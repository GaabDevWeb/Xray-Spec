import logging

import httpx

from app.config import get_settings
from app.services.llm_errors import LLMTimeout, LLMUnavailable

logger = logging.getLogger("xray.gemini")

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

# Aliases amigáveis → slug real na API (ListModels).
MODEL_ALIASES: dict[str, str] = {
    "gemini-3-flash": "gemini-3-flash-preview",
    "gemini-3-pro": "gemini-3-pro-preview",
}


def _resolve_model(model: str | None) -> str:
    settings = get_settings()
    chosen = model or settings.resolved_default_model
    return MODEL_ALIASES.get(chosen, chosen)


def _error_message(status_code: int, model: str, body: dict) -> str:
    err = body.get("error", {}) if isinstance(body, dict) else {}
    upstream = err.get("message", "")

    if status_code == 404:
        return (
            f"Modelo '{model}' não encontrado na API Gemini. "
            "Verifique XRAY_DEFAULT_MODEL ou use gemini-2.0-flash / gemini-3-flash-preview."
        )
    if status_code == 403:
        return (
            "Acesso negado ao modelo Gemini neste projeto. "
            "Confirme a chave em aistudio.google.com/apikey e permissões do modelo."
        )
    if status_code == 429:
        return (
            "Cota da API Gemini excedida. Aguarde alguns minutos ou verifique billing/plano no Google AI Studio."
        )
    if upstream:
        logger.warning("Gemini error %s: %s", status_code, upstream[:200])
    return "Serviço de análise indisponível no momento."


def _build_payload(messages: list[dict]) -> dict:
    """Converte mensagens OpenAI-style (system/user/assistant) para o formato Gemini."""
    system_text = next((m["content"] for m in messages if m["role"] == "system"), None)
    contents = []
    for msg in messages:
        if msg["role"] == "system":
            continue
        role = "model" if msg["role"] == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": msg["content"]}]})

    payload: dict = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
        },
    }
    if system_text:
        payload["systemInstruction"] = {"parts": [{"text": system_text}]}
    return payload


async def chat_completion(messages: list[dict], model: str | None = None) -> str:
    """Chama a API Gemini (generateContent) e devolve o texto da resposta."""
    settings = get_settings()
    if not settings.gemini_api_key:
        logger.warning("GEMINI_API_KEY not configured")
        raise LLMUnavailable("GEMINI_API_KEY não configurada no servidor.")

    chosen_model = _resolve_model(model)
    url = f"{GEMINI_BASE}/models/{chosen_model}:generateContent"
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": settings.gemini_api_key,
    }

    try:
        async with httpx.AsyncClient(timeout=settings.xray_llm_timeout) as client:
            response = await client.post(url, json=_build_payload(messages), headers=headers)
    except httpx.TimeoutException as exc:
        logger.warning("Gemini timeout after %ss", settings.xray_llm_timeout)
        raise LLMTimeout from exc
    except httpx.HTTPError as exc:
        logger.warning("Gemini connection error: %s", type(exc).__name__)
        raise LLMUnavailable from exc

    if response.status_code != 200:
        try:
            body = response.json()
        except ValueError:
            body = {}
        logger.warning("Gemini responded %s for model %s", response.status_code, chosen_model)
        raise LLMUnavailable(_error_message(response.status_code, chosen_model, body))

    data = response.json()
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        logger.warning("Unexpected Gemini payload shape")
        raise LLMUnavailable from exc


async def probe() -> bool:
    """Verifica se generateContent responde (não basta listar modelos)."""
    settings = get_settings()
    if not settings.gemini_api_key:
        return False

    model = _resolve_model(None)
    url = f"{GEMINI_BASE}/models/{model}:generateContent"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": "ping"}]}],
        "generationConfig": {"maxOutputTokens": 1},
    }
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.post(
                url,
                json=payload,
                headers={"x-goog-api-key": settings.gemini_api_key, "Content-Type": "application/json"},
            )
        # 200 = ok; 429 = credencial válida mas sem cota (ainde "conectado")
        return response.status_code in (200, 429)
    except httpx.HTTPError:
        return False
