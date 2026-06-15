import { DIMENSION_ORDER, DIMENSION_LABELS } from "./config.js";
import { renderDimensionBars } from "./dimensions.js";
import { highlightEvidence } from "./highlight.js";

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

const GAP_TAG = {
  critical: "[CRITICAL GAP]",
  high: "[HIGH GAP]",
  medium: "[MEDIUM GAP]",
  low: "[LOW GAP]",
};

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

function telemetryStatus(total) {
  if (total <= 50) {
    return { text: "[ SYSTEM STATUS: UNSTABLE / CRITICAL ]", className: "status-critical" };
  }
  if (total <= 75) {
    return { text: "[ SPEC HEALTH: DEGRADED / WARNING ]", className: "status-warning" };
  }
  if (total <= 90) {
    return { text: "[ SPEC HEALTH: NOMINAL / STABLE ]", className: "status-stable" };
  }
  return { text: "[ SPEC HEALTH: OPTIMAL / CLEAR ]", className: "status-optimal" };
}

/**
 * Renderiza a resposta de análise completa.
 * @param {object} analysis - AnalysisResponse
 * @param {object} ctx - { textarea, previousScore, originalText }
 */
export function render(analysis, ctx = {}) {
  renderTelemetry(analysis, ctx.previousScore);
  renderDimensionBars("dimension-bars", analysis.score.dimensions);
  renderStream(analysis, ctx);
}

function renderTelemetry(analysis, previousScore) {
  const score = analysis.score;
  const statusEl = document.getElementById("score-status");
  const valueEl = document.getElementById("score-value");
  const delta = document.getElementById("score-delta");
  const counters = document.getElementById("error-counters");

  const status = telemetryStatus(score.total);
  statusEl.textContent = status.text;
  statusEl.className = `telemetry-status mono ${status.className}`;
  valueEl.textContent = score.total;

  counters.innerHTML = "";
  const counts = [
    ["GAPS", analysis.gaps?.length ?? 0],
    ["AMBIGUITIES", analysis.ambiguities?.length ?? 0],
    ["ASSUMPTIONS", analysis.assumptions?.length ?? 0],
    ["SUGGESTIONS", analysis.suggestions?.length ?? 0],
  ];
  counts.forEach(([label, count]) => {
    counters.appendChild(el("span", "counter-cell", `${label}: ${count}`));
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

function renderStream(analysis, ctx) {
  const stream = document.getElementById("inspection-stream");
  stream.innerHTML = "";

  const sections = [
    ["gaps", "GAPS", () => buildGaps(analysis.gaps, ctx.textarea)],
    ["ambiguities", "AMBIGUITIES", () => buildAmbiguities(analysis.ambiguities, ctx.textarea)],
    ["assumptions", "ASSUMPTIONS", () => buildAssumptions(analysis.assumptions)],
    ["suggestions", "SUGGESTIONS", () => buildSuggestions(analysis.suggestions)],
    [
      "dimensions",
      "DIMENSIONS",
      () => buildDimensions(analysis.score.dimensions, ctx.textarea),
    ],
    ["diff", "CODE REVIEW", () => buildDiff(analysis, ctx)],
  ];

  sections.forEach(([id, title, fn]) => {
    const section = el("section", "stream-section");
    section.dataset.section = id;

    const head = el("div", "stream-section-head");
    head.innerHTML = `<span class="stream-section-tag mono">// ${title}</span>`;
    section.appendChild(head);

    const body = el("div", "stream-section-body");
    body.appendChild(fn());
    section.appendChild(body);
    stream.appendChild(section);
  });
}

function buildGaps(gaps, textarea) {
  const frag = document.createDocumentFragment();
  if (!gaps?.length) {
    frag.appendChild(emptyLog("no gaps detected"));
    return frag;
  }

  [...gaps]
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9))
    .forEach((gap) => {
      const entry = el("div", "log-entry clickable");
      entry.innerHTML =
        `<span class="log-tag">${GAP_TAG[gap.severity] || "[GAP]"}</span>` +
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
    const interps = (amb.interpretations || [])
      .map((i) => `<li>${escapeHtml(i)}</li>`)
      .join("");
    const entry = el("div", "log-entry");
    entry.innerHTML =
      `<span class="log-tag">[WARNING AMBIGUITY]</span>` +
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
    const entry = el("div", "log-entry");
    entry.innerHTML =
      `<span class="log-tag">[HIDDEN ASSUMPTION]</span>` +
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
      const tag =
        s.priority === "high"
          ? "[HIGH PRIORITY]"
          : s.priority === "medium"
            ? "[MEDIUM PRIORITY]"
            : "[LOW PRIORITY]";
      const entry = el("div", "log-entry");
      entry.innerHTML =
        `<span class="log-tag">${tag}</span>` +
        `<div class="log-body">` +
        `<p class="log-msg">${escapeHtml(s.text)}</p>` +
        `<p class="log-meta">${escapeHtml(s.dimension)}</p>` +
        `</div>`;
      frag.appendChild(entry);
    });
  return frag;
}

function buildDimensions(dimensions, textarea) {
  const frag = document.createDocumentFragment();

  DIMENSION_ORDER.forEach((key) => {
    const dim = dimensions[key];
    const block = el("div", "dim-block");

    const head = el("button", "dim-block-head mono");
    head.type = "button";
    head.innerHTML =
      `<span>${DIMENSION_LABELS[key]}</span><span class="dim-block-score">${dim.score}</span>`;

    const body = el("div", "dim-block-body");
    body.appendChild(el("p", "log-detail", escapeHtml(dim.justification)));

    if (dim.evidence?.length) {
      const evRow = el("div", "evidence-row");
      dim.evidence.forEach((ev) => {
        const chip = el("button", "evidence-chip mono", escapeHtml(ev));
        chip.type = "button";
        chip.title = "locate in source";
        chip.addEventListener("click", (e) => {
          e.stopPropagation();
          highlightEvidence(textarea, ev);
        });
        evRow.appendChild(chip);
      });
      body.appendChild(evRow);
    }

    body.appendChild(el("p", "log-meta", `→ ${escapeHtml(dim.suggestion)}`));
    head.addEventListener("click", () => block.classList.toggle("open"));
    block.appendChild(head);
    block.appendChild(body);
    frag.appendChild(block);
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
      "review required — resolve all <strong>[A DEFINIR]</strong> markers before adoption"
    )
  );

  const split = el("div", "diff-split");
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
