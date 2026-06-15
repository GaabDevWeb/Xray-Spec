import logging

from fastapi import APIRouter, HTTPException

from app.schemas.request import AnalyzeRequest
from app.schemas.response import AnalysisResponse
from app.services.analyzer import AnalysisValidationError, analyze
from app.services.llm_errors import LLMTimeout, LLMUnavailable

logger = logging.getLogger("xray.routes.analyze")

router = APIRouter()


@router.post("/api/analyze", response_model=AnalysisResponse)
async def analyze_spec(payload: AnalyzeRequest) -> AnalysisResponse:
    """Analisa uma especificação via LLM e devolve o diagnóstico estruturado (PRD §10)."""
    try:
        return await analyze(payload.text, payload.type, payload.model)
    except LLMTimeout as exc:
        raise HTTPException(status_code=504, detail=exc.message)
    except LLMUnavailable as exc:
        raise HTTPException(status_code=502, detail=exc.message)
    except AnalysisValidationError:
        raise HTTPException(
            status_code=422,
            detail="Não foi possível processar a análise. Tente novamente.",
        )
