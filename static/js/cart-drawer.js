(function () {
  'use strict';

  
  var drawer   = document.getElementById('cartDrawer');
  var overlay  = document.getElementById('cartDrawerOverlay');
  var closeBtn = document.getElementById('cdClose');
  var itemsEl  = document.getElementById('cdItems');
  var footerEl = document.getElementById('cdFooter');
  var emptyEl  = document.getElementById('cdEmpty');
  var badgeEl  = document.getElementById('cdBadge');
  var totalEl  = document.getElementById('cdTotal');
  var stockAlertEl = document.getElementById('cdStockAlert');
  var checkoutBtn  = document.getElementById('cdCheckoutBtn');

  if (!drawer) return;

  
  function csrf() {
    var m = document.cookie.match(/csrftoken=([^;]+)/);
    return m ? m[1] : '';
  }

  
  function open() {
    drawer.classList.add('is-open');
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    fetchCart();
  }

  function close() {
    drawer.classList.remove('is-open');
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) close();
  });

  
  function bindOpenCart(el) {
    if (el.closest('.cd-drawer')) return;
    el.addEventListener('click', function (e) {
      e.preventDefault();
      open();
    });
  }

  document.querySelectorAll('.js-open-cart-drawer').forEach(bindOpenCart);
  document.querySelectorAll('.header-icon-link[title="Cart"]').forEach(bindOpenCart);

  window.cartDrawer = { open: open, close: close };

  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', function (e) {
      if (checkoutBtn.classList.contains('cd-btn--disabled')) {
        e.preventDefault();
        if (stockAlertEl && !stockAlertEl.hidden) {
          stockAlertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    });
  }

  (function maybeOpenFromQuery() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      if (params.get('open_cart') !== '1') return;
      open();
      params.delete('open_cart');
      params.delete('added');
      var qs = params.toString();
      var path = window.location.pathname + (qs ? '?' + qs : '') + (window.location.hash || '');
      window.history.replaceState({}, '', path);
    } catch (err) {}
  })();

  
  function fetchCart() {
    showSkeleton();
    fetch('/api/cart/drawer/', {
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    })
      .then(function (r) { return r.json(); })
      .then(render)
      .catch(function () { render({ items: [], total: '0', item_count: 0 }); });
  }

  
  function showSkeleton() {
    var html = '';
    for (var i = 0; i < 3; i++) {
      html += '<div class="cd-skeleton">' +
              '<div class="cd-skel-thumb"></div>' +
              '<div class="cd-skel-lines">' +
              '<div class="cd-skel-line"></div>' +
              '<div class="cd-skel-line"></div>' +
              '<div class="cd-skel-line"></div>' +
              '</div></div>';
    }
    itemsEl.innerHTML = html;
    footerEl.hidden = true;
    emptyEl.hidden  = true;
  }

  
  function render(data) {
    var items = data.items || [];
    var total = parseFloat(data.total || 0);
    var count = data.item_count || 0;

    syncAllBadges(count);

    if (!items.length) {
      itemsEl.innerHTML = '';
      footerEl.hidden   = true;
      emptyEl.hidden    = false;
      return;
    }

    emptyEl.hidden    = true;
    footerEl.hidden   = false;
    totalEl.textContent = fmtPrice(total);

    if (stockAlertEl) {
      if (data.checkout_blocked && data.stock_summary) {
        stockAlertEl.hidden = false;
        stockAlertEl.textContent = data.stock_summary;
      } else {
        stockAlertEl.hidden = true;
        stockAlertEl.textContent = '';
      }
      stockAlertEl.classList.remove('cd-stock-alert--transient');
    }
    if (checkoutBtn) {
      if (data.checkout_blocked) {
        checkoutBtn.classList.add('cd-btn--disabled');
        checkoutBtn.setAttribute('aria-disabled', 'true');
      } else {
        checkoutBtn.classList.remove('cd-btn--disabled');
        checkoutBtn.removeAttribute('aria-disabled');
      }
    }

    var html = '';
    items.forEach(function (item) {
      var img = item.image
        ? '<img src="' + esc(item.image) + '" alt="' + esc(item.name) + '" loading="lazy">'
        : '<div style="width:100%;height:100%;background:var(--cd-cream);"></div>';

      var variant = item.variant_display
        ? '<p class="cd-item__variant">' + esc(item.variant_display) + '</p>'
        : '';

      var oos = !item.in_stock;
      var maxQ = parseInt(item.max_quantity, 10);
      if (isNaN(maxQ)) maxQ = item.quantity;
      var canInc = !oos && item.quantity < maxQ;
      var stockMsg = item.stock_message
        ? '<p class="cd-item__stock-warn" role="status">' + esc(item.stock_message) + '</p>'
        : '';
      var oosBadge = oos && item.stock_issue === 'out_of_stock'
        ? '<span class="cd-item__oos-badge">Out of stock</span>'
        : '';

      html +=
        '<div class="cd-item' + (oos ? ' cd-item--oos' : '') + '" data-id="' + item.id + '" data-max="' + maxQ + '">' +
          '<div class="cd-item__thumb">' + img + '</div>' +
          '<div class="cd-item__info">' +
            '<p class="cd-item__name">' + esc(item.name) + oosBadge + '</p>' +
            variant +
            stockMsg +
            '<p class="cd-item__price" data-line="' + parseFloat(item.line_total || 0) + '">' +
              fmtPrice(parseFloat(item.line_total || (parseFloat(item.unit_price) + parseFloat(item.pot_unit_price || 0)) * item.quantity)) +
            '</p>' +
            '<div class="cd-item__controls">' +
              (oos && item.stock_issue === 'out_of_stock'
                ? '<button type="button" class="cd-remove-text js-cd-del" data-id="' + item.id + '">Remove unavailable item</button>'
                : '<div class="cd-qty">' +
                    '<button class="cd-qty__btn js-cd-dec" data-id="' + item.id + '"' +
                      (item.quantity <= 1 ? ' disabled' : '') +
                      ' aria-label="Decrease">−</button>' +
                    '<span class="cd-qty__val">' + item.quantity + '</span>' +
                    '<button class="cd-qty__btn js-cd-inc" data-id="' + item.id + '"' +
                      (canInc ? '' : ' aria-disabled="true"') +
                      ' aria-label="Increase">+</button>' +
                  '</div>' +
                  '<button class="cd-remove js-cd-del" data-id="' + item.id + '" aria-label="Remove item">' +
                    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                      '<polyline points="3 6 5 6 21 6"/>' +
                      '<path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>' +
                      '<path d="M10 11v6"/><path d="M14 11v6"/>' +
                      '<path d="M9 6V4h6v2"/>' +
                    '</svg>' +
                  '</button>') +
            '</div>' +
          '</div>' +
        '</div>';
    });

    itemsEl.innerHTML = html;
  }

  
  itemsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-id]');
    if (!btn) return;
    var id = btn.getAttribute('data-id');

    if (btn.classList.contains('js-cd-dec')) adjustQty(id, -1);
    else if (btn.classList.contains('js-cd-inc')) adjustQty(id, +1);
    else if (btn.classList.contains('js-cd-del')) removeItem(id);
  });

  
  var qtyAlertTimer = null;


  function showMaxQtyAlert(message) {
    if (!stockAlertEl || !message) return;
    stockAlertEl.hidden = false;
    stockAlertEl.textContent = message;
    stockAlertEl.classList.add('cd-stock-alert--transient');
    if (qtyAlertTimer) clearTimeout(qtyAlertTimer);
    qtyAlertTimer = setTimeout(function () {

      if (stockAlertEl.classList.contains('cd-stock-alert--transient')) {
        stockAlertEl.hidden = true;
        stockAlertEl.textContent = '';
        stockAlertEl.classList.remove('cd-stock-alert--transient');
      }
    }, 3000);
  }

  
  function setIncMaxed(btn, maxed) {
    if (!btn) return;
    if (maxed) btn.setAttribute('aria-disabled', 'true');
    else btn.removeAttribute('aria-disabled');
  }

  function adjustQty(itemId, delta) {
    var row    = itemsEl.querySelector('[data-id="' + itemId + '"]');
    if (!row) return;
    var valEl  = row.querySelector('.cd-qty__val');
    var decBtn = row.querySelector('.js-cd-dec');
    var incBtn = row.querySelector('.js-cd-inc');
    var current = parseInt(valEl.textContent, 10) || 1;
    var next    = current + delta;
    if (next < 1) return;
    var maxQ = parseInt(row.getAttribute('data-max'), 10);
    var overStock = !isNaN(maxQ) && maxQ > 0 && current > maxQ;
    if (delta > 0 && !isNaN(maxQ) && maxQ > 0 && next > maxQ) {
      // Trying to go *up* past the current stock ceiling — block it.
      setIncMaxed(incBtn, true);
      showMaxQtyAlert('Only ' + maxQ + ' left in stock for this item.');
      return;
    }
    if (delta < 0 && overStock) {
      
      next = maxQ;
    }
    valEl.textContent    = next;
    decBtn.disabled      = (next <= 1);
    setIncMaxed(incBtn, !isNaN(maxQ) && maxQ > 0 && next >= maxQ);

    fetch('/cart/update/', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRFToken':  csrf(),
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: 'item_id=' + itemId + '&quantity=' + next,
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.success === false) {
          if (data.error && stockAlertEl) {
            stockAlertEl.hidden = false;
            stockAlertEl.textContent = data.error;
            stockAlertEl.classList.remove('cd-stock-alert--transient');
          }
          fetchCart();
          return;
        }
        if (data.cart_count !== undefined) syncAllBadges(data.cart_count);
        if (data.total !== undefined) {
          totalEl.textContent = fmtPrice(parseFloat(data.total));
        } else {
          recomputeTotal();
        }
        if (data.line_total !== undefined) {
          var priceEl = row.querySelector('.cd-item__price');
          if (priceEl) {
            priceEl.setAttribute('data-line', parseFloat(data.line_total));
            priceEl.textContent = fmtPrice(parseFloat(data.line_total));
          }
        }

        if (data.max_quantity !== undefined) {
          var serverMax = parseInt(data.max_quantity, 10);
          var serverQty = parseInt(data.quantity, 10);
          if (!isNaN(serverMax)) {
            row.setAttribute('data-max', serverMax);
            if (!isNaN(serverQty)) {
              if (decBtn) decBtn.disabled = (serverQty <= 1);
              setIncMaxed(incBtn, serverQty >= serverMax);
              
            }
          }
        }

        
        if (data.stock_message !== undefined) {
          row.classList.toggle('cd-item--oos', !data.in_stock);
          var warnEl = row.querySelector('.cd-item__stock-warn');
          if (data.stock_message) {
            if (!warnEl) {
              warnEl = document.createElement('p');
              warnEl.className = 'cd-item__stock-warn';
              warnEl.setAttribute('role', 'status');
              var infoEl = row.querySelector('.cd-item__info');
              var priceEl2 = row.querySelector('.cd-item__price');
              if (infoEl) infoEl.insertBefore(warnEl, priceEl2 || null);
            }
            warnEl.textContent = data.stock_message;
          } else if (warnEl) {
            warnEl.remove();
          }
        }

       
        if (data.checkout_blocked !== undefined) {
          if (stockAlertEl) {
            if (data.checkout_blocked && data.stock_summary) {
              stockAlertEl.hidden = false;
              stockAlertEl.textContent = data.stock_summary;
            } else {
              stockAlertEl.hidden = true;
              stockAlertEl.textContent = '';
            }
            stockAlertEl.classList.remove('cd-stock-alert--transient');
          }
          if (checkoutBtn) {
            if (data.checkout_blocked) {
              checkoutBtn.classList.add('cd-btn--disabled');
              checkoutBtn.setAttribute('aria-disabled', 'true');
            } else {
              checkoutBtn.classList.remove('cd-btn--disabled');
              checkoutBtn.removeAttribute('aria-disabled');
            }
          }
        }
      })
      .catch(fetchCart);
  }

  
