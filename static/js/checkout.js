

document.addEventListener('DOMContentLoaded', function() {
    initCheckoutFieldValidation();
    initAddressSelection();
    initPaymentSelection();
    initPaymentButtonText();
    initAddressToggle();
    initCheckoutRemoveItems();
    initCheckoutQtyControls();
    initCheckoutPackTips();
    initCheckoutCoupon();
    initCheckoutSubmit();
    initCheckoutDeliveryGuard();
    initCheckoutDeliveryTotals();
});


// Keystroke-level filtering plus a submit-time re-check for the new-address
// fields. This is UX sugar only — CheckoutForm.clean() on the server is the
// real source of truth and re-validates everything regardless of what makes
// it past this. Kept intentionally close to those same rules (name/city:
// letters only; address: must contain a letter; phone: 10 digits; pincode:
// 6 digits; email: standard format) so the two never disagree.
function initCheckoutFieldValidation() {
    var section = document.getElementById('newAddressSection');
    if (!section) return;

    var NAME_RE = /^[A-Za-z][A-Za-z .'-]*$/;
    var HAS_LETTER_RE = /[A-Za-z]/;
    var PHONE_RE = /^[6-9]\d{9}$/;
    var PINCODE_RE = /^[1-9]\d{5}$/;
    // Kept identical to contact.js's EMAIL_RE and to CheckoutForm.email's
    // _EMAIL_LIKE_VALIDATOR server-side (app/forms.py) so all three never
    // disagree. Stricter than a bare "has @ and a dot" check — Django's
    // default EmailValidator technically allows most punctuation unquoted
    // in the local part (RFC 5322), which let obvious junk like
    // "!!!123@gmail.com" through.
    var EMAIL_RE = /^(?!.*\.\.)[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;
    var REQUIRED_MSG = 'This field is required.';

    var nameInput          = section.querySelector('input[name="full_name"]');
    var phoneInput         = section.querySelector('input[name="phone"]');
    var addressInput       = section.querySelector('textarea[name="address_line"]');
    var cityInput          = section.querySelector('input[name="city"]');
    var pincodeInput       = section.querySelector('input[name="pincode"]');
    var emailInput         = section.querySelector('input[name="email"]');
    var deliveryStateSelect = section.querySelector('select[name="delivery_state"]');

    // Mirrors CheckoutForm.clean()'s required_fields list on the server:
    // full_name/phone/address_line/city/delivery_state/pincode are always
    // mandatory for a new address; email only when checking out as a guest.
    var isGuestCheckout = section.getAttribute('data-guest-checkout') === 'true';

    function setFieldError(name, message) {
        var el = section.querySelector('[data-field-error="' + name + '"]');
        if (!el) return;
        if (message) {
            el.textContent = message;
            el.hidden = false;
        } else {
            el.textContent = '';
            el.hidden = true;
        }
    }

    function markInvalid(input, invalid) {
        if (input) input.classList.toggle('is-invalid', !!invalid);
    }

    // A full-page reload after a failed submit (e.g. a required field left
    // blank) re-renders this section server-side with each field's error
    // text — but the input itself never got any visual treatment, so a
    // missed field was easy to miss among several. Walk the server-rendered
    // error markers and put the same red-border treatment on whichever
    // input/select/textarea precedes each one, then jump to the first.
    (function syncServerRenderedErrors() {
        var firstInvalid = null;
        section.querySelectorAll('[data-field-error]').forEach(function (errEl) {
            if (errEl.hidden) return;
            var field = errEl.previousElementSibling;
            if (!field) return;
            markInvalid(field, true);
            if (!firstInvalid) firstInvalid = field;
        });
        if (firstInvalid) {
            firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstInvalid.focus({ preventScroll: true });
        }
    })();

    function filterOnInput(input, pattern) {
        if (!input) return;
        input.addEventListener('input', function () {
            var cleaned = input.value.replace(pattern, '');
            if (cleaned !== input.value) input.value = cleaned;
        });
    }

    function filterDigitsOnInput(input, maxLen) {
        if (!input) return;
        input.addEventListener('input', function () {
            var cleaned = input.value.replace(/\D/g, '').slice(0, maxLen);
            if (cleaned !== input.value) input.value = cleaned;
        });
    }

    // Checks a field's current value against required-ness first, then
    // format. Blank on a required field always wins (red border + "This
    // field is required.") over any format message, so an empty field never
    // silently passes just because there's nothing yet to fail a regex.
    function fieldInvalidState(input, testFn, message, required) {
        var val = (input.value || '').trim();
        if (!val) {
            return required ? REQUIRED_MSG : '';
        }
        return testFn(val) ? '' : message;
    }

    function checkOnBlur(input, testFn, name, message, required) {
        if (!input) return;
        input.addEventListener('blur', function () {
            var errMsg = fieldInvalidState(input, testFn, message, required);
            markInvalid(input, !!errMsg);
            setFieldError(name, errMsg);
        });
    }

    // Letters (plus space/period/apostrophe/hyphen) only — blocks the
    // "only numbers" / "only special characters" case outright by never
    // letting those characters land in the field.
    filterOnInput(nameInput, /[^A-Za-z .'-]/g);
    filterOnInput(cityInput, /[^A-Za-z .'-]/g);
    checkOnBlur(nameInput, function (v) { return NAME_RE.test(v); }, 'full_name', 'Enter a valid name using letters only.', true);
    checkOnBlur(cityInput, function (v) { return NAME_RE.test(v); }, 'city', 'Enter a valid city name using letters only.', true);

    // Address needs to allow digits (house/street numbers), so it isn't
    // filtered as-you-type — just checked that it isn't purely numbers/punctuation.
    checkOnBlur(addressInput, function (v) { return HAS_LETTER_RE.test(v); }, 'address_line', 'Enter a valid address.', true);

    // Digits only, hard-capped — typing a letter or 11th digit simply does nothing.
    filterDigitsOnInput(phoneInput, 10);
    filterDigitsOnInput(pincodeInput, 6);
    checkOnBlur(phoneInput, function (v) { return PHONE_RE.test(v); }, 'phone', 'Enter a valid 10-digit phone number.', true);
    checkOnBlur(pincodeInput, function (v) { return PINCODE_RE.test(v); }, 'pincode', 'Enter a valid 6-digit PIN code.', true);

    checkOnBlur(emailInput, function (v) { return EMAIL_RE.test(v); }, 'email', 'Enter a valid email address.', isGuestCheckout);

    // The state dropdown has no format to fail — it's either picked or it
    // isn't — so just gate it on required-ness.
    if (deliveryStateSelect) {
        deliveryStateSelect.addEventListener('blur', function () {
            var blank = !deliveryStateSelect.value;
            markInvalid(deliveryStateSelect, blank);
            setFieldError('delivery_state', blank ? REQUIRED_MSG : '');
        });
        deliveryStateSelect.addEventListener('change', function () {
            if (deliveryStateSelect.value) {
                markInvalid(deliveryStateSelect, false);
                setFieldError('delivery_state', '');
            }
        });
    }

    var form = document.getElementById('checkoutForm');
    if (!form) return;

    form.addEventListener('submit', function (e) {
        // Saved-address checkout doesn't use these fields at all — nothing to gate.
        if (section.offsetParent === null) return;

        var checks = [
            [nameInput, NAME_RE, 'full_name', 'Enter a valid name using letters only.', true],
            [cityInput, NAME_RE, 'city', 'Enter a valid city name using letters only.', true],
            [addressInput, HAS_LETTER_RE, 'address_line', 'Enter a valid address.', true],
            [phoneInput, PHONE_RE, 'phone', 'Enter a valid 10-digit phone number.', true],
            [pincodeInput, PINCODE_RE, 'pincode', 'Enter a valid 6-digit PIN code.', true],
            [emailInput, EMAIL_RE, 'email', 'Enter a valid email address.', isGuestCheckout],
        ];

        var firstInvalid = null;
        checks.forEach(function (c) {
            var input = c[0], re = c[1], name = c[2], msg = c[3], required = c[4];
            if (!input) return;
            var errMsg = fieldInvalidState(input, function (v) { return re.test(v); }, msg, required);
            markInvalid(input, !!errMsg);
            setFieldError(name, errMsg);
            if (errMsg && !firstInvalid) firstInvalid = input;
        });

        if (deliveryStateSelect) {
            var stateBlank = !deliveryStateSelect.value;
            markInvalid(deliveryStateSelect, stateBlank);
            setFieldError('delivery_state', stateBlank ? REQUIRED_MSG : '');
            if (stateBlank && !firstInvalid) firstInvalid = deliveryStateSelect;
        }

        if (firstInvalid) {
            e.preventDefault();
            e.stopImmediatePropagation();
            firstInvalid.focus();
            showCheckoutError('Please correct the highlighted fields before placing your order.');
        }
    });
}

function initCheckoutSubmit() {
    var form = document.getElementById('checkoutForm');
    var placeOrderBtn = document.getElementById('placeOrderBtn');
    if (!form || !placeOrderBtn) return;

    applyCheckoutBlockedState();

    form.addEventListener('submit', function(e) {
        if (window.CHECKOUT_BLOCKED) {
            e.preventDefault();
            showCheckoutError(window.CHECKOUT_SUMMARY || window.CHECKOUT_STOCK_SUMMARY || 'Please fix cart issues before checkout.');
            return;
        }
        syncAddressToHidden();
        syncPaymentToHidden();

        var payment = getSelectedPaymentMethod();
        if (payment === 'razorpay') {
            e.preventDefault();
            handleRazorpaySubmit();
            return;
        }
        
        placeOrderBtn.disabled = true;
        var btnText = document.getElementById('placeOrderBtnText');
        if (btnText) btnText.textContent = 'Placing Order…';
    });
}

function getSelectedPaymentMethod() {
    var radio = document.querySelector('input[name="payment_method"]:checked');
    return radio ? radio.value : 'cod';
}

function syncPaymentToHidden() {
    var payment = getSelectedPaymentMethod();
    var hidden = document.getElementById('id_payment');
    if (hidden) hidden.value = payment;
}

function syncAddressToHidden() {
    var form = document.getElementById('checkoutForm');
    if (!form) return;
    var addr = form.querySelector('input[name="address_selection"]:checked');
    var sel = form.querySelector('input[name="selected_address"]');
    var useNew = form.querySelector('input[name="use_new_address"]');

    if (addr && addr.value) {
        if (sel) sel.value = addr.value;
        if (useNew) useNew.value = 'false';   
    } else {
        if (sel) sel.value = '';
        if (useNew) useNew.value = 'true';
    }
}

function handleRazorpaySubmit() {
    var form = document.getElementById('checkoutForm');
    var btn = document.getElementById('placeOrderBtn');
    var btnText = document.getElementById('placeOrderBtnText');
    var errDiv = document.getElementById('checkoutErrorMessage');
    var csrfToken = document.querySelector('[name=csrfmiddlewaretoken]');
    if (!form || !btn || !csrfToken) return;

    if (window.CHECKOUT_BLOCKED) {
        showCheckoutError(window.CHECKOUT_SUMMARY || window.CHECKOUT_STOCK_SUMMARY || 'Please fix cart issues before checkout.');
        return;
    }

    syncAddressToHidden();
    syncPaymentToHidden();

    btn.disabled = true;
    if (btnText) btnText.textContent = 'Loading…';
    if (errDiv) {
        errDiv.style.display = 'none';
        errDiv.textContent = '';
    }

    var formData = new FormData(form);
    formData.set('payment', 'razorpay');

    fetch(form.getAttribute('data-razorpay-create-url') || '/checkout/create-razorpay-order/', {
        method: 'POST',
        headers: {
            'X-CSRFToken': csrfToken.value,
            'Accept': 'application/json',
        },
        body: formData,
    })
    .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
    .then(function(result) {
        if (result.ok && result.data.status === 'success') {
            openRazorpayPopup(result.data);
        } else {
            showCheckoutError(result.data.message || 'Could not create order. Please try again.');
            reenablePlaceOrderButton();
        }
    })
    .catch(function() {
        showCheckoutError('Network error. Please try again.');
        reenablePlaceOrderButton();
    });
}

function showCheckoutError(message) {
    var errDiv = document.getElementById('checkoutErrorMessage');
    if (errDiv) {
        errDiv.textContent = message;
        errDiv.style.display = 'block';
        errDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// #checkoutErrorMessage is actively managed by applyCheckoutBlockedState()
// (called on every delivery-totals refresh) — it clears the box whenever
// there's no real checkout-blocking issue. A "only N left in stock" note
// isn't a blocking issue, so it can't live in that box or the very next
// totals refresh wipes it out. Use a lightweight toast instead, matching
// the one already used on the PDP / add-to-cart flow.
function showCheckoutQtyToast(message) {
    var container = document.getElementById('add-to-cart-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'add-to-cart-toast-container';
        container.setAttribute('aria-live', 'polite');
        container.style.cssText = 'position:fixed;top:1rem;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:0.5rem;pointer-events:none;';
        document.body.appendChild(container);
    }
    var toast = document.createElement('div');
    toast.style.cssText = 'padding:0.75rem 1.25rem;border-radius:8px;font-size:0.9rem;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.15);white-space:nowrap;max-width:90vw;background:#dc3545;color:#fff;';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.25s ease';
        setTimeout(function() {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 250);
    }, 2500);
}

function reenablePlaceOrderButton() {
    var btn = document.getElementById('placeOrderBtn');
    var btnText = document.getElementById('placeOrderBtnText');
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = getSelectedPaymentMethod() === 'razorpay' ? 'Pay & Place Order' : 'Place Order';
}

function openRazorpayPopup(data) {
    var btn = document.getElementById('placeOrderBtn');
    var btnText = document.getElementById('placeOrderBtnText');
    if (btnText) btnText.textContent = 'Pay & Place Order';

    if (typeof Razorpay === 'undefined') {
        showCheckoutError('Payment script failed to load. Please refresh and try again.');
        reenablePlaceOrderButton();
        return;
    }

    var verifyUrl = (typeof window.STORE_RAZORPAY_VERIFY_URL !== 'undefined')
        ? window.STORE_RAZORPAY_VERIFY_URL
        : '/payment/razorpay/verify/';
    var cancelUrl = (typeof window.STORE_RAZORPAY_CANCEL_URL !== 'undefined')
        ? window.STORE_RAZORPAY_CANCEL_URL
        : '/payment/razorpay/cancel/';
    var csrfToken = document.querySelector('[name=csrfmiddlewaretoken]');
    var csrf = csrfToken ? csrfToken.value : '';

    var options = {
        key: data.razorpay_key_id,
        amount: data.amount,
        currency: 'INR',
        order_id: data.razorpay_order_id,
        name: 'Plants 99',
        description: 'Order #' + data.order_number,
        prefill: {
            name: data.customer_name || '',
            email: data.customer_email || '',
            contact: data.customer_phone || '',
        },
        handler: function(response) {
            verifyPayment(response, data.razorpay_order_id, verifyUrl, csrf, data.success_url);
        },
        modal: {
            ondismiss: function() {
                cancelPayment(data.order_number, cancelUrl, csrf);
                reenablePlaceOrderButton();
            },
        },
        config: {
            display: {
                preferences: {
                    show: false,
                },
            },
        },
    };

    var rzp = new Razorpay(options);
    rzp.open();
    reenablePlaceOrderButton();
}

function verifyPayment(response, razorpayOrderId, verifyUrl, csrf, successUrl) {
    var btn = document.getElementById('placeOrderBtn');
    var btnText = document.getElementById('placeOrderBtnText');
    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = 'Verifying…';

    fetch(verifyUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrf,
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            razorpay_order_id: razorpayOrderId,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
        }),
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.status === 'success' && (data.redirect || data.order_number)) {
            window.location.href = data.redirect || ('/orders/' + data.order_number + '/');
        } else {
            showCheckoutError(data.message || 'Payment verification failed.');
            reenablePlaceOrderButton();
        }
    })
    .catch(function() {
        showCheckoutError('Verification failed. Please contact support if amount was deducted.');
        reenablePlaceOrderButton();
    });
}

function cancelPayment(orderNumber, cancelUrl, csrf) {
    fetch(cancelUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrf,
        },
        body: JSON.stringify({ order_number: orderNumber }),
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.redirect) {
            window.location.href = data.redirect;
        }
    })
    .catch(function() {
        window.location.href = '/?open_cart=1';
    });
}


