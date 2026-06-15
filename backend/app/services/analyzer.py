import json
import logging
import re

from pydantic import ValidationError

from app.schemas.request import InputType
from app.schemas.response import AnalysisResponse
from app.services import llm
from app.services.prompt_builder import (
    build_retry_prompt,
    build_system_prompt,
    build_user_prompt,
)
from app.services.score import recompute_total

logger = logging.getLogger("xray.analyzer")

_JSON_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


class AnalysisValidationError(Exception):
    """JSON do LLM inválido após o retry (mapeada para HTTP 422)."""


def _strip_markdown(raw: str) -> str:
    """Remove cercas de código ```json ... ``` que alguns modelos adicionam."""
    cleaned = raw.strip()
    cleaned = _JSON_FENCE.sub("", cleaned)
    return cleaned.strip()


def _parse_and_validate(raw: str) -> AnalysisResponse:
    cleaned = _strip_markdown(raw)
    parsed = json.loads(cleaned)
    return AnalysisResponse.model_validate(parsed)


async def analyze(text: str, input_type: InputType, model: str | None = None) -> AnalysisResponse:
    """Pipeline completo: monta prompts, chama LLM, valida com retry 1× e recalcula score.

    Levanta:
      - LLMTimeout / LLMUnavailable (502/504)
      - AnalysisValidationError (422) após duas falhas de validação.
    """
    system_prompt = build_system_prompt()
    user_prompt = build_user_prompt(text, input_type)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    raw = await llm.chat_completion(messages, model=model)

    try:
        analysis = _parse_and_validate(raw)
    except (json.JSONDecodeError, ValidationError) as first_error:
        logger.info("First LLM response invalid, retrying once")
        messages.append({"role": "assistant", "content": raw})
        messages.append({"role": "user", "content": build_retry_prompt(str(first_error))})

        retry_raw = await llm.chat_completion(messages, model=model)
        try:
            analysis = _parse_and_validate(retry_raw)
        except (json.JSONDecodeError, ValidationError) as second_error:
            logger.warning("LLM response invalid after retry: %s", type(second_error).__name__)
            raise AnalysisValidationError from second_error

    return recompute_total(analysis)
