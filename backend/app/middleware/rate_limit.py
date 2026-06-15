import time
from collections import defaultdict, deque

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

WINDOW_SECONDS = 60


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limit por IP com janela deslizante em memória (PRD §20 D3).

    Limita apenas as rotas de API; assets e /docs passam livremente.
    Para deploy multi-worker uma store compartilhada (Redis) seria necessária,
    mas para a V1 single-process este controlador é suficiente.
    """

    def __init__(self, app, limit: int = 10):
        super().__init__(app)
        self.limit = limit
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        hits = self._hits[client_ip]

        while hits and now - hits[0] > WINDOW_SECONDS:
            hits.popleft()

        if len(hits) >= self.limit:
            retry_after = int(WINDOW_SECONDS - (now - hits[0])) + 1
            return JSONResponse(
                status_code=429,
                content={"detail": "Limite de requisições atingido. Aguarde 1 minuto."},
                headers={"Retry-After": str(retry_after)},
            )

        hits.append(now)
        return await call_next(request)
