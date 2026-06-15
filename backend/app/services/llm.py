"""Dispatcher de provedor LLM — selecionado via XRAY_LLM_PROVIDER no .env."""

from app.config import get_settings
from app.services import gemini, openrouter

_SUPPORTED = frozenset({"openrouter", "gemini"})


def active_provider() -> str:
    return get_settings().xray_llm_provider


async def chat_completion(messages: list[dict], model: str | None = None) -> str:
    if active_provider() == "gemini":
        return await gemini.chat_completion(messages, model=model)
    return await openrouter.chat_completion(messages, model=model)


async def probe() -> bool:
    if active_provider() == "gemini":
        return await gemini.probe()
    return await openrouter.probe()
