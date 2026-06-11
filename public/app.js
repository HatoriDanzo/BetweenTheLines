const views = {
  home: document.querySelector("#homeView"),
  upload: document.querySelector("#uploadView"),
  analyzing: document.querySelector("#analyzingView"),
  report: document.querySelector("#reportView")
};

const nav = document.querySelector(".ci-nav");
const form = document.querySelector("#analysisForm");
const fileInput = document.querySelector("#cvFile");
const fileName = document.querySelector("#fileName");
const uploadArea = document.querySelector("#uploadArea");
const uploadMain = document.querySelector("#uploadMain");
const analyzeButton = document.querySelector("#analyzeButton");
const stepList = document.querySelector("#stepList");
const report = document.querySelector("#report");

const steps = [
  "Reading CV",
  "Collecting public evidence",
  "Identifying professional archetype",
  "Analysing hidden signals",
  "Assessing evidence strength",
  "Building recruiter intelligence"
];

const sampleAudit = {
  mode: "sample",
  audit: {
    extractedProfile: {
      name: "Sarah Chen",
      jobTitles: ["Senior Product Manager", "Lead Product Manager"],
      companies: ["Arbor Technologies", "Vanta Health"],
      skills: ["Product Strategy", "Roadmap Planning", "Stakeholder Management"],
      achievements: [],
      certifications: []
    },
    professionalArchetype: "B2B Product Operator",
    professionalIdentity:
      "Sarah Chen appears to be a product operator whose primary strength sits at the intersection of roadmap ownership, cross-functional coordination, and B2B SaaS delivery — not a generalist marketer or a technical founder. Her career positioning suggests a candidate who builds internal process discipline around product delivery rather than one who defines market category or leads commercial strategy. The public record, while limited, does not contradict the CV's positioning but adds little additional signal about the scale or commercial impact of her work. What is notably absent from both the CV and public footprint is any evidence of revenue ownership, pricing decisions, or P&L exposure — which positions her clearly as a product execution professional rather than a commercially accountable product leader. The gap between her stated seniority and the absence of commercial evidence is the central question this profile raises.",
    careerTrajectory: [
      {
        label: "Discovery and Execution",
        narrative: "Early roles suggest product discovery and feature delivery in a structured environment. The emphasis appears to be on execution within an established roadmap framework rather than strategic ownership of the product direction itself."
      },
      {
        label: "Roadmap Ownership",
        narrative: "A clear transition toward owning the product roadmap and managing stakeholder alignment across engineering, design, and commercial teams. This phase signals growing seniority but the scope of decision authority is not fully evidenced."
      },
      {
        label: "Cross-functional Leadership",
        narrative: "Recent roles imply broader influence across multiple functions, with the CV suggesting she operates at senior manager level. The absence of team size or reporting line detail makes it difficult to assess whether this represents true leadership or senior individual contribution."
      },
      {
        label: "Likely Next Step",
        narrative: "The evidence positions Sarah for a Head of Product or Group Product Manager role at a mid-stage B2B SaaS company. To make that transition credible, she will need to demonstrate commercial accountability and measurable business outcomes, neither of which are currently evidenced."
      }
    ],
    hiddenSignals: [
      {
        signal: "Process Discipline",
        observation: "Repeated references to roadmap frameworks, sprint planning, and delivery methodology suggest a candidate who builds operational structure around product work — an underrated signal of scalability in product leadership."
      },
      {
        signal: "Cross-functional Scope",
        observation: "The consistent involvement of engineering, design, and commercial stakeholders across multiple roles implies broader organisational influence than the job titles alone suggest."
      },
      {
        signal: "Absence of Commercial Signal",
        observation: "No revenue targets, pricing decisions, or commercial ownership language appears anywhere in the CV. This is a deliberate or unconscious omission that positions this candidate as execution-oriented rather than commercially accountable."
      },
      {
        signal: "B2B Domain Depth",
        observation: "Both Arbor Technologies and Vanta Health are B2B SaaS environments. This is not accidental — it suggests a candidate who has deliberately stayed in B2B and likely understands enterprise sales cycles and customer success dynamics."
      }
    ],
    evidenceStrength: {
      strongEvidence: [
        { area: "Product Roadmap Ownership", assessment: "Explicitly referenced across multiple roles with consistent language around prioritisation and delivery. CV evidence is clear, though public corroboration is limited." },
        { area: "Stakeholder Management", assessment: "Cross-functional alignment appears in every role described. The pattern is strong enough across multiple positions to constitute a reliable signal." },
        { area: "B2B SaaS Environment", assessment: "Both companies listed are verifiable B2B SaaS organisations. Domain experience appears genuine and consistent." }
      ],
      moderateEvidence: [
        { area: "Data-driven Decision Making", assessment: "Analytics references appear in the CV but no specific metrics, tools, or outcomes are named. The claim is present but not substantiated." },
        { area: "User Research", assessment: "Discovery themes appear across the CV but specific research methodologies, sample sizes, or outcome influence are not documented." }
      ],
      weakEvidence: [
        { area: "Team Leadership", assessment: "Senior language is used but team size, reporting structure, and direct management scope are never specified. This could mean leading one person or ten." },
        { area: "Strategic Product Vision", assessment: "Strategy language appears but no evidence of setting company-level product direction, entering new markets, or owning category positioning." }
      ],
      noEvidence: [
        { area: "Commercial Ownership", assessment: "No revenue targets, P&L exposure, pricing decisions, or commercial accountability appear anywhere in the CV or public record." },
        { area: "Public Professional Footprint", assessment: "No public writing, speaking engagements, open-source contributions, or industry presence was identified. This limits external validation of claimed expertise." }
      ]
    },
    publicProfileEvidence: [
      {
        finding: "Public footprint is limited.",
        detail: "No published articles, conference appearances, or industry contributions were identified. This is common at this career stage but limits independent validation of the CV's claims.",
        source: "Web search"
      },
      {
        finding: "Both listed companies are verifiable B2B SaaS organisations.",
        detail: "Arbor Technologies and Vanta Health are legitimate companies operating in the B2B sector. Employment history at these organisations is plausible.",
        source: "Company research"
      },
      {
        finding: "Overall public footprint strength: Limited.",
        detail: "The absence of a meaningful public profile means that claims in this CV rest entirely on self-reported evidence. A hiring manager should treat this as a validation risk rather than a disqualifier.",
        source: "Overall assessment"
      }
    ],
    missingEvidence: [
      "No revenue impact or business outcome is attached to any achievement. What commercial results did her product decisions drive?",
      "Team leadership scope is entirely unspecified. How many people did she manage directly, and at what level?",
      "No budget ownership or resource accountability appears anywhere. Did she control headcount, vendor spend, or tooling budgets?",
      "Pricing decisions, packaging, or commercial product strategy are absent. Was she ever accountable to revenue or margin outcomes?",
      "The reason for leaving each role is not addressed. Were departures voluntary, and what drove the transitions?",
      "No specific product metrics are named — no retention rates, activation rates, NPS scores, or conversion improvements.",
      "Certifications, training, or professional development are not mentioned, which is unusual for a senior PM in 2024.",
      "No reference to the size of the customer base, ARR, or company stage at each employer — context that would materially affect how to read her experience."
    ],
    recruiterConcerns: [
      "The seniority claimed in the most recent role is not fully evidenced by the scope described. It is unclear whether this is senior individual contribution or genuine people leadership.",
      "The complete absence of commercial metrics across an eight-year career is unusual and suggests either a deliberate omission or a career spent in environments where commercial accountability was not part of the product role.",
      "No evidence of having driven or influenced a major product pivot, launch, or strategic decision that had measurable company-level impact.",
      "The transition between Arbor Technologies and Vanta Health is not explained. The timeline and circumstances of both moves are worth exploring."
    ],
    interviewPriorities: [
      "Across your eight years in product, which single decision you made had the most measurable commercial impact — and how was that impact quantified?",
      "In your most recent role, how many people reported to you directly, and how many were in your broader cross-functional team?",
      "You describe roadmap ownership across both companies. Who had final sign-off on prioritisation decisions, and how often did your recommendation differ from what shipped?",
      "What product metrics did you personally own and report to leadership — not team metrics, but your individual accountability?",
      "Walk me through the circumstances of your transition from Arbor Technologies to Vanta Health. What drove that move and what were you optimising for?",
      "Have you ever been accountable to a revenue target, pricing decision, or P&L outcome? If not, what was the closest commercial accountability you held?"
    ],
    employerTakeaway:
      "This profile is best suited for a mid-stage B2B SaaS company seeking an experienced product operator to own delivery, coordinate cross-functional teams, and maintain roadmap discipline in a structured product environment. The evidenced strengths are in execution, stakeholder alignment, and domain knowledge — not in commercial strategy, product vision, or people leadership at scale. A hiring manager considering this candidate for a senior or head-of role should use the interview process to validate commercial accountability, team leadership scope, and measurable business impact before proceeding. The CV as submitted would benefit significantly from quantified outcomes and clearer leadership evidence.",
    bestFitRoles: {
      strongFit: ["Senior Product Manager", "Group Product Manager", "Product Lead (B2B SaaS)"],
      possibleFit: ["Head of Product (Series A-B)", "Product Operations Manager"],
      weakFit: ["Chief Product Officer", "VP of Product", "Product Marketing Manager"]
    },
    careerCeiling: {
      currentLevel: "Senior Manager / Senior Individual Contributor",
      nextLevel: "Head of Product or Group Product Manager within 12-18 months",
      potentialLevel: "VP of Product with demonstrated commercial accountability",
      reasoning: "The trajectory and domain depth are consistent with a path to VP-level leadership, but the complete absence of commercial ownership evidence and unclear leadership scope represent genuine barriers to that progression. Development of P&L accountability and a public professional presence would materially strengthen the case."
    }
  }
};

