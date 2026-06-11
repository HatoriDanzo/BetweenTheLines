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
    queries.map(async (query) => ({ query, results: await searchPublicWeb(query) }))
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
    `"${name}" LinkedIn`,
    [name, profile.companies[0]].filter(Boolean).join(" ") + " LinkedIn",
    [name, profile.jobTitles[0]].filter(Boolean).join(" "),
    `"${name}" site:linkedin.com`,
    [name, profile.companies[0], profile.industry].filter(Boolean).join(" ")
  ].filter((query) => query && query.length > 6);

  return unique(parts).slice(0, 3);
}

async function fetchPageEvidence(url) {
  try {
    const isLinkedIn = url.includes("linkedin.com");
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

    let pageText = "";
    if (isLinkedIn) {
      // LinkedIn public profiles expose structured sections
      const sections = [
        $('section[data-section="summary"]').text(),
        $('section[data-section="experience"]').text(),
        $(".profile-section-card").text(),
        $("main").text()
      ].filter(Boolean);
      pageText = cleanText(sections.join(" ")).slice(0, 3000);
    } else {
      pageText = cleanText($("body").text()).slice(0, 2000);
    }

    return {
      status: "collected",
      title,
      excerpt: [description, pageText].filter(Boolean).join(" ").slice(0, 3000)
    };
  } catch (error) {
    return { status: "unavailable", title: "", excerpt: "Could not retrieve this public page." };
  }
}

