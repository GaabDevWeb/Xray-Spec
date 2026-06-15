import { MIN_CHARS, MAX_CHARS } from "./config.js";

/**
 * Valida o texto da especificação conforme regras locais (FLOWCHART §6).
 * Retorna { valid, reason } onde reason ∈ { "empty", "short", "long", null }.
 */
export function validateInput(text) {
  const length = text.trim().length;
  if (length === 0) return { valid: false, reason: "empty" };
  if (length < MIN_CHARS) return { valid: false, reason: "short" };
  if (length > MAX_CHARS) return { valid: false, reason: "long" };
  return { valid: true, reason: null };
}

export function hintFor(reason) {
  switch (reason) {
    case "empty":
      return "";
    case "short":
      return `Mínimo de ${MIN_CHARS} caracteres.`;
    case "long":
      return `Máximo de ${MAX_CHARS.toLocaleString("pt-BR")} caracteres excedido.`;
    default:
      return "";
  }
}
