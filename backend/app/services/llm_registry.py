"""Registry de provedores LLM."""

from types import ModuleType

from app.config import SUPPORTED_PROVIDERS
from app.services.llm_errors import ProviderConfigError
from app.services.providers import (
    anthropic,
    cursor,
    deepseek,
    gemini,
    groq,
    openai,
    openrouter,
)

PROVIDERS: dict[str, ModuleType] = {
    "openrouter": openrouter,
    "gemini": gemini,
    "openai": openai,
    "anthropic": anthropic,
    "deepseek": deepseek,
    "groq": groq,
    "cursor": cursor,
}


def get_provider(name: str) -> ModuleType:
    if name not in PROVIDERS:
        supported = ", ".join(sorted(SUPPORTED_PROVIDERS))
        raise ProviderConfigError(f"Unknown provider '{name}'. Supported: {supported}.")
    return PROVIDERS[name]