function initCheckoutRemoveItems() {
    var root = document.getElementById('checkout-order-lines') || document;
    root.addEventListener('click', function(e) {
        var btn = e.target.closest('.js-checkout-remove');
        if (!btn) return;
        e.preventDefault();
        var itemId = btn.getAttribute('data-item-id');
        if (!itemId) return;
        removeCheckoutItem(itemId, btn);
    });
}


function getCheckoutCsrfToken() {
    var input = document.querySelector('#checkoutForm [name=csrfmiddlewaretoken]');
    return input ? input.value : '';
}


function removeCheckoutItem(itemId, btn) {
    var template = window.CHECKOUT_REMOVE_URL_TEMPLATE || '/cart/remove/0/';
    var url = template.replace('/0/', '/' + encodeURIComponent(itemId) + '/');
    if (btn) btn.disabled = true;

    fetch(url, {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCheckoutCsrfToken(),
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json',
        },
    })
    .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
    .then(function(result) {
        if (!result.ok || !result.data.success) {
            if (btn) btn.disabled = false;
            showCheckoutError(result.data && result.data.error ? result.data.error : 'Could not remove item.');
            return;
        }
        if (result.data.cart_empty) {
            window.location.href = '/?open_cart=1';
            return;
        }
        var line = document.querySelector('[data-checkout-line][data-item-id="' + itemId + '"]');
        if (line) line.remove();
        syncCheckoutCartCount(result.data.cart_count);
        refreshCheckoutDeliveryTotals(resolveCheckoutStateId());
    })
    .catch(function() {
        if (btn) btn.disabled = false;
        showCheckoutError('Network error. Please try again.');
    });
}


