import { TYPE_LABELS } from "./config.js";
import { validateInput, hintFor } from "./validator.js";
import { checkHealth, analyze, ApiError } from "./api.js";
import { render } from "./renderer.js";
import * as history from "./history.js";

const STATE = {
  INITIALIZING: "Initializing",
  OFFLINE: "OfflineMode",
  IDLE: "Idle",
  READY: "Ready",
  ANALYZING: "Analyzing",
  RESULTS: "Results",
  ERROR: "ErrorState",
};

const dom = {};
let state = STATE.INITIALIZING;
let previousScore = null;
let online = false;
let activeStreamFilter = null;

document.addEventListener("DOMContentLoaded", init);

function init() {
  cacheDom();
  bindEvents();
  bootstrap();
}

function cacheDom() {
  dom.input = document.getElementById("spec-input");
  dom.typeSelect = document.getElementById("type-select");
  dom.typeSegments = document.querySelectorAll(".type-seg");
  dom.analyzeBtn = document.getElementById("btn-analyze");
  dom.counter = document.getElementById("char-counter");
  dom.hint = document.getElementById("input-hint");
  dom.offlineBanner = document.getElementById("offline-banner");
  dom.skeleton = document.getElementById("skeleton");
  dom.results = document.getElementById("results");
  dom.errorRegion = document.getElementById("error-region");
  dom.errorMessage = document.getElementById("error-message");
  dom.retryBtn = document.getElementById("btn-retry");
  dom.errorCounters = document.getElementById("error-counters");
  dom.historyBtn = document.getElementById("btn-history");
  dom.helpBtn = document.getElementById("btn-help");
  dom.historyPanel = document.getElementById("history-panel");
  dom.helpPanel = document.getElementById("help-panel");
  dom.historyList = document.getElementById("history-list");
  dom.historyEmpty = document.getElementById("history-empty");
  dom.closeHistory = document.getElementById("btn-close-history");
  dom.closeHelp = document.getElementById("btn-close-help");
  dom.clearHistory = document.getElementById("btn-clear-history");
  dom.overlay = document.getElementById("overlay");
  dom.analyzeBtnLabel = dom.analyzeBtn.querySelector(".btn-label");
  dom.statusProvider = document.getElementById("status-provider");
}

function bindEvents() {
  dom.input.addEventListener("input", onInput);
  dom.analyzeBtn.addEventListener("click", runAnalysis);
  dom.input.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (!dom.analyzeBtn.disabled) runAnalysis();
    }
  });
  dom.retryBtn.addEventListener("click", runAnalysis);

  dom.errorCounters.addEventListener("click", onCounterFilterClick);

  dom.typeSegments.forEach((btn) =>
    btn.addEventListener("click", () => syncTypeSegments(btn.dataset.value))
  );

  dom.historyBtn.addEventListener("click", openHistory);
  dom.helpBtn.addEventListener("click", () => openDrawer(dom.helpPanel));
  dom.closeHistory.addEventListener("click", closeDrawers);
  dom.closeHelp.addEventListener("click", closeDrawers);
  dom.clearHistory.addEventListener("click", onClearHistory);
  dom.overlay.addEventListener("click", closeDrawers);

  window.addEventListener("online", () => refreshConnectivity());
  window.addEventListener("offline", () => setOffline());
}

async function bootstrap() {
  setState(STATE.INITIALIZING);
  await refreshConnectivity();
  onInput();
}

async function refreshConnectivity() {
  const health = await checkHealth();
  online = navigator.onLine && health.ok;
  if (dom.statusProvider) {
    dom.statusProvider.textContent = health.ok && health.provider
      ? `${health.provider} · online`
      : "offline";
  }
  if (online) {
    dom.offlineBanner.hidden = true;
    if (state === STATE.OFFLINE || state === STATE.INITIALIZING) setState(STATE.IDLE);
    onInput();
  } else {
    setOffline();
  }
}

function setOffline() {
  online = false;
  dom.offlineBanner.hidden = false;
  setState(STATE.OFFLINE);
  dom.analyzeBtn.disabled = true;
}

function onInput() {
  const text = dom.input.value;
  const length = text.trim().length;
  dom.counter.textContent = `${length.toLocaleString("pt-BR")} / 10.000`;

  const { valid, reason } = validateInput(text);
  dom.counter.classList.toggle("over-limit", reason === "long");
  dom.hint.textContent = valid ? "" : hintFor(reason);

  if (!online) {
    dom.analyzeBtn.disabled = true;
    return;
  }
  dom.analyzeBtn.disabled = !valid;
  if (state === STATE.IDLE || state === STATE.READY) {
    setState(valid ? STATE.READY : STATE.IDLE);
  }
}

