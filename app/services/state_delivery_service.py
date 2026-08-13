"""
State-based delivery serviceability and charge service.

Delivery charges are centralized on DeliveryState.delivery_charge — one
fixed charge per state, applied to every product that ships there. Product
management only selects *which* states a product ships to.

Public API
----------
resolve_delivery_state_id(...)  → int | None
get_deliverable_states_for_product(product_id)  → QuerySet[DeliveryState]
is_state_deliverable_for_product(product_id, state_id) → bool
get_all_active_states()  → QuerySet[DeliveryState]
set_product_delivery_states(product_id, state_ids)  → None
set_state_delivery_charges(charges)  → None
get_state_delivery_charge(state_id) → Decimal | None
get_product_delivery_charge(product_id, state_id) → Decimal | None
get_combo_delivery_charge(combo_id, state_id) → Decimal | None
delivery_packs_for_quantity(quantity) → int
delivery_pack_free_slots(quantity) → int
delivery_pack_upsell_message(quantity) → str
compute_cart_delivery_charges(items, state_id) → CartDeliveryBreakdown
serviceability_payload(*, product_id, state_id)  → dict
get_deliverable_states_payload(product_id) → list[dict]
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional

from django.conf import settings
from django.db import transaction
from django.db.models import QuerySet


ZERO = Decimal('0')


def _flat_fallback() -> Decimal:
    return Decimal(str(getattr(settings, 'FLAT_DELIVERY_CHARGE', 60)))


def delivery_pack_size() -> int:
    """Pieces that share one state delivery charge (default 2 ≈ 500g–1kg)."""
    try:
        size = int(getattr(settings, 'DELIVERY_PACK_SIZE', 2) or 2)
    except (TypeError, ValueError):
        size = 2
    return max(1, size)


def delivery_packs_for_quantity(quantity) -> int:
    """ceil(qty / pack_size) — minimum 1 when quantity >= 1."""
    import math

    qty = int(quantity or 0)
    if qty <= 0:
        return 0
    return int(math.ceil(qty / delivery_pack_size()))


def delivery_pack_free_slots(quantity) -> int:
    """Pieces that can still be added without starting a new delivery pack."""
    size = delivery_pack_size()
    qty = int(quantity or 0)
    if qty <= 0 or size <= 1:
        return 0
    rem = qty % size
    return 0 if rem == 0 else size - rem


def delivery_pack_upsell_message(quantity) -> str:
    """Short checkout tip when another piece fits the current pack for free."""
    slots = delivery_pack_free_slots(quantity)
    if slots == 1:
        return 'Add 1 more - no extra delivery charge'
    if slots > 1:
        return f'Add {slots} more - no extra delivery charge'
    return ''


def _as_decimal(value) -> Decimal:
    if value is None:
        return ZERO
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return ZERO


# ── Read helpers ───────────────────────────────────────────────────────────────

def get_deliverable_state_ids_for_product(product_id: int) -> Optional[set]:
    """
    Return allowed state IDs for a product, or None when the product has no
    state restrictions (ships to all active states).
    """
    from app.models import ProductDeliveryState

    ids = set(
        ProductDeliveryState.objects
        .filter(product_id=product_id, state__is_active=True)
        .values_list('state_id', flat=True)
    )
    if not ids:
        return None
    return ids


def resolve_delivery_state_id(*, delivery_state=None, state_text: str = '') -> Optional[int]:
    """Resolve a DeliveryState PK from a model instance and/or legacy text state."""
    if delivery_state is not None:
        if hasattr(delivery_state, 'pk'):
            return delivery_state.pk
        try:
            return int(delivery_state)
        except (TypeError, ValueError):
            pass

    text = (state_text or '').strip()
    if not text:
        return None

    from app.models import DeliveryState

    ds = DeliveryState.objects.filter(is_active=True, name__iexact=text).first()
    if ds:
        return ds.pk
    match = DeliveryState.objects.filter(is_active=True, code__iexact=text).first()
    return match.pk if match else None


def get_deliverable_states_for_product(product_id: int) -> QuerySet:
    """
    Return active DeliveryState objects this product ships to.

    No configured ProductDeliveryState rows ⇒ unrestricted ⇒ all active states
    (same policy as is_state_deliverable_for_product / cart validation).
    """
    from app.models import DeliveryState

    allowed = get_deliverable_state_ids_for_product(product_id)
    if allowed is None:
        return get_all_active_states()
    return (
        DeliveryState.objects
        .filter(pk__in=allowed, is_active=True)
        .order_by('display_order', 'name')
    )


def is_state_deliverable_for_product(product_id: int, state_id: int) -> bool:
    """
    True if the product ships to this state.
    Products with no configured restrictions ship to all states.
    """
    allowed = get_deliverable_state_ids_for_product(product_id)
    if allowed is None:
        return True
    return state_id in allowed


def is_state_deliverable_for_combo(combo_id: int, state_id: int) -> bool:
    """True when every component product in the combo ships to this state."""
    from app.models import ComboItem

    component_pids = list(
        ComboItem.objects.filter(combo_id=combo_id).values_list('product_id', flat=True)
    )
    if not component_pids:
        return False
    return all(is_state_deliverable_for_product(pid, state_id) for pid in component_pids)


def get_all_active_states() -> QuerySet:
    """All active states ordered for display."""
    from app.models import DeliveryState

    return DeliveryState.objects.filter(is_active=True).order_by('display_order', 'name')


def get_states_by_region() -> Dict[str, List]:
    """Returns states grouped by region for seller admin UI."""
    from app.models import DeliveryState

    region_order = ['south', 'west', 'central', 'east', 'north', 'northeast', 'ut']
    states = list(DeliveryState.objects.filter(is_active=True).order_by('display_order', 'name'))

    grouped: Dict[str, List] = {r: [] for r in region_order}
    for state in states:
        grouped.setdefault(state.region, []).append(state)
    return {k: v for k, v in grouped.items() if v}


# ── Delivery charges ───────────────────────────────────────────────────────────

def get_state_delivery_charge(state_id: int) -> Optional[Decimal]:
    """
    Centralized delivery charge for a state, or None when not yet configured
    (caller should apply the flat-rate fallback in that case).
    """
    from app.models import DeliveryState

    charge = (
        DeliveryState.objects
        .filter(pk=state_id)
        .values_list('delivery_charge', flat=True)
        .first()
    )
    return _as_decimal(charge) if charge is not None else None


def get_product_delivery_charge(product_id: int, state_id: int) -> Optional[Decimal]:
    """
    Centralized per-pack delivery charge for a product × state.

    Returns the state's centralized charge when the product ships to that
    state. Returns None when the product doesn't ship there, or the state
    has no charge configured yet (caller must check serviceability first).
    """
    if not is_state_deliverable_for_product(product_id, state_id):
        return None
    return get_state_delivery_charge(state_id)


def get_combo_delivery_charge(combo_id: int, state_id: int) -> Optional[Decimal]:
    """
    Centralized per-pack delivery charge for a combo × state — same
    centralized state charge, gated on every component shipping there.
    """
    if not is_state_deliverable_for_combo(combo_id, state_id):
        return None
    return get_state_delivery_charge(state_id)


@dataclass
class CartDeliveryBreakdown:
    total: Decimal
    used_flat_fallback: bool = False
    state_missing: bool = False
    lines: Dict[int, Dict[str, Decimal]] = field(default_factory=dict)

    def line_for(self, item_id: int) -> Dict[str, Decimal]:
        return self.lines.get(item_id, {
            'delivery_charge_per_unit': ZERO,
            'total_delivery_charge': ZERO,
        })


def compute_cart_delivery_charges(items, state_id: Optional[int] = None) -> CartDeliveryBreakdown:
    """
    Cart-wide pooled delivery charge: every line's quantity is pooled into
    one pack count before pricing, so mixed-product carts bundle correctly
    (e.g. Product A × 1 + Product B × 1 share one pack, not two).

    Rules:
    - No state selected → ₹0 (checkout must prompt to select a state).
    - State has a configured charge → charge × ceil(total_qty / DELIVERY_PACK_SIZE).
    - State has no charge configured → flat fallback with the same pack rule.

    Per-line delivery fields are always zeroed — the real total lives only
    at the cart/order level, since the charge is no longer attributable to
    an individual line.
    """
    if not state_id:
        return CartDeliveryBreakdown(total=ZERO, used_flat_fallback=False, state_missing=True)

    total_qty = sum(int(getattr(item, 'quantity', 0) or 0) for item in items)
    packs = Decimal(delivery_packs_for_quantity(total_qty))

    charge = get_state_delivery_charge(state_id)
    used_flat_fallback = charge is None
    if charge is None:
        charge = _flat_fallback()

    lines: Dict[int, Dict[str, Decimal]] = {}
    for item in items:
        item_id = getattr(item, 'id', None)
        if item_id is not None:
            lines[item_id] = {
                'delivery_charge_per_unit': ZERO,
                'total_delivery_charge': ZERO,
            }

    return CartDeliveryBreakdown(
        total=charge * packs,
        used_flat_fallback=used_flat_fallback,
        lines=lines,
    )


# ── Write helpers ──────────────────────────────────────────────────────────────

def set_product_delivery_states(product_id: int, state_ids: List[int]) -> None:
    """
    Atomically replace the delivery-state list for a product.

    Serviceability only — delivery pricing is centralized on
    DeliveryState.delivery_charge and is not set per product.
    """
    from app.models import DeliveryState, ProductDeliveryState

    valid_ids = set(
        DeliveryState.objects
        .filter(pk__in=state_ids, is_active=True)
        .values_list('pk', flat=True)
    )

    with transaction.atomic():
        ProductDeliveryState.objects.filter(product_id=product_id).delete()
        if valid_ids:
            ProductDeliveryState.objects.bulk_create([
                ProductDeliveryState(product_id=product_id, state_id=sid)
                for sid in valid_ids
            ])


def set_state_delivery_charges(charges: Dict[int, Optional[Any]]) -> None:
    """
    Atomically update the centralized per-state delivery charges.

    charges: map of state_id → charge (Decimal/str/number), or None/''
    to clear a state back to "not configured" (flat-rate fallback applies).
    """
    from app.models import DeliveryState

    with transaction.atomic():
        for state_id, value in charges.items():
            charge = None if value in (None, '') else _as_decimal(value)
            DeliveryState.objects.filter(pk=state_id).update(delivery_charge=charge)


def _state_list_with_charges(product_id: int, states) -> List[Dict[str, Any]]:
    return [
        {
            'id': s.id,
            'name': s.name,
            'code': s.code,
            'region': s.region,
            'delivery_charge': str(get_product_delivery_charge(product_id, s.id) or ZERO),
        }
        for s in states
    ]


def get_deliverable_states_payload(product_id: int) -> List[Dict[str, Any]]:
    """Deliverable states for a product, including per-state delivery charges."""
    return _state_list_with_charges(product_id, get_deliverable_states_for_product(product_id))


# ── Serviceability payload (used by AJAX views + checkout) ────────────────────

def serviceability_payload(
    *,
    product_id: int,
    state_id: Optional[int],
) -> Dict[str, Any]:
    """Unified response for PDP AJAX + checkout validation."""
    deliverable_qs = get_deliverable_states_for_product(product_id)
    deliverable_list = _state_list_with_charges(product_id, deliverable_qs)

    if not state_id:
        return {
            'serviceable': False,
            'state_id': None,
            'state_name': None,
            'delivery_charge': None,
            'deliverable_states': deliverable_list,
            'message': 'Please select your delivery state.',
        }

    selected = next((s for s in deliverable_qs if s.id == state_id), None)
    if selected:
        charge = get_product_delivery_charge(product_id, state_id)
        return {
            'serviceable': True,
            'state_id': selected.id,
            'state_name': selected.name,
            'delivery_charge': str(charge if charge is not None else ZERO),
            'deliverable_states': deliverable_list,
            'message': f'Delivery available to {selected.name} ✓',
        }

    from app.models import DeliveryState
    try:
        state_name = DeliveryState.objects.get(pk=state_id).name
    except DeliveryState.DoesNotExist:
        state_name = 'selected state'

    return {
        'serviceable': False,
        'state_id': state_id,
        'state_name': state_name,
        'delivery_charge': None,
        'deliverable_states': deliverable_list,
        'message': f"Sorry, we don't currently deliver to {state_name}.",
    }


def serviceability_payload_for_combo(
    *,
    combo_id: int,
    state_id: Optional[int],
) -> Dict[str, Any]:
    """For a Combo, ALL component products must deliver to the state."""
    from app.models import ComboItem, DeliveryState

    component_pids = list(
        ComboItem.objects
        .filter(combo_id=combo_id)
        .values_list('product_id', flat=True)
    )

    if not component_pids:
        return {
            'serviceable': False,
            'state_id': state_id,
            'state_name': None,
            'delivery_charge': None,
            'deliverable_states': [],
            'message': 'Combo has no products.',
        }

    common_state_ids = None
    for pid in component_pids:
        pid_state_ids = get_deliverable_state_ids_for_product(pid)
        if pid_state_ids is None:
            continue
        if common_state_ids is None:
            common_state_ids = set(pid_state_ids)
        else:
            common_state_ids &= pid_state_ids

    if common_state_ids is None:
        deliverable_qs = DeliveryState.objects.filter(is_active=True).order_by('display_order', 'name')
    elif not common_state_ids:
        deliverable_qs = DeliveryState.objects.none()
    else:
        deliverable_qs = (
            DeliveryState.objects
            .filter(pk__in=common_state_ids, is_active=True)
            .order_by('display_order', 'name')
        )

    charge_for_state = get_combo_delivery_charge(combo_id, state_id) if state_id else None
    deliverable_list = [
        {
            'id': s.id,
            'name': s.name,
            'code': s.code,
            'region': s.region,
            'delivery_charge': str(get_combo_delivery_charge(combo_id, s.id) or ZERO),
        }
        for s in deliverable_qs
    ]

    if not state_id:
        return {
            'serviceable': False,
            'state_id': None,
            'state_name': None,
            'delivery_charge': None,
            'deliverable_states': deliverable_list,
            'message': 'Please select your delivery state.',
        }

    selected = next((s for s in deliverable_qs if s.id == state_id), None)
    if selected:
        return {
            'serviceable': True,
            'state_id': selected.id,
            'state_name': selected.name,
            'delivery_charge': str(charge_for_state if charge_for_state is not None else ZERO),
            'deliverable_states': deliverable_list,
            'message': f'Delivery available to {selected.name} ✓',
        }

    try:
        state_name = DeliveryState.objects.get(pk=state_id).name
    except DeliveryState.DoesNotExist:
        state_name = 'selected state'

    return {
        'serviceable': False,
        'state_id': state_id,
        'state_name': state_name,
        'delivery_charge': None,
        'deliverable_states': deliverable_list,
        'message': f"Sorry, we don't currently deliver this combo to {state_name}.",
    }
