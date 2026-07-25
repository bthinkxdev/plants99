from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from .base import TimeStampedModel


class Coupon(TimeStampedModel):
    class DiscountType(models.TextChoices):
        PERCENT = ('percent', 'Percentage')
        FIXED = ('fixed', 'Fixed amount')

    code = models.CharField(max_length=40, unique=True, db_index=True)
    name = models.CharField(max_length=120, blank=True, default='')
    description = models.TextField(blank=True, default='')
    discount_type = models.CharField(
        max_length=10,
        choices=DiscountType.choices,
        default=DiscountType.PERCENT,
        db_index=True,
    )
    discount_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
    )
    starts_at = models.DateTimeField(null=True, blank=True, db_index=True)
    expires_at = models.DateTimeField(null=True, blank=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    max_uses = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text='Blank = unlimited global uses.',
    )
    usage_count = models.PositiveIntegerField(default=0)
    once_per_customer = models.BooleanField(
        default=False,
        help_text='If set, each customer (user or phone) may redeem once.',
    )
    min_subtotal = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0'),
        validators=[MinValueValidator(Decimal('0'))],
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.code

    def save(self, *args, **kwargs):
        if self.code:
            self.code = self.code.strip().upper()
        super().save(*args, **kwargs)

    @property
    def is_expired(self) -> bool:
        if self.expires_at and timezone.now() > self.expires_at:
            return True
        return False

    @property
    def has_started(self) -> bool:
        if self.starts_at and timezone.now() < self.starts_at:
            return False
        return True

    @property
    def uses_remaining_label(self) -> str:
        if self.max_uses is None:
            return f'{self.usage_count} / ∞'
        return f'{self.usage_count} / {self.max_uses}'


class CouponRedemption(TimeStampedModel):
    coupon = models.ForeignKey(Coupon, on_delete=models.PROTECT, related_name='redemptions')
    order = models.OneToOneField(
        'Order',
        on_delete=models.CASCADE,
        related_name='coupon_redemption',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='coupon_redemptions',
    )
    customer_phone = models.CharField(max_length=20, blank=True, default='', db_index=True)
    customer_email = models.EmailField(blank=True, default='')
    code_snapshot = models.CharField(max_length=40)
    discount_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['coupon', 'customer_phone']),
            models.Index(fields=['coupon', 'user']),
        ]

    def __str__(self):
        return f'{self.code_snapshot} on {self.order_id}'
