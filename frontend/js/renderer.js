import { renderDimensionBars } from "./dimensions.js";
import { highlightEvidence } from "./highlight.js";

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

const SEV_LABEL = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
};

const COUNTER_CONFIG = [
  { filter: "gaps", label: "CRITICAL FINDINGS", countKey: "gaps" },
  { filter: "ambiguities", label: "AMBIGUITIES", countKey: "ambiguities" },
  { filter: "assumptions", label: "HIDDEN ASSUMPTIONS", countKey: "assumptions" },
  { filter: "suggestions", label: "SUGGESTIONS", countKey: "suggestions" },
];

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function healthBand(total) {
  if (total <= 25) return { label: "CRITICAL", className: "health-critical" };
  if (total <= 50) return { label: "DEGRADED", className: "health-degraded" };
  if (total <= 75) return { label: "WARNING", className: "health-warning" };
  return { label: "HEALTHY", className: "health-healthy" };
}

function gapTagClass(severity) {
  return `sev-badge sev-badge--${severity || "medium"}`;
}

function buildRationale(analysis) {
  const gaps = analysis.gaps ?? [];
  const top = [...gaps].sort(
    (a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9)
  )[0];

  if (top) {
    return `Primary failure: ${top.description}`;
  }

  const ambig = analysis.ambiguities?.length ?? 0;
  const assum = analysis.assumptions?.length ?? 0;
  if (ambig || assum) {
    const parts = [];
    if (ambig) parts.push(`${ambig} structural ambiguit${ambig !== 1 ? "ies" : "y"}`);
    if (assum) parts.push(`${assum} undeclared assumption${assum !== 1 ? "s" : ""}`);
    return parts.join(" · ");
  }

  return "No structural failures detected in this scan.";
}

/**
 * Renderiza a resposta de análise completa.
 * @param {object} analysis - AnalysisResponse
 * @param {object} ctx - { textarea, previousScore, originalText }
 */
export function render(analysis, ctx = {}) {
  renderTelemetry(analysis, ctx.previousScore);
  renderDimensionBars("dimension-bars", analysis.score.dimensions);
  renderReviewFeature(analysis, ctx);
  renderStream(analysis, ctx);
}

function renderTelemetry(analysis, previousScore) {
  const score = analysis.score;
  const bandEl = document.getElementById("health-band");
  const valueEl = document.getElementById("score-value");
  const delta = document.getElementById("score-delta");
  const rationale = document.getElementById("telemetry-rationale");
  const counters = document.getElementById("error-counters");

  const band = healthBand(score.total);
  bandEl.textContent = band.label;
  bandEl.className = `health-band mono ${band.className}`;
  valueEl.textContent = score.total;
  rationale.textContent = buildRationale(analysis);

  counters.innerHTML = "";
  const counts = {
    gaps: analysis.gaps?.length ?? 0,
    ambiguities: analysis.ambiguities?.length ?? 0,
    assumptions: analysis.assumptions?.length ?? 0,
    suggestions: analysis.suggestions?.length ?? 0,
  };

  COUNTER_CONFIG.forEach(({ filter, label, countKey }) => {
    const count = counts[countKey];
    const btn = el("button", "finding-cell");
    btn.type = "button";
    btn.dataset.filter = filter;
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", `Filtrar ${label.toLowerCase()}`);
    btn.innerHTML =
      `<span class="finding-count">${count}</span>` +
      `<span class="finding-label">${label}</span>`;
    counters.appendChild(btn);
  });

  if (typeof previousScore === "number") {
    const diff = score.total - previousScore;
    delta.hidden = false;
    if (diff > 0) {
      delta.textContent = `Δ +${diff}`;
      delta.className = "score-delta up";
    } else if (diff < 0) {
      delta.textContent = `Δ ${diff}`;
      delta.className = "score-delta down";
    } else {
      delta.textContent = "Δ 0";
      delta.className = "score-delta flat";
    }
  } else {
    delta.hidden = true;
  }
}

