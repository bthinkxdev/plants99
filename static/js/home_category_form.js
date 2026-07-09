(function () {
    'use strict';

    var form = document.getElementById('home-category-form');
    if (!form) return;

    var nameInput = document.getElementById('id_name');
    var descInput = document.getElementById('id_description');
    var orderInput = document.getElementById('id_display_order');
    var activeInput = document.getElementById('id_is_active');
    var bannerInput = document.getElementById('id_banner_image');
    var linkUrlInput = document.getElementById('id_link_url');
    var linkedCategorySelect = document.getElementById('id_linked_category');
    var destinationRadios = form.querySelectorAll('input[name="destination_type"]');
    var destPanels = document.querySelectorAll('.hc-destination-panel');

    var previewTitle = document.getElementById('hc-preview-title');
    var previewSubtitle = document.getElementById('hc-preview-subtitle');
    var previewImg = document.getElementById('hc-preview-img');
    var previewPlaceholder = document.getElementById('hc-preview-placeholder');
    var previewOrder = document.getElementById('hc-preview-order');
    var previewStatus = document.getElementById('hc-preview-status');
    var linkPreviewText = document.getElementById('hc-link-preview-text');

    function currentDestination() {
        var checked = form.querySelector('input[name="destination_type"]:checked');
        return checked ? checked.value : 'category';
    }

    function updateDestinationPanels() {
        var dest = currentDestination();
        destPanels.forEach(function (panel) {
            panel.classList.toggle('is-active', panel.getAttribute('data-dest') === dest);
        });
        updatePreviewText();
    }

    function updatePreviewText() {
        if (previewTitle && nameInput) {
            previewTitle.textContent = (nameInput.value || '').trim() || 'Category name';
        }
        if (previewSubtitle && descInput) {
            previewSubtitle.textContent = (descInput.value || '').trim() || 'Subtitle appears here';
        }
        if (previewOrder && orderInput) {
            previewOrder.textContent = 'Order: ' + (orderInput.value || '0');
        }
        if (previewStatus && activeInput) {
            previewStatus.textContent = activeInput.checked ? 'Visible' : 'Hidden';
        }
        if (!linkPreviewText) return;
        var dest = currentDestination();
        if (dest === 'url') {
            var url = linkUrlInput ? (linkUrlInput.value || '').trim() : '';
            linkPreviewText.textContent = url ? (url.length > 48 ? url.slice(0, 45) + '…' : url) : 'Enter a custom URL';
        } else if (dest === 'category') {
            if (linkedCategorySelect && linkedCategorySelect.value) {
                var opt = linkedCategorySelect.options[linkedCategorySelect.selectedIndex];
                linkPreviewText.textContent = 'Shop → ' + (opt ? opt.textContent : 'Category');
            } else {
                linkPreviewText.textContent = 'Select a shop category';
            }
        } else {
            var count = selected.length;
            linkPreviewText.textContent = count
                ? count + ' featured product' + (count === 1 ? '' : 's') + ' in carousel'
                : 'Add featured products for the carousel';
        }
    }

    destinationRadios.forEach(function (radio) {
        radio.addEventListener('change', updateDestinationPanels);
    });

    if (nameInput) nameInput.addEventListener('input', updatePreviewText);
    if (descInput) descInput.addEventListener('input', updatePreviewText);
    if (orderInput) orderInput.addEventListener('input', updatePreviewText);
    if (activeInput) activeInput.addEventListener('change', updatePreviewText);
    if (linkUrlInput) linkUrlInput.addEventListener('input', updatePreviewText);
    if (linkedCategorySelect) linkedCategorySelect.addEventListener('change', updatePreviewText);

    if (bannerInput) {
        bannerInput.addEventListener('change', function () {
            var file = bannerInput.files && bannerInput.files[0];
            if (!file || !previewImg) return;
            var reader = new FileReader();
            reader.onload = function (e) {
                previewImg.src = e.target.result;
                previewImg.style.display = 'block';
                if (previewPlaceholder) previewPlaceholder.style.display = 'none';
            };
            reader.readAsDataURL(file);
        });
    }

    var app = document.getElementById('hc-products-app');
    var productsSource = document.getElementById('id_products');
    var listEl = document.getElementById('hc-products-list');
    var emptyEl = document.getElementById('hc-products-empty');
    var selectEl = document.getElementById('hc-product-select');
    var addBtn = document.getElementById('hc-product-add-btn');

    var productCatalog = [];
    var optionsEl = document.getElementById('hc-product-options-data');
    if (optionsEl) {
        try {
            productCatalog = JSON.parse(optionsEl.textContent || '[]') || [];
        } catch (e) {
            productCatalog = [];
        }
    }

    var selected = [];
    var dataEl = document.getElementById('hc-initial-products-data');
    if (dataEl) {
        try {
            selected = JSON.parse(dataEl.textContent || '[]') || [];
        } catch (e) {
            selected = [];
        }
    }
    if (!selected.length && productsSource) {
        Array.prototype.forEach.call(productsSource.options, function (opt) {
            if (opt.selected) {
                selected.push({ id: parseInt(opt.value, 10), name: opt.textContent });
            }
        });
    }

    function escapeHtml(s) {
        var div = document.createElement('div');
        div.textContent = s == null ? '' : s;
        return div.innerHTML;
    }

    function syncSelect() {
        if (!productsSource) return;
        productsSource.innerHTML = '';
        selected.forEach(function (p) {
            var opt = document.createElement('option');
            opt.value = String(p.id);
            opt.textContent = p.name;
            opt.selected = true;
            productsSource.appendChild(opt);
        });
    }

    function refreshProductDropdown() {
        if (!selectEl) return;
        var current = selectEl.value;
        selectEl.innerHTML = '<option value="">— Pick a product —</option>';
        productCatalog.forEach(function (p) {
            if (
                selected.some(function (s) {
                    return String(s.id) === String(p.id);
                })
            ) {
                return;
            }
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            selectEl.appendChild(opt);
        });
        if (current && selectEl.querySelector('option[value="' + current + '"]')) {
            selectEl.value = current;
        }
    }

    function renderList() {
        if (!listEl || !emptyEl) return;
        listEl.innerHTML = '';
        if (!selected.length) {
            emptyEl.style.display = 'block';
            listEl.style.display = 'none';
            syncSelect();
            refreshProductDropdown();
            updatePreviewText();
            return;
        }
        emptyEl.style.display = 'none';
        listEl.style.display = 'block';
        selected.forEach(function (p, index) {
            var li = document.createElement('li');
            li.className = 'hc-product-item';
            li.innerHTML =
                '<div class="hc-product-order">' +
                (index + 1) +
                '</div>' +
                '<div class="hc-product-name">' +
                escapeHtml(p.name) +
                '</div>' +
                '<div class="hc-product-actions">' +
                '<button type="button" class="btn btn-sm btn-secondary hc-product-up" data-id="' +
                p.id +
                '" title="Move up"' +
                (index === 0 ? ' disabled' : '') +
                '><i class="fas fa-arrow-up"></i></button>' +
                '<button type="button" class="btn btn-sm btn-secondary hc-product-down" data-id="' +
                p.id +
                '" title="Move down"' +
                (index === selected.length - 1 ? ' disabled' : '') +
                '><i class="fas fa-arrow-down"></i></button>' +
                '<button type="button" class="btn btn-sm btn-danger hc-product-remove" data-id="' +
                p.id +
                '" title="Remove"><i class="fas fa-times"></i></button>' +
                '</div>';
            listEl.appendChild(li);
        });
        syncSelect();
        refreshProductDropdown();
        updatePreviewText();
    }

    function moveItem(id, direction) {
        var idx = selected.findIndex(function (p) {
            return String(p.id) === String(id);
        });
        if (idx < 0) return;
        var next = idx + direction;
        if (next < 0 || next >= selected.length) return;
        var tmp = selected[idx];
        selected[idx] = selected[next];
        selected[next] = tmp;
        renderList();
    }

    function removeItem(id) {
        selected = selected.filter(function (p) {
            return String(p.id) !== String(id);
        });
        renderList();
    }

    function addProduct(id, name) {
        if (!id) return;
        if (
            selected.some(function (p) {
                return String(p.id) === String(id);
            })
        ) {
            return;
        }
        var catalogName = name;
        productCatalog.forEach(function (p) {
            if (String(p.id) === String(id)) catalogName = p.name;
        });
        selected.push({ id: parseInt(id, 10), name: catalogName || name });
        renderList();
    }

    if (addBtn) {
        addBtn.addEventListener('click', function () {
            if (!selectEl || !selectEl.value) return;
            var opt = selectEl.options[selectEl.selectedIndex];
            addProduct(selectEl.value, opt ? opt.textContent : '');
            selectEl.selectedIndex = 0;
        });
    }

    if (listEl) {
        listEl.addEventListener('click', function (e) {
            var up = e.target.closest('.hc-product-up');
            var down = e.target.closest('.hc-product-down');
            var remove = e.target.closest('.hc-product-remove');
            if (up) moveItem(up.getAttribute('data-id'), -1);
            if (down) moveItem(down.getAttribute('data-id'), 1);
            if (remove) removeItem(remove.getAttribute('data-id'));
        });
    }

    form.addEventListener('submit', function () {
        syncSelect();
    });

    updateDestinationPanels();
    renderList();
})();
