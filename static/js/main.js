(function ($) {
    "use strict";

    
    (function hideSpinner() {
        var el = document.getElementById('spinner');
        if (el) el.classList.remove('show');
    })();


    
    if (typeof WOW !== 'undefined') {
        try { new WOW().init(); } catch (e) {  }
    }


    
    $(window).on('scroll', function () {
        if ($(this).scrollTop() > 80) {
            $('.nav-bar').addClass('sticky-top shadow-sm');
        } else {
            $('.nav-bar').removeClass('sticky-top shadow-sm');
        }
    });


    
    if ($(".header-carousel").length && typeof $.fn.owlCarousel === 'function') {
        try {
            $(".header-carousel").owlCarousel({
            items: 1,
            autoplay: true,
            autoplayTimeout: 5000,
            smartSpeed: 700,
            center: false,
            dots: true,
            loop: true,
            margin: 0,
            nav: false
        });
        } catch (e) {  }
    }


    
    if ($(".hc-hero-carousel").length && typeof $.fn.owlCarousel === 'function') {
        try {
            $(".hc-hero-carousel").owlCarousel({
                autoplay: true,
                autoplayTimeout: 4000,
                smartSpeed: 700,
                dots: false,
                loop: true,
                margin: 12,
                nav: false,
                responsiveClass: true,
                responsive: {
                    0: { items: 2.5, margin: 10 },
                    480: { items: 2.5, margin: 11 },
                    576: { items: 2.5, margin: 12 },
                    768: { items: 2, margin: 20 },
                    992: { items: 2, margin: 24 },
                    1200: { items: 3, margin: 24 }
                }
            });
        } catch (e) {  }
    }

    if (
        $(".productList-carousel").not(".hc-hero-carousel").length &&
        typeof $.fn.owlCarousel === 'function'
    ) {
        try {
            $(".productList-carousel").not(".hc-hero-carousel").owlCarousel({
                autoplay: true,
                autoplayTimeout: 4000,
                smartSpeed: 700,
                dots: false,
                loop: true,
                margin: 24,
                nav: false,
                responsiveClass: true,
                responsive: {
                    0: { items: 1 },
                    576: { items: 1 },
                    768: { items: 2 },
                    992: { items: 2 },
                    1200: { items: 3 }
                }
            });
        } catch (e) {  }
    }


    
    if ($(".productImg-carousel").length && typeof $.fn.owlCarousel === 'function') {
        try {
            $(".productImg-carousel").owlCarousel({
            autoplay: true,
            autoplayTimeout: 3500,
            smartSpeed: 700,
            dots: false,
            loop: true,
            items: 1,
            margin: 0,
            nav: false
        });
        } catch (e) {  }
    }


    
    if ($(".single-carousel").length && typeof $.fn.owlCarousel === 'function') {
        try {
            $(".single-carousel").owlCarousel({
            autoplay: false,
            smartSpeed: 500,
            dots: true,
            dotsData: true,
            loop: false,
            items: 1,
            nav: false
        });
        } catch (e) {  }
    }


    
    if ($(".related-carousel").length && typeof $.fn.owlCarousel === 'function') {
        try {
            $(".related-carousel").owlCarousel({
            autoplay: true,
            autoplayTimeout: 4000,
            smartSpeed: 700,
            dots: false,
            loop: true,
            margin: 20,
            nav: false,
            responsiveClass: true,
            responsive: {
                0:    { items: 1 },
                576:  { items: 2 },
                768:  { items: 2 },
                992:  { items: 3 },
                1200: { items: 4 }
            }
        });
        } catch (e) {  }
    }


    
    $(document).on('click', '.btn-plus, .btn-minus', function () {
        var $btn   = $(this);
        var $input = $btn.closest('.quantity').find('input[type="text"], input[type="number"]');
        var current = parseInt($input.val(), 10) || 1;

        if ($btn.hasClass('btn-plus')) {
            var max = parseInt($input.attr('max'), 10);
            if (isNaN(max) || current < max) {
                $input.val(current + 1);
            }
        } else {
            var min = parseInt($input.attr('min'), 10) || 1;
            if (current > min) {
                $input.val(current - 1);
            }
        }

        $input.trigger('change');
    });


    
    $(document).on('click', '.gallery-thumb', function () {
        var src = $(this).find('img').attr('src');
        if (!src) return;

        
        var $main = $(this).closest('.gallery-section').find('.gallery-main img');
        $main.css('opacity', 0);
        setTimeout(function () {
            $main.attr('src', src).css('opacity', 1);
        }, 150);

        
        $(this).closest('.gallery-thumbs').find('.gallery-thumb').removeClass('active');
        $(this).addClass('active');
    });


    
    $(document).on('click', '#filterToggleBtn, .btn-filter', function (e) {
        e.stopPropagation();
        $('#filterOffcanvas').addClass('open');
        $('#filterOverlay').addClass('open');
        $('body').css('overflow', 'hidden');
    });

    $(document).on('click', '#filterCloseBtn', function () {
        closeFilter();
    });

    $(document).on('click', '#filterOverlay', function () {
        closeFilter();
    });

    $(document).on('keydown', function (e) {
        if (e.key === 'Escape') {
            closeFilter();
        }
    });

    function closeFilter() {
        $('#filterOffcanvas').removeClass('open');
        $('#filterOverlay').removeClass('open');
        $('body').css('overflow', '');
    }


    
    $(document).on('click', '.custom-accordion-header', function () {
        var $item    = $(this).closest('.custom-accordion-item');
        var $body    = $item.find('.custom-accordion-body');
        var isOpen   = $item.hasClass('open');

        
        $item.closest('.custom-accordion').find('.custom-accordion-item').each(function () {
            $(this).removeClass('open');
            $(this).find('.custom-accordion-body').slideUp(250);
            $(this).find('.accordion-icon').text('+');
        });

        
        if (!isOpen) {
            $item.addClass('open');
            $body.slideDown(250);
            $item.find('.accordion-icon').text('−');
        }
    });


    
    $(document).on('click', '#goToStep2', function (e) {
        e.preventDefault();

        
        var valid = true;
        $('#checkoutStep1 [required]').each(function () {
            if (!$(this).val().trim()) {
                $(this).addClass('is-invalid');
                valid = false;
            } else {
                $(this).removeClass('is-invalid');
            }
        });

        if (!valid) {
            return;
        }

        $('#checkoutStep1').addClass('d-none');
        $('#checkoutStep2').removeClass('d-none');

        
        $('.checkout-step[data-step="1"]').removeClass('active').addClass('done');
        $('.checkout-step[data-step="2"]').addClass('active');

        
        $('html, body').animate({ scrollTop: $('#checkoutSteps').offset().top - 20 }, 300);
    });

    $(document).on('click', '#backToStep1', function (e) {
        e.preventDefault();
        $('#checkoutStep2').addClass('d-none');
        $('#checkoutStep1').removeClass('d-none');

        $('.checkout-step[data-step="2"]').removeClass('active');
        $('.checkout-step[data-step="1"]').addClass('active').removeClass('done');
    });

    
    $(document).on('blur', '[required]', function () {
        if (!$(this).val().trim()) {
            $(this).addClass('is-invalid');
        } else {
            $(this).removeClass('is-invalid');
        }
    });


    
    $(document).on('click', '.cart-remove-btn', function () {
        var $row = $(this).closest('tr');
        $row.css({ opacity: 0, transition: 'opacity 0.3s' });
        setTimeout(function () {
            $row.remove();
            updateCartTotal();
        }, 300);
    });


    
    function parsePrice(str) {
        return parseFloat((str || '').replace(/[^0-9.]/g, '')) || 0;
    }

    function updateCartTotal() {
        var subtotal = 0;

        $('#cartTable tbody tr').each(function () {
            var qty   = parseInt($(this).find('.quantity input').val(), 10) || 1;
            var price = parsePrice($(this).find('[data-price]').data('price'));
            var lineTotal = qty * price;

            $(this).find('.line-total').text('$' + lineTotal.toFixed(2));
            subtotal += lineTotal;
        });

        var shipping = parsePrice($('#shippingCost').text());
        var total    = subtotal + shipping;

        $('#cartSubtotal').text('$' + subtotal.toFixed(2));
        $('#cartTotal').text('$' + total.toFixed(2));
    }

    $(document).on('change', '.quantity input', function () {
        updateCartTotal();
        $('#formQuantity').val($(this).val());
    });


    
    $(document).on('click', '.product-wishlist', function (e) {
        e.preventDefault();
        var $icon = $(this).find('i');
        if ($icon.hasClass('far')) {
            $icon.removeClass('far').addClass('fas');
            $(this).addClass('active').css({ background: '#000', color: '#fff', borderColor: '#000' });
        } else {
            $icon.removeClass('fas').addClass('far');
            $(this).removeClass('active').css({ background: '', color: '', borderColor: '' });
        }
    });


    
    $(document).on('click', 'a[href^="#"]:not([data-bs-toggle])', function (e) {
        var target = $(this.getAttribute('href'));
        if (target.length) {
            e.preventDefault();
            $('html, body').animate({ scrollTop: target.offset().top - 80 }, 500, 'swing');
        }
    });


    
    $(window).on('scroll', function () {
        if ($(this).scrollTop() > 300) {
            $('.back-to-top').fadeIn('slow');
        } else {
            $('.back-to-top').fadeOut('slow');
        }
    });

    $(document).on('click', '.back-to-top', function (e) {
        e.preventDefault();
        $('html, body').animate({ scrollTop: 0 }, 600, 'swing');
    });


    
    $(window).on('load', function () {
        $('.owl-carousel').css('min-height', '');
    });


})(jQuery);
