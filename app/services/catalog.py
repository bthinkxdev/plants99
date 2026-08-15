from django.conf import settings
from django.db.models import OuterRef, Subquery, Q, Prefetch, F
from django.utils import timezone
from ..models import Combo, Product, Variant
from .category_tree import category_filter_ids_for_slug
from .combo_catalog import combo_is_in_stock, prefetch_combo_items


def pick_listing_variant(variants):
    """Prefer cheapest in-stock variant; fall back to cheapest active variant."""
    active = [v for v in variants if getattr(v, 'is_active', True)]
    if not active:
        return None, False
    in_stock = [v for v in active if (v.stock_quantity or 0) > 0]
    pool = in_stock if in_stock else active
    chosen = min(pool, key=lambda v: (v.price, v.display_order, v.id))
    return chosen, bool(in_stock)


def attach_product_card_display(product, variants_attr='listing_variants'):
    """Set primary_variant, lowest_price, and card_in_stock for storefront cards."""
    variants = list(getattr(product, variants_attr, None) or [])
    pv, in_stock = pick_listing_variant(variants)
    if pv:
        product.primary_variant = pv
        product.lowest_price = pv.price
        product.card_in_stock = in_stock
        return True
    if getattr(product, 'is_combo_product', False) and product.base_price is not None:
        product.primary_variant = None
        product.lowest_price = product.base_price
        product.card_in_stock = combo_is_in_stock(product, multiplier=1)
        return True
    if getattr(product, 'is_rent_available', False) and getattr(settings, 'RENTAL_ENABLED', True):
        cfg = getattr(product, 'rental_config', None)
        rent_price = getattr(cfg, 'rent_price_per_day', None) if cfg else None
        if rent_price is not None or product.base_price is not None:
            product.primary_variant = None
            product.lowest_price = product.base_price or rent_price
            product.card_in_stock = True
            return True
    if product.base_price is not None:
        product.primary_variant = None
        product.lowest_price = product.base_price
        product.card_in_stock = (product.base_stock or 0) > 0
        return True
    return False


def listing_variant_prefetch():
    qs = (
        Variant.objects.filter(is_active=True)
        .prefetch_related('images')
        .order_by('display_order', 'id')
    )
    return Prefetch('variants', queryset=qs, to_attr='listing_variants')


def listing_variant_base_qs():
    """Active variants for shop listing (includes out-of-stock)."""
    return (
        Variant.objects.filter(
            is_active=True,
            product__is_active=True,
        )
        .select_related('product', 'product__category', 'product__rental_config')
        .prefetch_related('images')
    )


def active_variant_qs():
    """
    All sellable variants with their product + images.
    Used by API views (RecentlyViewed, NewArrivals, etc.) — unchanged.
    """
    return (
        Variant.objects.filter(
            is_active=True,
            product__is_active=True,
            stock_quantity__gt=0,
        )
        .select_related('product', 'product__category', 'product__rental_config')
        .prefetch_related('images')
    )
 
 
# ─────────────────────────────────────────────
# Plant-filter helpers — unchanged
# ─────────────────────────────────────────────
 
def apply_plant_filters_to_variant_qs(qs, request):
    difficulty = (request.GET.get('difficulty') or '').strip().lower()
    if difficulty in ('easy', 'medium', 'hard'):
        qs = qs.filter(product__difficulty=difficulty)
    sunlight = (request.GET.get('sunlight') or '').strip().lower()
    if sunlight in ('full_sun', 'partial', 'low_light'):
        qs = qs.filter(product__sunlight=sunlight)
    watering = (request.GET.get('watering') or '').strip().lower()
    if watering in ('low', 'medium', 'high'):
        qs = qs.filter(product__watering=watering)
    plant_type = (request.GET.get('plant_type') or '').strip().lower()
    if plant_type in ('indoor', 'outdoor', 'flowering'):
        qs = qs.filter(product__plant_type=plant_type)
    guide = (request.GET.get('guide') or '').strip().lower()
    if guide == 'beginner':
        qs = qs.filter(product__beginner_friendly=True)
    elif guide == 'low_maintenance':
        qs = qs.filter(product__low_maintenance=True)
    elif guide == 'air_purifying':
        qs = qs.filter(product__air_purifying=True)
    elif guide == 'office':
        qs = qs.filter(product__office_friendly=True)
    return qs
 
def apply_plant_filters_to_product_qs(qs, request):
    difficulty = (request.GET.get('difficulty') or '').strip().lower()
    if difficulty in ('easy', 'medium', 'hard'):
        qs = qs.filter(difficulty=difficulty)
    sunlight = (request.GET.get('sunlight') or '').strip().lower()
    if sunlight in ('full_sun', 'partial', 'low_light'):
        qs = qs.filter(sunlight=sunlight)
    watering = (request.GET.get('watering') or '').strip().lower()
    if watering in ('low', 'medium', 'high'):
        qs = qs.filter(watering=watering)
    plant_type = (request.GET.get('plant_type') or '').strip().lower()
    if plant_type in ('indoor', 'outdoor', 'flowering'):
        qs = qs.filter(plant_type=plant_type)
    guide = (request.GET.get('guide') or '').strip().lower()
    if guide == 'beginner':
        qs = qs.filter(beginner_friendly=True)
    elif guide == 'low_maintenance':
        qs = qs.filter(low_maintenance=True)
    elif guide == 'air_purifying':
        qs = qs.filter(air_purifying=True)
    elif guide == 'office':
        qs = qs.filter(office_friendly=True)
    return qs
 
 
