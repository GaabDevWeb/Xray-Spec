"""Provedor Cursor via cursor-sdk (Agent API local, Composer)."""

import asyncio
import logging
from pathlib import Path

from app.config import get_settings
from app.services.llm_errors import LLMTimeout, LLMUnavailable, format_provider_error

logger = logging.getLogger("xray.cursor")

PROVIDER_NAME = "cursor"

_REPO_ROOT = Path(__file__).resolve().parents[4]


def _resolve_model(model: str | None) -> str:
    settings = get_settings()
    return model or settings.resolved_default_model


def _resolve_cwd() -> str:
    settings = get_settings()
    if settings.xray_cursor_cwd.strip():
        return str(Path(settings.xray_cursor_cwd).expanduser().resolve())
    return str(_REPO_ROOT)


def _build_prompt(messages: list[dict]) -> str:
    """Combina system/user/assistant num único prompt para Agent.prompt()."""
    parts: list[str] = []
    for msg in messages:
        role = msg.get("role", "user").upper()
        parts.append(f"[{role}]\n{msg['content']}")
    parts.append(
        "[INSTRUCTION]\n"
        "Respond ONLY with valid JSON matching the schema in the system message. "
        "Do not edit files, run tools, or add markdown fences."
    )
    return "\n\n".join(parts)


def _import_sdk():
    try:
        from cursor_sdk import AgentOptions, AsyncAgent, AsyncClient, CursorAgentError, LocalAgentOptions
    except ImportError as exc:
        raise LLMUnavailable(
            format_provider_error(
                PROVIDER_NAME,
                _resolve_model(None),
                "cursor-sdk not installed. Run: pip install cursor-sdk",
            )
        ) from exc
    return AgentOptions, AsyncAgent, AsyncClient, CursorAgentError, LocalAgentOptions


async def chat_completion(messages: list[dict], model: str | None = None) -> str:
    settings = get_settings()
    chosen = _resolve_model(model)
    if not settings.cursor_api_key:
        raise LLMUnavailable(
            format_provider_error(PROVIDER_NAME, chosen, "API key not configured (CURSOR_API_KEY).")
        )

    AgentOptions, AsyncAgent, AsyncClient, CursorAgentError, LocalAgentOptions = _import_sdk()
    prompt = _build_prompt(messages)
    cwd = _resolve_cwd()

    try:
        async with await AsyncClient.launch_bridge(workspace=cwd) as client:
            coro = AsyncAgent.prompt(
                prompt,
                AgentOptions(
                    api_key=settings.cursor_api_key,
                    model=chosen,
                    mode=settings.xray_cursor_mode,
                    local=LocalAgentOptions(cwd=cwd, setting_sources=[]),
                ),
                client=client,
            )
            result = await asyncio.wait_for(coro, timeout=settings.xray_llm_timeout)
    except asyncio.TimeoutError as exc:
        logger.warning("Cursor timeout after %ss", settings.xray_llm_timeout)
        raise LLMTimeout from exc
    except CursorAgentError as exc:
        logger.warning("Cursor startup error: %s", exc.message[:200] if exc.message else type(exc).__name__)
        raise LLMUnavailable(
            format_provider_error(PROVIDER_NAME, chosen, exc.message or "Agent failed to start.")
        ) from exc
    except Exception as exc:
        if isinstance(exc, (LLMTimeout, LLMUnavailable)):
            raise
        logger.warning("Cursor unexpected error: %s", type(exc).__name__)
        raise LLMUnavailable(
            format_provider_error(PROVIDER_NAME, chosen, "Connection error.")
        ) from exc

    status = getattr(result, "status", None)
    if status == "error" or (status is not None and str(status) == "error"):
        raise LLMUnavailable(
            format_provider_error(PROVIDER_NAME, chosen, "Analysis run failed.")
        )

    text = (result.result or "").strip()
    if not text:
        raise LLMUnavailable(
            format_provider_error(PROVIDER_NAME, chosen, "Empty response from agent.")
        )
    return text


async def probe() -> bool:
    settings = get_settings()
    if not settings.cursor_api_key:
        return False

    def _check() -> bool:
        try:
            from cursor_sdk import Cursor

            models = Cursor.models.list(api_key=settings.cursor_api_key)
            return bool(models)
        except Exception:
            return False

    return await asyncio.to_thread(_check)
