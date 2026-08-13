"""Meta Pixel ecommerce funnel: ViewContent, AddToCart, InitiateCheckout, Purchase."""
from decimal import Decimal

from django.test import Client, TestCase
from django.urls import reverse

from app.models import Cart, CartItem, Category, Combo, Order, Payment, Product
from app.views import _add_to_cart_pixel


class AddToCartPixelPayloadTests(TestCase):
    def test_value_reflects_only_the_added_quantity(self):
        payload = _add_to_cart_pixel(42, 'Snake Plant', Decimal('150.00'), 3)
        self.assertEqual(payload['event'], 'AddToCart')
        self.assertEqual(payload['content_ids'], ['42'])
        self.assertEqual(payload['content_name'], 'Snake Plant')
        self.assertEqual(payload['content_type'], 'product')
        self.assertEqual(payload['value'], str(Decimal('450.00')))
        self.assertEqual(payload['currency'], 'INR')


class ProductViewContentTests(TestCase):
    def test_product_detail_page_fires_view_content_with_base_price(self):
        cat = Category.objects.create(name='Plants', slug='plants-vc', is_active=True)
        product = Product.objects.create(
            name='Money Plant', slug='money-plant-vc', category=cat,
            base_price=Decimal('249.00'), base_stock=10, is_active=True,
        )
        resp = Client().get(reverse('store:product_detail', args=[product.slug]))
        self.assertEqual(resp.status_code, 200)
        content = resp.content.decode()
        self.assertIn("fbq('track', 'ViewContent'", content)
        self.assertIn(f"content_ids: ['{product.id}']", content)
        self.assertIn("content_name: 'Money Plant'", content)
        self.assertIn('value: 249.00', content)
        self.assertIn("currency: 'INR'", content)


class ComboViewContentTests(TestCase):
    def test_combo_detail_page_fires_view_content_with_combo_price(self):
        combo = Combo.objects.create(
            name='Starter Bundle', slug='starter-bundle-vc',
            price=Decimal('599.00'), is_active=True, purchase_enabled=True,
        )
        resp = Client().get(reverse('store:combo_detail', args=[combo.slug]))
        self.assertEqual(resp.status_code, 200)
        content = resp.content.decode()
        self.assertIn("fbq('track', 'ViewContent'", content)
        self.assertIn(f"content_ids: ['{combo.id}']", content)
        self.assertIn("content_name: 'Starter Bundle'", content)
        self.assertIn('value: 599.00', content)


class AddToCartEndToEndTests(TestCase):
    def test_successful_add_returns_pixel_payload(self):
        cat = Category.objects.create(name='Plants', slug='plants-atc', is_active=True)
        product = Product.objects.create(
            name='Areca Palm', slug='areca-palm-atc', category=cat,
            base_price=Decimal('300.00'), base_stock=10, is_active=True,
        )
        client = Client()
        resp = client.post(
            reverse('store:cart_add'),
            {'product_id': product.id, 'quantity': 2},
            HTTP_X_REQUESTED_WITH='XMLHttpRequest',
        )
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertTrue(payload['success'])
        pixel = payload['pixel']
        self.assertEqual(pixel['content_ids'], [str(product.id)])
        self.assertEqual(pixel['content_name'], 'Areca Palm')
        self.assertEqual(Decimal(pixel['value']), Decimal('600.00'))
        self.assertEqual(pixel['currency'], 'INR')

    def test_failed_add_returns_no_pixel(self):
        cat = Category.objects.create(name='Plants', slug='plants-atc-oos', is_active=True)
        product = Product.objects.create(
            name='Out Of Stock Fern', slug='oos-fern-atc', category=cat,
            base_price=Decimal('120.00'), base_stock=0, is_active=True,
        )
        client = Client()
        resp = client.post(
            reverse('store:cart_add'),
            {'product_id': product.id, 'quantity': 1},
            HTTP_X_REQUESTED_WITH='XMLHttpRequest',
        )
        self.assertEqual(resp.status_code, 400)
        payload = resp.json()
        self.assertFalse(payload['success'])
        self.assertNotIn('pixel', payload)


class CheckoutInitiateCheckoutTests(TestCase):
    def test_checkout_page_fires_initiate_checkout_once(self):
        cat = Category.objects.create(name='Plants', slug='plants-ic', is_active=True)
        product = Product.objects.create(
            name='Peace Lily', slug='peace-lily-ic', category=cat,
            base_price=Decimal('400.00'), base_stock=10, is_active=True,
        )
        client = Client()
        session = client.session
        session.save()
        cart = Cart.objects.create(session_key=session.session_key, status=Cart.Status.ACTIVE)
        CartItem.objects.create(cart=cart, product=product, unit_price=product.base_price, quantity=2)

        resp = client.get(reverse('store:checkout'))
        self.assertEqual(resp.status_code, 200)
        content = resp.content.decode()
        self.assertEqual(content.count("fbq('track', 'InitiateCheckout'"), 1)
        self.assertIn('value: 800.00', content)
        self.assertIn('num_items: 2', content)


class SuccessPurchaseTests(TestCase):
    def test_success_page_fires_purchase_with_event_id_and_dedupe_guard(self):
        cat = Category.objects.create(name='Plants', slug='plants-p', is_active=True)
        product = Product.objects.create(
            name='Jade Plant', slug='jade-plant-p', category=cat,
            base_price=Decimal('199.00'), base_stock=10, is_active=True,
        )
        from app.models import Address
        address = Address.objects.create(
            full_name='Buyer', phone='9999999999', address_line='Line 1',
            city='Kochi', state='Kerala', pincode='682001', is_snapshot=True,
        )
        order = Order.objects.create(
            order_number='PXTEST001', subtotal=Decimal('398.00'), shipping=Decimal('0'),
            total=Decimal('398.00'), address=address,
        )
        order.items.create(
            product=product, product_name=product.name, variant_snapshot='Default',
            unit_price=Decimal('199.00'), quantity=2,
        )
        Payment.objects.create(order=order, method=Payment.Method.COD, amount=order.total)

        client = Client()
        session = client.session
        session['last_order_number'] = order.order_number
        session.save()

        resp = client.get(reverse('store:order_success', args=[order.order_number]))
        self.assertEqual(resp.status_code, 200)
        content = resp.content.decode()
        self.assertIn("fbq('track', 'Purchase'", content)
        self.assertIn(f"id: '{product.id}', quantity: 2", content)
        self.assertIn("var orderNumber = 'PXTEST001'", content)
        self.assertIn("eventID: 'order-' + orderNumber", content)
        self.assertIn("sessionStorage.getItem(key)", content)
        self.assertIn("sessionStorage.setItem(key, '1')", content)