function renderReviewFeature(analysis, ctx) {
  const panel = document.getElementById("review-feature");
  panel.innerHTML = "";

  const head = el("div", "review-feature-head");
  head.innerHTML =
    `<span class="review-feature-tag mono">// SPEC REVISION</span>` +
    `<span class="review-feature-hint mono">before / after</span>`;
  panel.appendChild(head);

  const body = el("div", "review-feature-body");
  body.appendChild(buildDiff(analysis, ctx));
  panel.appendChild(body);
}

function renderStream(analysis, ctx) {
  const stream = document.getElementById("inspection-stream");
  stream.innerHTML = "";

  const sections = [
    ["gaps", "FINDINGS", () => buildGaps(analysis.gaps, ctx.textarea)],
    ["ambiguities", "AMBIGUITIES", () => buildAmbiguities(analysis.ambiguities, ctx.textarea)],
    ["assumptions", "ASSUMPTIONS", () => buildAssumptions(analysis.assumptions)],
    ["suggestions", "SUGGESTIONS", () => buildSuggestions(analysis.suggestions)],
  ];

  sections.forEach(([id, title, fn]) => {
    const section = el("section", "stream-section");
    section.dataset.section = id;

    const sectionHead = el("div", "stream-section-head");
    sectionHead.innerHTML = `<span class="stream-section-tag mono">// ${title}</span>`;
    section.appendChild(sectionHead);

    const sectionBody = el("div", "stream-section-body");
    sectionBody.appendChild(fn());
    section.appendChild(sectionBody);
    stream.appendChild(section);
  });
}

function buildGaps(gaps, textarea) {
  const frag = document.createDocumentFragment();
  if (!gaps?.length) {
    frag.appendChild(emptyLog("no critical findings"));
    return frag;
  }

  [...gaps]
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9))
    .forEach((gap) => {
      const sev = gap.severity || "medium";
      const entry = el("div", `log-entry log-entry--${sev} clickable`);
      entry.innerHTML =
        `<span class="${gapTagClass(sev)}">${SEV_LABEL[sev] || "GAP"}</span>` +
        `<div class="log-body">` +
        `<p class="log-msg">${escapeHtml(gap.description)}</p>` +
        `<p class="log-detail">${escapeHtml(gap.question)}</p>` +
        `<p class="log-meta">${escapeHtml(gap.related_dimension)} · ${escapeHtml(gap.category)}</p>` +
        `</div>`;
      entry.addEventListener("click", () => highlightEvidence(textarea, gap.description));
      frag.appendChild(entry);
    });
  return frag;
}

function buildAmbiguities(ambiguities, textarea) {
  const frag = document.createDocumentFragment();
  if (!ambiguities?.length) {
    frag.appendChild(emptyLog("no ambiguities detected"));
    return frag;
  }

  ambiguities.forEach((amb) => {
    const entry = el("div", "log-entry log-entry--medium");
    const interps = (amb.interpretations || [])
      .map((i) => `<li>${escapeHtml(i)}</li>`)
      .join("");
    entry.innerHTML =
      `<span class="sev-badge sev-badge--medium">AMBIGUITY</span>` +
      `<div class="log-body">` +
      `<p class="log-msg mono">"${escapeHtml(amb.term)}"</p>` +
      `<p class="log-detail">${escapeHtml(amb.context)}</p>` +
      `<ul class="log-list">${interps}</ul>` +
      `<p class="log-meta">→ ${escapeHtml(amb.suggestion)}</p>` +
      `</div>`;
    if (amb.term) {
      const locate = el("button", "locate-btn mono", "locate");
      locate.type = "button";
      locate.addEventListener("click", () => highlightEvidence(textarea, amb.term));
      entry.querySelector(".log-body").appendChild(locate);
    }
    frag.appendChild(entry);
  });
  return frag;
}

function buildAssumptions(assumptions) {
  const frag = document.createDocumentFragment();
  if (!assumptions?.length) {
    frag.appendChild(emptyLog("no hidden assumptions detected"));
    return frag;
  }

  assumptions.forEach((asm) => {
    const entry = el("div", "log-entry log-entry--high");
    entry.innerHTML =
      `<span class="sev-badge sev-badge--high">ASSUMPTION</span>` +
      `<div class="log-body">` +
      `<p class="log-msg">${escapeHtml(asm.assumption)}</p>` +
      `<p class="log-detail">risk: ${escapeHtml(asm.risk)}</p>` +
      `<p class="log-meta">${escapeHtml(asm.question)}</p>` +
      `</div>`;
    frag.appendChild(entry);
  });
  return frag;
}