function syncCheckoutCartCount(count) {
    if (typeof count === 'undefined' || count === null) return;
    document.querySelectorAll('.js-cart-count').forEach(function(el) {
        el.textContent = String(count);
        if (count > 0) {
            el.style.display = '';
            el.removeAttribute('aria-hidden');
            el.classList.remove('bottom-bar-badge--hidden');
            el.classList.add('bottom-bar-badge--visible');
        } else {
            el.style.display = 'none';
            el.setAttribute('aria-hidden', 'true');
            el.classList.add('bottom-bar-badge--hidden');
            el.classList.remove('bottom-bar-badge--visible');
        }
    });
}


function setCheckoutQtyControlsBusy(wrap, busy) {
    if (!wrap) return;
    wrap.querySelectorAll('button').forEach(function(btn) {
        btn.disabled = !!busy;
    });
}


function syncCheckoutQtyButtons(wrap, quantity, maxQuantity) {
    if (!wrap) return;
    var qty = parseInt(quantity, 10) || 1;
    var maxQ = parseInt(maxQuantity, 10);
    if (isNaN(maxQ)) maxQ = parseInt(wrap.getAttribute('data-max'), 10) || qty;
    wrap.setAttribute('data-max', String(maxQ));
    var line = wrap.closest('[data-checkout-line]');
    if (line) line.setAttribute('data-max', String(maxQ));
    var valEl = wrap.querySelector('[data-checkout-qty-val]');
    if (valEl) valEl.textContent = String(qty);
    var dec = wrap.querySelector('.js-checkout-qty-dec');
    var inc = wrap.querySelector('.js-checkout-qty-inc');
    if (dec) dec.disabled = qty <= 1;
    if (inc) inc.disabled = qty >= maxQ;
}


