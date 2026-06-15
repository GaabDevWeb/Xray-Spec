from typing import Literal

from pydantic import BaseModel, Field

Severity = Literal["critical", "high", "medium", "low"]
Priority = Literal["high", "medium", "low"]
DimensionName = Literal[
    "context",
    "objective",
    "constraints",
    "specificity",
    "clarity",
    "success_criteria",
]


class Meta(BaseModel):
    input_type: str
    input_language: str
    word_count: int
    analysis_timestamp: str


class Dimension(BaseModel):
    score: int = Field(..., ge=0, le=100)
    weight: float = Field(..., ge=0, le=1)
    justification: str
    evidence: list[str] = Field(default_factory=list)
    suggestion: str


class Dimensions(BaseModel):
    context: Dimension
    objective: Dimension
    constraints: Dimension
    specificity: Dimension
    clarity: Dimension
    success_criteria: Dimension


class Score(BaseModel):
    total: int = Field(..., ge=0, le=100)
    label: str
    dimensions: Dimensions


class Gap(BaseModel):
    id: str
    category: str
    severity: Severity
    description: str
    question: str
    related_dimension: str


class Ambiguity(BaseModel):
    id: str
    term: str
    context: str
    interpretations: list[str]
    suggestion: str


class Assumption(BaseModel):
    id: str
    assumption: str
    risk: str
    question: str


class Suggestion(BaseModel):
    priority: Priority
    text: str
    dimension: str


class ImprovedSpec(BaseModel):
    text: str
    changes_summary: list[str] = Field(default_factory=list)


class AnalysisResponse(BaseModel):
    """Schema v1.0 da resposta de análise (PRD §10)."""

    version: str = "1.0"
    meta: Meta
    score: Score
    gaps: list[Gap] = Field(default_factory=list)
    ambiguities: list[Ambiguity] = Field(default_factory=list)
    assumptions: list[Assumption] = Field(default_factory=list)
    suggestions: list[Suggestion] = Field(default_factory=list)
    improved_spec: ImprovedSpec
