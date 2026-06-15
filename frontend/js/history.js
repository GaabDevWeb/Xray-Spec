import { HISTORY_KEY, HISTORY_MAX } from "./config.js";

function read() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function write(items) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
    return true;
  } catch (err) {
    if (err && err.name === "QuotaExceededError" && items.length > 1) {
      // Remove o item mais antigo e tenta de novo (FLOWCHART §14).
      return write(items.slice(0, -1));
    }
    return false;
  }
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

export function list() {
  return read();
}

/** Salva uma análise no topo, mantendo no máximo HISTORY_MAX itens. */
export function save({ inputText, inputType, analysis }) {
  const items = read();
  const entry = {
    id: uuid(),
    created_at: new Date().toISOString(),
    input_text: inputText,
    input_type: inputType,
    score_total: analysis.score.total,
    analysis,
  };
  const next = [entry, ...items].slice(0, HISTORY_MAX);
  write(next);
  return entry;
}

export function get(id) {
  return read().find((item) => item.id === id) || null;
}

export function remove(id) {
  write(read().filter((item) => item.id !== id));
}

export function clear() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
}