# ─────────────────────────────────────────────
# Combo cards — unchanged
# ─────────────────────────────────────────────
 
def collection_combo_cards(request):
    """Active purchasable combos with stock; respects price, search, sort."""
    qs = (
        Combo.objects.filter(is_active=True, purchase_enabled=True)
        .prefetch_related(prefetch_combo_items())
    )
    min_price = request.GET.get('min_price')
    max_price = request.GET.get('max_price')
    query = request.GET.get('q')
    sort = (request.GET.get('sort') or '').strip().lower()
    if min_price:
        qs = qs.filter(price__gte=min_price)
    if max_price:
        qs = qs.filter(price__lte=max_price)
    if query:
        qs = qs.filter(Q(name__icontains=query) | Q(description__icontains=query))
    if sort == 'price_asc':
        qs = qs.order_by('price', '-updated_at')
    elif sort == 'price_desc':
        qs = qs.order_by('-price', '-updated_at')
    else:
        qs = qs.order_by('-updated_at', '-id')
    cards = []
    for c in qs:
        if c.price:
            cards.append({
                'kind': 'combo',
                'combo': c,
                'in_stock': combo_is_in_stock(c, multiplier=1),
            })
    return cards
 
 
# ─────────────────────────────────────────────
# OPTIMIZED: collection_card_items
# ─────────────────────────────────────────────

def _sort_merged_cards(cards, sort):
    """
    Sorts a mixed list of variant-product and simple-product cards as one
    sequence. Each card carries uniform sort_price / sort_date / sort_id
    keys (set by _variant_cards / _simple_product_cards below) precisely so
    the two kinds can be ordered against each other directly — previously
    they were sorted independently and rendered as two back-to-back blocks
    (all variant products, then all simple products), which looked like
    "sort broken into two halves" regardless of which option was picked.

    Uses two stable sorts (secondary key first, then primary key) rather
    than a single tuple key, since datetimes can't be negated to flip
    their sort direction the way numeric fields can.
    """
    if sort == 'price_asc':
        cards.sort(key=lambda c: c['sort_date'], reverse=True)
        cards.sort(key=lambda c: c['sort_price'])
    elif sort == 'price_desc':
        cards.sort(key=lambda c: c['sort_date'], reverse=True)
        cards.sort(key=lambda c: c['sort_price'], reverse=True)
    else:
        cards.sort(key=lambda c: c['sort_id'], reverse=True)
        cards.sort(key=lambda c: c['sort_date'], reverse=True)
    return cards


