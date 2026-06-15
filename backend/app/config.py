from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

LLMProvider = Literal["openrouter", "gemini"]

_DEFAULT_MODELS: dict[str, str] = {
    "openrouter": "anthropic/claude-sonnet-4.5",
    "gemini": "gemini-3-flash-preview",
}


class Settings(BaseSettings):
    """Configurações carregadas de variáveis de ambiente (.env na raiz do projeto)."""

    # Provedor LLM: openrouter | gemini
    xray_llm_provider: LLMProvider = "openrouter"

    openrouter_api_key: str = ""
    gemini_api_key: str = ""

    # Se vazio, usa o default do provedor ativo (resolved_default_model).
    xray_default_model: str = ""
    xray_fallback_model: str = "openai/gpt-4o-mini"

    xray_cors_origins: str = "http://localhost:5500,http://127.0.0.1:5500"
    xray_rate_limit: int = 10
    xray_llm_timeout: int = 25

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("xray_llm_provider", mode="before")
    @classmethod
    def normalize_provider(cls, value: object) -> str:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.xray_cors_origins.split(",") if origin.strip()]

    @property
    def resolved_default_model(self) -> str:
        if self.xray_default_model.strip():
            return self.xray_default_model.strip()
        return _DEFAULT_MODELS.get(self.xray_llm_provider, _DEFAULT_MODELS["openrouter"])


@lru_cache
def get_settings() -> Settings:
    return Settings()
