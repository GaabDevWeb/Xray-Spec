from fastapi import APIRouter

from app.services import llm

router = APIRouter()


@router.get("/api/health")
async def health() -> dict:
    """Status do serviço e conectividade com o provedor LLM configurado."""
    provider = llm.active_provider()
    connected = await llm.probe()
    return {
        "status": "ok" if connected else "degraded",
        "provider": provider,
        "llm": "connected" if connected else "disconnected",
        # Retrocompatível com frontend/consumers que esperam campo openrouter
        "openrouter": "connected" if connected and provider == "openrouter" else "disconnected",
    }
