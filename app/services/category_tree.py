from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Set, Tuple

from django.db.models import QuerySet

from ..models import Category, Product


@dataclass(frozen=True)
class CategoryTree:
    by_id: Dict[int, Category]
    children_ids: Dict[Optional[int], List[int]]

    def descendants_of(self, category_id: int, max_depth: int = 10) -> List[int]:
        """
        Returns a stable BFS list of descendants (excluding the root).
        Designed to be cycle-safe even if bad data exists.
        """
        out: List[int] = []
        seen: Set[int] = {category_id}
        q: deque[Tuple[int, int]] = deque()
        for cid in self.children_ids.get(category_id, []):
            q.append((cid, 1))
        while q:
            cid, depth = q.popleft()
            if cid in seen:
                continue
            seen.add(cid)
            out.append(cid)
            if depth >= max_depth:
                continue
            for nxt in self.children_ids.get(cid, []):
                q.append((nxt, depth + 1))
        return out

    def path_for(self, category_id: int, separator: str = " > ", max_depth: int = 10) -> str:
        cat = self.by_id.get(category_id)
        if not cat:
            return ""
        parts = [cat.name]
        seen: Set[int] = {category_id}
        cur = self.by_id.get(getattr(cat, "parent_id", None))
        depth = 0
        while cur is not None and depth < max_depth:
            if cur.pk in seen:
                break
            seen.add(cur.pk)
            parts.append(cur.name)
            cur = self.by_id.get(getattr(cur, "parent_id", None))
            depth += 1
        return separator.join(reversed(parts))


def build_active_category_tree(qs: Optional[QuerySet] = None) -> CategoryTree:
    if qs is None:
        qs = Category.objects.filter(is_active=True)
    cats = list(qs.only("id", "name", "slug", "parent_id", "is_active").order_by("name", "id"))
    by_id: Dict[int, Category] = {c.pk: c for c in cats if c.pk}
    children_ids: Dict[Optional[int], List[int]] = defaultdict(list)
    for c in cats:
        children_ids[getattr(c, "parent_id", None)].append(c.pk)
    return CategoryTree(by_id=by_id, children_ids=dict(children_ids))


def category_ids_with_direct_available_products() -> Set[int]:
    """
    Ids of categories that have at least one product linked *directly to
    them* which is actually purchasable — active, and in stock (variant
    stock_quantity > 0 / base_stock > 0 / combo availability — the same
    rule Product.objects.available() already uses everywhere else). A
    product that's merely active but has zero stock does not count, so a
    category whose only products are sold out is treated the same as one
    with no products at all.
    """
    return set(Product.objects.available().values_list('category_id', flat=True).distinct())


def category_ids_with_available_products(tree: Optional[CategoryTree] = None) -> Set[int]:
    """
    Ids of categories that should actually be shown to a shopper: the
    category itself, or any descendant of it, has at least one purchasable
    product (see category_ids_with_direct_available_products). This rolls
    availability up the tree so a parent category with no products of its
    own — used purely as a grouping — still shows as long as a qualifying
    child exists underneath it, while a category (parent or leaf) with
    nothing purchasable anywhere in its subtree is excluded.

    This is the single source of truth behind both the homepage category
    strip and the navbar category menu, so the two can never disagree.
    """
    if tree is None:
        tree = build_active_category_tree()
    direct = category_ids_with_direct_available_products()
    if not direct:
        return set()
    qualifying: Set[int] = set()
    for cid in tree.by_id:
        subtree_ids = {cid}
        subtree_ids.update(tree.descendants_of(cid))
        if subtree_ids & direct:
            qualifying.add(cid)
    return qualifying


def category_filter_ids_for_slug(category_slug: str, *, include_children: bool = True, max_depth: int = 10) -> Tuple[Optional[Category], List[int]]:
    """
    Returns (category, ids_to_filter_by).

    - If slug is invalid: (None, []).
    - If include_children=True: ids include the selected category and its descendants.
    """
    if not category_slug:
        return (None, [])
    category = Category.objects.filter(slug=category_slug).only("id", "name", "slug", "parent_id", "is_active").first()
    if not category:
        return (None, [])
    if not include_children:
        return (category, [category.pk])
    tree = build_active_category_tree()
    ids = [category.pk] + tree.descendants_of(category.pk, max_depth=max_depth)
    return (category, ids)

