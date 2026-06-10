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
  "Analysing experience",
  "Identifying strengths",
  "Finding missing evidence",
  "Generating report"
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
    professionalIdentity:
      "Sarah Chen presents as a mid-to-senior Product Manager with experience across B2B SaaS and fintech verticals. Her CV communicates a product-led orientation with consistent focus on roadmap ownership and cross-functional collaboration.",
    careerTrajectory: [
      { label: "Product Analysis Foundation", narrative: "Early experience appears rooted in analytics and product discovery." },
      { label: "Product Ownership", narrative: "Subsequent roles suggest ownership of roadmap, delivery, and stakeholder alignment." },
      { label: "Leadership Signals", narrative: "Recent roles imply broader leadership, though team size and decision authority need clarification." }
    ],
    coreCompetencies: {
      strongEvidence: [
        { competency: "Product Strategy", evidence: "Repeated roadmap and product ownership language.", source: "CV" },
        { competency: "Stakeholder Management", evidence: "Cross-functional collaboration appears consistently.", source: "CV" }
      ],
      moderateEvidence: [
        { competency: "Data Analysis", evidence: "Analysis is referenced, but methodology and depth are not fully evidenced.", source: "CV" },
        { competency: "User Research", evidence: "Discovery themes appear, but research examples are limited.", source: "CV" }
      ],
      limitedEvidence: [
        { competency: "P&L Ownership", evidence: "Commercial ownership is not clearly supported by numbers.", source: "CV" },
        { competency: "Executive Reporting", evidence: "Senior stakeholder exposure is implied but not evidenced.", source: "CV" }
      ]
    },
    publicProfileEvidence: [
      {
        finding: "Publicly available professional information appears broadly consistent with the CV narrative.",
        detail: "Sample report only. Real submissions use supplied URLs and public research snippets.",
        source: "Sample"
      }
    ],
    whatTheCvDoesNotSay: [
      "No quantified business outcomes are attached to major achievements.",
      "Team leadership scope and reporting line are unclear.",
      "Commercial ownership, budget responsibility, and target accountability need clarification.",
      "Decision validation methodology is not strongly evidenced."
    ],
    interviewFocusAreas: [
      "Which shipped product had the clearest measurable business impact?",
      "How large was the team or cross-functional group involved?",
      "What metrics did the candidate own directly?",
      "Which product decision was made against stakeholder pressure, and why?",
      "How did the candidate validate roadmap priorities?"
    ],
    employerTakeaway:
      "A company may be interested in interviewing this candidate for senior product roles where product ownership and stakeholder coordination matter, while using the interview to clarify measurable impact and leadership scope."
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
    const response = await fetch("/.netlify/functions/analyze", {
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

    ${card("01 · Professional identity", "Executive summary", paragraph(audit.professionalIdentity))}
    ${card("02 · Career trajectory", "Progression narrative", trajectory(audit.careerTrajectory))}
    ${card("03 · Core competencies", "Evidence by strength", competencies(audit.coreCompetencies))}
    ${card("04 · Public profile evidence", "Public alignment", publicEvidence(audit.publicProfileEvidence), "")}
    ${missingCard(audit.whatTheCvDoesNotSay)}
    ${card("06 · Suggested interview questions", "Questions built from this CV's gaps", questions(audit.interviewFocusAreas))}
    ${takeaway(audit.employerTakeaway)}

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

function card(eyebrow, title, body, extraClass = "") {
  return `
    <section class="ci-rcard ${extraClass}">
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
      ${items
        .map(
          (item, index) => `
            <div class="ci-tl-item">
              <div class="ci-tl-year">Phase ${index + 1}</div>
              <div>
                <div class="ci-tl-role">${escapeHtml(item.label || "Professional Development")}</div>
                <div class="ci-tl-note">${escapeHtml(item.narrative || "")}</div>
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function competencies(groups = {}) {
  return `
    ${competencyGroup("Strong evidence", "s", groups.strongEvidence)}
    ${competencyGroup("Moderate evidence", "m", groups.moderateEvidence)}
    ${competencyGroup("Limited evidence", "l", groups.limitedEvidence)}
  `;
}

function competencyGroup(label, className, items = []) {
  const dot = className === "s" ? "dot-s" : className === "m" ? "dot-m" : "dot-l";
  const color = className === "s" ? "clr-s" : className === "m" ? "clr-m" : "clr-l";
  const badges = items.length
    ? items.map((item) => `<span class="ci-badge ${className}" title="${escapeAttr(formatEvidence(item))}">${escapeHtml(formatCompetency(item))}</span>`).join("")
    : `<span class="ci-badge ${className}">No clear evidence identified</span>`;

  return `
    <div class="ci-comp-group">
      <div class="ci-comp-label"><span class="${dot}"></span><span class="${color}">${escapeHtml(label)}</span></div>
      <div class="ci-badges">${badges}</div>
    </div>
  `;
}

function publicEvidence(items = []) {
  if (!items.length) {
    return paragraph("Limited public professional evidence was identified from the supplied URLs and public research.");
  }

  return `
    <ul>
      ${items
        .map((item) => {
          if (typeof item === "string") return `<li>${escapeHtml(item)}</li>`;
          const source = item.source ? ` Source: ${item.source}.` : "";
          return `<li><strong>${escapeHtml(item.finding || "Public evidence finding")}</strong>${item.detail ? ` ${escapeHtml(item.detail)}` : ""}${escapeHtml(source)}</li>`;
        })
        .join("")}
    </ul>
  `;
}

function missingCard(items = []) {
  const missing = items.length ? items : ["No major missing-evidence themes were identified."];
  return `
    <section class="ci-rcard ci-missing-card">
      <div class="ci-rcard-eyebrow">05 · Missing evidence</div>
      <div class="ci-rcard-title">What this CV leaves unanswered</div>
      <div class="ci-missing-note">These are evidence gaps, not conclusions about ability.</div>
      ${missing
        .map(
          (item) => `
          <div class="ci-missing-item">
            <div class="ci-missing-title"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Evidence gap</div>
            <div class="ci-missing-body">${escapeHtml(item)}</div>
          </div>
        `
        )
        .join("")}
    </section>
  `;
}

function questions(items = []) {
  if (!items.length) return paragraph("No interview focus areas were generated.");
  return items
    .map(
      (item, index) => `
        <div class="ci-q-item">
          <div class="ci-q-num">${String(index + 1).padStart(2, "0")}</div>
          <div class="ci-q-text">${escapeHtml(item)}</div>
        </div>
      `
    )
    .join("");
}

function takeaway(value) {
  return `
    <section class="ci-takeaway">
      <div class="ci-takeaway-eyebrow">07 · Employer takeaway</div>
      <div class="ci-takeaway-title">Executive summary</div>
      <div class="ci-takeaway-body">${escapeHtml(value || "Limited evidence was available for an employer takeaway.")}</div>
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

function formatCompetency(item) {
  if (typeof item === "string") return item;
  return item.competency || "Competency";
}

function formatEvidence(item) {
  if (typeof item === "string") return item;
  return [item.evidence, item.source ? `Source: ${item.source}` : ""].filter(Boolean).join(" ");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value = "") {
  return escapeHtml(value).replaceAll("\n", " ");
}
