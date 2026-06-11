const cheerio = require("cheerio");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

const MAX_CV_CHARS = 60000;
const MAX_RESEARCH_CHARS = 48000;
const URL_FETCH_TIMEOUT_MS = 4000;
const GROQ_TIMEOUT_MS = 55000;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const body = req.body || {};
    const file = body.file;
    if (!file?.base64 || !file?.name) {
      return res.status(400).json({ error: "A PDF or DOCX CV upload is required." });
    }

    const buffer = Buffer.from(file.base64, "base64");
    const cvText = await parseCv(buffer, file.name, file.type);
    if (!cvText || cvText.trim().length < 120) {
      return res.status(422).json({
        error: "The CV text could not be extracted clearly. Try a text-based PDF or DOCX file."
      });
    }

    const extractedProfile = extractSignals(cvText);
    const research = await collectResearch(body.urls || {}, extractedProfile).catch(() => ({
      suppliedUrls: [],
      queries: [],
      searchFindings: []
    }));
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return res.status(503).json({
        error: "The analysis service is not configured. GROQ_API_KEY is missing from the environment."
      });
    }

    const audit = await generateAuditWithGroq({ apiKey, cvText, extractedProfile, research });

    return res.status(200).json({
      mode: "ai",
      audit: normalizeAudit(audit, extractedProfile),
      research
    });
  } catch (error) {
    console.error(error);
    if (error.message?.startsWith("Groq request failed:")) {
      return res.status(502).json({ error: error.message });
    }
    const safeMsg = String(error.message || "unknown error").slice(0, 300);
    return res.status(500).json({ error: `Unexpected error: ${safeMsg}` });
  }
};

async function parseCv(buffer, fileName, mimeType = "") {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".docx") || mimeType.includes("wordprocessingml")) {
    const result = await mammoth.extractRawText({ buffer });
    return cleanText(result.value);
  }

  if (lowerName.endsWith(".pdf") || mimeType.includes("pdf")) {
    const result = await pdfParse(buffer);
    return cleanText(result.text);
  }

  throw new Error("Unsupported file type.");
}

function cleanText(value = "") {
  return value
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CV_CHARS);
}

