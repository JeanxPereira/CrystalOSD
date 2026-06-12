"""Pure regex/heuristic classifier. No LLM. Reads decomp.me iterate JSON."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Verdict(str, Enum):
    SOLVED = "SOLVED"
    SYMBOL_ONLY = "SYMBOL_ONLY"
    CLOSE = "CLOSE"
    PROGRESSING = "PROGRESSING"
    STUCK = "STUCK"
    COMPILE_FAIL = "COMPILE_FAIL"
    ERROR = "ERROR"


@dataclass
class Judgement:
    verdict: Verdict
    score: int | None
    max_score: int | None
    match_pct: float
    reason: str


def classify(
    iterate_result: dict,
    *,
    prev_score: int | None = None,
    same_score_streak: int = 0,
    symbol_only_threshold: int = 15,
    close_threshold: int = 100,
    stuck_threshold: int = 3,
) -> Judgement:
    """Classify a decomp.me iterate result.

    Args:
        iterate_result: JSON output of `decomp_match.py iterate`
        prev_score: score from the previous iteration (None on first)
        same_score_streak: how many iters in a row score has not improved
    """
    if "error" in iterate_result:
        return Judgement(Verdict.ERROR, None, None, 0.0, iterate_result["error"])

    if iterate_result.get("compiler_output"):
        return Judgement(
            Verdict.COMPILE_FAIL,
            None,
            None,
            0.0,
            iterate_result.get("compiler_output", "")[:300],
        )

    score = iterate_result.get("score")
    max_score = iterate_result.get("max_score") or 0
    match_pct = iterate_result.get("match_pct", 0.0)

    if score is None:
        return Judgement(Verdict.ERROR, None, None, 0.0, "no score in result")

    if score == 0:
        return Judgement(Verdict.SOLVED, 0, max_score, 100.0, "score=0")

    if 0 < score <= symbol_only_threshold:
        return Judgement(
            Verdict.SYMBOL_ONLY,
            score,
            max_score,
            match_pct,
            f"score={score} ≤ symbol_only_threshold={symbol_only_threshold}",
        )

    improving = prev_score is None or score < prev_score
    if not improving and same_score_streak >= stuck_threshold:
        return Judgement(
            Verdict.STUCK,
            score,
            max_score,
            match_pct,
            f"no improvement for {same_score_streak} iterations",
        )

    if score <= close_threshold:
        return Judgement(Verdict.CLOSE, score, max_score, match_pct, f"score={score}")

    return Judgement(Verdict.PROGRESSING, score, max_score, match_pct, f"score={score}")
