from app.config import get_settings
from app.services.llm_errors import LLMUnavailable, format_provider_error
from app.services.providers import _openai_compat

PROVIDER_NAME = "deepseek"
DEEPSEEK_BASE = "https://api.deepseek.com/v1"


def _resolve_model(model: str | None) -> str:
    settings = get_settings()
    return model or settings.resolved_default_model


async def chat_completion(messages: list[dict], model: str | None = None) -> str:
    settings = get_settings()
    chosen = _resolve_model(model)
    if not settings.deepseek_api_key:
        raise LLMUnavailable(
            format_provider_error(PROVIDER_NAME, chosen, "API key not configured (DEEPSEEK_API_KEY).")
        )
    return await _openai_compat.chat_completion(
        messages,
        chosen,
        provider=PROVIDER_NAME,
        base_url=DEEPSEEK_BASE,
        api_key=settings.deepseek_api_key,
        timeout=settings.xray_llm_timeout,
    )


async def probe() -> bool:
    settings = get_settings()
    if not settings.deepseek_api_key:
        return False
    return await _openai_compat.probe_models(
        provider=PROVIDER_NAME,
        base_url=DEEPSEEK_BASE,
        api_key=settings.deepseek_api_key,
    )