function removeItem(itemId) {
    var row = itemsEl.querySelector('[data-id="' + itemId + '"]');
    if (row) row.classList.add('is-removing');

    setTimeout(function () {
      fetch('/cart/remove/' + itemId + '/', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'X-CSRFToken': csrf(),
          'X-Requested-With': 'XMLHttpRequest',
        },
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.cart_count !== undefined) syncAllBadges(data.cart_count);

          
          if (data.removed_product_id) {
            document.dispatchEvent(new CustomEvent('cart:item-removed', {
              detail: {
                removed_product_id: data.removed_product_id,
                removed_variant_id: data.removed_variant_id
              }
            }));
          }

          if (data.cart_empty && /^\/checkout(\/|$)/.test(window.location.pathname)) {
            // The checkout page's order lines, totals and place-order button
            // are rendered server-side and require a non-empty cart. Removing
            // the last item from the drawer while sitting on checkout has to
            // leave that page the same way checkout's own remove control
            // already does (see removeCheckoutItem in checkout.js) — just
            // refreshing the drawer would leave a stale, cart-less checkout
            // page behind it until the shopper navigated away and back.
            window.location.href = '/?open_cart=1';
            return;
          }
          fetchCart();
        })
        .catch(fetchCart);
    }, 230);
  }

  
  function recomputeTotal() {
    var total = 0;
    itemsEl.querySelectorAll('.cd-item').forEach(function (row) {
      var priceEl = row.querySelector('.cd-item__price');
      var lineTotal = parseFloat((priceEl && priceEl.getAttribute('data-line')) || 0);
      total += lineTotal;
    });
    totalEl.textContent = fmtPrice(total);
  }

  
  function syncAllBadges(count) {
    if (badgeEl) badgeEl.textContent = count;

    document.querySelectorAll('.js-cart-count').forEach(function (el) {
      el.textContent  = count;
      el.style.display = count > 0 ? 'inline-flex' : 'none';
      if (count > 0) {
        el.classList.remove('bottom-bar-badge--hidden');
        el.classList.add('bottom-bar-badge--visible');
        el.removeAttribute('aria-hidden');
      } else {
        el.classList.add('bottom-bar-badge--hidden');
        el.classList.remove('bottom-bar-badge--visible');
        el.setAttribute('aria-hidden', 'true');
      }
    });
  }

  
  
  
  
  
  document.addEventListener('cart:updated', function (e) {
    var detail = (e || {}).detail || {};
    if (detail.cart_count !== undefined) syncAllBadges(detail.cart_count);
    
    if (drawer.classList.contains('is-open')) fetchCart();
  });

  
  function fmtPrice(n) {
    return '₹' + n.toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

})();