import { API_BASE, REQUEST_TIMEOUT_MS } from "./config.js";

/** Erro tipado para o fluxo de UI mapear estados de erro (AGENT §11). */
export class ApiError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // "validation" | "processing" | "unavailable" | "timeout" | "ratelimit" | "network"
  }
}

function mapStatus(status, detail) {
  switch (status) {
    case 400:
      return new ApiError("validation", detail || "Requisição inválida.");
    case 422:
      return new ApiError("processing", detail || "Não foi possível processar a análise.");
    case 429:
      return new ApiError("ratelimit", detail || "Muitas requisições. Aguarde 1 minuto.");
    case 502:
      return new ApiError("unavailable", detail || "Serviço de análise indisponível.");
    case 504:
      return new ApiError("timeout", detail || "Tempo de análise esgotado.");
    default:
      return new ApiError("unavailable", detail || `Erro inesperado (${status}).`);
  }
}

export async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`, { method: "GET" });
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === "ok";
  } catch {
    return false;
  }
}

export async function analyze({ text, type, model }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, type, ...(model ? { model } : {}) }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let detail = "";
      try {
        const body = await res.json();
        detail = body.detail || "";
      } catch {
        /* corpo não-JSON */
      }
      throw mapStatus(res.status, detail);
    }

    return await res.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.name === "AbortError") {
      throw new ApiError("timeout", "Tempo esgotado (90s). Tente novamente.");
    }
    throw new ApiError("network", "Falha de conexão com o servidor.");
  } finally {
    clearTimeout(timer);
  }
}
