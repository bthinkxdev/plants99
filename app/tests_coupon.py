"""Coupon validation, totals integration, and order redemption."""
from decimal import Decimal
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from app.models import (
    Cart,
    CartItem,
    Category,
    Coupon,
    CouponRedemption,
    DeliveryState,
    Order,
    Product,
)
from app.services.cart_order import CartService, OrderService
from app.services.coupon_service import (
    CouponError,
    apply_coupon_to_cart,
    calculate_discount,
    clear_cart_coupon,
    resolve_cart_coupon,
    validate_coupon,
)


User = get_user_model()


@override_settings(FLAT_DELIVERY_CHARGE=60)
class CouponServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.cat = Category.objects.create(name='Plants', slug='plants-c', is_active=True)
        cls.product = Product.objects.create(
            name='Money Plant',
            slug='money-plant-c',
            category=cls.cat,
            base_price=Decimal('500.00'),
            base_stock=20,
            is_active=True,
            purchase_enabled=True,
        )
        cls.kerala = DeliveryState.objects.create(
            name='Kerala', code='KL-C', region='south', display_order=0, is_active=True,
        )

    def _cart_with_item(self, qty=1):
        cart = Cart.objects.create(status=Cart.Status.ACTIVE)
        CartItem.objects.create(
            cart=cart,
            product=self.product,
            quantity=qty,
            unit_price=self.product.base_price,
        )
        return cart

    def test_percent_and_fixed_discount_math(self):
        percent = Coupon.objects.create(
            code='WELCOME10',
            discount_type=Coupon.DiscountType.PERCENT,
            discount_value=Decimal('10'),
        )
        fixed = Coupon.objects.create(
            code='FESTIVE500',
            discount_type=Coupon.DiscountType.FIXED,
            discount_value=Decimal('500'),
        )
        self.assertEqual(calculate_discount(percent, Decimal('1000')), Decimal('100.00'))
        self.assertEqual(calculate_discount(fixed, Decimal('1000')), Decimal('500.00'))
        self.assertEqual(calculate_discount(fixed, Decimal('200')), Decimal('200.00'))

    def test_expired_inactive_max_uses_rejected(self):
        expired = Coupon.objects.create(
            code='OLD10',
            discount_type=Coupon.DiscountType.PERCENT,
            discount_value=Decimal('10'),
            expires_at=timezone.now() - timedelta(days=1),
        )
        inactive = Coupon.objects.create(
            code='OFF10',
            discount_type=Coupon.DiscountType.PERCENT,
            discount_value=Decimal('10'),
            is_active=False,
        )
        limited = Coupon.objects.create(
            code='ONCE',
            discount_type=Coupon.DiscountType.FIXED,
            discount_value=Decimal('50'),
            max_uses=1,
            usage_count=1,
        )
        ok, msg = validate_coupon(expired, subtotal=Decimal('500'))
        self.assertFalse(ok)
        self.assertIn('expired', msg.lower())
        ok, msg = validate_coupon(inactive, subtotal=Decimal('500'))
        self.assertFalse(ok)
        ok, msg = validate_coupon(limited, subtotal=Decimal('500'))
        self.assertFalse(ok)
        self.assertIn('usage', msg.lower())

    def test_once_per_customer_blocks_repeat(self):
        user = User.objects.create_user(username='buyer1', password='x')
        coupon = Coupon.objects.create(
            code='UNIQUE1',
            discount_type=Coupon.DiscountType.PERCENT,
            discount_value=Decimal('10'),
            once_per_customer=True,
        )
        cart = self._cart_with_item()
        order = Order.objects.create(
            user=user,
            order_number='QOTESTCPN1',
            subtotal=Decimal('500'),
            shipping=Decimal('60'),
            total=Decimal('510'),
            discount_amount=Decimal('50'),
            coupon_code='UNIQUE1',
            address_id=self._make_address(user).pk,
        )
        CouponRedemption.objects.create(
            coupon=coupon,
            order=order,
            user=user,
            customer_phone='9999999999',
            code_snapshot='UNIQUE1',
            discount_amount=Decimal('50'),
        )
        ok, msg = validate_coupon(coupon, subtotal=Decimal('500'), user=user, phone='9999999999')
        self.assertFalse(ok)
        self.assertIn('already used', msg.lower())

    def _make_address(self, user):
        from app.models import Address
        return Address.objects.create(
            user=user,
            full_name='Test',
            phone='9999999999',
            address_line='Line',
            city='City',
            state='Kerala',
            pincode='673001',
            delivery_state=self.kerala,
            is_snapshot=True,
        )

    def test_apply_and_totals_include_discount(self):
        Coupon.objects.create(
            code='SAVE10',
            discount_type=Coupon.DiscountType.PERCENT,
            discount_value=Decimal('10'),
        )
        cart = self._cart_with_item(qty=2)
        apply_coupon_to_cart(cart, 'save10', subtotal=Decimal('1000'))
        cart.refresh_from_db()
        self.assertEqual(cart.coupon_code, 'SAVE10')
        totals = CartService.compute_totals(cart, state_id=None)
        self.assertEqual(totals.discount, Decimal('100.00'))
        self.assertEqual(totals.coupon_code, 'SAVE10')
        self.assertEqual(totals.total, Decimal('900.00'))

    def test_stale_coupon_cleared_on_resolve(self):
        coupon = Coupon.objects.create(
            code='STALE',
            discount_type=Coupon.DiscountType.PERCENT,
            discount_value=Decimal('10'),
            is_active=True,
        )
        cart = self._cart_with_item()
        cart.coupon_code = 'STALE'
        cart.save(update_fields=['coupon_code'])
        coupon.is_active = False
        coupon.save(update_fields=['is_active'])
        c, discount, err = resolve_cart_coupon(cart, subtotal=Decimal('500'))
        self.assertIsNone(c)
        self.assertEqual(discount, Decimal('0'))
        self.assertTrue(err)
        cart.refresh_from_db()
        self.assertEqual(cart.coupon_code, '')

    def test_order_snapshots_discount_and_redemption(self):
        user = User.objects.create_user(username='buyer2', password='x')
        Coupon.objects.create(
            code='ORDER10',
            discount_type=Coupon.DiscountType.PERCENT,
            discount_value=Decimal('10'),
        )
        cart = Cart.objects.create(user=user, status=Cart.Status.ACTIVE)
        CartItem.objects.create(
            cart=cart,
            product=self.product,
            quantity=2,
            unit_price=self.product.base_price,
        )
        apply_coupon_to_cart(cart, 'ORDER10', user=user, subtotal=Decimal('1000'))
        form_data = {
            'full_name': 'Buyer',
            'phone': '9888888888',
            'email': 'b@example.com',
            'address_line': 'Street',
            'city': 'Calicut',
            'state': 'Kerala',
            'pincode': '673001',
            'delivery_state': self.kerala,
            'payment': 'cod',
            'use_new_address': True,
        }
        order = OrderService.create_order(cart, form_data, user=user, clear_cart=True)
        self.assertEqual(order.coupon_code, 'ORDER10')
        self.assertEqual(order.discount_amount, Decimal('100.00'))
        self.assertTrue(CouponRedemption.objects.filter(order=order, code_snapshot='ORDER10').exists())
        coupon = Coupon.objects.get(code='ORDER10')
        coupon.refresh_from_db()
        self.assertEqual(coupon.usage_count, 1)

    def test_checkout_coupon_api(self):
        Coupon.objects.create(
            code='API10',
            discount_type=Coupon.DiscountType.PERCENT,
            discount_value=Decimal('10'),
        )
        client = Client()
        session = client.session
        session.save()
        cart = Cart.objects.create(session_key=session.session_key, status=Cart.Status.ACTIVE)
        CartItem.objects.create(
            cart=cart,
            product=self.product,
            quantity=1,
            unit_price=self.product.base_price,
        )
        # Bind session cookie used by CartService
        client.cookies['sessionid'] = session.session_key
        url = reverse('store:checkout_coupon_apply')
        resp = client.post(url, {'code': 'API10'}, HTTP_X_REQUESTED_WITH='XMLHttpRequest')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get('success'))
        self.assertEqual(data.get('coupon_code'), 'API10')
        self.assertEqual(Decimal(data.get('discount')), Decimal('50.00'))

        remove_url = reverse('store:checkout_coupon_remove')
        resp2 = client.post(remove_url, {}, HTTP_X_REQUESTED_WITH='XMLHttpRequest')
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(resp2.json().get('coupon_code'), '')
        self.assertEqual(Decimal(resp2.json().get('discount')), Decimal('0'))

    def test_invalid_code_raises(self):
        cart = self._cart_with_item()
        with self.assertRaises(CouponError):
            apply_coupon_to_cart(cart, 'NOPE', subtotal=Decimal('500'))
        clear_cart_coupon(cart)
