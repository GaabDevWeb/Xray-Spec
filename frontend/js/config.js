export const API_BASE = "http://localhost:8000";
export const MIN_CHARS = 10;
export const MAX_CHARS = 10000;
export const REQUEST_TIMEOUT_MS = 90000;
export const HISTORY_KEY = "xray_history";
export const HISTORY_MAX = 50;

export const DIMENSION_LABELS = {
  context: "Contexto",
  objective: "Objetivo",
  constraints: "Restrições",
  specificity: "Especificidade",
  clarity: "Clareza",
  success_criteria: "Critérios de Sucesso",
};

export const DIMENSION_ORDER = [
  "context",
  "objective",
  "constraints",
  "specificity",
  "clarity",
  "success_criteria",
];

export const TYPE_LABELS = {
  prompt: "Prompt",
  requirement: "Requisito",
  briefing: "Briefing",
};
