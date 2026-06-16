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


class ProviderConfigError(Exception):
    """Configuração inválida do provedor LLM (startup / health)."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


PROVIDER_LABELS: dict[str, str] = {
    "openrouter": "OpenRouter",
    "gemini": "Gemini",
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "deepseek": "DeepSeek",
    "groq": "Groq",
    "cursor": "Cursor",
}


def format_provider_error(provider: str, model: str, message: str) -> str:
    """Mensagem amigável exibida ao utilizador (sem stack trace)."""
    label = PROVIDER_LABELS.get(provider, provider.title())
    return f"{label} ({model}) failed:\n{message}"
