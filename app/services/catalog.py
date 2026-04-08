from django.db.models import Q
from ..models import Combo, Variant
from .category_tree import category_filter_ids_for_slug
from .combo_catalog import combo_is_in_stock, prefetch_combo_items

def active_variant_qs():
    return (
        Variant.objects.filter(is_active=True, product__is_active=True, stock_quantity__gt=0)
        .select_related('product', 'product__category', 'product__rental_config')
        .prefetch_related('images')
    )

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


def collection_combo_cards(request):
    """Active purchasable combos with stock; respects price, search, sort."""
    qs = Combo.objects.filter(is_active=True, purchase_enabled=True).prefetch_related(prefetch_combo_items())
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
        if c.price and combo_is_in_stock(c, multiplier=1):
            cards.append({'kind': 'combo', 'combo': c})
    return cards


def collection_card_items(request, paginate_by=12):
    _ = paginate_by
    category = request.GET.get('category')
    min_price = request.GET.get('min_price')
    max_price = request.GET.get('max_price')
    query = request.GET.get('q')
    sort = (request.GET.get('sort') or '').strip().lower()
    qs = active_variant_qs()
    rent_only = (request.GET.get('rent') or '').strip() in ('1', 'true', 'yes')
    if rent_only:
        qs = qs.filter(product__is_rent_available=True, product__rental_config__is_rent_enabled=True)
    if category and category != 'all':
        _, ids = category_filter_ids_for_slug(category, include_children=True, max_depth=10)
        if ids:
            qs = qs.filter(product__category_id__in=ids)
    if min_price:
        qs = qs.filter(price__gte=min_price)
    if max_price:
        qs = qs.filter(price__lte=max_price)
    if query:
        qs = qs.filter(Q(product__name__icontains=query) | Q(product__description__icontains=query) | Q(product__category__name__icontains=query))
    qs = apply_plant_filters_to_variant_qs(qs, request)
    if sort == 'price_asc':
        qs = qs.order_by('price', '-product__created_at')
    elif sort == 'price_desc':
        qs = qs.order_by('-price', '-product__created_at')
    else:
        qs = qs.order_by('-product__created_at', '-product__id')
    seen_products = set()
    cards = []
    for v in qs:
        if v.product_id in seen_products:
            continue
        seen_products.add(v.product_id)
        cards.append({'kind': 'variant', 'variant': v, 'is_jewellery': False})
    return cards
