"""Pincode serviceability check — in-memory, no external API."""

from functools import lru_cache
from typing import Optional, Tuple

from django.conf import settings


@lru_cache(maxsize=1)
def _allowed_pincode_payload() -> Tuple[frozenset, Tuple[str, ...]]:
    raw = getattr(settings, 'ALLOWED_SERVICE_PINCODES', ())
    out = set()
    for p in raw:
        s = ''.join((c for c in str(p) if c.isdigit()))
        if len(s) == 6:
            out.add(s)
    frozen = frozenset(out)
    return frozen, tuple(sorted(frozen))


def _allowed_normalized() -> frozenset:
    return _allowed_pincode_payload()[0]


def normalize_pincode(pincode: Optional[str]) -> str:
    if not pincode:
        return ''
    return ''.join((c for c in str(pincode).strip() if c.isdigit()))


def is_pincode_serviceable(pincode: Optional[str]) -> bool:
    n = normalize_pincode(pincode)
    return len(n) == 6 and n in _allowed_normalized()


def allowed_pincode_list() -> Tuple[str, ...]:
    return _allowed_pincode_payload()[1]
