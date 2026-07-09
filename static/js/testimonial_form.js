(function () {
    'use strict';

    var form = document.getElementById('testimonial-form');
    if (!form) return;

    var nameInput = document.getElementById('id_testimonial_name') || document.getElementById('id_name');
    var descInput = document.getElementById('id_testimonial_description') || document.getElementById('id_description');
    var ratingSelect = document.getElementById('id_rating');
    var photoInput = document.getElementById('id_testimonial_photo') || document.getElementById('id_photo');
    var verifiedInput = document.getElementById('id_testimonial_verified') || document.getElementById('id_is_verified');
    var activeInput = document.getElementById('id_testimonial_active') || document.getElementById('id_is_active');

    var previewName = document.getElementById('tm-preview-name');
    var previewText = document.getElementById('tm-preview-text');
    var previewStars = document.getElementById('tm-preview-stars');
    var previewBadge = document.getElementById('tm-preview-badge');
    var previewMeta = document.getElementById('tm-preview-meta');
    var previewInitials = document.getElementById('tm-preview-initials');
    var previewAvatarImg = document.getElementById('tm-preview-avatar-img');
    var photoPreview = document.getElementById('tm-photo-preview');
    var photoInitials = document.getElementById('tm-photo-initials');
    var descCount = document.getElementById('tm-desc-count');
    var starPicker = document.getElementById('tm-star-picker');

    function initialsFromName(name) {
        var t = (name || '').trim();
        return t ? t.charAt(0).toUpperCase() : '?';
    }

    function currentRating() {
        return parseInt(ratingSelect && ratingSelect.value, 10) || 5;
    }

    function setRating(value) {
        if (!ratingSelect) return;
        ratingSelect.value = String(value);
        if (starPicker) {
            starPicker.querySelectorAll('.tm-star-btn').forEach(function (btn) {
                var v = parseInt(btn.getAttribute('data-value'), 10);
                btn.classList.toggle('is-active', v <= value);
            });
        }
        updatePreview();
    }

    function renderStars(count) {
        if (!previewStars) return;
        var html = '';
        for (var i = 1; i <= 5; i++) {
            html += i <= count ? '★' : '☆';
        }
        previewStars.textContent = html;
    }

    function syncToggleWrap(input) {
        if (!input) return;
        var label = input.closest('.toggle-wrap');
        if (label) label.classList.toggle('checked', input.checked);
    }

    function updatePreview() {
        var name = nameInput ? nameInput.value.trim() : '';
        if (previewName) previewName.textContent = name || 'Customer name';
        if (previewText && descInput) {
            previewText.textContent = descInput.value.trim() || 'Customer review appears here…';
        }
        if (descCount && descInput) {
            descCount.textContent = descInput.value.length + ' / 2000';
        }
        renderStars(currentRating());
        if (previewBadge && verifiedInput) {
            previewBadge.style.display = verifiedInput.checked ? '' : 'none';
        }
        if (previewMeta && activeInput) {
            previewMeta.textContent = activeInput.checked ? 'Visible on homepage' : 'Hidden from homepage';
        }
        var letter = initialsFromName(name);
        if (previewInitials && (!previewAvatarImg || previewAvatarImg.style.display === 'none')) {
            previewInitials.textContent = letter;
        }
        if (photoInitials && (!photoPreview || photoPreview.style.display === 'none')) {
            photoInitials.textContent = letter;
        }
    }

    if (starPicker) {
        starPicker.addEventListener('click', function (e) {
            var btn = e.target.closest('.tm-star-btn');
            if (!btn) return;
            setRating(parseInt(btn.getAttribute('data-value'), 10));
        });
        setRating(currentRating());
    }

    if (nameInput) nameInput.addEventListener('input', updatePreview);
    if (descInput) descInput.addEventListener('input', updatePreview);
    if (verifiedInput) {
        verifiedInput.addEventListener('change', function () {
            syncToggleWrap(verifiedInput);
            updatePreview();
        });
    }
    if (activeInput) {
        activeInput.addEventListener('change', function () {
            syncToggleWrap(activeInput);
            updatePreview();
        });
    }

    if (photoInput) {
        photoInput.addEventListener('change', function () {
            var file = photoInput.files && photoInput.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (e) {
                if (photoPreview) {
                    photoPreview.src = e.target.result;
                    photoPreview.style.display = 'block';
                }
                if (photoInitials) photoInitials.style.display = 'none';
                if (previewAvatarImg) {
                    previewAvatarImg.src = e.target.result;
                    previewAvatarImg.style.display = 'block';
                    if (previewInitials) previewInitials.style.display = 'none';
                } else if (document.getElementById('tm-preview-avatar')) {
                    var img = document.createElement('img');
                    img.id = 'tm-preview-avatar-img';
                    img.alt = '';
                    img.src = e.target.result;
                    var av = document.getElementById('tm-preview-avatar');
                    av.innerHTML = '';
                    av.appendChild(img);
                }
            };
            reader.readAsDataURL(file);
        });
    }

    form.querySelectorAll('.toggle-wrap .toggle-input').forEach(function (input) {
        syncToggleWrap(input);
        input.addEventListener('change', function () {
            syncToggleWrap(input);
            if (input === verifiedInput || input === activeInput) updatePreview();
        });
    });

    updatePreview();
})();
