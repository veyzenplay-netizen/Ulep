/* ULEP | Team carousel.
   One member at a time. It moves on by itself with a progress bar along the top,
   loops back to the first member, and can be paused, stepped with Prev / Next,
   jumped with the dots, swiped on a phone, or driven with the arrow keys. */
(function () {
    var root = document.getElementById('team');
    if (!root) return;

    var SLIDE_MS = 3500;

    var slides = Array.prototype.slice.call(root.querySelectorAll('.member'));
    var bar = document.getElementById('teamBar');
    var pauseBtn = document.getElementById('teamPause');
    var prevBtn = document.getElementById('teamPrev');
    var nextBtn = document.getElementById('teamNext');
    var dotsBox = document.getElementById('teamDots');
    var card = document.getElementById('teamCard');
    var live = document.getElementById('teamSlides');

    var PAUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/></svg>';
    var PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>';

    var current = 0;
    var elapsed = 0;          // ms spent on the current slide
    var last = 0;             // timestamp of the previous frame
    var raf = 0;
    var userPaused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var onScreen = false;

    /* dots */
    var dots = slides.map(function (slide, i) {
        var d = document.createElement('button');
        d.type = 'button';
        d.setAttribute('aria-label', 'Show ' + slide.querySelector('h4').textContent);
        d.addEventListener('click', function () { go(i); });
        dotsBox.appendChild(d);
        return d;
    });

    function paint() {
        slides.forEach(function (s, i) {
            s.classList.toggle('is-active', i === current);
            s.classList.toggle('is-before', i < current);
            s.setAttribute('aria-hidden', i === current ? 'false' : 'true');
        });
        dots.forEach(function (d, i) {
            if (i === current) d.setAttribute('aria-current', 'true');
            else d.removeAttribute('aria-current');
        });
    }

    function go(i) {
        current = (i + slides.length) % slides.length;
        elapsed = 0;
        bar.style.width = '0%';
        paint();
    }

    function running() {
        return !userPaused && onScreen && !document.hidden;
    }

    function frame(now) {
        raf = 0;
        if (!running()) return;
        if (last) elapsed += Math.min(now - last, 100);   // ignore long gaps (tab switch)
        last = now;
        if (elapsed >= SLIDE_MS) {
            go(current + 1);
        } else {
            bar.style.width = (elapsed / SLIDE_MS * 100) + '%';
        }
        raf = requestAnimationFrame(frame);
    }

    function kick() {
        last = 0;
        if (running() && !raf) raf = requestAnimationFrame(frame);
    }

    function setPaused(p) {
        userPaused = p;
        pauseBtn.setAttribute('aria-pressed', p ? 'true' : 'false');
        pauseBtn.innerHTML = (p ? PLAY_ICON : PAUSE_ICON) + '<span>' + (p ? 'Play' : 'Pause') + '</span>';
        live.setAttribute('aria-live', p ? 'polite' : 'off');
        kick();
    }

    pauseBtn.addEventListener('click', function () { setPaused(!userPaused); });
    prevBtn.addEventListener('click', function () { go(current - 1); kick(); });
    nextBtn.addEventListener('click', function () { go(current + 1); kick(); });

    /* arrow keys while focus is anywhere inside the carousel */
    root.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') { go(current - 1); kick(); }
        else if (e.key === 'ArrowRight') { go(current + 1); kick(); }
    });

    /* swipe */
    var startX = null, startY = null;
    card.addEventListener('touchstart', function (e) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });
    card.addEventListener('touchend', function (e) {
        if (startX === null) return;
        var dx = e.changedTouches[0].clientX - startX;
        var dy = e.changedTouches[0].clientY - startY;
        startX = null;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            go(current + (dx < 0 ? 1 : -1));
            kick();
        }
    }, { passive: true });

    /* only run while the carousel is on screen and the tab is visible */
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
            onScreen = entries[0].isIntersecting;
            kick();
        }, { threshold: 0.35 }).observe(card);
    } else {
        onScreen = true;
    }
    document.addEventListener('visibilitychange', kick);

    /* the site search calls this so a match on a hidden slide gets shown */
    window.ulepTeam = {
        show: function (el) {
            var i = slides.indexOf(el);
            if (i === -1) return;
            go(i);
            setPaused(true);
        }
    };

    setPaused(userPaused);
    paint();
})();