async function searchPublicWeb(query) {
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

    $(".result").each((_, element) => {
      const anchor = $(element).find(".result__a").first();
      const title = cleanText(anchor.text());
      const href = resolveDuckDuckGoUrl(anchor.attr("href"));
      const snippet = cleanText($(element).find(".result__snippet").text());

      if (title && href) {
        results.push({ title, url: href, snippet });
      }
    });

    const topResults = results.slice(0, 5);

    // Fetch the actual LinkedIn result pages for richer text
    const enriched = await Promise.all(
      topResults.map(async (result) => {
        if (result.url.includes("linkedin.com")) {
          const page = await fetchPageEvidence(result.url);
          if (page.status === "collected" && page.excerpt.length > 100) {
            return { ...result, pageText: page.excerpt.slice(0, 1500) };
          }
        }
        return result;
      })
    );

    return enriched;
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
  return `
You are a Senior Talent Assessment Consultant and Executive Recruiter with 20+ years of experience placing candidates at FTSE 100, Fortune 500, and high-growth technology companies. You have been hired to produce a thorough, evidence-led recruiter intelligence report on this candidate — the kind of deep briefing a senior partner would hand to a hiring director before a C-suite search.

CRITICAL RULE: The CV is a set of UNVERIFIED CLAIMS. Your job is to cross-reference every significant claim against publicly available evidence — LinkedIn profiles, web search results, company pages, publications, GitHub, portfolio sites, and any other public sources provided. Do NOT rephrase or summarise the CV. Build the audit from public evidence outward.

DEPTH REQUIREMENT: Every section must be substantive and specific. Generic observations are not acceptable. Recruiters reading this report expect senior-level analysis — not bullet points or surface-level paraphrasing. Write as a trusted colleague who has spent two hours researching this candidate online and is now briefing a partner. Use full sentences, name specifics, and draw clear distinctions.

Your process:
1. Read the CV to identify the claims being made.
2. Examine ALL public research provided (LinkedIn, search results, page excerpts, portfolio, GitHub).
3. For each significant claim, determine: supported / partially supported / unverifiable / contradicted by public evidence.
4. Write from the public evidence outward — not from the CV inward.

MANDATORY depth per section:

professionalIdentity — 5 to 7 sentences minimum:
- Who does this person appear to be based on their PUBLIC footprint, NOT their CV?
- What is their clearest professional identity signal from the public record?
- What domain and seniority level does public evidence suggest?
- Is there alignment or a gap between how they present themselves and what the public evidence shows?
- What is the single strongest public signal about their professional character?

careerTrajectory — 3 to 5 phases minimum:
- Trace the career arc using BOTH public evidence and CV.
- Each phase needs a compelling, specific label (not generic) and a 2–4 sentence narrative.
- Identify where public evidence supports, extends, contradicts, or is entirely silent on CV claims.
- Note any unexplained transitions, gaps in tenure, lateral moves, or acceleration.

coreCompetencies:
- strongEvidence: 4–6 skills with BOTH CV presence and specific public corroboration. Name the source (LinkedIn headline, GitHub repo, publication, article, media mention). Be explicit about the evidence.
- moderateEvidence: 4–6 skills present in CV with limited or no public corroboration. Explain exactly what is missing.
- limitedEvidence: 3–5 skills claimed in CV with zero public evidence found. State this plainly.

publicProfileEvidence — 5 to 7 findings minimum:
- Specific findings from LinkedIn, web search, portfolio, GitHub, or any other public source — with source name or URL where available.
- What the public profile reveals that the CV does NOT mention.
- What the CV claims that the public profile is silent on.
- Any inconsistencies or discrepancies between CV and public profile.
- Overall public footprint strength: strong / moderate / limited — and what that signals to a recruiter.

whatTheCvDoesNotSay — 8 to 10 specific gaps minimum:
- Concrete, specific gaps tied to THIS candidate's profile — not generic recruitment advice.
- Frame each as a question a senior interviewer would have after reviewing both the CV and the public evidence.
- Examples: missing revenue accountability, unclear team size, unexplained company exit, absent public portfolio, no evidence of claimed leadership scale.

interviewFocusAreas — 8 to 10 targeted questions minimum:
- Sharp, specific questions a senior recruiter would ask in a briefing call.
- Each question must target a specific, identifiable gap or ambiguity found in this audit.
- Frame them as a senior recruiter would — direct, probing, commercially grounded.
- Do NOT ask generic interview questions. Each question must be traceable to a finding in this report.

employerTakeaway — 4 to 6 sentences minimum:
- What type of organisation, stage, and role does public evidence suggest this candidate fits?
- What does this candidate clearly bring, based on evidence — not CV claims?
- What are the key unknowns or risk factors a hiring manager should validate before proceeding?
- What kind of mandate would play to their evidenced strengths?

Tone: authoritative, candid, evidence-led. Like a trusted senior colleague who has done their homework and is not afraid to name what they found — and what they did not find.

Strict rules:
- No hiring recommendations (no "hire", "reject", "strong fit", "worth interviewing").
- No personality types, age, gender, health, religion, or ethnicity.
- Use: "appears consistent", "publicly visible", "no public evidence found", "limited public evidence", "the public record suggests".
- Never use "verified", "confirmed", or "authenticated".
- If public research is sparse, say so explicitly and explain what that sparseness signals — do not pad with CV content.

Return only a JSON object with this exact shape:
{
  "extractedProfile": {
    "name": "string",
    "jobTitles": ["string"],
    "companies": ["string"],
    "skills": ["string"],
    "achievements": ["string"],
    "certifications": ["string"]
  },
  "professionalIdentity": "string",
  "careerTrajectory": [
    { "label": "string", "narrative": "string" }
  ],
  "coreCompetencies": {
    "strongEvidence": [
      { "competency": "string", "evidence": "string", "source": "CV | Public profile | CV and public profile" }
    ],
    "moderateEvidence": [
      { "competency": "string", "evidence": "string", "source": "CV | Public profile | CV and public profile" }
    ],
    "limitedEvidence": [
      { "competency": "string", "evidence": "string", "source": "CV | Public profile | CV and public profile" }
    ]
  },
  "publicProfileEvidence": [
    { "finding": "string", "detail": "string", "source": "string" }
  ],
  "whatTheCvDoesNotSay": ["string"],
  "interviewFocusAreas": ["string"],
  "employerTakeaway": "string"
}
`;
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
    professionalIdentity: audit.professionalIdentity || "",
    careerTrajectory: Array.isArray(audit.careerTrajectory) ? audit.careerTrajectory : [],
    coreCompetencies: {
      strongEvidence: audit.coreCompetencies?.strongEvidence || [],
      moderateEvidence: audit.coreCompetencies?.moderateEvidence || [],
      limitedEvidence: audit.coreCompetencies?.limitedEvidence || []
    },
    publicProfileEvidence: Array.isArray(audit.publicProfileEvidence)
      ? audit.publicProfileEvidence
      : [],
    whatTheCvDoesNotSay: Array.isArray(audit.whatTheCvDoesNotSay)
      ? audit.whatTheCvDoesNotSay
      : [],
    interviewFocusAreas: Array.isArray(audit.interviewFocusAreas) ? audit.interviewFocusAreas : [],
    employerTakeaway: audit.employerTakeaway || ""
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
