"""
Coupon validation, discount math, cart apply/clear, and order redemption.

Single source of truth — views and totals must not reimplement these rules.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Optional, Tuple

from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from app.models import Coupon, CouponRedemption

ZERO = Decimal('0')
CENT = Decimal('0.01')


class CouponError(Exception):
    """Raised when a coupon cannot be applied."""


def normalize_code(code: Optional[str]) -> str:
    return (code or '').strip().upper()


def get_coupon(code: Optional[str]) -> Optional[Coupon]:
    normalized = normalize_code(code)
    if not normalized:
        return None
    return Coupon.objects.filter(code=normalized).first()


def _as_decimal(value) -> Decimal:
    if value is None:
        return ZERO
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception:
        return ZERO


def _quantize(amount: Decimal) -> Decimal:
    return amount.quantize(CENT, rounding=ROUND_HALF_UP)


def calculate_discount(coupon: Coupon, subtotal) -> Decimal:
    """Merchandise discount capped at subtotal. Never applies to shipping."""
    sub = _as_decimal(subtotal)
    if sub <= ZERO or coupon is None:
        return ZERO
    value = _as_decimal(coupon.discount_value)
    if coupon.discount_type == Coupon.DiscountType.PERCENT:
        raw = sub * (value / Decimal('100'))
    else:
        raw = value
    if raw <= ZERO:
        return ZERO
    return _quantize(min(raw, sub))


def _customer_already_used(*, coupon: Coupon, user=None, phone: str = '') -> bool:
    if not coupon.once_per_customer:
        return False
    qs = CouponRedemption.objects.filter(coupon=coupon)
    clauses = Q()
    if user is not None and getattr(user, 'is_authenticated', False) and getattr(user, 'pk', None):
        clauses |= Q(user_id=user.pk)
    phone_norm = (phone or '').strip()
    if phone_norm:
        clauses |= Q(customer_phone=phone_norm)
    if not clauses:
        return False
    return qs.filter(clauses).exists()


def validate_coupon(
    coupon: Optional[Coupon],
    *,
    subtotal,
    user=None,
    phone: str = '',
) -> Tuple[bool, str]:
    if coupon is None:
        return False, 'Invalid coupon code.'
    if not coupon.is_active:
        return False, 'This coupon is no longer active.'
    now = timezone.now()
    if coupon.starts_at and now < coupon.starts_at:
        return False, 'This coupon is not active yet.'
    if coupon.expires_at and now > coupon.expires_at:
        return False, 'This coupon has expired.'
    if coupon.max_uses is not None and coupon.usage_count >= coupon.max_uses:
        return False, 'This coupon has reached its usage limit.'
    sub = _as_decimal(subtotal)
    min_sub = _as_decimal(coupon.min_subtotal)
    if min_sub > ZERO and sub < min_sub:
        return False, f'Minimum order of ₹{min_sub} required for this coupon.'
    if _customer_already_used(coupon=coupon, user=user, phone=phone):
        return False, 'You have already used this coupon.'
    discount = calculate_discount(coupon, sub)
    if discount <= ZERO:
        return False, 'This coupon does not apply to your cart.'
    return True, ''


def clear_cart_coupon(cart) -> None:
    if getattr(cart, 'coupon_code', ''):
        cart.coupon_code = ''
        cart.save(update_fields=['coupon_code', 'updated_at'])


def apply_coupon_to_cart(cart, code: str, *, user=None, phone: str = '', subtotal=None) -> Tuple[Coupon, Decimal]:
    """
    Validate and attach coupon to cart.
    Returns (coupon, discount). Raises CouponError on failure.
    """
    coupon = get_coupon(code)
    if coupon is None:
        raise CouponError('Invalid coupon code.')
    if subtotal is None:
        subtotal = sum((item.line_total for item in cart.items.all()))
    ok, message = validate_coupon(coupon, subtotal=subtotal, user=user, phone=phone)
    if not ok:
        raise CouponError(message)
    discount = calculate_discount(coupon, subtotal)
    cart.coupon_code = coupon.code
    cart.save(update_fields=['coupon_code', 'updated_at'])
    return coupon, discount


def resolve_cart_coupon(
    cart,
    *,
    user=None,
    phone: str = '',
    subtotal=None,
) -> Tuple[Optional[Coupon], Decimal, Optional[str]]:
    """
    Re-validate cart.coupon_code. Clears cart if stale.
    Returns (coupon|None, discount, error_message|None).
    """
    code = normalize_code(getattr(cart, 'coupon_code', ''))
    if not code:
        return None, ZERO, None
    if subtotal is None:
        subtotal = sum((item.line_total for item in cart.items.all()))
    coupon = get_coupon(code)
    ok, message = validate_coupon(coupon, subtotal=subtotal, user=user, phone=phone)
    if not ok:
        clear_cart_coupon(cart)
        return None, ZERO, message
    return coupon, calculate_discount(coupon, subtotal), None


@transaction.atomic
def record_redemption(
    order,
    coupon: Coupon,
    discount,
    *,
    user=None,
    phone: str = '',
    email: str = '',
) -> CouponRedemption:
    """Persist redemption and bump usage_count. Call inside order create transaction."""
    amount = _quantize(_as_decimal(discount))
    redemption = CouponRedemption.objects.create(
        coupon=coupon,
        order=order,
        user=user if user is not None and getattr(user, 'pk', None) else None,
        customer_phone=(phone or '').strip(),
        customer_email=(email or '').strip(),
        code_snapshot=coupon.code,
        discount_amount=amount,
    )
    Coupon.objects.filter(pk=coupon.pk).update(usage_count=F('usage_count') + 1)
    return redemption