function buildSuggestions(suggestions) {
  const frag = document.createDocumentFragment();
  if (!suggestions?.length) {
    frag.appendChild(emptyLog("no suggestions"));
    return frag;
  }

  [...suggestions]
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9))
    .forEach((s) => {
      const pri = s.priority === "high" ? "high" : s.priority === "medium" ? "medium" : "low";
      const entry = el("div", `log-entry log-entry--${pri}`);
      entry.innerHTML =
        `<span class="sev-badge sev-badge--${pri}">${pri.toUpperCase()}</span>` +
        `<div class="log-body">` +
        `<p class="log-msg">${escapeHtml(s.text)}</p>` +
        `<p class="log-meta">${escapeHtml(s.dimension)}</p>` +
        `</div>`;
      frag.appendChild(entry);
    });
  return frag;
}

function buildDiff(analysis, ctx) {
  const frag = document.createDocumentFragment();
  const originalText = ctx.originalText ?? (ctx.textarea ? ctx.textarea.value : "");
  const improvedText = analysis.improved_spec?.text || "";

  frag.appendChild(
    el(
      "p",
      "diff-notice mono",
      "Resolve all <strong>[A DEFINIR]</strong> markers before adoption — this is the revised spec."
    )
  );

  const split = el("div", "diff-split diff-split--featured");
  split.appendChild(buildDiffPane("before", "original", originalText));
  split.appendChild(buildDiffPane("after", "proposed", improvedText, originalText));
  frag.appendChild(split);

  const changes = analysis.improved_spec?.changes_summary || [];
  if (changes.length) {
    const cs = el("div", "changes-summary");
    cs.appendChild(el("p", "mono", "// CHANGES"));
    const ul = el("ul");
    changes.forEach((c) => ul.appendChild(el("li", null, escapeHtml(c))));
    cs.appendChild(ul);
    frag.appendChild(cs);
  }

  const actions = el("div", "diff-actions");
  const copyBtn = el("button", "secondary-btn mono", "copy after");
  copyBtn.type = "button";
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(improvedText);
      copyBtn.textContent = "copied";
      setTimeout(() => (copyBtn.textContent = "copy after"), 1500);
    } catch {
      copyBtn.textContent = "copy failed";
    }
  });
  actions.appendChild(copyBtn);
  frag.appendChild(actions);

  return frag;
}

function buildDiffPane(side, badge, text, originalText = null) {
  const isAfter = side === "after";
  const pane = el("div", `diff-pane diff-pane--${side}`);
  pane.innerHTML =
    `<div class="diff-pane-bar mono"><span>${side}</span><span class="diff-badge">${badge}</span></div>`;

  const lines = el("div", "diff-lines");
  const beforeLines = (originalText ?? text).split("\n");
  const sourceLines = text.split("\n");

  sourceLines.forEach((line, i) => {
    const row = el("div", "diff-line");
    const ln = el("span", "diff-ln mono", String(i + 1));
    const code = el("span", "diff-code mono");

    if (isAfter) {
      const changed = i >= beforeLines.length || line !== beforeLines[i];
      if (changed) row.classList.add("diff-line--modified");
      if (/\[A DEFINIR[^\]]*\]/.test(line)) row.classList.add("diff-line--todo");
      code.innerHTML = escapeHtml(line).replace(
        /\[A DEFINIR[^\]]*\]/g,
        (m) => `<mark class="todo-mark">${m}</mark>`
      );
    } else {
      code.textContent = line;
    }

    row.appendChild(ln);
    row.appendChild(code);
    lines.appendChild(row);
  });

  pane.appendChild(lines);
  return pane;
}

function emptyLog(message) {
  return el("p", "log-empty mono", `// ${message}`);
}