def _variant_cards(request, sort):
    """
    One card per variant-product (cheapest/most-expensive/display-order
    listing variant chosen per the active sort — see subquery_order below),
    including out-of-stock. Each card carries sort_price/sort_date/sort_id
    so it can be merged with simple-product cards and sorted as one list.

    BEFORE: fetched ALL variants into Python, deduped with a seen-set.
            At 5 000 variants that's 5 000 ORM rows deserialized every request.

    AFTER:  subquery picks the lowest-price active variant id per product
            entirely inside the DB.  Python only sees one row per product.
    """
    category   = request.GET.get('category')
    min_price  = request.GET.get('min_price')
    max_price  = request.GET.get('max_price')
    query      = request.GET.get('q')
    rent_only  = (request.GET.get('rent') or '').strip() in ('1', 'true', 'yes')
    offer_discount = (request.GET.get('offer') or '').strip().lower() in ('discount', 'sale', 'offers')
    deal_only  = (request.GET.get('deal') or '').strip().lower() in ('1', 'true', 'yes')

    # ── Step 1: build the filtered base qs (no select_related yet — keep it cheap) ──
    base_qs = Variant.objects.filter(
        is_active=True,
        product__is_active=True,
    )

    if rent_only:
        base_qs = base_qs.filter(
            product__is_rent_available=True,
            product__rental_config__is_rent_enabled=True,
            product__rental_config__rent_price_per_day__isnull=False,
        )

    if offer_discount:
        base_qs = base_qs.filter(
            original_price__isnull=False,
            original_price__gt=F('price'),
        )

    if deal_only:
        today = timezone.now().date()
        base_qs = base_qs.filter(product__is_deal_of_day=True).filter(
            Q(product__deal_of_day_start__isnull=True) | Q(product__deal_of_day_start__lte=today)
        ).filter(
            Q(product__deal_of_day_end__isnull=True) | Q(product__deal_of_day_end__gte=today)
        )

    if category and category != 'all':
        _, ids = category_filter_ids_for_slug(category, include_children=True, max_depth=10)
        if ids:
            base_qs = base_qs.filter(product__category_id__in=ids)

    if min_price:
        base_qs = base_qs.filter(price__gte=min_price)
    if max_price:
        base_qs = base_qs.filter(price__lte=max_price)

    if query:
        base_qs = base_qs.filter(
            Q(product__name__icontains=query)
            | Q(product__description__icontains=query)
            | Q(product__category__name__icontains=query)
        )

    base_qs = apply_plant_filters_to_variant_qs(base_qs, request)

    # ── Step 2: determine which variant "wins" per product ──
    if sort == 'price_asc':
        subquery_order = 'price'           # cheapest variant wins
    elif sort == 'price_desc':
        subquery_order = '-price'          # most expensive variant wins
    else:
        subquery_order = 'display_order'   # default: lowest display_order variant

    # ── Step 3: correlated subquery — one winner variant id per product ──
    # "For each product_id that appears in base_qs, give me the id of the
    #  variant with the best sort position."
    winner_subquery = (
        base_qs.filter(product_id=OuterRef('product_id'))
        .order_by(subquery_order, 'id')
        .values('id')[:1]
    )

    # ── Step 4: final qs — only winner rows, fully hydrated ──
    winner_qs = (
        base_qs
        .annotate(winner_id=Subquery(winner_subquery))
        .filter(id=Subquery(winner_subquery))   # keep only the chosen variant per product
        .select_related('product', 'product__category', 'product__rental_config')
        .prefetch_related('images')
    )

    return [
        {
            'kind': 'variant',
            'variant': v,
            'is_jewellery': False,
            'in_stock': (v.stock_quantity or 0) > 0,
            'sort_price': v.price,
            'sort_date': v.product.created_at,
            'sort_id': v.product_id,
        }
        for v in winner_qs
    ]


def _simple_product_cards(request):
    """
    One card per simple (variant-less) product, including out-of-stock.
    Mirrors _variant_cards' filters so the two only ever differ by which
    products they cover, never by which filters got applied — and carries
    the same sort_price/sort_date/sort_id keys so the two merge cleanly.
    """
    category   = request.GET.get('category')
    min_price  = request.GET.get('min_price')
    max_price  = request.GET.get('max_price')
    query      = request.GET.get('q')
    rent_only  = (request.GET.get('rent') or '').strip() in ('1', 'true', 'yes')
    offer_discount = (request.GET.get('offer') or '').strip().lower() in ('discount', 'sale', 'offers')
    deal_only  = (request.GET.get('deal') or '').strip().lower() in ('1', 'true', 'yes')

    qs = (
        Product.objects.filter(is_active=True, variants__isnull=True)
        .exclude(base_price__isnull=True)
        .select_related('category', 'rental_config')
        .prefetch_related('images')
    )

    if rent_only:
        qs = qs.filter(
            is_rent_available=True,
            rental_config__is_rent_enabled=True,
            rental_config__rent_price_per_day__isnull=False,
        )

    if offer_discount:
        qs = qs.filter(
            base_original_price__isnull=False,
            base_original_price__gt=F('base_price'),
        )

    if deal_only:
        today = timezone.now().date()
        qs = qs.filter(is_deal_of_day=True).filter(
            Q(deal_of_day_start__isnull=True) | Q(deal_of_day_start__lte=today)
        ).filter(
            Q(deal_of_day_end__isnull=True) | Q(deal_of_day_end__gte=today)
        )

    if category and category != 'all':
        _, ids = category_filter_ids_for_slug(category, include_children=True, max_depth=10)
        if ids:
            qs = qs.filter(category_id__in=ids)

    if min_price:
        qs = qs.filter(base_price__gte=min_price)
    if max_price:
        qs = qs.filter(base_price__lte=max_price)

    if query:
        qs = qs.filter(
            Q(name__icontains=query)
            | Q(description__icontains=query)
            | Q(category__name__icontains=query)
        )

    qs = apply_plant_filters_to_product_qs(qs, request)

    return [
        {
            'kind': 'simple',
            'product': p,
            'in_stock': (p.base_stock or 0) > 0,
            'sort_price': p.base_price,
            'sort_date': p.created_at,
            'sort_id': p.id,
        }
        for p in qs
    ]


def collection_card_items(request, paginate_by=12):
    """
    Returns one card-dict per product — variant products and simple
    (variant-less) products merged into a single list and sorted together,
    so "newest" / "price: low to high" / "price: high to low" apply across
    the whole catalog rather than sorting each kind separately and
    concatenating them (which looked like two disconnected blocks: all
    variant products in order, then all simple products in order).
    """
    _ = paginate_by  # kept for API compatibility
    sort = (request.GET.get('sort') or '').strip().lower()
    cards = _variant_cards(request, sort) + _simple_product_cards(request)
    return _sort_merged_cards(cards, sort)
