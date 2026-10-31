/* ULEP | Theme switcher.
   The first part runs straight away (script sits in <head>) so the page never
   flashes the wrong colours. The picker is built once the page has loaded. */
(function () {
    var KEY = 'ulep-theme';
    var root = document.documentElement;
    var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    var OPTIONS = [
        { id: 'light',    label: 'Light',    note: '' },
        { id: 'dark',     label: 'Dark',     note: 'Navy' },
        { id: 'midnight', label: 'Midnight', note: 'Black' },
        { id: 'auto',     label: 'Auto',     note: 'Device' }
    ];

    function saved() {
        try {
            var v = localStorage.getItem(KEY);
            return OPTIONS.some(function (o) { return o.id === v; }) ? v : 'auto';
        } catch (e) { return 'auto'; }
    }

    function resolve(pref) {
        if (pref === 'auto') return mq && mq.matches ? 'dark' : 'light';
        return pref;
    }

    function apply(pref) {
        var theme = resolve(pref);
        root.setAttribute('data-theme', theme);
        root.setAttribute('data-theme-pref', pref);
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', theme === 'light' ? '#ffffff' : theme === 'midnight' ? '#000000' : '#0b1424');
    }

    var pref = saved();
    apply(pref);

    if (mq) {
        var onSystem = function () { if (pref === 'auto') { apply('auto'); refresh(); } };
        if (mq.addEventListener) mq.addEventListener('change', onSystem);
        else if (mq.addListener) mq.addListener(onSystem);
    }

    /* ----- picker ----- */
    var ICONS = {
        light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/></svg>',
        dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
        midnight: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/><path d="M17 4v3M15.5 5.5h3"/></svg>'
    };

    var btn, menu, items = [];

    function refresh() {
        if (!btn) return;
        var shown = resolve(pref);
        btn.innerHTML = ICONS[shown] + '<span class="theme-label">' + label(pref) + '</span>';
        btn.setAttribute('aria-label', 'Colour theme: ' + label(pref));
        items.forEach(function (b) {
            b.setAttribute('aria-checked', b.getAttribute('data-id') === pref ? 'true' : 'false');
        });
    }

    function label(id) {
        for (var i = 0; i < OPTIONS.length; i++) if (OPTIONS[i].id === id) return OPTIONS[i].label;
        return '';
    }

    function setPref(id) {
        pref = id;
        try { localStorage.setItem(KEY, id); } catch (e) {}
        root.classList.add('theme-fade');
        apply(id);
        refresh();
        setTimeout(function () { root.classList.remove('theme-fade'); }, 400);
    }

    function close(focusBtn) {
        if (!menu || menu.hidden) return;
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        if (focusBtn) btn.focus();
    }

    function open() {
        menu.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        var cur = items.filter(function (b) { return b.getAttribute('aria-checked') === 'true'; })[0] || items[0];
        cur.focus();
    }

    function build(slot) {
        var wrap = document.createElement('div');
        wrap.className = 'theme-wrap';

        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theme-btn';
        btn.setAttribute('aria-haspopup', 'true');
        btn.setAttribute('aria-expanded', 'false');

        menu = document.createElement('div');
        menu.className = 'theme-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Colour theme');
        menu.hidden = true;

        OPTIONS.forEach(function (o) {
            var b = document.createElement('button');
            b.type = 'button';
            b.setAttribute('role', 'menuitemradio');
            b.setAttribute('data-id', o.id);
            b.innerHTML = '<span class="theme-chip" data-chip="' + o.id + '"></span><span>' + o.label + '</span>' +
                (o.note ? '<small>' + o.note + '</small>' : '');
            b.addEventListener('click', function () { setPref(o.id); close(true); });
            menu.appendChild(b);
            items.push(b);
        });

        btn.addEventListener('click', function () { if (menu.hidden) open(); else close(false); });

        menu.addEventListener('keydown', function (e) {
            var i = items.indexOf(document.activeElement);
            if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
            else if (e.key === 'Escape') { e.preventDefault(); close(true); }
            else if (e.key === 'Tab') { close(false); }
        });

        document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) close(false); });

        wrap.appendChild(btn);
        wrap.appendChild(menu);
        slot.appendChild(wrap);
        refresh();
    }

    document.addEventListener('DOMContentLoaded', function () {
        var slot = document.querySelector('[data-theme-slot]');
        if (slot) build(slot);
    });
})();
