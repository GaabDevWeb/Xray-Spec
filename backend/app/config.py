from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

CursorMode = Literal["plan", "agent"]

LLMProvider = Literal["openrouter", "gemini", "openai", "anthropic", "deepseek", "groq", "cursor"]

SUPPORTED_PROVIDERS: frozenset[str] = frozenset(
    {"openrouter", "gemini", "openai", "anthropic", "deepseek", "groq", "cursor"}
)

_DEFAULT_MODELS: dict[str, str] = {
    "openrouter": "anthropic/claude-sonnet-4.5",
    "gemini": "gemini-3-flash-preview",
    "openai": "gpt-4o",
    "anthropic": "claude-sonnet-4-20250514",
    "deepseek": "deepseek-chat",
    "groq": "llama-3.3-70b-versatile",
    "cursor": "composer-2.5",
}

_API_KEY_ENV: dict[str, str] = {
    "openrouter": "OPENROUTER_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "groq": "GROQ_API_KEY",
    "cursor": "CURSOR_API_KEY",
}


class Settings(BaseSettings):
    """Configurações carregadas de variáveis de ambiente (.env na raiz do projeto)."""

    xray_llm_provider: LLMProvider = Field(
        default="openrouter",
        validation_alias=AliasChoices("XRAY_LLM_PROVIDER", "LLM_PROVIDER"),
    )

    openrouter_api_key: str = ""
    gemini_api_key: str = ""
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    deepseek_api_key: str = ""
    groq_api_key: str = ""
    cursor_api_key: str = ""

    # Cursor SDK: cwd do agente local; mode plan ≈ ask (sem edição directa)
    xray_cursor_cwd: str = ""
    xray_cursor_mode: CursorMode = "plan"

    xray_default_model: str = Field(
        default="",
        validation_alias=AliasChoices("XRAY_DEFAULT_MODEL", "LLM_MODEL"),
    )
    xray_fallback_model: str = "openai/gpt-4o-mini"

    xray_cors_origins: str = "http://localhost:5500,http://127.0.0.1:5500"
    xray_rate_limit: int = 10
    xray_llm_timeout: int = 25

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    @field_validator("xray_cursor_mode", mode="before")
    @classmethod
    def normalize_cursor_mode(cls, value: object) -> str:
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in ("ask", "plan"):
                return "plan"
            if normalized in ("agent",):
                return "agent"
            if normalized in ("plan", "agent"):
                return normalized
            raise ValueError("XRAY_CURSOR_MODE must be 'plan' (ask-like) or 'agent'.")
        return value

    @field_validator("xray_llm_provider", mode="before")
    @classmethod
    def normalize_provider(cls, value: object) -> str:
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized and normalized not in SUPPORTED_PROVIDERS:
                supported = ", ".join(sorted(SUPPORTED_PROVIDERS))
                raise ValueError(
                    f"Unknown LLM provider '{normalized}'. Supported: {supported}."
                )
            return normalized
        return value

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.xray_cors_origins.split(",") if origin.strip()]

    @property
    def resolved_default_model(self) -> str:
        if self.xray_default_model.strip():
            return self.xray_default_model.strip()
        return _DEFAULT_MODELS.get(self.xray_llm_provider, _DEFAULT_MODELS["openrouter"])

    def api_key_for(self, provider: str | None = None) -> str:
        """Devolve a API key do provedor (activo ou explícito)."""
        name = provider or self.xray_llm_provider
        keys = {
            "openrouter": self.openrouter_api_key,
            "gemini": self.gemini_api_key,
            "openai": self.openai_api_key,
            "anthropic": self.anthropic_api_key,
            "deepseek": self.deepseek_api_key,
            "groq": self.groq_api_key,
            "cursor": self.cursor_api_key,
        }
        return keys.get(name, "").strip()

    def api_key_env_name(self, provider: str | None = None) -> str:
        name = provider or self.xray_llm_provider
        return _API_KEY_ENV.get(name, "API_KEY")

    def config_error(self) -> str | None:
        """None se OK; mensagem amigável se provider ou chave inválidos."""
        provider = self.xray_llm_provider
        if provider not in SUPPORTED_PROVIDERS:
            supported = ", ".join(sorted(SUPPORTED_PROVIDERS))
            return f"Unknown provider '{provider}'. Supported: {supported}."
        if not self.api_key_for(provider):
            env = self.api_key_env_name(provider)
            return f"API key not configured ({env})."
        return None


@lru_cache
def get_settings() -> Settings:
    return Settings()