function syncCheckoutPackUpsell(message) {
    var tip = document.querySelector('[data-checkout-pack-tip]');
    if (!tip) return;
    var text = (message == null) ? '' : String(message).trim();
    tip.textContent = text;
    if (text) tip.removeAttribute('hidden');
    else tip.setAttribute('hidden', '');
}


function initCheckoutPackTips() {
    // Cart-wide tip is rendered server-side on load and kept in sync by
    // initCheckoutDeliveryTotals()'s totals refresh — nothing to do here.
}


function updateCheckoutItemQuantity(itemId, nextQty, wrap) {
    var url = window.CHECKOUT_UPDATE_URL || '/cart/update/';
    setCheckoutQtyControlsBusy(wrap, true);

    fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-CSRFToken': getCheckoutCsrfToken(),
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json',
        },
        body: 'item_id=' + encodeURIComponent(itemId) + '&quantity=' + encodeURIComponent(nextQty),
    })
    .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
    .then(function(result) {
        if (!result.ok || !result.data.success) {
            setCheckoutQtyControlsBusy(wrap, false);
            syncCheckoutQtyButtons(
                wrap,
                (wrap.querySelector('[data-checkout-qty-val]') || {}).textContent,
                wrap.getAttribute('data-max')
            );
            showCheckoutError(result.data && result.data.error ? result.data.error : 'Could not update quantity.');
            return;
        }

        syncCheckoutCartCount(result.data.cart_count);

        if (result.data.cart_empty || result.data.item_removed) {
            if (result.data.cart_empty) {
                window.location.href = '/?open_cart=1';
                return;
            }
            var gone = document.querySelector('[data-checkout-line][data-item-id="' + itemId + '"]');
            if (gone) gone.remove();
            refreshCheckoutDeliveryTotals(resolveCheckoutStateId());
            return;
        }

        var line = document.querySelector('[data-checkout-line][data-item-id="' + itemId + '"]');
        var priceEl = line ? line.querySelector('[data-checkout-line-price]') : null;
        if (priceEl && result.data.line_total != null) {
            var amount = parseFloat(result.data.line_total);
            priceEl.textContent = '\u20B9' + (isNaN(amount) ? result.data.line_total : amount.toFixed(0));
        }
        syncCheckoutQtyButtons(wrap, result.data.quantity, result.data.max_quantity);
        syncCheckoutPackUpsell(result.data.pack_upsell_message);

        var qtyNow = parseInt(result.data.quantity, 10);
        var maxNow = parseInt(result.data.max_quantity, 10);
        if (!isNaN(qtyNow) && !isNaN(maxNow) && maxNow > 0 && qtyNow >= maxNow) {
            showCheckoutQtyToast('Only ' + maxNow + ' left in stock for this item.');
        }
        refreshCheckoutDeliveryTotals(resolveCheckoutStateId());
    })
    .catch(function() {
        setCheckoutQtyControlsBusy(wrap, false);
        syncCheckoutQtyButtons(
            wrap,
            (wrap.querySelector('[data-checkout-qty-val]') || {}).textContent,
            wrap.getAttribute('data-max')
        );
        showCheckoutError('Network error. Please try again.');
    });
}


