from django.conf import settings
from django.db import connection

class EnsureGuestSessionMiddleware:

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not getattr(request, 'user', None) or not request.user.is_authenticated:
            if not request.session.session_key:
                request.session.create()
        return self.get_response(request)

class DebugTraceMiddleware:

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if getattr(settings, 'DEBUG_TRACE', False):
            connection.force_debug_cursor = True
        try:
            return self.get_response(request)
        finally:
            if getattr(settings, 'DEBUG_TRACE', False):
                connection.force_debug_cursor = False


class ParkedCartRestoreMiddleware:
    """
    Buy Now temporarily parks the shopper's real cart aside (see
    CartService.isolate_for_buy_now) so checkout only ever sees the single
    buy-now item. If the shopper completes or explicitly cancels that
    checkout, the view itself restores the real cart immediately. This
    middleware is the fallback for every other way a buy-now flow can end —
    closing the tab, hitting back, or just browsing elsewhere — by restoring
    the parked cart the moment the shopper visits any page outside the
    checkout flow.
    """

    CHECKOUT_URL_NAMES = {
        'buy_now',
        'checkout',
        'order_create',
        'create_razorpay_order',
        'razorpay_verify',
        'razorpay_cancel',
        'checkout_totals',
        'checkout_coupon_apply',
        'checkout_coupon_remove',
        'cart_drawer',
        'cart_update',
        'cart_remove',
    }

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.session.get('parked_cart_id'):
            is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'
            if not is_ajax:
                from django.urls import Resolver404, resolve
                try:
                    url_name = resolve(request.path_info).url_name
                except Resolver404:
                    url_name = None
                if url_name not in self.CHECKOUT_URL_NAMES:
                    from .services import CartService
                    CartService.restore_parked_cart(request)
        return self.get_response(request)
