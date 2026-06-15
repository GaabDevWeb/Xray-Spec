class LLMTimeout(Exception):
    """Chamada ao provedor LLM excedeu o timeout (HTTP 504)."""

    def __init__(self, message: str = "Tempo de análise esgotado. Tente novamente."):
        self.message = message
        super().__init__(message)


class LLMUnavailable(Exception):
    """Provedor LLM indisponível ou erro de conexão/resposta (HTTP 502)."""

    def __init__(self, message: str = "Serviço de análise indisponível no momento."):
        self.message = message
        super().__init__(message)
