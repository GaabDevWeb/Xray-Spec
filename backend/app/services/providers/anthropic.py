import logging

import httpx

from app.config import get_settings
from app.services.llm_errors import LLMTimeout, LLMUnavailable, format_provider_error

logger = logging.getLogger("xray.anthropic")

PROVIDER_NAME = "anthropic"
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"

MODEL_ALIASES: dict[str, str] = {
    "claude-sonnet-4": "claude-sonnet-4-20250514",
    "claude-opus-4": "claude-opus-4-20250514",
}


def _resolve_model(model: str | None) -> str:
    settings = get_settings()
    chosen = model or settings.resolved_default_model
    return MODEL_ALIASES.get(chosen, chosen)


def _split_messages(messages: list[dict]) -> tuple[str | None, list[dict]]:
    system_parts: list[str] = []
    conv: list[dict] = []
    for msg in messages:
        if msg["role"] == "system":
            system_parts.append(msg["content"])
        else:
            conv.append({"role": msg["role"], "content": msg["content"]})
    system = "\n\n".join(system_parts) if system_parts else None
    return system, conv


def _error_message(status_code: int, body: dict) -> str:
    err = body.get("error", {}) if isinstance(body, dict) else {}
    upstream = err.get("message", "") if isinstance(err, dict) else ""
    if status_code == 401:
        return upstream or "Invalid API key."
    if status_code == 404:
        return upstream or "Model not found."
    if status_code == 429:
        return upstream or "Rate limit exceeded. Try again in a moment."
    if upstream:
        return str(upstream)
    return "Request failed."


async def chat_completion(messages: list[dict], model: str | None = None) -> str:
    settings = get_settings()
    chosen = _resolve_model(model)
    if not settings.anthropic_api_key:
        raise LLMUnavailable(
            format_provider_error(PROVIDER_NAME, chosen, "API key not configured (ANTHROPIC_API_KEY).")
        )

    system, conv = _split_messages(messages)
    payload: dict = {
        "model": chosen,
        "max_tokens": 8192,
        "temperature": 0.2,
        "messages": conv,
    }
    if system:
        payload["system"] = system

    headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=settings.xray_llm_timeout) as client:
            response = await client.post(ANTHROPIC_URL, json=payload, headers=headers)
    except httpx.TimeoutException as exc:
        logger.warning("Anthropic timeout after %ss", settings.xray_llm_timeout)
        raise LLMTimeout from exc
    except httpx.HTTPError as exc:
        logger.warning("Anthropic connection error: %s", type(exc).__name__)
        raise LLMUnavailable(
            format_provider_error(PROVIDER_NAME, chosen, "Connection error.")
        ) from exc

    if response.status_code != 200:
        try:
            body = response.json()
        except ValueError:
            body = {}
        logger.warning("Anthropic responded %s for model %s", response.status_code, chosen)
        raise LLMUnavailable(
            format_provider_error(PROVIDER_NAME, chosen, _error_message(response.status_code, body))
        )

    data = response.json()
    try:
        for block in data["content"]:
            if block.get("type") == "text":
                return block["text"]
        raise KeyError("no text block")
    except (KeyError, IndexError, TypeError) as exc:
        logger.warning("Unexpected Anthropic payload shape")
        raise LLMUnavailable(
            format_provider_error(PROVIDER_NAME, chosen, "Unexpected response format.")
        ) from exc


async def probe() -> bool:
    settings = get_settings()
    if not settings.anthropic_api_key:
        return False
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(
                "https://api.anthropic.com/v1/models",
                headers={
                    "x-api-key": settings.anthropic_api_key,
                    "anthropic-version": ANTHROPIC_VERSION,
                },
            )
        return response.status_code == 200
    except httpx.HTTPError:
        return False
