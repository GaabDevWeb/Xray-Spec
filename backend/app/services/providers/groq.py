from app.config import get_settings
from app.services.llm_errors import LLMUnavailable, format_provider_error
from app.services.providers import _openai_compat

PROVIDER_NAME = "groq"
GROQ_BASE = "https://api.groq.com/openai/v1"

MODEL_ALIASES: dict[str, str] = {
    "llama-3.3-70b": "llama-3.3-70b-versatile",
    "qwen-qwq": "qwen-qwq-32b",
}


def _resolve_model(model: str | None) -> str:
    settings = get_settings()
    chosen = model or settings.resolved_default_model
    return MODEL_ALIASES.get(chosen, chosen)


async def chat_completion(messages: list[dict], model: str | None = None) -> str:
    settings = get_settings()
    chosen = _resolve_model(model)
    if not settings.groq_api_key:
        raise LLMUnavailable(
            format_provider_error(PROVIDER_NAME, chosen, "API key not configured (GROQ_API_KEY).")
        )
    return await _openai_compat.chat_completion(
        messages,
        chosen,
        provider=PROVIDER_NAME,
        base_url=GROQ_BASE,
        api_key=settings.groq_api_key,
        timeout=settings.xray_llm_timeout,
    )


async def probe() -> bool:
    settings = get_settings()
    if not settings.groq_api_key:
        return False
    return await _openai_compat.probe_models(
        provider=PROVIDER_NAME,
        base_url=GROQ_BASE,
        api_key=settings.groq_api_key,
    )