function initCheckoutQtyControls() {
    var root = document.getElementById('checkout-order-lines');
    if (!root) return;

    root.addEventListener('click', function(e) {
        var btn = e.target.closest('.js-checkout-qty-inc, .js-checkout-qty-dec');
        if (!btn || btn.disabled) return;
        e.preventDefault();

        var wrap = btn.closest('[data-checkout-qty]');
        var itemId = btn.getAttribute('data-item-id') || (wrap && wrap.getAttribute('data-item-id'));
        if (!wrap || !itemId) return;

        var valEl = wrap.querySelector('[data-checkout-qty-val]');
        var current = parseInt(valEl && valEl.textContent, 10) || 1;
        var maxQ = parseInt(wrap.getAttribute('data-max'), 10);
        if (isNaN(maxQ)) maxQ = current;
        var delta = btn.classList.contains('js-checkout-qty-inc') ? 1 : -1;
        var next = current + delta;
        if (next < 1) return;
        if (next > maxQ) {
            var inc = wrap.querySelector('.js-checkout-qty-inc');
            if (inc) inc.disabled = true;
            showCheckoutQtyToast('Only ' + maxQ + ' left in stock for this item.');
            return;
        }

        updateCheckoutItemQuantity(itemId, next, wrap);
    });
}


function setShippingDisplay(label, status) {
    var shippingEl = document.getElementById('shipping-value');
    if (!shippingEl) return;

    shippingEl.textContent = label || '';
    shippingEl.dataset.status = status || '';

    var warn = status === 'state_required' || status === 'unavailable';
    shippingEl.style.color = warn ? '#b91c1c' : 'var(--clr-black)';
    shippingEl.style.fontWeight = warn ? '600' : '700';
}


function syncCheckoutLineDeliveryWarnings(data) {
    var issueMap = {};
    (data.delivery_issues || []).forEach(function(issue) {
        issueMap[String(issue.item_id)] = issue;
    });

    document.querySelectorAll('[data-checkout-line]').forEach(function(line) {
        var itemId = line.getAttribute('data-item-id');
        var warn = line.querySelector('[data-line-delivery-warn]');
        var issue = issueMap[String(itemId)];
        if (issue) {
            line.classList.add('order-line--delivery-issue');
            if (warn) {
                warn.textContent = issue.message || '';
                warn.hidden = false;
            }
        } else {
            line.classList.remove('order-line--delivery-issue');
            if (warn) {
                warn.textContent = '';
                warn.hidden = true;
            }
        }
    });
}


