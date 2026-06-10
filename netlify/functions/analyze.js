const cheerio = require("cheerio");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

const MAX_CV_CHARS = 60000;
const MAX_RESEARCH_CHARS = 48000;
const URL_FETCH_TIMEOUT_MS = 7000;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const file = body.file;
    if (!file?.base64 || !file?.name) {
      return json(400, { error: "A PDF or DOCX CV upload is required." });
    }

    const buffer = Buffer.from(file.base64, "base64");
    const cvText = await parseCv(buffer, file.name, file.type);
    if (!cvText || cvText.trim().length < 120) {
      return json(422, {
        error: "The CV text could not be extracted clearly. Try a text-based PDF or DOCX file."
      });
    }

    const extractedProfile = extractSignals(cvText);
    const research = await collectResearch(body.urls || {}, extractedProfile);
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return json(200, {
        mode: "demo",
        audit: buildDemoAudit(cvText, extractedProfile, research),
        research
      });
    }

    const audit = await generateAuditWithClaude({
      apiKey,
      cvText,
      extractedProfile,
      research
    });

    return json(200, {
      mode: "ai",
      audit: normalizeAudit(audit, extractedProfile),
      research
    });
  } catch (error) {
    console.error(error);
    if (error.message?.startsWith("Claude request failed")) {
      return json(502, {
        error:
          "Claude analysis failed. Check that ANTHROPIC_API_KEY is a valid key and the account has credits."
      });
    }

    return json(500, {
      error: "The audit service hit an unexpected issue while processing this CV."
    });
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
  const searchFindings = [];
  for (const query of queries) {
    const results = await searchPublicWeb(query);
    searchFindings.push({ query, results });
  }

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

  return unique(parts).slice(0, 5);
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

async function generateAuditWithClaude({ apiKey, cvText, extractedProfile, research }) {
  const model = process.env.CLAUDE_MODEL || "claude-opus-4-8";
  const endpoint = "https://api.anthropic.com/v1/messages";

  const userContent = JSON.stringify(
    {
      cvText,
      extractedProfile,
      publicResearch: compactResearch(research)
    },
    null,
    2
  );

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt(),
      messages: [{ role: "user", content: userContent }]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Claude request failed: ${text}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || "{}";
  return JSON.parse(stripCodeFence(text));
}

function systemPrompt() {
  return `
You are a Senior Talent Assessment Consultant and Executive Recruiter with 20+ years of experience.

CRITICAL RULE: The CV is a set of UNVERIFIED CLAIMS. Your job is to cross-reference those claims against publicly available evidence — LinkedIn profiles, web search results, company pages, publications, and any other public sources provided. Do NOT simply rephrase or summarise the CV. The output must reflect what you independently found publicly, not what the candidate wrote about themselves.

Your process:
1. Read the CV to understand the claims being made.
2. Examine all public research provided (LinkedIn content, search results, page excerpts).
3. For each significant claim in the CV, determine: is it supported, partially supported, unverifiable, or contradicted by public evidence?
4. Build your audit from the public evidence outward — not from the CV inward.

What makes a good audit:
- It reads like an independent recruiter who researched the candidate online, not a CV reviewer.
- It surfaces what the public profile reveals that the CV does NOT mention, and vice versa.
- It is direct and specific — names roles, companies, platforms, dates, signals.
- It distinguishes between what is publicly visible, what is claimed but unverifiable, and what appears inconsistent.
- It gives a recruiter a clear, honest picture of who this person appears to be based on external evidence.

Tone: authoritative, candid, evidence-led. Like a trusted senior colleague who has done their homework.

Strict rules:
- No hiring recommendations (no "hire", "reject", "strong fit", "worth interviewing").
- No personality types, age, gender, health, religion, or ethnicity.
- For public evidence, use: "appears consistent", "appears aligned", "reinforces", "publicly visible", "no public evidence found", "limited public evidence".
- Never use "verified", "confirmed", or "authenticated".
- If public research is sparse, say so explicitly — do not pad with CV content.

Section guidance:
- professionalIdentity: 3–5 sentences drawing from PUBLIC evidence first. Who does this person appear to be based on their public footprint? What is their clearest professional identity signal?
- careerTrajectory: 2–4 phases derived from public evidence and CV cross-reference. Use evocative labels. Note where public evidence supports or is silent on CV claims.
- coreCompetencies strongEvidence: only skills with BOTH CV and public corroboration. Source must be "CV and public profile" or "Public profile".
- coreCompetencies moderateEvidence: skills visible in CV but with limited or no public corroboration.
- coreCompetencies limitedEvidence: skills claimed in CV with no public evidence found.
- publicProfileEvidence: specific findings from LinkedIn/web research — what the public profile reveals, what it is silent on, any inconsistencies with the CV.
- whatTheCvDoesNotSay: 5–7 specific gaps an interviewer must probe — things neither the CV nor public profile addresses clearly.
- interviewFocusAreas: 5–7 sharp, specific questions based on the actual gaps and signals found.
- employerTakeaway: 3–5 sentences on what type of employer and role fits best, based on public evidence — not CV claims alone.

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

function buildDemoAudit(cvText, profile, research) {
  const hasPublicEvidence =
    research.suppliedUrls.some((item) => item.status === "collected") ||
    research.searchFindings.some((item) => item.results.length);

  return normalizeAudit(
    {
      extractedProfile: profile,
      professionalIdentity: `Appears to be a ${profile.industry} professional with experience signals around ${joinOrFallback(
        profile.skills.slice(0, 4),
        "operational execution, stakeholder coordination, and role-specific delivery"
      )}. This demo-mode interpretation is based on extracted CV text and does not replace the Claude audit.`,
      careerTrajectory: [
        {
          label: "Foundation and Execution",
          narrative:
            "The CV appears to establish hands-on responsibility and functional delivery before broader ownership can be assessed."
        },
        {
          label: "Ownership Signals",
          narrative:
            "Role titles and recurring skill themes suggest possible expansion into ownership, but scope, scale, and measurable outcomes need clarification."
        }
      ],
      coreCompetencies: {
        strongEvidence: profile.skills.slice(0, 3).map((skill) => ({
          competency: titleCase(skill),
          evidence: "The term appears directly in the CV text.",
          source: "CV"
        })),
        moderateEvidence: profile.jobTitles.slice(0, 3).map((title) => ({
          competency: title,
          evidence: "The role/title appears in the CV, but seniority and impact require supporting detail.",
          source: "CV"
        })),
        limitedEvidence: [
          {
            competency: "Commercial impact",
            evidence: "Impact may be present, but quantified revenue, budget, or growth ownership was not clearly extracted.",
            source: "CV"
          }
        ]
      },
      publicProfileEvidence: [
        {
          finding: hasPublicEvidence
            ? "Publicly available professional information appears available for recruiter review."
            : "Limited public professional evidence was identified from the supplied inputs.",
          detail:
            "Demo mode collected public snippets where accessible, but Claude analysis is required for deeper cross-reference.",
          source: "Public web"
        }
      ],
      whatTheCvDoesNotSay: [
        "Revenue responsibility or commercial targets are not clearly evidenced.",
        "Budget ownership is not clearly evidenced.",
        "Team size and leadership scope require clarification.",
        "The scale of measurable achievements may need stronger evidence.",
        "Certifications and formal credentials require clearer supporting detail if relevant."
      ],
      interviewFocusAreas: [
        "Which achievements best demonstrate measurable commercial or operational impact?",
        "What revenue, budget, or target ownership did the candidate personally hold?",
        "How large were the teams, vendors, or stakeholder groups involved?",
        "Which claims are directly supported by public portfolio, profile, or project evidence?",
        "What would previous managers identify as the candidate's strongest repeatable contribution?"
      ],
      employerTakeaway:
        "A company may be interested in interviewing this candidate if the role values the extracted domain signals, while using the interview to clarify scale, ownership, and evidence gaps."
    },
    profile
  );
}

function stripCodeFence(value = "") {
  return value.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
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

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}
