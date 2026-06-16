"""Dispatcher de provedor LLM — selecionado via XRAY_LLM_PROVIDER (ou LLM_PROVIDER) no .env."""

from app.config import get_settings
from app.services.llm_errors import LLMUnavailable, ProviderConfigError, format_provider_error
from app.services.llm_registry import get_provider


def active_provider() -> str:
    return get_settings().xray_llm_provider


def active_model() -> str:
    return get_settings().resolved_default_model


def _module():
    return get_provider(active_provider())


def _ensure_config(model: str) -> None:
    settings = get_settings()
    if err := settings.config_error():
        raise LLMUnavailable(format_provider_error(active_provider(), model, err))


async def chat_completion(messages: list[dict], model: str | None = None) -> str:
    settings = get_settings()
    chosen = model or settings.resolved_default_model
    _ensure_config(chosen)
    try:
        mod = _module()
    except ProviderConfigError as exc:
        raise LLMUnavailable(
            format_provider_error(active_provider(), chosen, exc.message)
        ) from exc
    return await mod.chat_completion(messages, model=model)


async def probe() -> bool:
    settings = get_settings()
    if settings.config_error():
        return False
    try:
        mod = _module()
    except ProviderConfigError:
        return False
    return await mod.probe()
