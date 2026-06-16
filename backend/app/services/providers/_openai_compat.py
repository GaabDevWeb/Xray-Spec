"""Helper partilhado para APIs compatíveis com OpenAI chat/completions."""

import logging

import httpx

from app.services.llm_errors import LLMTimeout, LLMUnavailable, format_provider_error

logger = logging.getLogger("xray.llm")


def _parse_upstream_message(body: dict) -> str:
    if not isinstance(body, dict):
        return ""
    err = body.get("error")
    if isinstance(err, dict) and err.get("message"):
        return str(err["message"])
    if body.get("message"):
        return str(body["message"])
    return ""


def _status_message(status_code: int, body: dict) -> str:
    upstream = _parse_upstream_message(body)
    if status_code == 401:
        return upstream or "Invalid API key."
    if status_code == 403:
        return upstream or "Access denied."
    if status_code == 404:
        return upstream or "Model not found."
    if status_code == 429:
        return upstream or "Rate limit exceeded. Try again in a moment."
    if status_code >= 500:
        return upstream or "Upstream service unavailable."
    return upstream or "Request failed."


async def chat_completion(
    messages: list[dict],
    model: str,
    *,
    provider: str,
    base_url: str,
    api_key: str,
    timeout: int,
    json_mode: bool = True,
) -> str:
    """POST chat/completions e devolve o conteúdo textual da primeira escolha."""
    url = f"{base_url.rstrip('/')}/chat/completions"
    payload: dict = {
        "model": model,
        "temperature": 0.2,
        "messages": messages,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=payload, headers=headers)
    except httpx.TimeoutException as exc:
        logger.warning("%s timeout after %ss", provider, timeout)
        raise LLMTimeout from exc
    except httpx.HTTPError as exc:
        logger.warning("%s connection error: %s", provider, type(exc).__name__)
        raise LLMUnavailable(
            format_provider_error(provider, model, "Connection error.")
        ) from exc

    if response.status_code != 200:
        try:
            body = response.json()
        except ValueError:
            body = {}
        logger.warning("%s responded %s for model %s", provider, response.status_code, model)
        raise LLMUnavailable(
            format_provider_error(provider, model, _status_message(response.status_code, body))
        )

    data = response.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        logger.warning("Unexpected %s payload shape", provider)
        raise LLMUnavailable(
            format_provider_error(provider, model, "Unexpected response format.")
        ) from exc


async def probe_models(
    *,
    provider: str,
    base_url: str,
    api_key: str,
) -> bool:
    """Verifica conectividade listando modelos (ou endpoint equivalente)."""
    url = f"{base_url.rstrip('/')}/models"
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(url, headers=headers)
        return response.status_code == 200
    except httpx.HTTPError:
        return False
