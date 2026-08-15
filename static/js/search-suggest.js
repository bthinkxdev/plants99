(function () {
    'use strict';

    function debounce(fn, wait) {
        var t;
        return function () {
            var ctx = this, args = arguments;
            clearTimeout(t);
            t = setTimeout(function () { fn.apply(ctx, args); }, wait);
        };
    }

    document.addEventListener('DOMContentLoaded', function () {
        var form = document.querySelector('.site-search-pill');
        if (!form) return;
        var input = form.querySelector('input[name="q"]');
        if (!input) return;

        var wrap = form.closest('.site-header__search-slot') || form.parentNode;
        wrap.style.position = wrap.style.position || 'relative';

        var list = document.createElement('div');
        list.id = 'searchSuggestList';
        list.className = 'search-suggest-list';
        list.setAttribute('role', 'listbox');
        list.hidden = true;
        wrap.appendChild(list);

        var suggestUrl = '/api/search/suggest/';
        var active = -1;
        var items = [];

        function hide() {
            list.hidden = true;
            list.innerHTML = '';
            active = -1;
            items = [];
        }

        function render(results) {
            items = results || [];
            active = -1;
            if (!items.length) {
                hide();
                return;
            }
            list.innerHTML = '';
            items.forEach(function (item, idx) {
                var a = document.createElement('a');
                a.href = item.url;
                a.className = 'search-suggest-item';
                a.setAttribute('role', 'option');
                a.dataset.index = String(idx);
                a.innerHTML = '<span class="search-suggest-name"></span>' +
                    (item.category ? '<span class="search-suggest-cat"></span>' : '');
                a.querySelector('.search-suggest-name').textContent = item.name;
                if (item.category) a.querySelector('.search-suggest-cat').textContent = item.category;
                list.appendChild(a);
            });
            list.hidden = false;
        }

        var fetchSuggestions = debounce(function () {
            var q = (input.value || '').trim();
            if (q.length < 2) {
                hide();
                return;
            }
            fetch(suggestUrl + '?q=' + encodeURIComponent(q), {
                headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' }
            })
                .then(function (r) { return r.json(); })
                .then(function (data) { render(data.results || []); })
                .catch(function () { hide(); });
        }, 180);

        input.addEventListener('input', fetchSuggestions);
        input.addEventListener('focus', function () {
            if ((input.value || '').trim().length >= 2) fetchSuggestions();
        });
        input.addEventListener('keydown', function (e) {
            if (list.hidden || !items.length) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                active = Math.min(active + 1, items.length - 1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                active = Math.max(active - 1, 0);
            } else if (e.key === 'Enter' && active >= 0) {
                e.preventDefault();
                window.location.href = items[active].url;
                return;
            } else if (e.key === 'Escape') {
                hide();
                return;
            } else {
                return;
            }
            Array.prototype.forEach.call(list.children, function (el, i) {
                el.classList.toggle('is-active', i === active);
            });
        });

        document.addEventListener('click', function (e) {
            if (!wrap.contains(e.target)) hide();
        });
    });

    // Guard against empty/whitespace-only search submissions landing on the
    // "shop all" page (product_list with an empty ?q= just lists everything).
    // Covers every live search box — desktop header pill + mobile search
    // bar — not just the one wired up above, and skips the hidden q
    // passthrough field in the shop filters panel (_filters.html), which
    // legitimately carries an empty value forward when filtering with no
    // active search term.
    document.addEventListener('DOMContentLoaded', function () {
        var guarded = [];
        document.querySelectorAll('input[name="q"]:not([type="hidden"])').forEach(function (input) {
            var searchForm = input.closest('form');
            if (!searchForm || guarded.indexOf(searchForm) !== -1) return;
            guarded.push(searchForm);
            searchForm.addEventListener('submit', function (e) {
                var q = (input.value || '').trim();
                if (!q) {
                    e.preventDefault();
                    input.focus();
                    return;
                }
                // Collapse stray internal whitespace too (e.g. "  plant   pot  ")
                // rather than round-tripping it untouched into the URL.
                input.value = q;
            });
        });
    });
})();
