import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.middleware.rate_limit import RateLimitMiddleware
from app.routes import analyze, health

logging.basicConfig(level=logging.INFO)

settings = get_settings()

app = FastAPI(title="Xray Spec Analyzer", version="1.0.0")

app.add_middleware(RateLimitMiddleware, limit=settings.xray_rate_limit)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(health.router)
app.include_router(analyze.router)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Erros de validação do corpo da requisição viram 400 (AGENT §6.1), não 422.

    422 é reservado para falha do JSON do LLM após retry.
    """
    first = exc.errors()[0] if exc.errors() else {}
    message = first.get("msg", "Requisição inválida.")
    return JSONResponse(status_code=400, content={"detail": message})