async function runAnalysis() {
  const text = dom.input.value.trim();
  const type = dom.typeSelect.value;
  const { valid } = validateInput(text);
  if (!valid || !online) return;

  setState(STATE.ANALYZING);
  hideError();
  dom.skeleton.hidden = false;
  dom.results.hidden = true;
  dom.analyzeBtn.disabled = true;
  dom.input.disabled = true;
  if (dom.analyzeBtnLabel) dom.analyzeBtnLabel.textContent = "Escaneando…";

  try {
    const analysis = await analyze({ text, type });
    history.save({ inputText: text, inputType: type, analysis });
    render(analysis, { textarea: dom.input, originalText: text, previousScore });
    previousScore = analysis.score.total;
    resetStreamFilter();
    setState(STATE.RESULTS);
    dom.skeleton.hidden = true;
    dom.results.hidden = false;
    dom.results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    dom.skeleton.hidden = true;
    showError(err);
  } finally {
    dom.input.disabled = false;
    if (dom.analyzeBtnLabel) dom.analyzeBtnLabel.textContent = "Escanear";
    onInput();
  }
}

function showError(err) {
  setState(STATE.ERROR);
  const kind = err instanceof ApiError ? err.kind : "unavailable";
  dom.errorMessage.textContent = err.message || "Ocorreu um erro inesperado.";
  // Retry faz sentido para falhas transitórias; validação volta para o input.
  dom.retryBtn.hidden = kind === "validation";
  dom.errorRegion.hidden = false;
  dom.errorRegion.scrollIntoView({ behavior: "smooth", block: "center" });
}

function hideError() {
  dom.errorRegion.hidden = true;
  dom.retryBtn.hidden = true;
}

function syncTypeSegments(value) {
  dom.typeSelect.value = value;
  dom.typeSegments.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === value);
  });
}

function onCounterFilterClick(e) {
  const btn = e.target.closest(".counter-cell");
  if (!btn?.dataset.filter) return;

  const filter = btn.dataset.filter;
  if (activeStreamFilter === filter) {
    resetStreamFilter();
  } else {
    applyStreamFilter(filter);
  }
}

function applyStreamFilter(filter) {
  activeStreamFilter = filter;
  dom.errorCounters.querySelectorAll(".counter-cell").forEach((cell) => {
    const active = cell.dataset.filter === filter;
    cell.classList.toggle("active", active);
    cell.setAttribute("aria-pressed", active ? "true" : "false");
  });
  document.querySelectorAll(".stream-section").forEach((section) => {
    const show = section.dataset.section === filter;
    section.classList.toggle("stream-section--hidden", !show);
  });
}

function resetStreamFilter() {
  activeStreamFilter = null;
  dom.errorCounters?.querySelectorAll(".counter-cell").forEach((cell) => {
    cell.classList.remove("active");
    cell.setAttribute("aria-pressed", "false");
  });
  document.querySelectorAll(".stream-section").forEach((section) => {
    section.classList.remove("stream-section--hidden");
  });
}

/* ----- Histórico ----- */

function openHistory() {
  renderHistoryList();
  openDrawer(dom.historyPanel);
}

function renderHistoryList() {
  const items = history.list();
  dom.historyList.innerHTML = "";
  dom.historyEmpty.hidden = items.length > 0;

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "history-item";
    const date = new Date(item.created_at).toLocaleString("pt-BR");
    li.innerHTML =
      `<div class="history-item-head">` +
      `<span class="history-score">${item.score_total}/100</span>` +
      `<span class="history-meta">${TYPE_LABELS[item.input_type] || item.input_type} · ${date}</span>` +
      `</div>` +
      `<p class="history-excerpt"></p>` +
      `<div class="history-item-actions"></div>`;
    li.querySelector(".history-excerpt").textContent = item.input_text;

    const actions = li.querySelector(".history-item-actions");
    actions.appendChild(actionBtn("Abrir", () => openHistoryItem(item)));
    actions.appendChild(actionBtn("Usar como base", () => useAsBase(item)));
    actions.appendChild(actionBtn("Excluir", () => deleteHistoryItem(item.id), true));
    dom.historyList.appendChild(li);
  });
}

function actionBtn(label, handler, danger) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = danger ? "ghost-btn danger" : "ghost-btn";
  btn.textContent = label;
  btn.addEventListener("click", handler);
  return btn;
}

function openHistoryItem(item) {
  render(item.analysis, {
    textarea: dom.input,
    originalText: item.input_text,
    previousScore: null,
  });
  resetStreamFilter();
  setState(STATE.RESULTS);
  dom.skeleton.hidden = true;
  dom.results.hidden = false;
  closeDrawers();
  dom.results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function useAsBase(item) {
  dom.input.value = item.input_text;
  syncTypeSegments(item.input_type);
  previousScore = item.score_total;
  closeDrawers();
  onInput();
  dom.input.focus();
}

function deleteHistoryItem(id) {
  history.remove(id);
  renderHistoryList();
}

function onClearHistory() {
  if (confirm("Limpar todo o histórico de análises? Esta ação não pode ser desfeita.")) {
    history.clear();
    renderHistoryList();
  }
}

function openDrawer(panel) {
  panel.hidden = false;
  panel.setAttribute("aria-hidden", "false");
  dom.overlay.hidden = false;
}

function closeDrawers() {
  dom.historyPanel.hidden = true;
  dom.helpPanel.hidden = true;
  dom.historyPanel.setAttribute("aria-hidden", "true");
  dom.helpPanel.setAttribute("aria-hidden", "true");
  dom.overlay.hidden = true;
}

function setState(next) {
  state = next;
}