let stepTimer;
let currentStep = 0;

document.querySelector("#homeLogo").addEventListener("click", () => showView("home"));
document.querySelector("#navUploadBtn").addEventListener("click", () => showView("upload"));
document.querySelector("#heroUploadBtn").addEventListener("click", () => showView("upload"));
document.querySelector("#backHomeBtn").addEventListener("click", () => showView("home"));
document.querySelector("#sampleReportBtn").addEventListener("click", renderSample);
document.querySelector("#heroSampleBtn").addEventListener("click", renderSample);
document.querySelector("#howItWorksBtn").addEventListener("click", () => {
  showView("home");
  document.querySelector("#howItWorks").scrollIntoView({ behavior: "smooth" });
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  setSelectedFile(file);
});

["dragenter", "dragover"].forEach((eventName) => {
  uploadArea.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadArea.classList.add("over");
    uploadMain.textContent = "Release to upload";
  });
});

["dragleave", "drop"].forEach((eventName) => {
  uploadArea.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadArea.classList.remove("over");
    uploadMain.textContent = "Drag and drop a CV here";
  });
});

uploadArea.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer.files;
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  setSelectedFile(file);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = fileInput.files[0];
  if (!file) {
    renderError("Upload a PDF or DOCX CV before running the audit.");
    return;
  }

  if (file.size > 6 * 1024 * 1024) {
    renderError("Please upload a CV under 6 MB.");
    return;
  }

  const formData = new FormData(form);
  const payload = {
    file: {
      name: file.name,
      type: file.type,
      base64: await fileToBase64(file)
    },
    urls: {
      linkedin: formData.get("linkedinUrl")?.trim(),
      portfolio: formData.get("portfolioUrl")?.trim(),
      website: formData.get("websiteUrl")?.trim(),
      github: formData.get("githubUrl")?.trim()
    }
  };

  setLoading(true);

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "The analysis could not be completed.");
    }

    renderReport(data);
  } catch (error) {
    renderError(error.message);
  } finally {
    setLoading(false);
  }
});

