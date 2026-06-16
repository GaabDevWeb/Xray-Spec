import logging

import httpx

from app.config import get_settings
from app.services.llm_errors import LLMTimeout, LLMUnavailable, format_provider_error
from app.services.providers import _openai_compat

logger = logging.getLogger("xray.openrouter")

PROVIDER_NAME = "openrouter"
OPENROUTER_BASE = "https://openrouter.ai/api/v1"

OpenRouterTimeout = LLMTimeout
OpenRouterUnavailable = LLMUnavailable


def _resolve_model(model: str | None) -> str:
    settings = get_settings()
    return model or settings.resolved_default_model


async def chat_completion(messages: list[dict], model: str | None = None) -> str:
    settings = get_settings()
    chosen = _resolve_model(model)
    if not settings.openrouter_api_key:
        raise LLMUnavailable(
            format_provider_error(PROVIDER_NAME, chosen, "API key not configured (OPENROUTER_API_KEY).")
        )

    url = f"{OPENROUTER_BASE}/chat/completions"
    payload = {
        "model": chosen,
        "temperature": 0.2,
        "messages": messages,
        "response_format": {"type": "json_object"},
    }
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "X-Title": "Xray Spec Analyzer",
    }

    try:
        async with httpx.AsyncClient(timeout=settings.xray_llm_timeout) as client:
            response = await client.post(url, json=payload, headers=headers)
    except httpx.TimeoutException as exc:
        logger.warning("OpenRouter timeout after %ss", settings.xray_llm_timeout)
        raise LLMTimeout from exc
    except httpx.HTTPError as exc:
        logger.warning("OpenRouter connection error: %s", type(exc).__name__)
        raise LLMUnavailable(
            format_provider_error(PROVIDER_NAME, chosen, "Connection error.")
        ) from exc

    if response.status_code >= 500:
        logger.warning("OpenRouter upstream %s", response.status_code)
        raise LLMUnavailable(
            format_provider_error(PROVIDER_NAME, chosen, "Upstream service unavailable.")
        )
    if response.status_code == 429:
        raise LLMUnavailable(
            format_provider_error(
                PROVIDER_NAME,
                chosen,
                "Rate limit exceeded. Wait a moment and try again.",
            )
        )
    if response.status_code != 200:
        try:
            body = response.json()
        except ValueError:
            body = {}
        msg = _openai_compat._status_message(response.status_code, body)
        logger.warning("OpenRouter responded %s", response.status_code)
        raise LLMUnavailable(format_provider_error(PROVIDER_NAME, chosen, msg))

    data = response.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        logger.warning("Unexpected OpenRouter payload shape")
        raise LLMUnavailable(
            format_provider_error(PROVIDER_NAME, chosen, "Unexpected response format.")
        ) from exc


async def probe() -> bool:
    settings = get_settings()
    if not settings.openrouter_api_key:
        return False
    return await _openai_compat.probe_models(
        provider=PROVIDER_NAME,
        base_url=OPENROUTER_BASE,
        api_key=settings.openrouter_api_key,
    )
