import { DIMENSION_ORDER, DIMENSION_LABELS } from "./config.js";
import { renderDimensionBars } from "./dimensions.js";
import { highlightEvidence } from "./highlight.js";

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

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

function countRelevant(gaps) {
  if (!gaps?.length) return 0;
  return gaps.filter((g) => g.severity === "critical" || g.severity === "high").length;
}

function buildDiagnosis(analysis) {
  const gaps = analysis.gaps?.length ?? 0;
  const ambig = analysis.ambiguities?.length ?? 0;
  const assum = analysis.assumptions?.length ?? 0;
  const relevant = countRelevant(analysis.gaps);

  const parts = [];
  if (gaps) parts.push(`${gaps} lacuna${gaps !== 1 ? "s" : ""}`);
  if (ambig) parts.push(`${ambig} ambiguidade${ambig !== 1 ? "s" : ""}`);
  if (assum) parts.push(`${assum} suposição${assum !== 1 ? "ões" : ""}`);

  if (!parts.length) {
    return "Nenhum problema estrutural detectado nesta inspeção.";
  }

  const summary = parts.join(" · ");
  if (relevant > 0) {
    return `${relevant} problema${relevant !== 1 ? "s" : ""} relevante${relevant !== 1 ? "s" : ""} · ${summary}`;
  }
  return summary;
}

/**
 * Renderiza a resposta de análise completa.
 * @param {object} analysis - AnalysisResponse
 * @param {object} ctx - { textarea, previousScore, originalText }
 */
export function render(analysis, ctx = {}) {
  renderScore(analysis.score, analysis, ctx.previousScore);
  renderDimensionBars("dimension-bars", analysis.score.dimensions);
  renderGaps(analysis.gaps, ctx.textarea);
  renderAmbiguities(analysis.ambiguities, ctx.textarea);
  renderAssumptions(analysis.assumptions);
  renderSuggestions(analysis.suggestions);
  renderDimensions(analysis.score.dimensions, ctx.textarea);
  renderDiff(analysis, ctx);
}

function renderScore(score, analysis, previousScore) {
  const value = document.getElementById("score-value");
  const label = document.getElementById("score-label");
  const delta = document.getElementById("score-delta");
  const diagnosis = document.getElementById("scan-diagnosis");

  value.textContent = score.total;
  label.textContent = score.label.toUpperCase();
  diagnosis.textContent = buildDiagnosis(analysis);

  if (typeof previousScore === "number") {
    const diff = score.total - previousScore;
    delta.hidden = false;
    if (diff > 0) {
      delta.textContent = `+${diff} vs. scan anterior`;
      delta.className = "score-delta up";
    } else if (diff < 0) {
      delta.textContent = `${diff} vs. scan anterior`;
      delta.className = "score-delta down";
    } else {
      delta.textContent = "sem variação";
      delta.className = "score-delta flat";
    }
  } else {
    delta.hidden = true;
  }
}

function renderDimensions(dimensions, textarea) {
  const panel = document.querySelector('[data-panel="dimensions"]');
  panel.innerHTML = "";
  panel.appendChild(
    panelHeader("Dimensões", "Detalhe por eixo de inspeção — justificativa, evidências e sugestões.")
  );

  DIMENSION_ORDER.forEach((key) => {
    const dim = dimensions[key];
    const wrapper = el("div", "dimension");

    const head = el("button", "dimension-head");
    head.type = "button";
    head.innerHTML =
      `<span class="dimension-name">${DIMENSION_LABELS[key]}</span>` +
      `<span class="dimension-score">${dim.score}</span>`;

    const body = el("div", "dimension-body");
    body.appendChild(
      el("p", null, `<strong>Justificativa:</strong> ${escapeHtml(dim.justification)}`)
    );

    if (dim.evidence?.length) {
      const evWrap = el("p", null, "<strong>Evidências:</strong> ");
      dim.evidence.forEach((ev) => {
        const chip = el("span", "chip", escapeHtml(ev));
        chip.title = "Localizar no texto original";
        chip.addEventListener("click", (e) => {
          e.stopPropagation();
          highlightEvidence(textarea, ev);
        });
        evWrap.appendChild(chip);
      });
      body.appendChild(evWrap);
    }

    body.appendChild(
      el("p", "muted", `<strong>Sugestão:</strong> ${escapeHtml(dim.suggestion)}`)
    );

    head.addEventListener("click", () => wrapper.classList.toggle("open"));
    wrapper.appendChild(head);
    wrapper.appendChild(body);
    panel.appendChild(wrapper);
  });
}

function renderGaps(gaps, textarea) {
  const panel = document.querySelector('[data-panel="gaps"]');
  panel.innerHTML = "";
  panel.appendChild(
    panelHeader("Lacunas detectadas", "Informação ausente ou incompleta que impede execução confiável.")
  );

  if (!gaps?.length) {
    panel.appendChild(emptyState("Nenhuma lacuna detectada nesta inspeção."));
    return;
  }

  [...gaps]
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9))
    .forEach((gap) => {
      const card = el("div", "item-card clickable");
      card.innerHTML =
        `<span class="sev sev-${gap.severity}">${gap.severity}</span>` +
        `<p class="item-title">${escapeHtml(gap.description)}</p>` +
        `<p class="item-question">${escapeHtml(gap.question)}</p>` +
        `<p class="muted">${escapeHtml(gap.related_dimension)} · ${escapeHtml(gap.category)}</p>`;
      card.addEventListener("click", () => highlightEvidence(textarea, gap.description));
      panel.appendChild(card);
    });
}