function extractSignals(cvText) {
  const lines = cvText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const name =
    lines.find((line) => {
      const words = line.split(/\s+/);
      return (
        words.length >= 2 &&
        words.length <= 5 &&
        /^[A-Za-z][A-Za-z .'-]+$/.test(line) &&
        !/(resume|curriculum|vitae|profile|summary|experience|education)/i.test(line)
      );
    }) || "Candidate";

  const titleTerms = [
    "manager",
    "director",
    "lead",
    "specialist",
    "analyst",
    "engineer",
    "developer",
    "consultant",
    "coordinator",
    "executive",
    "operator",
    "designer",
    "architect",
    "owner",
    "head"
  ];

  const jobTitles = unique(
    lines
      .filter((line) => titleTerms.some((term) => new RegExp(`\\b${term}\\b`, "i").test(line)))
      .filter((line) => line.length <= 90)
      .slice(0, 8)
  );

  const companyPattern = /\b([A-Z][A-Za-z0-9&.,' -]{2,}\s(?:LLC|L\.L\.C|Ltd|Limited|Inc|Corp|Corporation|Group|Technologies|Technology|Systems|Solutions|Media|Digital|Marketplace|FZE|FZCO|Pvt|Private))\b/g;
  const companies = unique([...cvText.matchAll(companyPattern)].map((match) => match[1])).slice(0, 8);

  const skills = extractSkills(cvText);
  const industry = inferIndustry(cvText);

  return {
    name,
    jobTitles,
    companies,
    skills,
    industry
  };
}

function extractSkills(cvText) {
  const skillBank = [
    "marketplace operations",
    "e-commerce",
    "catalog management",
    "growth",
    "sales",
    "account management",
    "project management",
    "data analysis",
    "leadership",
    "budgeting",
    "revenue",
    "seo",
    "crm",
    "sql",
    "python",
    "javascript",
    "react",
    "node",
    "aws",
    "figma",
    "analytics",
    "stakeholder management",
    "operations",
    "strategy",
    "product management"
  ];

  const lower = cvText.toLowerCase();
  return skillBank.filter((skill) => lower.includes(skill)).slice(0, 12);
}

function inferIndustry(cvText) {
  const lower = cvText.toLowerCase();
  if (/(marketplace|e-commerce|catalog|retail|merchandising)/.test(lower)) return "e-commerce";
  if (/(software|developer|engineer|cloud|api|platform)/.test(lower)) return "technology";
  if (/(finance|banking|investment|accounting)/.test(lower)) return "finance";
  if (/(healthcare|medical|clinical|hospital)/.test(lower)) return "healthcare";
  if (/(marketing|brand|campaign|content|seo)/.test(lower)) return "marketing";
  return "professional";
}

async function collectResearch(urls, profile) {
  const suppliedUrls = Object.entries(urls)
    .filter(([, value]) => typeof value === "string" && value.trim())
    .map(([type, value]) => ({ type, url: normalizeUrl(value) }))
    .filter((item) => item.url);

  const suppliedFindings = await Promise.all(
    suppliedUrls.map(async (item) => ({
      type: item.type,
      url: item.url,
      ...(await fetchPageEvidence(item.url))
    }))
  );

  const queries = buildSearchQueries(profile);
  const searchFindings = await Promise.all(
    queries.map(async (query) => {
      const [ddg, bing] = await Promise.all([
        duckDuckGoSnippets(query),
        bingSnippets(query)
      ]);
      // Merge and deduplicate by title
      const seen = new Set();
      const merged = [...ddg, ...bing].filter((r) => {
        if (seen.has(r.title)) return false;
        seen.add(r.title);
        return !r.url.includes("linkedin.com");
      }).slice(0, 6);
      return { query, results: merged };
    })
  );

  return {
    suppliedUrls: suppliedFindings,
    queries,
    searchFindings
  };
}

function buildSearchQueries(profile) {
  const name = profile.name === "Candidate" ? "" : profile.name;
  if (!name) return [];

  const parts = [
    [name, profile.companies[0]].filter(Boolean).join(" "),
    [name, profile.jobTitles[0]].filter(Boolean).join(" "),
    [name, profile.industry, "professional"].filter(Boolean).join(" ")
  ].filter((query) => query && query.length > 6);

  return unique(parts).slice(0, 3);
}

async function fetchPageEvidence(url) {
  if (url.includes("linkedin.com")) {
    return fetchLinkedInViaSerp(url);
  }
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache"
      }
    });

    if (!response.ok) {
      return { status: "unavailable", title: "", excerpt: `HTTP ${response.status}` };
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    $("script, style, noscript, svg, nav, footer, header").remove();

    const title = cleanText($("title").first().text()).slice(0, 160);
    const description = cleanText($('meta[name="description"]').attr("content") || "").slice(0, 500);
    const pageText = cleanText($("body").text()).slice(0, 2000);

    return {
      status: "collected",
      title,
      excerpt: [description, pageText].filter(Boolean).join(" ").slice(0, 3000)
    };
  } catch (error) {
    return { status: "unavailable", title: "", excerpt: "Could not retrieve this public page." };
  }
}

// LinkedIn blocks direct scraping with HTTP 999.
// Instead, harvest the profile data from search engine snippets, which index
// the public profile and surface headline, summary, and job history in their
// result excerpts — no LinkedIn request needed.
async function fetchLinkedInViaSerp(linkedInUrl) {
  const slug = extractLinkedInSlug(linkedInUrl);
  const queries = slug
    ? [
        `site:linkedin.com/in/${slug}`,
        `linkedin.com/in/${slug} profile`
      ]
    : [`site:linkedin.com "${linkedInUrl}"`];

  const allSnippets = [];

  await Promise.all(
    queries.map(async (query) => {
      const [ddg, bing] = await Promise.all([
        duckDuckGoSnippets(query),
        bingSnippets(query)
      ]);
      allSnippets.push(...ddg, ...bing);
    })
  );

  // Deduplicate and prefer LinkedIn-sourced snippets
  const linkedInSnippets = allSnippets.filter((s) => s.url && s.url.includes("linkedin.com"));
  const best = linkedInSnippets.length ? linkedInSnippets : allSnippets;

  if (!best.length) {
    return { status: "unavailable", title: "", excerpt: "No public LinkedIn data found via search index." };
  }

  const excerpt = best
    .map((s) => [s.title, s.snippet].filter(Boolean).join(" — "))
    .join(" | ")
    .slice(0, 3000);

  return { status: "collected", title: best[0]?.title || "", excerpt };
}

