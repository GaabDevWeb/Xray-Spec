from app.schemas.response import AnalysisResponse

# Pesos fixos das 6 dimensões (PRD §8 / AGENT §6.3). A soma é 1.0.
DIMENSION_WEIGHTS: dict[str, float] = {
    "context": 0.20,
    "objective": 0.20,
    "constraints": 0.15,
    "specificity": 0.15,
    "clarity": 0.15,
    "success_criteria": 0.15,
}


def band_label(total: int) -> str:
    """Faixa de interpretação do score (PRD §8.3)."""
    if total <= 25:
        return "Crítico"
    if total <= 50:
        return "Fraco"
    if total <= 75:
        return "Adequado"
    if total <= 90:
        return "Bom"
    return "Excelente"


def recompute_total(analysis: AnalysisResponse) -> AnalysisResponse:
    """Backend é a fonte de verdade do score: recalcula total e label a partir das dimensões.

    Evita confiar no total devolvido pelo LLM, que pode divergir da fórmula ponderada.
    """
    dimensions = analysis.score.dimensions
    weighted_sum = 0.0
    for name, weight in DIMENSION_WEIGHTS.items():
        dimension = getattr(dimensions, name)
        weighted_sum += dimension.score * weight
        dimension.weight = weight

    total = round(weighted_sum)
    analysis.score.total = total
    analysis.score.label = band_label(total)
    return analysis