function applyCheckoutTotalsPayload(data) {
    if (!data || !data.success) return;

    var shipping = parseFloat(data.shipping || 0);
    var subtotal = parseFloat(data.subtotal || 0);
    var gst = parseFloat(data.gst_total || 0);
    var discount = parseFloat(data.discount || 0);
    var total = parseFloat(data.total || 0);
    var status = data.status || 'state_required';
    var label = data.shipping_label || '';
    var couponCode = data.coupon_code || '';

    var shippingEl = document.getElementById('shipping-value');
    var shippingHidden = document.getElementById('shipping_charge');
    var subtotalEl = document.getElementById('subtotal-value');
    var totalEl = document.getElementById('total-value');
    var placeOrderTotal = document.getElementById('placeOrderTotal');
    var discountRow = document.getElementById('discount-row');
    var discountValue = document.getElementById('discount-value');
    var discountAmountText = document.getElementById('discount-amount-text');
    var discountCodeLabel = document.getElementById('discount-code-label');

    if (shippingEl) {
        shippingEl.dataset.value = (status === 'ok') ? String(shipping) : '';
        setShippingDisplay(label, status);
    }
    if (shippingHidden) shippingHidden.value = (status === 'ok') ? String(shipping) : '0';
    if (subtotalEl) {
        subtotalEl.dataset.value = String(subtotal);
        subtotalEl.textContent = '\u20B9' + subtotal.toFixed(0);
    }
    if (discountRow) {
        if (discount > 0) {
            discountRow.hidden = false;
            if (discountValue) discountValue.dataset.value = String(discount);
            if (discountAmountText) discountAmountText.textContent = discount.toFixed(0);
            if (discountCodeLabel) discountCodeLabel.textContent = couponCode;
        } else {
            discountRow.hidden = true;
        }
    }
    syncCheckoutCouponControls(couponCode, data.coupon_message || '');
    if (totalEl) {
        totalEl.dataset.value = String(total);
        totalEl.textContent = '\u20B9' + total.toFixed(0);
    }
    if (placeOrderTotal) {
        placeOrderTotal.textContent = total.toFixed(0);
    }

    syncCheckoutLineDeliveryWarnings(data);
    syncCheckoutPackUpsell(data.pack_upsell_message);

    // Delivery/state blocks disable the button without duplicating the message
    // into #checkoutErrorMessage (status already lives on Delivery Charge).
    if (!window.CHECKOUT_STOCK_BLOCKED) {
        if (status === 'state_required' || status === 'unavailable') {
            window.CHECKOUT_BLOCKED = true;
            window.CHECKOUT_SUMMARY = '';
        } else {
            window.CHECKOUT_BLOCKED = false;
            window.CHECKOUT_SUMMARY = '';
        }
        applyCheckoutBlockedState();
    }

    document.dispatchEvent(new CustomEvent('shippingRatesUpdated', {
        detail: {
            shipping: shipping,
            subtotal: subtotal,
            gst_total: gst,
            discount: discount,
            coupon_code: couponCode,
            total: total,
            status: status,
            delivery_message: data.delivery_message || '',
        }
    }));
}


function syncCheckoutCouponControls(couponCode, message) {
    var input = document.getElementById('checkoutCouponInput');
    var applyBtn = document.getElementById('checkoutCouponApply');
    var removeBtn = document.getElementById('checkoutCouponRemove');
    var msg = document.getElementById('checkoutCouponMsg');
    var hasCode = !!(couponCode && String(couponCode).trim());
    if (input) {
        input.value = hasCode ? couponCode : (input.value || '');
        input.readOnly = hasCode;
    }
    if (applyBtn) applyBtn.hidden = hasCode;
    if (removeBtn) removeBtn.hidden = !hasCode;
    if (msg) {
        msg.textContent = message || (hasCode ? 'Coupon applied.' : '');
        msg.classList.toggle('is-error', !!(message && !hasCode));
        msg.classList.toggle('is-ok', hasCode);
    }
}


function initCheckoutCoupon() {
    var applyBtn = document.getElementById('checkoutCouponApply');
    var removeBtn = document.getElementById('checkoutCouponRemove');
    var input = document.getElementById('checkoutCouponInput');
    if (!applyBtn && !removeBtn) return;

    function phoneValue() {
        var phone = document.querySelector('#checkoutForm [name=phone]');
        return phone ? phone.value.trim() : '';
    }

    function postCoupon(url, body) {
        return fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-CSRFToken': getCheckoutCsrfToken(),
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json',
            },
            body: body,
        }).then(function(res) {
            return res.json().then(function(data) {
                return { ok: res.ok, data: data || {} };
            });
        });
    }

    if (applyBtn) {
        applyBtn.addEventListener('click', function() {
            var code = input ? input.value.trim() : '';
            if (!code) {
                syncCheckoutCouponControls('', 'Enter a coupon code.');
                return;
            }
            applyBtn.disabled = true;
            var stateId = resolveCheckoutStateId() || '';
            var body = 'code=' + encodeURIComponent(code)
                + '&phone=' + encodeURIComponent(phoneValue())
                + '&state_id=' + encodeURIComponent(stateId);
            postCoupon(window.CHECKOUT_COUPON_APPLY_URL || '/api/checkout/coupon/', body)
                .then(function(result) {
                    applyBtn.disabled = false;
                    if (!result.ok || !result.data.success) {
                        syncCheckoutCouponControls('', (result.data && result.data.error) || 'Could not apply coupon.');
                        return;
                    }
                    applyCheckoutTotalsPayload(result.data);
                })
                .catch(function() {
                    applyBtn.disabled = false;
                    syncCheckoutCouponControls('', 'Network error. Try again.');
                });
        });
    }

    if (removeBtn) {
        removeBtn.addEventListener('click', function() {
            removeBtn.disabled = true;
            var stateId = resolveCheckoutStateId() || '';
            var body = 'state_id=' + encodeURIComponent(stateId);
            postCoupon(window.CHECKOUT_COUPON_REMOVE_URL || '/api/checkout/coupon/remove/', body)
                .then(function(result) {
                    removeBtn.disabled = false;
                    if (input) {
                        input.value = '';
                        input.readOnly = false;
                    }
                    if (!result.ok || !result.data.success) {
                        syncCheckoutCouponControls('', (result.data && result.data.error) || 'Could not remove coupon.');
                        return;
                    }
                    applyCheckoutTotalsPayload(result.data);
                    syncCheckoutCouponControls('', '');
                })
                .catch(function() {
                    removeBtn.disabled = false;
                    syncCheckoutCouponControls('', 'Network error. Try again.');
                });
        });
    }

    if (input) {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (applyBtn && !applyBtn.hidden) applyBtn.click();
            }
        });
    }
}