function renderAmbiguities(ambiguities, textarea) {
  const panel = document.querySelector('[data-panel="ambiguities"]');
  panel.innerHTML = "";
  panel.appendChild(
    panelHeader("Ambiguidades", "Termos ou trechos com múltiplas interpretações possíveis.")
  );

  if (!ambiguities?.length) {
    panel.appendChild(emptyState("Nenhuma ambiguidade detectada."));
    return;
  }

  ambiguities.forEach((amb) => {
    const card = el("div", "item-card");
    const interps = (amb.interpretations || [])
      .map((i) => `<li>${escapeHtml(i)}</li>`)
      .join("");
    card.innerHTML =
      `<p class="item-title mono">“${escapeHtml(amb.term)}”</p>` +
      `<p class="muted">${escapeHtml(amb.context)}</p>` +
      `<p><strong>Interpretações:</strong></p><ul>${interps}</ul>` +
      `<p class="muted"><strong>Sugestão:</strong> ${escapeHtml(amb.suggestion)}</p>`;
    if (amb.term) {
      const chip = el("span", "chip", "Localizar termo");
      chip.addEventListener("click", () => highlightEvidence(textarea, amb.term));
      card.appendChild(chip);
    }
    panel.appendChild(card);
  });
}

function renderAssumptions(assumptions) {
  const panel = document.querySelector('[data-panel="assumptions"]');
  panel.innerHTML = "";
  panel.appendChild(
    panelHeader("Suposições ocultas", "Premissas não declaradas que podem gerar risco na execução.")
  );

  if (!assumptions?.length) {
    panel.appendChild(emptyState("Nenhuma suposição oculta detectada."));
    return;
  }

  assumptions.forEach((asm) => {
    const card = el("div", "item-card");
    card.innerHTML =
      `<p class="item-title">${escapeHtml(asm.assumption)}</p>` +
      `<p class="muted"><strong>Risco:</strong> ${escapeHtml(asm.risk)}</p>` +
      `<p class="item-question">${escapeHtml(asm.question)}</p>`;
    panel.appendChild(card);
  });
}

function renderSuggestions(suggestions) {
  const panel = document.querySelector('[data-panel="suggestions"]');
  panel.innerHTML = "";
  panel.appendChild(
    panelHeader("Sugestões", "Ações priorizadas para elevar a qualidade da especificação.")
  );

  if (!suggestions?.length) {
    panel.appendChild(emptyState("Nenhuma sugestão adicional."));
    return;
  }

  [...suggestions]
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9))
    .forEach((s) => {
      const card = el("div", "item-card");
      card.innerHTML =
        `<span class="sev sev-${s.priority === "high" ? "high" : s.priority === "medium" ? "medium" : "low"}">${s.priority}</span>` +
        `<p class="item-title">${escapeHtml(s.text)}</p>` +
        `<p class="muted">${escapeHtml(s.dimension)}</p>`;
      panel.appendChild(card);
    });
}

function renderDiff(analysis, ctx) {
  const panel = document.querySelector('[data-panel="diff"]');
  panel.innerHTML = "";

  panel.appendChild(
    panelHeader("Revisão", "Comparativo before/after — revise marcadores antes de adotar.")
  );

  const disclaimer = el(
    "div",
    "diff-disclaimer",
    "Esta versão não substitui sua especificação. Ela estrutura o que você escreveu — revise os marcadores <strong>[A DEFINIR]</strong> e preencha as decisões que só você pode tomar."
  );
  panel.appendChild(disclaimer);

  const grid = el("div", "diff-grid");
  const originalText = ctx.originalText ?? (ctx.textarea ? ctx.textarea.value : "");
  const improvedText = analysis.improved_spec?.text || "";

  const before = el("div", "diff-col");
  before.innerHTML =
    `<div class="diff-col-header"><h4>Before</h4><span class="diff-badge">original</span></div>`;
  const beforeText = el("div", "diff-text");
  beforeText.textContent = originalText;
  before.appendChild(beforeText);

  const after = el("div", "diff-col");
  after.innerHTML =
    `<div class="diff-col-header"><h4>After</h4><span class="diff-badge">proposta</span></div>`;
  const afterText = el("div", "diff-text after");
  afterText.innerHTML = escapeHtml(improvedText).replace(
    /\[A DEFINIR[^\]]*\]/g,
    (m) => `<mark class="todo">${m}</mark>`
  );
  after.appendChild(afterText);

  grid.appendChild(before);
  grid.appendChild(after);
  panel.appendChild(grid);

  const changes = analysis.improved_spec?.changes_summary || [];
  if (changes.length) {
    const cs = el("div", "changes-summary");
    cs.appendChild(el("p", null, "Resumo das mudanças"));
    const ul = el("ul");
    changes.forEach((c) => ul.appendChild(el("li", null, escapeHtml(c))));
    cs.appendChild(ul);
    panel.appendChild(cs);
  }

  const actions = el("div", "diff-actions");
  const copyBtn = el("button", "secondary-btn", "Copiar after");
  copyBtn.type = "button";
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(improvedText);
      copyBtn.textContent = "Copiado";
      setTimeout(() => (copyBtn.textContent = "Copiar after"), 1500);
    } catch {
      copyBtn.textContent = "Falha ao copiar";
    }
  });
  actions.appendChild(copyBtn);
  panel.appendChild(actions);
}

function panelHeader(title, description) {
  const header = el("div", "panel-header");
  header.innerHTML = `<h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p>`;
  return header;
}

function emptyState(message) {
  return el("p", "empty-state", escapeHtml(message));
}
