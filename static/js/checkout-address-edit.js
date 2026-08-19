
// Checkout page: "Edit" button on a saved address opens a modal (built from

document.addEventListener('DOMContentLoaded', function () {
    var overlay = document.getElementById('addressEditOverlay');
    var form = document.getElementById('addressEditForm');
    if (!overlay || !form) return;

    var closeBtn = document.getElementById('addressEditClose');
    var cancelBtn = document.getElementById('addressEditCancel');
    var saveBtn = document.getElementById('addressEditSave');
    var formError = document.getElementById('addressEditFormError');
    var stateSelect = document.getElementById('addrEditState');
    var isDefaultInput = document.getElementById('addrEditIsDefault');

    var fields = {
        full_name: document.getElementById('addrEditFullName'),
        phone: document.getElementById('addrEditPhone'),
        address_line: document.getElementById('addrEditAddressLine'),
        city: document.getElementById('addrEditCity'),
        pincode: document.getElementById('addrEditPincode'),
        delivery_state: stateSelect
    };

    
    var NAME_RE = /^[A-Za-z][A-Za-z .'-]*$/;
    var HAS_LETTER_RE = /[A-Za-z]/;
    var PHONE_RE = /^[6-9]\d{9}$/;
    var PINCODE_RE = /^[1-9]\d{5}$/;

    
    (function populateStateOptions() {
        var master = document.getElementById('id_delivery_state');
        if (master && stateSelect) stateSelect.innerHTML = master.innerHTML;
    })();

    function getCSRF() {
        var input = form.querySelector('[name=csrfmiddlewaretoken]');
        if (input && input.value) return input.value;
        var m = document.cookie.match(/\bcsrftoken=([^;]+)/);
        return m ? decodeURIComponent(m[1].trim()) : '';
    }

    function setFieldError(name, message) {
        var el = form.querySelector('[data-field-error="' + name + '"]');
        var input = fields[name];
        if (input) input.classList.toggle('is-invalid', !!message);
        if (!el) return;
        if (message) {
            el.textContent = message;
            el.hidden = false;
        } else {
            el.textContent = '';
            el.hidden = true;
        }
    }

    function clearErrors() {
        Object.keys(fields).forEach(function (name) { setFieldError(name, ''); });
        formError.hidden = true;
        formError.textContent = '';
    }

    function validateClientSide() {
        var checks = [
            [fields.full_name, NAME_RE, 'full_name', 'Enter a valid name using letters only.'],
            [fields.city, NAME_RE, 'city', 'Enter a valid city name using letters only.'],
            [fields.address_line, HAS_LETTER_RE, 'address_line', 'Enter a valid address.'],
            [fields.phone, PHONE_RE, 'phone', 'Enter a valid 10-digit phone number.'],
            [fields.pincode, PINCODE_RE, 'pincode', 'Enter a valid 6-digit PIN code.']
        ];
        var firstInvalid = null;
        checks.forEach(function (c) {
            var input = c[0], re = c[1], name = c[2], msg = c[3];
            if (!input) return;
            var val = (input.value || '').trim();
            var errMsg = !val ? 'This field is required.' : (re.test(val) ? '' : msg);
            setFieldError(name, errMsg);
            if (errMsg && !firstInvalid) firstInvalid = input;
        });
        if (stateSelect) {
            var blank = !stateSelect.value;
            setFieldError('delivery_state', blank ? 'This field is required.' : '');
            if (blank && !firstInvalid) firstInvalid = stateSelect;
        }
        return firstInvalid;
    }

    var currentEditUrl = '';

    function openModal(addressId) {
        var template = form.getAttribute('data-edit-url-template');
        if (!template || !addressId) return;
        var url = template.replace(/\/0\/edit\/?$/, '/' + addressId + '/edit/');
        currentEditUrl = url;

        fetch(url, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin'
        })
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                if (!data || !data.success) return;
                var a = data.address;
                clearErrors();
                fields.full_name.value = a.full_name || '';
                fields.phone.value = a.phone || '';
                fields.address_line.value = a.address_line || '';
                fields.city.value = a.city || '';
                fields.pincode.value = a.pincode || '';
                if (stateSelect) stateSelect.value = a.delivery_state_id ? String(a.delivery_state_id) : '';
                if (isDefaultInput) isDefaultInput.checked = !!a.is_default;
                overlay.classList.add('is-open');
                overlay.setAttribute('aria-hidden', 'false');
                document.body.style.overflow = 'hidden';
            })
            .catch(function () {});
    }

    function closeModal() {
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        currentEditUrl = '';
    }

    document.querySelectorAll('.js-edit-address').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            
            e.preventDefault();
            e.stopPropagation();
            openModal(btn.getAttribute('data-address-id'));
        });
    });

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeModal();
    });

    // Digits only, hard-capped — same as checkout.js's newAddressSection.
    function filterDigits(input, maxLen) {
        if (!input) return;
        input.addEventListener('input', function () {
            var cleaned = input.value.replace(/\D/g, '').slice(0, maxLen);
            if (cleaned !== input.value) input.value = cleaned;
        });
    }
    filterDigits(fields.phone, 10);
    filterDigits(fields.pincode, 6);

    function updateAddressDeliveryMap(addressId, entry) {
        var el = document.getElementById('checkout-address-delivery');
        if (!el) return;
        var map = {};
        try { map = JSON.parse(el.textContent || '{}') || {}; } catch (e) { map = {}; }
        map[String(addressId)] = entry;
        el.textContent = JSON.stringify(map);
    }

    function applyUpdatedAddressToCard(a) {
        var card = document.querySelector('.address-card[data-address-id="' + a.id + '"]');
        if (!card) return;
        var nameEl = card.querySelector('.js-address-name');
        var phoneEl = card.querySelector('.js-address-phone');
        var linesEl = card.querySelector('.js-address-lines');
        if (nameEl) nameEl.textContent = a.full_name;
        if (phoneEl) phoneEl.textContent = a.phone;
        if (linesEl) linesEl.textContent = a.address_line + ', ' + a.city + ', ' + a.state_display + ' — ' + a.pincode;
        if (a.state_id) card.setAttribute('data-state-id', String(a.state_id));

        var warn = document.querySelector('[data-address-warn="' + a.id + '"]');
        if (warn) {
            warn.textContent = a.blocked ? (a.message || '') : '';
            warn.style.display = a.blocked ? 'block' : 'none';
        }

        
        updateAddressDeliveryMap(a.id, { state_id: a.state_id, blocked: !!a.blocked, message: a.message || '' });

        card.classList.remove('selectable--just-updated');
        void card.offsetWidth; // restart the flash animation even on a repeat edit
        card.classList.add('selectable--just-updated');

        
        var radio = card.querySelector('input[name="address_selection"]');
        if (radio && radio.checked && typeof window.updateCheckoutDeliveryForSelectedAddress === 'function') {
            window.updateCheckoutDeliveryForSelectedAddress();
        }
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!currentEditUrl) return;

        var firstInvalid = validateClientSide();
        if (firstInvalid) {
            firstInvalid.focus();
            return;
        }

        var fd = new FormData(form);
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

        fetch(currentEditUrl, {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCSRF()
            },
            body: fd,
            credentials: 'same-origin'
        })
            .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) {
                if (result.ok && result.data.success) {
                    applyUpdatedAddressToCard(result.data.address);
                    closeModal();
                } else {
                    clearErrors();
                    var errors = (result.data && result.data.errors) || {};
                    var firstErrField = null;
                    Object.keys(errors).forEach(function (name) {
                        if (name === '__all__') {
                            formError.textContent = errors[name];
                            formError.hidden = false;
                            return;
                        }
                        setFieldError(name, errors[name]);
                        if (!firstErrField && fields[name]) firstErrField = fields[name];
                    });
                    if (firstErrField) firstErrField.focus();
                }
            })
            .catch(function () {
                formError.textContent = 'Network error. Please try again.';
                formError.hidden = false;
            })
            .then(function () {
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Address'; }
            });
    });
});
