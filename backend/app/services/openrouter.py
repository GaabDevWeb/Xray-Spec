import logging

import httpx

from app.config import get_settings
from app.services.llm_errors import LLMTimeout, LLMUnavailable

logger = logging.getLogger("xray.openrouter")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Aliases retrocompatíveis para imports existentes
OpenRouterTimeout = LLMTimeout
OpenRouterUnavailable = LLMUnavailable


async def chat_completion(messages: list[dict], model: str | None = None) -> str:
    """Chama o OpenRouter e devolve o conteúdo textual da primeira escolha.

    Lança OpenRouterTimeout / OpenRouterUnavailable para mapeamento HTTP no router.
    Nunca registra a API key nem o texto do usuário nos logs.
    """
    settings = get_settings()
    chosen_model = model or settings.resolved_default_model

    payload = {
        "model": chosen_model,
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
            response = await client.post(OPENROUTER_URL, json=payload, headers=headers)
    except httpx.TimeoutException as exc:
        logger.warning("OpenRouter timeout after %ss", settings.xray_llm_timeout)
        raise LLMTimeout from exc
    except httpx.HTTPError as exc:
        logger.warning("OpenRouter connection error: %s", type(exc).__name__)
        raise LLMUnavailable from exc

    if response.status_code >= 500:
        logger.warning("OpenRouter upstream %s", response.status_code)
        raise LLMUnavailable
    if response.status_code == 429:
        raise LLMUnavailable(
            "Limite de requisições do modelo gratuito atingido. Aguarde 1 minuto e tente novamente."
        )
    if response.status_code != 200:
        logger.warning("OpenRouter responded %s", response.status_code)
        raise LLMUnavailable

    data = response.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        logger.warning("Unexpected OpenRouter payload shape")
        raise LLMUnavailable from exc


async def probe() -> bool:
    """Verifica conectividade básica com o OpenRouter para o health check."""
    settings = get_settings()
    if not settings.openrouter_api_key:
        return False
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(
                "https://openrouter.ai/api/v1/models",
                headers={"Authorization": f"Bearer {settings.openrouter_api_key}"},
            )
        return response.status_code == 200
    except httpx.HTTPError:
        return False