function extractLinkedInSlug(url) {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/\/in\/([^/?#]+)/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

async function duckDuckGoSnippets(query) {
  try {
    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    if (!response.ok) return [];
    const html = await response.text();
    const $ = cheerio.load(html);
    const results = [];
    $(".result").each((_, el) => {
      const anchor = $(el).find(".result__a").first();
      const title = cleanText(anchor.text());
      const href = resolveDuckDuckGoUrl(anchor.attr("href"));
      const snippet = cleanText($(el).find(".result__snippet").text());
      if (title && snippet) results.push({ title, url: href, snippet });
    });
    return results.slice(0, 4);
  } catch {
    return [];
  }
}

async function bingSnippets(query) {
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=5`;
    const response = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    if (!response.ok) return [];
    const html = await response.text();
    const $ = cheerio.load(html);
    const results = [];
    $("li.b_algo").each((_, el) => {
      const title = cleanText($(el).find("h2").text());
      const href = $(el).find("h2 a").attr("href") || "";
      const snippet = cleanText($(el).find(".b_caption p, .b_algoSlug").text());
      if (title && snippet) results.push({ title, url: href, snippet });
    });
    return results.slice(0, 4);
  } catch {
    return [];
  }
}

async function searchPublicWeb(query) {
  try {
    const results = await duckDuckGoSnippets(query);
    // Do not attempt to re-fetch LinkedIn URLs — already handled via SERP
    return results.filter((r) => !r.url.includes("linkedin.com")).slice(0, 5);
  } catch (error) {
    return [];
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function resolveDuckDuckGoUrl(href = "") {
  if (!href) return "";
  try {
    const parsed = new URL(href, "https://duckduckgo.com");
    return parsed.searchParams.get("uddg") || parsed.href;
  } catch {
    return "";
  }
}

function normalizeUrl(value = "") {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`).href;
  } catch {
    return "";
  }
}

async function generateAuditWithGroq({ apiKey, cvText, extractedProfile, research }) {
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const endpoint = "https://api.groq.com/openai/v1/chat/completions";

  const userContent = JSON.stringify(
    {
      cvText,
      extractedProfile,
      publicResearch: compactResearch(research)
    },
    null,
    2
  );

  const controller = new AbortController();
  const groqTimeout = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt() },
          {
            role: "user",
            content:
              userContent +
              "\n\nIMPORTANT: Return ONLY a valid JSON object. Every string value must be on one line and wrapped in double quotes. Do not leave any string value unquoted."
          }
        ]
      })
    });
  } catch (fetchError) {
    if (fetchError.name === "AbortError") throw new Error("Groq request failed: timed out after 55s.");
    throw new Error(`Groq request failed: network error — ${fetchError.message}`);
  } finally {
    clearTimeout(groqTimeout);
  }

  const rawText = await response.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error("Groq request failed: unreadable response from AI service.");
  }

  if (!response.ok) {
    // json_validate_failed: Groq provides failed_generation — try to repair and use it
    const failedGen = data.error?.failed_generation;
    if (failedGen) {
      try {
        return JSON.parse(extractJson(repairUnquotedStrings(failedGen)));
      } catch {}
    }
    const msg = data.error?.message || "unknown error";
    throw new Error(`Groq request failed: ${msg.slice(0, 200)}`);
  }

  const text = data.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(extractJson(text));
  } catch {
    // Repair attempt: model may have dropped quotes on long string values
    return JSON.parse(extractJson(repairUnquotedStrings(text)));
  }
}

