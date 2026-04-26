from __future__ import annotations


def normalize_credential(value: str | None) -> str | None:
    """
    Trim whitespace and surrounding quotes; treat empty strings as missing.
    Any other value (even if it contains words like 'your') is respected.
    """
    if value is None:
        return None
    candidate = value.strip().strip("'\"")
    return candidate or None
