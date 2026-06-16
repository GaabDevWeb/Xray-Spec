from fastapi import APIRouter

from app.config import get_settings
from app.services import llm

router = APIRouter()


@router.get("/api/health")
async def health() -> dict:
    """Status do serviço e conectividade com o provedor LLM configurado."""
    settings = get_settings()
    provider = llm.active_provider()
    model = llm.active_model()
    config_err = settings.config_error()
    connected = await llm.probe() if not config_err else False

    payload: dict = {
        "status": "ok" if connected else "degraded",
        "provider": provider,
        "model": model,
        "llm": "connected" if connected else "disconnected",
        # Retrocompatível com frontend/consumers que esperam campo openrouter
        "openrouter": "connected" if connected and provider == "openrouter" else "disconnected",
    }
    if config_err:
        payload["config_error"] = config_err
    return payload