function applyCheckoutBlockedState() {
    var placeOrderBtn = document.getElementById('placeOrderBtn');
    var errDiv = document.getElementById('checkoutErrorMessage');
    if (placeOrderBtn) {
        placeOrderBtn.disabled = !!window.CHECKOUT_BLOCKED;
        placeOrderBtn.setAttribute('aria-disabled', window.CHECKOUT_BLOCKED ? 'true' : 'false');
    }
    // Only surface the bottom alert for stock / submit errors — not delivery status.
    if (errDiv) {
        var msg = '';
        if (window.CHECKOUT_BLOCKED && window.CHECKOUT_STOCK_BLOCKED) {
            msg = window.CHECKOUT_STOCK_SUMMARY || window.CHECKOUT_SUMMARY || '';
        } else if (window.CHECKOUT_BLOCKED && window.CHECKOUT_SUMMARY) {
            msg = window.CHECKOUT_SUMMARY;
        }
        if (msg) {
            errDiv.textContent = msg;
            errDiv.style.display = 'block';
        } else {
            errDiv.style.display = 'none';
            errDiv.textContent = '';
        }
    }
}


function initAddressSelection() {
    const addressRadios = document.querySelectorAll('input[name="address_selection"]');
    const selectedAddressInput = document.getElementById('id_selected_address');
    const useNewAddressInput = document.getElementById('id_use_new_address');

    if (!addressRadios.length) return;

    function syncSelectedAddress(radio) {
        if (!radio) return;
        document.querySelectorAll('.address-card.selectable').forEach(card => {
            card.classList.remove('selected');
        });
        const card = radio.closest('.address-card');
        if (card) card.classList.add('selected');
        if (selectedAddressInput) selectedAddressInput.value = radio.value;
        if (useNewAddressInput) useNewAddressInput.value = 'false';
    }

    // Ensure hidden fields match the checked radio on first paint.
    const initiallyChecked = document.querySelector('input[name="address_selection"]:checked');
    if (initiallyChecked) {
        syncSelectedAddress(initiallyChecked);
    }

    addressRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            syncSelectedAddress(this);
            updateCheckoutDeliveryForSelectedAddress();
        });
    });
}


function readAddressDeliveryMap() {
    var el = document.getElementById('checkout-address-delivery');
    if (!el) return {};
    try {
        return JSON.parse(el.textContent || '{}');
    } catch (e) {
        return {};
    }
}


function initCheckoutDeliveryGuard() {
    updateCheckoutDeliveryForSelectedAddress();
    var stateSelect = document.getElementById('id_delivery_state');
    if (stateSelect) {
        stateSelect.addEventListener('change', function() {
            refreshCheckoutDeliveryTotals(stateSelect.value);
        });
    }
}


function isUsingNewAddress() {
    var newAddressSection = document.getElementById('newAddressSection');
    var selected = document.querySelector('input[name="address_selection"]:checked');
    var useNewInput = document.getElementById('id_use_new_address');
    var useNew = useNewInput && String(useNewInput.value).toLowerCase() === 'true';

    // Prefer explicit form flag when a saved-address radio group exists.
    if (document.querySelector('input[name="address_selection"]')) {
        if (useNew) return true;
        if (selected) return false;
        // No radio selected yet — treat as new-address flow if the section is visible.
    }

    if (!newAddressSection) return true;
    var style = window.getComputedStyle(newAddressSection);
    return style.display !== 'none' && style.visibility !== 'hidden';
}


function resolveCheckoutStateId() {
    if (!isUsingNewAddress()) {
        var selected = document.querySelector('input[name="address_selection"]:checked');
        if (selected) {
            var card = selected.closest('[data-address-id]');
            var fromCard = card && card.getAttribute('data-state-id');
            if (fromCard) return String(fromCard);

            var map = readAddressDeliveryMap();
            var meta = map[String(selected.value)] || map[selected.value] || {};
            if (meta.state_id) return String(meta.state_id);
        }
        return '';
    }

    var stateSelect = document.getElementById('id_delivery_state');
    return stateSelect && stateSelect.value ? stateSelect.value : '';
}


