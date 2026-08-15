document.addEventListener('DOMContentLoaded', function () {
    initContactFieldValidation();
});


// Mirrors initCheckoutFieldValidation() in checkout.js: required-field +
// format checks on blur and on submit, with the same is-invalid /
// data-field-error convention. ContactForm.message additionally enforces a
// max_length server-side (see app/forms.py ContactForm.MESSAGE_MAX_LENGTH) —
// the character counter and hard input cap here just mirror that limit so
// the user sees it coming instead of hitting a save error.
function initContactFieldValidation() {
    var form = document.getElementById('contactForm');
    if (!form) return;

    var REQUIRED_MSG = 'This field is required.';
    // Letters (plus space/period/apostrophe/hyphen) only — same rule as
    // checkout.js's full_name field, and enforced server-side too via
    // ContactForm.name's _NAME_LIKE_VALIDATOR (app/forms.py).
    var NAME_RE = /^[A-Za-z][A-Za-z .'-]*$/;
    // Kept identical to checkout.js's EMAIL_RE and to ContactForm.email's
    // _EMAIL_LIKE_VALIDATOR server-side so all three never disagree.
    var EMAIL_RE = /^(?!.*\.\.)[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

    var nameInput = form.querySelector('input[name="name"]');
    var emailInput = form.querySelector('input[name="email"]');
    var subjectInput = form.querySelector('input[name="subject"]');
    var messageInput = form.querySelector('textarea[name="message"]');
    var messageCount = document.getElementById('messageCharCount');

    var messageMaxLength = parseInt(
        (messageInput && messageInput.getAttribute('maxlength')) ||
        (messageCount && messageCount.getAttribute('data-max-length')) ||
        2000,
        10
    );

    function setFieldError(name, message) {
        var el = form.querySelector('[data-field-error="' + name + '"]');
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

    // Blocks the "only numbers" / "only special characters" case outright
    // by never letting those characters land in the field — mirrors
    // checkout.js's filterOnInput for full_name.
    function filterOnInput(input, pattern) {
        if (!input) return;
        input.addEventListener('input', function () {
            var cleaned = input.value.replace(pattern, '');
            if (cleaned !== input.value) input.value = cleaned;
        });
    }

    // A full-page reload after a failed submit re-renders this form
    // server-side with each field's error text — but only the message/is-invalid
    // class from the initial render reflects that. Walk the server-rendered
    // error markers and put the same red-border treatment on whichever
    // field precedes each one, then jump to the first (same pattern as
    // checkout.js's syncServerRenderedErrors).
    (function syncServerRenderedErrors() {
        var firstInvalid = null;
        form.querySelectorAll('[data-field-error]').forEach(function (errEl) {
            if (errEl.hidden) return;
            var wrap = errEl.closest('.col-12') || errEl.parentElement;
            var field = wrap ? wrap.querySelector('input, textarea, select') : null;
            if (!field) return;
            markInvalid(field, true);
            if (!firstInvalid) firstInvalid = field;
        });
        if (firstInvalid) {
            firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstInvalid.focus({ preventScroll: true });
        }
    })();

    // Checks a field's current value against required-ness first, then
    // format — blank on a required field always wins over any format
    // message, same rule as checkout.js's fieldInvalidState.
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

    function updateMessageCount() {
        if (!messageInput || !messageCount) return;
        var len = messageInput.value.length;
        messageCount.textContent = len + ' / ' + messageMaxLength;
        messageCount.classList.toggle('text-danger', len >= messageMaxLength);
    }

    if (messageInput) {
        // Hard-cap as-you-type so the field can never hold more than the
        // server (ContactForm.message max_length) will accept.
        if (messageInput.value.length > messageMaxLength) {
            messageInput.value = messageInput.value.slice(0, messageMaxLength);
        }
        messageInput.addEventListener('input', function () {
            if (messageInput.value.length > messageMaxLength) {
                messageInput.value = messageInput.value.slice(0, messageMaxLength);
            }
            updateMessageCount();
        });
        updateMessageCount();
    }

    filterOnInput(nameInput, /[^A-Za-z .'-]/g);
    checkOnBlur(nameInput, function (v) { return NAME_RE.test(v); }, 'name', 'Enter a valid name using letters only.', true);
    checkOnBlur(emailInput, function (v) { return EMAIL_RE.test(v); }, 'email', 'Enter a valid email address.', true);
    checkOnBlur(subjectInput, function () { return true; }, 'subject', '', true);
    checkOnBlur(
        messageInput,
        function (v) { return v.length <= messageMaxLength; },
        'message',
        'Message is too long (max ' + messageMaxLength + ' characters).',
        true
    );

    form.addEventListener('submit', function (e) {
        var checks = [
            [nameInput, function (v) { return NAME_RE.test(v); }, 'name', 'Enter a valid name using letters only.', true],
            [emailInput, function (v) { return EMAIL_RE.test(v); }, 'email', 'Enter a valid email address.', true],
            [subjectInput, function () { return true; }, 'subject', '', true],
            [messageInput, function (v) { return v.length <= messageMaxLength; }, 'message', 'Message is too long (max ' + messageMaxLength + ' characters).', true],
        ];

        var firstInvalid = null;
        checks.forEach(function (c) {
            var input = c[0], testFn = c[1], name = c[2], msg = c[3], required = c[4];
            if (!input) return;
            var errMsg = fieldInvalidState(input, testFn, msg, required);
            markInvalid(input, !!errMsg);
            setFieldError(name, errMsg);
            if (errMsg && !firstInvalid) firstInvalid = input;
        });

        if (firstInvalid) {
            e.preventDefault();
            e.stopImmediatePropagation();
            firstInvalid.focus();
        }
    });
}
