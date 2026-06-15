from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

InputType = Literal["prompt", "requirement", "briefing"]

MIN_TEXT_LENGTH = 10
MAX_TEXT_LENGTH = 10_000


class AnalyzeRequest(BaseModel):
    """Corpo da requisição de POST /api/analyze (PRD §12.2)."""

    text: str = Field(..., description="Especificação a analisar (10–10000 chars)")
    type: InputType = Field(default="prompt", description="Calibração da análise")
    model: Optional[str] = Field(default=None, description="Override opcional do modelo LLM")

    @field_validator("text")
    @classmethod
    def validate_text_length(cls, value: str) -> str:
        stripped = value.strip()
        if len(stripped) < MIN_TEXT_LENGTH:
            raise ValueError(f"O texto deve ter no mínimo {MIN_TEXT_LENGTH} caracteres.")
        if len(stripped) > MAX_TEXT_LENGTH:
            raise ValueError(f"O texto deve ter no máximo {MAX_TEXT_LENGTH} caracteres.")
        return stripped