function refreshCheckoutDeliveryTotals(stateId) {
    var url = window.CHECKOUT_TOTALS_URL || '/api/checkout/totals/';
    var qs = stateId ? ('?state_id=' + encodeURIComponent(stateId)) : '';
    fetch(url + qs, { headers: { 'Accept': 'application/json' } })
        .then(function(res) { return res.json(); })
        .then(applyCheckoutTotalsPayload)
        .catch(function() { /* keep current totals */ });
}


function initCheckoutDeliveryTotals() {
    refreshCheckoutDeliveryTotals(resolveCheckoutStateId());
}


function updateCheckoutDeliveryForSelectedAddress() {
    var map = readAddressDeliveryMap();
    var selected = document.querySelector('input[name="address_selection"]:checked');

    document.querySelectorAll('[data-address-warn]').forEach(function(node) {
        node.style.display = 'none';
        node.textContent = '';
    });

    if (window.CHECKOUT_STOCK_BLOCKED) {
        applyCheckoutBlockedState();
        refreshCheckoutDeliveryTotals(resolveCheckoutStateId());
        return;
    }

    if (isUsingNewAddress()) {
        refreshCheckoutDeliveryTotals(resolveCheckoutStateId());
        return;
    }

    if (!selected) {
        refreshCheckoutDeliveryTotals('');
        return;
    }

    var meta = map[String(selected.value)] || map[selected.value] || {};
    if (meta.blocked) {
        var warn = document.querySelector('[data-address-warn="' + selected.value + '"]');
        if (warn) {
            warn.textContent = meta.message || '';
            warn.style.display = meta.message ? 'block' : 'none';
        }
    }
    refreshCheckoutDeliveryTotals(resolveCheckoutStateId());
}


function initPaymentSelection() {
    var paymentRadios = document.querySelectorAll('input[name="payment_method"]');
    var paymentHidden = document.getElementById('id_payment');

    paymentRadios.forEach(function(radio) {
        if (radio.checked && paymentHidden) paymentHidden.value = radio.value;
        radio.addEventListener('change', function() {
            document.querySelectorAll('.payment-option').forEach(function(opt) {
                opt.classList.remove('selected');
            });
            this.closest('.payment-option').classList.add('selected');
            if (paymentHidden) paymentHidden.value = this.value;
            updatePlaceOrderButtonText();
        });
    });

    var checked = document.querySelector('input[name="payment_method"]:checked');
    if (!checked && paymentRadios.length) {
        paymentRadios[0].checked = true;
        paymentRadios[0].closest('.payment-option').classList.add('selected');
        if (paymentHidden) paymentHidden.value = 'cod';
    }
    updatePlaceOrderButtonText();
}

function initPaymentButtonText() {
    updatePlaceOrderButtonText();
}

function updatePlaceOrderButtonText() {
    var btnText = document.getElementById('placeOrderBtnText');
    if (!btnText) return;
    var payment = getSelectedPaymentMethod();
    btnText.textContent = payment === 'razorpay' ? 'Pay & Place Order' : 'Place Order';
}


function initAddressToggle() {
    const addNewBtn = document.getElementById('addNewAddressBtn');
    const cancelNewBtn = document.getElementById('cancelNewAddressBtn');
    const savedAddressesSection = document.getElementById('savedAddresses');
    const newAddressSection = document.getElementById('newAddressSection');
    const selectedAddressInput = document.getElementById('id_selected_address');
    const useNewAddressInput = document.getElementById('id_use_new_address');

    if (addNewBtn) {
        addNewBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (savedAddressesSection) savedAddressesSection.style.display = 'none';
            if (newAddressSection) newAddressSection.style.display = 'block';
            if (selectedAddressInput) selectedAddressInput.value = '';
            if (useNewAddressInput) useNewAddressInput.value = 'true';
            document.querySelectorAll('input[name="address_selection"]').forEach(r => { r.checked = false; });
            document.querySelectorAll('.address-card.selectable').forEach(c => c.classList.remove('selected'));
            updateCheckoutDeliveryForSelectedAddress();
            if (newAddressSection) newAddressSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    if (cancelNewBtn) {
        cancelNewBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (savedAddressesSection) savedAddressesSection.style.display = 'grid';
            if (newAddressSection) newAddressSection.style.display = 'none';
            var defaultRadio = document.querySelector('input[name="address_selection"]:checked') ||
                document.querySelector('input[name="address_selection"]');
            if (defaultRadio) {
                defaultRadio.checked = true;
                defaultRadio.closest('.address-card').classList.add('selected');
                if (selectedAddressInput) selectedAddressInput.value = defaultRadio.value;
            }
            if (useNewAddressInput) useNewAddressInput.value = 'false';
            clearNewAddressForm();
            updateCheckoutDeliveryForSelectedAddress();
            if (savedAddressesSection) savedAddressesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }
}

function clearNewAddressForm() {
    var form = document.getElementById('checkoutForm');
    if (!form) return;
    ['full_name', 'phone', 'address_line', 'city', 'delivery_state', 'pincode', 'email'].forEach(function(name) {
        var field = form.querySelector('[name="' + name + '"]');
        if (field) field.value = '';
    });
    form.querySelectorAll('.form-error').forEach(function(el) { el.textContent = ''; });
}
