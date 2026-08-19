
(function() {
    function getCSRF() {
        var input = document.querySelector("[name=csrfmiddlewaretoken]");
        if (input && input.value) return input.value;
        var m = document.cookie.match(/\bcsrftoken=([^;]+)/);
        return m ? decodeURIComponent(m[1].trim()) : "";
    }

    function showToast(message, isError) {
        var container = document.getElementById("add-to-cart-toast-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "add-to-cart-toast-container";
            container.setAttribute("aria-live", "polite");
            container.style.cssText = "position:fixed;top:1rem;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:0.5rem;pointer-events:none;";
            document.body.appendChild(container);
        }
        var toast = document.createElement("div");
        toast.style.cssText = "padding:0.75rem 1.25rem;border-radius:8px;font-size:0.9rem;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.15);white-space:nowrap;max-width:90vw;"
            + (isError ? "background:#dc3545;color:#fff;" : "background:#000;color:#fff;");
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(function() {
            toast.style.opacity = "0";
            toast.style.transition = "opacity 0.25s ease";
            setTimeout(function() {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 250);
        }, 2500);
    }

    function updateCartCount(count) {
        var n = typeof count === "number" ? count : 0;
        document.querySelectorAll(".js-cart-count").forEach(function(el) {
            el.textContent = n;
            el.style.display = n > 0 ? "" : "none";
            el.removeAttribute("aria-hidden");
            if (n > 0) {
                el.classList.remove("bottom-bar-badge--hidden");
                el.classList.add("bottom-bar-badge--visible");
            } else {
                el.classList.add("bottom-bar-badge--hidden");
                el.classList.remove("bottom-bar-badge--visible");
            }
        });
    }

    function triggerCartGleam() {
        var cartItem = document.querySelector(".bottom-bar .js-bottom-bar-cart");
        if (!cartItem) return;
        cartItem.classList.remove("cart-gleam");
        cartItem.offsetHeight;
        cartItem.classList.add("cart-gleam");
        setTimeout(function() {
            cartItem.classList.remove("cart-gleam");
        }, 550);
    }

    function replaceWithViewCart(btn, cartUrl) {
        var viewCart = document.createElement("a");
        viewCart.href = cartUrl || "#";
        viewCart.className = (btn.className || "").replace(/\s*js-pdp-add-cart\s*/, " ").trim() + " btn-view-cart js-open-cart-drawer";
        viewCart.innerHTML = '<i class="fas fa-shopping-cart me-2"></i> View Cart';
        viewCart.setAttribute("aria-label", "View cart");
        viewCart.addEventListener("click", function(e) {
            if (window.cartDrawer && typeof window.cartDrawer.open === "function") {
                e.preventDefault();
                window.cartDrawer.open();
            }
        });
        if (btn.parentNode) btn.parentNode.replaceChild(viewCart, btn);
    }

    function syncStickyToViewCart() {
        var sticky = document.getElementById("pdpStickyAdd");
        if (!sticky || sticky.tagName === "A") return;
        var link = document.createElement("a");
        link.href = "#";
        link.id = "pdpStickyAdd";
        link.className = "btn btn-dark btn-sm flex-shrink-0 js-open-cart-drawer";
        link.textContent = "View Cart";
        link.addEventListener("click", function(e) {
            if (window.cartDrawer && typeof window.cartDrawer.open === "function") {
                e.preventDefault();
                window.cartDrawer.open();
            }
        });
        if (sticky.parentNode) sticky.parentNode.replaceChild(link, sticky);
    }

    document.addEventListener("DOMContentLoaded", function() {
        document.body.addEventListener("submit", function(e) {
            var form = e.target;
            if (!form || !form.classList.contains("product-add-form")) return;
            e.preventDefault();

            var url = form.getAttribute("action");
            if (!url) return;
            var body = new FormData(form);
            var btn = form.querySelector('button[type="submit"]');
            var origHtml = btn ? btn.innerHTML : "";
            if (btn) {
                btn.disabled = true;
                btn.classList.add("btn-adding");
                btn.innerHTML = '<span class="btn-adding-text"><i class="fas fa-spinner fa-spin me-2"></i> Adding...</span>';
            }

            var headers = { "X-Requested-With": "XMLHttpRequest" };
            var csrf = getCSRF();
            if (csrf) headers["X-CSRFToken"] = csrf;

            fetch(url, {
                method: "POST",
                headers: headers,
                body: body,
                credentials: "same-origin"
            })
                .then(function(r) { return r.json().then(function(data) { return { ok: r.ok, data: data }; }); })
                .then(function(result) {
                    if (result.ok && result.data.success) {
                        if (typeof result.data.cart_count === "number") {
                            updateCartCount(result.data.cart_count);
                            triggerCartGleam();
                        }

                        if (result.data.pixel && typeof fbq === "function") {
                            var p = result.data.pixel;
                            fbq('track', 'AddToCart', {
                                content_ids: p.content_ids,
                                content_name: p.content_name,
                                content_type: p.content_type,
                                value: p.value,
                                currency: p.currency
                            });
                        }

                        var productId = body.get('product_id');
                        var variantId = body.get('variant_id');
                        form.setAttribute('data-cart-added', '1');

                        // Keep the PDP's per-variant "already in cart" set current so switching
                        // attribute selections right after this add (no reload) immediately shows
                        // View Cart for this exact variant, and Add to Cart for every other one.
                        if (variantId) {
                            var addedVariantNum = parseInt(variantId, 10);
                            if (addedVariantNum) {
                                var ids = window.__pdpCartVariantIds || (window.__pdpCartVariantIds = new Set());
                                ids.add(addedVariantNum);
                            }
                        }

                        document.dispatchEvent(new CustomEvent('cart:updated', {
                            detail: Object.assign({}, result.data, {
                                added_product_id: productId,
                                added_variant_id: variantId
                            })
                        }));

                        if (btn) {
                            btn.classList.remove("btn-adding");
                            btn.classList.add("btn-added");
                            btn.innerHTML = '<span class="btn-added-icon"><i class="fas fa-check"></i></span>';
                            var cartUrl = form.getAttribute("data-cart-url") || (document.body && document.body.getAttribute("data-cart-url")) || "#";
                            setTimeout(function() {
                                btn.classList.remove("btn-added");
                                replaceWithViewCart(btn, cartUrl);
                                // Let the PDP re-derive every Add/View Cart control (main CTA +
                                // sticky bar) from the updated __pdpCartVariantIds set, so only
                                // the variant actually just added shows View Cart. Falls back to
                                // the old one-way sticky flip outside the PDP's variant script.
                                if (typeof window.__pdpRefreshCartButtons === "function") {
                                    window.__pdpRefreshCartButtons();
                                } else {
                                    syncStickyToViewCart();
                                }
                            }, 800);
                        }
                    } else {
                        if (btn) {
                            btn.classList.remove("btn-adding");
                            btn.disabled = false;
                            btn.innerHTML = origHtml;
                        }
                        showToast(result.data.error || "Could not add to cart", true);
                    }
                })
                .catch(function() {
                    if (btn) {
                        btn.classList.remove("btn-adding");
                        btn.disabled = false;
                        btn.innerHTML = origHtml;
                    }
                    showToast("Network error. Try again.", true);
                });
        });

        
        document.addEventListener('cart:updated', function(e) {
            var detail = (e && e.detail) || {};
            var variantId = detail.added_variant_id ? String(detail.added_variant_id) : null;
            var productId = detail.added_product_id ? String(detail.added_product_id) : null;
            if (!variantId && !productId) return;

            var cartUrl = (document.body && document.body.getAttribute('data-cart-url')) || '#';

            document.querySelectorAll('form.product-add-form').forEach(function(form) {

                if (form.getAttribute('data-cart-added') === '1') return;

                var fVariant = (form.querySelector('[name="variant_id"]') || {}).value || null;
                var fProduct = (form.querySelector('[name="product_id"]') || {}).value || null;

                // Match on product AND, when the added item was a specific variant, on that
                // exact variant too — matching by product alone would flag every other
                // variant of the same product as "in cart" as well.
                var isMatch = !!(productId && fProduct && fProduct === productId &&
                    (variantId ? fVariant === variantId : !fVariant));

                if (!isMatch) return;

                var btn = form.querySelector('button[type="submit"]');
                if (!btn) return;

                replaceWithViewCart(btn, cartUrl);
            });
        });

    });

    document.addEventListener('cart:item-removed', function(e) {
        var detail = (e && e.detail) || {};
        var removedProductId = detail.removed_product_id ? String(detail.removed_product_id) : null;
        if (!removedProductId || !window.productId || String(window.productId) !== removedProductId) return;

        
        if (typeof window.__pdpRefreshCartButtons === "function") {
            var removedVariantId = detail.removed_variant_id ? parseInt(detail.removed_variant_id, 10) : null;
            if (removedVariantId && window.__pdpCartVariantIds) {
                window.__pdpCartVariantIds.delete(removedVariantId);
            }
            window.__pdpRefreshCartButtons();
            return;
        }

        
        var ctaRow = document.querySelector(".product-cta-row");
        var current = ctaRow ? ctaRow.querySelector(".btn-add-cart") : null;
        if (current && current.tagName !== "BUTTON") revertToAddToCart(current);

        var sticky = document.getElementById("pdpStickyAdd");
        if (sticky && sticky.tagName !== "BUTTON") revertStickyToAddToCart();
    });

    
    function revertToAddToCart(current) {
        var btn = document.createElement("button");
        btn.type = "submit";
        btn.className = "btn-add-cart btn js-pdp-add-cart";
        btn.innerHTML = '<span class="btn-add-cart-text"><i class="fas fa-shopping-bag me-2"></i> Add to Cart</span>';
        if (current.parentNode) current.parentNode.replaceChild(btn, current);
        return btn;
    }

    function revertStickyToAddToCart() {
        var sticky = document.getElementById("pdpStickyAdd");
        if (!sticky || sticky.tagName !== "A") return;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.id = "pdpStickyAdd";
        btn.className = "btn btn-dark btn-sm flex-shrink-0";
        btn.textContent = "Add to cart";
        btn.addEventListener("click", function() {
            if (btn.disabled) return;
            var form = document.getElementById("addToCartForm") || document.querySelector("form.product-add-form");
            if (form) {
                if (typeof form.requestSubmit === "function") form.requestSubmit();
                else form.submit();
            }
        });
        if (sticky.parentNode) sticky.parentNode.replaceChild(btn, sticky);
    }

    
    window.addEventListener("pageshow", function(event) {
        if (!event.persisted) return;
        var stateUrl = document.body && document.body.getAttribute("data-cart-product-state-url");
        var productId = window.productId;
        if (!stateUrl || !productId) return;

        fetch(stateUrl + "?product_id=" + encodeURIComponent(productId), {
            headers: { "X-Requested-With": "XMLHttpRequest" },
            credentials: "same-origin"
        })
            .then(function(res) { return res.ok ? res.json() : null; })
            .then(function(data) {
                if (!data) return;
                var variantIds = (data.variant_ids || []).map(Number);

                
                if (typeof window.__pdpRefreshCartButtons === "function") {
                    window.__pdpCartVariantIds = new Set(variantIds);
                    window.__pdpRefreshCartButtons();
                    return;
                }

                
                var inCart = !!data.purchase_in_cart;
                var cartUrl = (document.body && document.body.getAttribute("data-cart-url")) || "#";

                var ctaRow = document.querySelector(".product-cta-row");
                var current = ctaRow ? ctaRow.querySelector(".btn-add-cart") : null;
                if (current) {
                    if (inCart && current.tagName !== "A") {
                        replaceWithViewCart(current, cartUrl);
                    } else if (!inCart && current.tagName !== "BUTTON") {
                        revertToAddToCart(current);
                    }
                }

                var sticky = document.getElementById("pdpStickyAdd");
                if (sticky) {
                    if (inCart && sticky.tagName !== "A") {
                        syncStickyToViewCart();
                    } else if (!inCart && sticky.tagName !== "BUTTON") {
                        revertStickyToAddToCart();
                    }
                }
            })
            .catch(function() {});
    });

    
    window.addEventListener("pageshow", function(event) {
        if (!event.persisted) return;
        fetch("/api/cart/drawer/", {
            headers: { "X-Requested-With": "XMLHttpRequest" },
            credentials: "same-origin"
        })
            .then(function(res) { return res.ok ? res.json() : null; })
            .then(function(data) {
                if (data && typeof data.item_count === "number") {
                    updateCartCount(data.item_count);
                }
            })
            .catch(function() {});
    });
})();