function systemPrompt() {
  return `You are a senior executive search consultant with 20 years of experience placing candidates at FTSE 100 and Fortune 500 companies. You produce deep recruiter intelligence reports — not CV summaries.

CORE MANDATE: Generate INSIGHT. Do NOT summarise. Do NOT repeat job titles. Do NOT restate responsibilities. Answer the question: "What would an experienced recruiter notice that most people would miss?"

ANALYSIS FRAMEWORK — apply all 5 layers:
Layer 1: What the CV explicitly says
Layer 2: What the CV implies through pattern and positioning
Layer 3: What the CV conspicuously does NOT say
Layer 4: What public evidence supports, contradicts, or adds
Layer 5: What an employer must investigate before proceeding

PROFESSIONAL ARCHETYPE — identify a precise functional identity. Not a job title. An archetype.
Examples: Marketplace Operator, Growth Marketer, Commercial Leader, Technical Marketer, Operations Specialist, Revenue Manager, Automation Builder, Brand Strategist, E-commerce Generalist, Demand Generation Specialist, Customer Success Leader, Revenue Operations Manager, Product Marketing Specialist, Performance Marketing Lead, Digital Commerce Manager

FORBIDDEN — never produce:
- CV summaries or job-by-job chronology
- Generic interview questions ("How do you stay updated?")
- Motivational or soft-skills language
- Personality assessments, DISC, MBTI
- Hiring recommendations, pass/fail decisions, trust scores
- Age, gender, health, religion, or ethnicity inferences

SECTION-BY-SECTION REQUIREMENTS:

professionalArchetype: One precise label. Not a job title. Who is this person professionally?

professionalIdentity: 5-7 sentences. Who does this person APPEAR to be at the intersection of domain, seniority, and operating style? What does public evidence add or contradict? What single statement best captures their professional positioning?

careerTrajectory: 3-5 phases. Labels must be interpretive (e.g., "Marketing Execution", "Marketplace Ownership", "Commercial Operations") — never job titles. The FINAL phase must be labelled exactly "Likely Next Step" with a specific role prediction and 2-sentence rationale. All other phases: 2-3 sentence interpretation of what changed and what it signals.

hiddenSignals: 4-6 patterns not explicitly stated in the CV. Each must name the signal type and provide a specific observation. Signal types: Revenue Ownership Signal, Systems Thinking, Automation Mindset, Commercial Awareness, Cross-functional Scope, Leadership Indicators, Technical Fluency, Entrepreneurial Tendency, Operational Discipline, Strategic Orientation.

evidenceStrength: Assess by area with a specific explanation — not just tags. Minimum counts:
- strongEvidence: 4-6 areas with clear CV evidence AND public corroboration. Name the source.
- moderateEvidence: 3-5 areas present in CV, limited or no public support. State what is missing.
- weakEvidence: 2-4 areas claimed but poorly evidenced even in the CV. Explain the weakness.
- noEvidence: 2-3 areas a recruiter would expect but that are entirely absent. State this plainly.

publicProfileEvidence: 4-6 findings. Focus on SIGNALS — does public activity reinforce claimed expertise? Does anything contradict? What does the public footprint reveal that the CV does not mention? What does the CV claim that the public record is entirely silent on? End with one overall footprint strength statement: strong / moderate / limited.

missingEvidence: 8-10 specific role-appropriate gaps. Frame as "what a recruiter expects to see but cannot find." Be specific to this candidate's domain. Examples for e-commerce: budget ownership, ROAS, CAC, revenue responsibility, inventory value, margin impact. Examples for operations: process metrics, cost savings, headcount managed, SLA performance. Never use generic gaps.

recruiterConcerns: 4-6 specific unknowns that remain even after reading the full CV and public evidence. Focus on: scale of responsibility, decision-making authority, depth vs breadth, ownership vs participation, solo vs team contribution.

interviewPriorities: 8-10 targeted questions built ONLY from missingEvidence and recruiterConcerns. Every question must be personalised. Reference actual figures, roles, or claims from this specific CV. No generic questions.

employerTakeaway: 4-6 sentences. What type of company, stage, and mandate does this person fit? What specific problem would they solve? Where would they create measurable value? What must a hiring manager validate before proceeding?

bestFitRoles:
- strongFit: 3-5 specific role titles based on evidenced strengths
- possibleFit: 2-4 role titles that are plausible with development
- weakFit: 2-4 role titles that are NOT supported by the evidence

careerCeiling:
- currentLevel: current seniority (e.g., "Manager", "Senior Manager", "Individual Contributor")
- nextLevel: realistic next step with timeline signal (e.g., "Head of E-commerce within 12-18 months")
- potentialLevel: ceiling with right development (e.g., "VP of Commercial", "COO")
- reasoning: 2-3 sentences grounded in specific evidence, not aspiration

Tone: authoritative, candid, evidence-led. A trusted colleague who has done their homework and is not afraid to name what they found — and what they did not.

Language rules:
- Use: "appears to", "the public record suggests", "no public evidence found", "limited public evidence", "publicly visible"
- Never use: "verified", "confirmed", "authenticated", "strong fit", "recommend", "hire", "reject"

Return ONLY a valid JSON object with this exact structure. Every string value on one line, wrapped in double quotes:
{
  "extractedProfile": {
    "name": "string",
    "jobTitles": ["string"],
    "companies": ["string"],
    "skills": ["string"],
    "achievements": ["string"],
    "certifications": ["string"]
  },
  "professionalArchetype": "string",
  "professionalIdentity": "string",
  "careerTrajectory": [
    { "label": "string", "narrative": "string" }
  ],
  "hiddenSignals": [
    { "signal": "string", "observation": "string" }
  ],
  "evidenceStrength": {
    "strongEvidence": [{ "area": "string", "assessment": "string" }],
    "moderateEvidence": [{ "area": "string", "assessment": "string" }],
    "weakEvidence": [{ "area": "string", "assessment": "string" }],
    "noEvidence": [{ "area": "string", "assessment": "string" }]
  },
  "publicProfileEvidence": [
    { "finding": "string", "detail": "string", "source": "string" }
  ],
  "missingEvidence": ["string"],
  "recruiterConcerns": ["string"],
  "interviewPriorities": ["string"],
  "employerTakeaway": "string",
  "bestFitRoles": {
    "strongFit": ["string"],
    "possibleFit": ["string"],
    "weakFit": ["string"]
  },
  "careerCeiling": {
    "currentLevel": "string",
    "nextLevel": "string",
    "potentialLevel": "string",
    "reasoning": "string"
  }
}`;
}