function showView(name) {
  Object.entries(views).forEach(([key, element]) => {
    element.classList.toggle("hidden", key !== name);
  });
  nav.classList.toggle("hidden", name === "analyzing");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setSelectedFile(file) {
  fileName.textContent = file ? file.name : "Accepts PDF and DOCX · Max 6 MB";
  uploadMain.textContent = file ? "CV selected" : "Drag and drop a CV here";
}

function setLoading(isLoading) {
  analyzeButton.disabled = isLoading;
  analyzeButton.innerHTML = isLoading
    ? '<i class="ti ti-loader-2" aria-hidden="true"></i> Audit in Progress'
    : '<i class="ti ti-sparkles" aria-hidden="true"></i> Run Professional Audit';

  if (isLoading) {
    currentStep = 0;
    renderSteps();
    showView("analyzing");
    stepTimer = window.setInterval(() => {
      currentStep = Math.min(currentStep + 1, steps.length - 1);
      renderSteps();
    }, 900);
  } else {
    window.clearInterval(stepTimer);
  }
}

function renderSteps() {
  stepList.innerHTML = steps
    .map((step, index) => {
      const state = index < currentStep ? "done" : index === currentStep ? "active" : "pending";
      const icon = index < currentStep ? '<i class="ti ti-check" aria-hidden="true"></i>' : "";
      return `<li class="ci-step ${state}"><span class="ci-step-dot"></span>${icon}${escapeHtml(step)}</li>`;
    })
    .join("");
}

function renderSample() {
  renderReport(sampleAudit);
}

function renderError(message) {
  showView("report");
  report.innerHTML = `
    <div class="ci-error">
      <strong>Analysis could not run.</strong><br />
      ${escapeHtml(message)}
    </div>
    <div class="ci-report-actions">
      <button class="ci-btn-outline" type="button" data-action="new-analysis">Back to upload</button>
      <button class="ci-btn-primary" type="button" data-action="home">Back to home</button>
    </div>
  `;
  bindReportActions();
}

function renderReport(data) {
  const audit = data.audit || {};
  const profile = audit.extractedProfile || {};
  const candidateName = profile.name || "Candidate";
  const role = firstNonEmpty(profile.jobTitles) || firstNonEmpty(profile.skills) || "Professional audit";
  const isSample = data.mode === "sample";

  showView("report");
  report.innerHTML = `
    <div class="ci-report-header">
      <div>
        <div class="ci-report-kicker">Analysis report${isSample ? ' <span class="ci-mode-chip">Sample</span>' : ""}</div>
        <div class="ci-report-name">${escapeHtml(candidateName)}</div>
        <div class="ci-report-role">${escapeHtml(role)}</div>
        ${audit.professionalArchetype ? `<div class="ci-archetype-chip">${escapeHtml(audit.professionalArchetype)}</div>` : ""}
        <div class="ci-report-meta">Generated ${escapeHtml(new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" }))} · Based on submitted CV and public evidence where accessible</div>
      </div>
      <div class="ci-report-actions">
        <button class="ci-btn-outline" type="button" data-action="new-analysis">
          <i class="ti ti-upload" aria-hidden="true"></i>
          New analysis
        </button>
        <button class="ci-btn-primary" type="button" data-action="print">
          <i class="ti ti-download" aria-hidden="true"></i>
          Export PDF
        </button>
      </div>
    </div>

    ${card("01 · Professional identity", "Who this person appears to be", paragraph(audit.professionalIdentity))}
    ${card("02 · Career trajectory", "Progression interpretation", trajectory(audit.careerTrajectory))}
    ${card("03 · Hidden signals", "What the CV implies but does not say", hiddenSignals(audit.hiddenSignals))}
    ${card("04 · Evidence strength", "Assessment by area", evidenceStrength(audit.evidenceStrength))}
    ${card("05 · Public profile evidence", "Cross-reference with public record", publicEvidence(audit.publicProfileEvidence))}
    ${missingCard(audit.missingEvidence)}
    ${recruiterConcernsCard(audit.recruiterConcerns)}
    ${card("08 · Interview priorities", "Questions built from this CV's gaps", interviewPriorities(audit.interviewPriorities))}
    ${takeaway(audit.employerTakeaway)}
    ${bestFitCard(audit.bestFitRoles)}
    ${careerCeilingCard(audit.careerCeiling)}

    <div class="ci-report-actions">
      <button class="ci-btn-outline" type="button" data-action="home">Back to home</button>
      <button class="ci-btn-primary" type="button" data-action="new-analysis">
        <i class="ti ti-upload" aria-hidden="true"></i>
        Analyse another CV
      </button>
    </div>
  `;
  bindReportActions();
}

function card(eyebrow, title, body) {
  return `
    <section class="ci-rcard">
      <div class="ci-rcard-eyebrow">${escapeHtml(eyebrow)}</div>
      <div class="ci-rcard-title">${escapeHtml(title)}</div>
      <div class="ci-rcard-body">${body}</div>
    </section>
  `;
}

function paragraph(value) {
  return `<p>${escapeHtml(value || "Limited evidence was available for this section.")}</p>`;
}

function trajectory(items = []) {
  if (!items.length) return paragraph("Career progression could not be inferred from the available evidence.");
  return `
    <div class="ci-tl">
      ${items.map((item, index) => {
        const isLast = index === items.length - 1;
        const isNextStep = item.label === "Likely Next Step";
        return `
          <div class="ci-tl-item${isNextStep ? " ci-tl-next" : ""}">
            <div class="ci-tl-year">${isNextStep ? "Next" : `Phase ${index + 1}`}</div>
            <div>
              <div class="ci-tl-role">${escapeHtml(item.label || "")}</div>
              <div class="ci-tl-note">${escapeHtml(item.narrative || "")}</div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function hiddenSignals(items = []) {
  if (!items.length) return paragraph("No hidden signals were identified.");
  return `
    <div class="ci-signals">
      ${items.map((item) => `
        <div class="ci-signal-item">
          <div class="ci-signal-label">${escapeHtml(item.signal || "")}</div>
          <div class="ci-signal-body">${escapeHtml(item.observation || "")}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function evidenceStrength(groups = {}) {
  return `
    ${evidenceGroup("Strong evidence", "s", groups.strongEvidence, "area", "assessment")}
    ${evidenceGroup("Moderate evidence", "m", groups.moderateEvidence, "area", "assessment")}
    ${evidenceGroup("Weak evidence", "l", groups.weakEvidence, "area", "assessment")}
    ${evidenceGroup("No evidence", "x", groups.noEvidence, "area", "assessment")}
  `;
}

function evidenceGroup(label, cls, items = [], areaKey, assessmentKey) {
  if (!items.length) return "";
  const dotClass = { s: "dot-s", m: "dot-m", l: "dot-l", x: "dot-x" }[cls] || "dot-l";
  const colorClass = { s: "clr-s", m: "clr-m", l: "clr-l", x: "clr-x" }[cls] || "clr-l";
  return `
    <div class="ci-ev-group">
      <div class="ci-comp-label"><span class="${dotClass}"></span><span class="${colorClass}">${escapeHtml(label)}</span></div>
      <div class="ci-ev-items">
        ${items.map((item) => `
          <div class="ci-ev-item">
            <div class="ci-ev-area">${escapeHtml(typeof item === "string" ? item : item[areaKey] || "")}</div>
            ${item[assessmentKey] ? `<div class="ci-ev-assessment">${escapeHtml(item[assessmentKey])}</div>` : ""}
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function publicEvidence(items = []) {
  if (!items.length) return paragraph("Limited public professional evidence was identified from the supplied URLs and public research.");
  return `
    <ul class="ci-evidence-list">
      ${items.map((item) => {
        if (typeof item === "string") return `<li>${escapeHtml(item)}</li>`;
        return `
          <li>
            <strong>${escapeHtml(item.finding || "")}</strong>
            ${item.detail ? ` ${escapeHtml(item.detail)}` : ""}
            ${item.source ? `<span class="ci-ev-source">${escapeHtml(item.source)}</span>` : ""}
          </li>
        `;
      }).join("")}
    </ul>
  `;
}

function missingCard(items = []) {
  const missing = items && items.length ? items : ["No major missing-evidence themes were identified."];
  return `
    <section class="ci-rcard ci-missing-card">
      <div class="ci-rcard-eyebrow">06 · Missing evidence</div>
      <div class="ci-rcard-title">What this CV leaves unanswered</div>
      <div class="ci-missing-note">These are evidence gaps a recruiter would expect to find. Not conclusions about ability.</div>
      ${missing.map((item) => `
        <div class="ci-missing-item">
          <div class="ci-missing-title"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Evidence gap</div>
          <div class="ci-missing-body">${escapeHtml(item)}</div>
        </div>
      `).join("")}
    </section>
  `;
}

function recruiterConcernsCard(items = []) {
  const concerns = items && items.length ? items : ["No specific recruiter concerns were identified."];
  return `
    <section class="ci-rcard ci-concerns-card">
      <div class="ci-rcard-eyebrow">07 · Recruiter concerns</div>
      <div class="ci-rcard-title">Unknowns that require validation</div>
      <div class="ci-missing-note">Questions that remain open even after reading the full CV and public evidence.</div>
      ${concerns.map((item, index) => `
        <div class="ci-concern-item">
          <div class="ci-q-num">${String(index + 1).padStart(2, "0")}</div>
          <div class="ci-concern-body">${escapeHtml(item)}</div>
        </div>
      `).join("")}
    </section>
  `;
}

function interviewPriorities(items = []) {
  if (!items.length) return paragraph("No interview priorities were generated.");
  return items.map((item, index) => `
    <div class="ci-q-item">
      <div class="ci-q-num">${String(index + 1).padStart(2, "0")}</div>
      <div class="ci-q-text">${escapeHtml(item)}</div>
    </div>
  `).join("");
}

function takeaway(value) {
  return `
    <section class="ci-takeaway">
      <div class="ci-takeaway-eyebrow">09 · Employer takeaway</div>
      <div class="ci-takeaway-title">Where this person creates value</div>
      <div class="ci-takeaway-body">${escapeHtml(value || "Limited evidence was available for an employer takeaway.")}</div>
    </section>
  `;
}

function bestFitCard(roles = {}) {
  const strong = roles.strongFit || [];
  const possible = roles.possibleFit || [];
  const weak = roles.weakFit || [];
  if (!strong.length && !possible.length && !weak.length) return "";
  return `
    <section class="ci-rcard ci-fit-card">
      <div class="ci-rcard-eyebrow">10 · Best fit roles</div>
      <div class="ci-rcard-title">Where this profile lands</div>
      <div class="ci-fit-grid">
        ${strong.length ? `
          <div class="ci-fit-col">
            <div class="ci-fit-label ci-fit-label-s"><span class="dot-s"></span> Strong fit</div>
            ${strong.map((r) => `<div class="ci-fit-role">${escapeHtml(r)}</div>`).join("")}
          </div>
        ` : ""}
        ${possible.length ? `
          <div class="ci-fit-col">
            <div class="ci-fit-label ci-fit-label-m"><span class="dot-m"></span> Possible fit</div>
            ${possible.map((r) => `<div class="ci-fit-role">${escapeHtml(r)}</div>`).join("")}
          </div>
        ` : ""}
        ${weak.length ? `
          <div class="ci-fit-col">
            <div class="ci-fit-label ci-fit-label-l"><span class="dot-l"></span> Weak fit</div>
            ${weak.map((r) => `<div class="ci-fit-role">${escapeHtml(r)}</div>`).join("")}
          </div>
        ` : ""}
      </div>
    </section>
  `;
}

function careerCeilingCard(ceiling = {}) {
  if (!ceiling.currentLevel && !ceiling.nextLevel && !ceiling.potentialLevel) return "";
  return `
    <section class="ci-rcard ci-ceiling-card">
      <div class="ci-rcard-eyebrow">11 · Career ceiling</div>
      <div class="ci-rcard-title">Trajectory assessment</div>
      <div class="ci-ceiling-track">
        ${ceiling.currentLevel ? `
          <div class="ci-ceiling-step">
            <div class="ci-ceiling-dot ci-ceiling-dot-now"></div>
            <div>
              <div class="ci-ceiling-stage">Current level</div>
              <div class="ci-ceiling-level">${escapeHtml(ceiling.currentLevel)}</div>
            </div>
          </div>
        ` : ""}
        ${ceiling.nextLevel ? `
          <div class="ci-ceiling-step">
            <div class="ci-ceiling-dot ci-ceiling-dot-next"></div>
            <div>
              <div class="ci-ceiling-stage">Next level</div>
              <div class="ci-ceiling-level">${escapeHtml(ceiling.nextLevel)}</div>
            </div>
          </div>
        ` : ""}
        ${ceiling.potentialLevel ? `
          <div class="ci-ceiling-step">
            <div class="ci-ceiling-dot ci-ceiling-dot-potential"></div>
            <div>
              <div class="ci-ceiling-stage">Potential ceiling</div>
              <div class="ci-ceiling-level">${escapeHtml(ceiling.potentialLevel)}</div>
            </div>
          </div>
        ` : ""}
      </div>
      ${ceiling.reasoning ? `<div class="ci-ceiling-reasoning">${escapeHtml(ceiling.reasoning)}</div>` : ""}
    </section>
  `;
}

function bindReportActions() {
  report.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "new-analysis") showView("upload");
      if (action === "home") showView("home");
      if (action === "print") window.print();
    });
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read the uploaded file."));
    reader.readAsDataURL(file);
  });
}

function firstNonEmpty(items = []) {
  return Array.isArray(items) ? items.find(Boolean) : "";
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
