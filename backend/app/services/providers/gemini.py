import logging

import httpx

from app.config import get_settings
from app.services.llm_errors import LLMTimeout, LLMUnavailable, format_provider_error

logger = logging.getLogger("xray.gemini")

PROVIDER_NAME = "gemini"
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

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
            f"Model '{model}' not found. "
            "Check XRAY_DEFAULT_MODEL or try gemini-2.0-flash / gemini-3-flash-preview."
        )
    if status_code == 403:
        return "Access denied. Verify GEMINI_API_KEY and model permissions in Google AI Studio."
    if status_code == 401:
        return upstream or "Invalid API key."
    if status_code == 429:
        return "Quota exceeded. Wait a few minutes or check billing in Google AI Studio."
    if upstream:
        logger.warning("Gemini error %s: %s", status_code, upstream[:200])
        return str(upstream)
    return "Service unavailable."


def _build_payload(messages: list[dict]) -> dict:
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
    settings = get_settings()
    chosen = _resolve_model(model)
    if not settings.gemini_api_key:
        raise LLMUnavailable(
            format_provider_error(PROVIDER_NAME, chosen, "API key not configured (GEMINI_API_KEY).")
        )

    url = f"{GEMINI_BASE}/models/{chosen}:generateContent"
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
        raise LLMUnavailable(
            format_provider_error(PROVIDER_NAME, chosen, "Connection error.")
        ) from exc

    if response.status_code != 200:
        try:
            body = response.json()
        except ValueError:
            body = {}
        logger.warning("Gemini responded %s for model %s", response.status_code, chosen)
        raise LLMUnavailable(
            format_provider_error(PROVIDER_NAME, chosen, _error_message(response.status_code, chosen, body))
        )

    data = response.json()
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        logger.warning("Unexpected Gemini payload shape")
        raise LLMUnavailable(
            format_provider_error(PROVIDER_NAME, chosen, "Unexpected response format.")
        ) from exc


async def probe() -> bool:
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
        return response.status_code in (200, 429)
    except httpx.HTTPError:
        return False