function compactResearch(research) {
  return JSON.stringify(research).slice(0, MAX_RESEARCH_CHARS);
}

function normalizeAudit(audit, fallbackProfile) {
  return {
    extractedProfile: {
      ...fallbackProfile,
      ...(audit.extractedProfile || {})
    },
    professionalArchetype: audit.professionalArchetype || "",
    professionalIdentity: audit.professionalIdentity || "",
    careerTrajectory: Array.isArray(audit.careerTrajectory) ? audit.careerTrajectory : [],
    hiddenSignals: Array.isArray(audit.hiddenSignals) ? audit.hiddenSignals : [],
    evidenceStrength: {
      strongEvidence: audit.evidenceStrength?.strongEvidence || [],
      moderateEvidence: audit.evidenceStrength?.moderateEvidence || [],
      weakEvidence: audit.evidenceStrength?.weakEvidence || [],
      noEvidence: audit.evidenceStrength?.noEvidence || []
    },
    publicProfileEvidence: Array.isArray(audit.publicProfileEvidence) ? audit.publicProfileEvidence : [],
    missingEvidence: Array.isArray(audit.missingEvidence) ? audit.missingEvidence : [],
    recruiterConcerns: Array.isArray(audit.recruiterConcerns) ? audit.recruiterConcerns : [],
    interviewPriorities: Array.isArray(audit.interviewPriorities) ? audit.interviewPriorities : [],
    employerTakeaway: audit.employerTakeaway || "",
    bestFitRoles: {
      strongFit: audit.bestFitRoles?.strongFit || [],
      possibleFit: audit.bestFitRoles?.possibleFit || [],
      weakFit: audit.bestFitRoles?.weakFit || []
    },
    careerCeiling: {
      currentLevel: audit.careerCeiling?.currentLevel || "",
      nextLevel: audit.careerCeiling?.nextLevel || "",
      potentialLevel: audit.careerCeiling?.potentialLevel || "",
      reasoning: audit.careerCeiling?.reasoning || ""
    }
  };
}


function extractJson(value = "") {
  const stripped = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (stripped.startsWith("{")) return stripped;
  const match = stripped.match(/\{[\s\S]*\}/);
  return match ? match[0] : "{}";
}

function repairUnquotedStrings(text) {
  // Llama sometimes emits: "key": \n  unquoted text  \n  "nextKey"
  // Fix by quoting the unquoted value
  return text.replace(
    /("(?:\w+)")\s*:\s*\n(\s*)([A-Z][^\n"{\[]+(?:\n(?!\s*["{}\[]).*)*)/g,
    (_, key, _indent, value) => {
      const safe = value.trim()
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\s*\n\s*/g, " ");
      return `${key}: "${safe}"`;
    }
  );
}

function unique(items) {
  return [...new Set(items.filter(Boolean).map((item) => item.trim()))];
}

function joinOrFallback(items, fallback) {
  return items.length ? items.join(", ") : fallback;
}

function titleCase(value) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
