from __future__ import annotations

from difflib import SequenceMatcher
from typing import Iterable


def _normalize(value: str) -> str:
    return " ".join(value.lower().strip().split())


def fuzzy_score(query: str, candidate: str) -> float:
    a = _normalize(query)
    b = _normalize(candidate)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    ratio = SequenceMatcher(None, a, b).ratio()
    if a in b:
        ratio = max(ratio, 0.9)
    return round(ratio, 6)


def best_matches(query: str, candidates: Iterable[str], limit: int = 5) -> list[tuple[str, float]]:
    scored = [(candidate, fuzzy_score(query, candidate)) for candidate in candidates]
    scored.sort(key=lambda row: row[1], reverse=True)
    return scored[: max(1, limit)]
