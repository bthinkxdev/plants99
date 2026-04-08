"""Pincode / serviceability checks for PDP and checkout context."""

from __future__ import annotations

from typing import Any, Dict, Optional

from app.services import pincode as pincode_svc


def normalize_pincode(pincode: Optional[str]) -> str:
    return pincode_svc.normalize_pincode(pincode)


def is_pincode_serviceable(pincode: Optional[str]) -> bool:
    return pincode_svc.is_pincode_serviceable(pincode)


def serviceability_for_product(
    *,
    pincode: Optional[str],
    product_is_combo: bool = False,
    line_type: str = 'purchase',
) -> Dict[str, Any]:
    """
    Unified serviceability payload for product, combo, or rental flows.
    Delivery list is shared (Kerala PIN list); product type affects messaging only.
    """
    normalized = normalize_pincode(pincode)
    ok = is_pincode_serviceable(normalized)
    lt = (line_type or 'purchase').strip().lower()
    return {
        'serviceable': ok,
        'normalized': normalized,
        'product_kind': 'combo' if product_is_combo else 'standard',
        'line_type': lt,
        'message_available': 'Delivery available to this PIN code.',
        'message_unavailable': 'We do not deliver to this PIN code yet.',
    }
