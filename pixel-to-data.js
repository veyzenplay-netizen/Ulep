(function () {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };
    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(2) + ' MB';
    }
    function fmtNum(n) { return Number(n).toLocaleString('en-US'); }


    /* =====================================================
       TABS (sidebar on desktop, horizontal bar on mobile)
       ===================================================== */
    (function () {
        var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
        var names = tabs.map(function (t) { return t.getAttribute('data-tab'); });

        function show(name, focus) {
            if (names.indexOf(name) === -1) name = 'image';
            tabs.forEach(function (t) {
                var on = t.getAttribute('data-tab') === name;
                t.classList.toggle('is-active', on);
                t.setAttribute('aria-selected', on ? 'true' : 'false');
                t.tabIndex = on ? 0 : -1;
                $('panel-' + t.getAttribute('data-tab')).hidden = !on;
                if (on && focus) t.focus();
            });
            try { history.replaceState(null, '', '#' + name); } catch (e) { /* file:// can refuse */ }
            window.scrollTo(0, 0);
        }

        tabs.forEach(function (t, i) {
            t.addEventListener('click', function () { show(t.getAttribute('data-tab')); });
            t.addEventListener('keydown', function (e) {
                var k = e.key, j = -1;
                if (k === 'ArrowDown' || k === 'ArrowRight') j = (i + 1) % tabs.length;
                else if (k === 'ArrowUp' || k === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
                else if (k === 'Home') j = 0;
                else if (k === 'End') j = tabs.length - 1;
                if (j > -1) { e.preventDefault(); show(names[j], true); }
            });
        });

        show(location.hash.replace('#', '') || 'image');
        window.addEventListener('hashchange', function () { show(location.hash.replace('#', '')); });
    })();


    /* =====================================================
       IMAGE LAB
       ===================================================== */
    (function () {
        var img = null, file = null, outBlob = null, outName = 'ulep-image.jpg';
        var origUrl = null, resUrl = null;
        var runId = 0, timer = null, pendingReason = '';
        var lastLogged = null;
        var dirty = false;

        var fileInput = $('fileInput'), chooseBtn = $('chooseBtn');
        var wIn = $('widthInput'), hIn = $('heightInput'), ratio = $('ratioCheck');
        var qIn = $('quality'), fmt = $('format');
        var live = $('liveToggle'), procBtn = $('processBtn'), dlBtn = $('downloadBtn');
        var chips = Array.prototype.slice.call(document.querySelectorAll('#scaleChips .chip'));

        var STEPS = ['read', 'resize', 'draw', 'encode', 'done'];

        /* ---------- activity log ---------- */
        function log(msg) {
            var ul = $('log');
            var empty = ul.querySelector('.log-empty');
            if (empty) empty.remove();
            var li = document.createElement('li');
            li.className = 'new';
            var t = document.createElement('time');
            t.textContent = new Date().toLocaleTimeString('en-GB');
            var p = document.createElement('span');
            p.textContent = msg;
            li.appendChild(t);
            li.appendChild(p);
            ul.insertBefore(li, ul.firstChild);
            while (ul.children.length > 40) ul.removeChild(ul.lastChild);
        }
        $('clearLog').addEventListener('click', function () {
            $('log').innerHTML = '<li class="log-empty">Every change you make will be listed here.</li>';
        });

        /* ---------- pipeline display ---------- */
        function setStep(name, state, text) {
            var li = document.querySelector('#pipe li[data-step="' + name + '"]');
            li.className = state ? 'is-' + state : '';
            if (text !== undefined) li.lastElementChild.textContent = text;
        }
        function resetSteps() {
            STEPS.forEach(function (s) { setStep(s, '', 'waiting'); });
        }
        function setBusy(on) { $('busy').hidden = !on; }
        function setMeta(text, isErr) {
            var el = $('resMeta');
            el.textContent = text;
            el.className = isErr ? 'err' : '';
            el.setAttribute('aria-live', 'polite');
        }

        /* ---------- settings ---------- */
        function readSettings() {
            return {
                w: Number(wIn.value), h: Number(hIn.value),
                q: Number(qIn.value), f: fmt.value
            };
        }
        function fname(mime) { return mime.split('/')[1].toUpperCase(); }
        function diff(a, b) {
            var out = [];
            if (!a) return out;
            if (a.w !== b.w) out.push('Width ' + a.w + ' \u2192 ' + b.w + ' px');
            if (a.h !== b.h) out.push('Height ' + a.h + ' \u2192 ' + b.h + ' px');
            if (a.f !== b.f) out.push('Format ' + fname(a.f) + ' \u2192 ' + fname(b.f));
            if (a.q !== b.q && b.f !== 'image/png') out.push('Quality ' + a.q + '% \u2192 ' + b.q + '%');
            return out;
        }
        function valid(s) {
            return Number.isInteger(s.w) && Number.isInteger(s.h) &&
                s.w >= 1 && s.h >= 1 && s.w <= 8000 && s.h <= 8000;
        }

        function syncControls() {
            var has = !!img;
            [wIn, hIn, ratio, fmt].forEach(function (el) { el.disabled = !has; });
            chips.forEach(function (c) { c.disabled = !has; });
            var png = fmt.value === 'image/png';
            qIn.disabled = !has || png;
            $('qualityHint').textContent = png
                ? 'PNG is lossless, so quality does not change it.'
                : 'Lower quality means a smaller file.';
            procBtn.disabled = !has;
        }

        function markDirty(on) {
            dirty = on;
            procBtn.classList.toggle('needs-run', on);
            if (on) setMeta('Settings changed. Click Process Image.', false);
        }

        /* a change was made: wait a moment, log it, then process if live */
        function touch(reason, delay) {
            if (!img) return;
            pendingReason = reason || pendingReason;
            clearTimeout(timer);
            timer = setTimeout(commit, delay === undefined ? 350 : delay);
        }
        function commit() {
            var s = readSettings();
            if (!valid(s)) {
                setMeta('Use a width and height from 1 to 8000.', true);
                log('Width and height must be whole numbers from 1 to 8000.');
                pendingReason = '';
                return;
            }
            var d = diff(lastLogged, s);
            if (pendingReason || d.length) {
                log((pendingReason ? pendingReason + ': ' : 'Changed: ') + (d.join(', ') || 'no change in size or quality'));
            }
            lastLogged = s;
            pendingReason = '';
            if (live.checked) run(); else markDirty(true);
        }

        /* ---------- the process itself ---------- */
        async function run() {
            if (!img) return;
            var my = ++runId;
            var s = readSettings();
            if (!valid(s)) { setMeta('Use a width and height from 1 to 8000.', true); return; }

            markDirty(false);
            var t0 = performance.now();
            var natW = img.naturalWidth, natH = img.naturalHeight;
            var pct = Math.round(s.w / natW * 100);
            var delay = 110;
            var png = s.f === 'image/png';

            resetSteps();
            setBusy(true);
            setMeta('Processing...', false);

            setStep('read', 'active', 'Reading ' + natW + ' \u00D7 ' + natH + ' px');
            await wait(delay); if (my !== runId) return;
            setStep('read', 'done', natW + ' \u00D7 ' + natH + ' px = ' + fmtNum(natW * natH) + ' pixels');

            setStep('resize', 'active', 'Working out new size');
            await wait(delay); if (my !== runId) return;
            setStep('resize', 'done', (s.w === natW && s.h === natH)
                ? 'Same size, no change'
                : natW + ' \u00D7 ' + natH + ' \u2192 ' + s.w + ' \u00D7 ' + s.h + ' (' + pct + '% wide)');

            setStep('draw', 'active', 'Drawing ' + fmtNum(s.w * s.h) + ' pixels');
            await wait(delay); if (my !== runId) return;

            var canvas, ctx;
            try {
                canvas = document.createElement('canvas');
                canvas.width = s.w;
                canvas.height = s.h;
                ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('no context');
                if (s.f === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, s.w, s.h); }
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, s.w, s.h);
            } catch (err) {
                return fail(my, 'draw', 'Could not draw at this size');
            }
            setStep('draw', 'done', s.w + ' \u00D7 ' + s.h + ' = ' + fmtNum(s.w * s.h) + ' pixels');

            setStep('encode', 'active', 'Encoding as ' + fname(s.f));
            await wait(delay); if (my !== runId) return;

            var blob = await new Promise(function (res) {
                try { canvas.toBlob(res, s.f, png ? undefined : s.q / 100); } catch (e) { res(null); }
            });
            if (my !== runId) return;
            if (!blob) return fail(my, 'encode', 'This browser cannot make that image');
            if (blob.type && blob.type !== s.f) {
                log('Your browser could not save ' + fname(s.f) + ', so it used ' + fname(blob.type) + ' instead.');
            }
            setStep('encode', 'done', fname(blob.type || s.f) + (png ? ', lossless' : ' at ' + s.q + '% quality'));
            await wait(delay); if (my !== runId) return;

            /* show the result */
            outBlob = blob;
            if (resUrl) URL.revokeObjectURL(resUrl);
            resUrl = URL.createObjectURL(blob);
            var shown = document.createElement('img');
            shown.src = resUrl;
            shown.alt = 'Processed image preview';
            var frame = $('resultPreview');
            Array.prototype.slice.call(frame.children).forEach(function (c) {
                if (c.id !== 'busy') c.remove();
            });
            frame.insertBefore(shown, frame.firstChild);
            var ext = (blob.type || s.f) === 'image/jpeg' ? 'jpg' : (blob.type || s.f).split('/')[1];
            var base = file ? file.name.replace(/\.[^.]+$/, '') : 'ulep-image';
            outName = base + '-ulep.' + ext;

            var change = Math.round((blob.size - file.size) / file.size * 100);
            var changeTxt = change === 0 ? 'No change' : (change < 0 ? '\u2212' + Math.abs(change) + '%' : '+' + change + '%');
            setStep('done', 'done', formatSize(blob.size) + ' (' + changeTxt.toLowerCase() + ')');

            $('nPixels').textContent = fmtNum(s.w * s.h);
            $('nRaw').textContent = formatSize(s.w * s.h * 3);
            $('nFile').textContent = formatSize(blob.size);
            $('nSaved').textContent = changeTxt;
            setMeta(s.w + ' \u00D7 ' + s.h + ' px \u00B7 ' + formatSize(blob.size), false);
            dlBtn.disabled = false;
            setBusy(false);

            log('Processed in ' + Math.round(performance.now() - t0) + ' ms: ' +
                s.w + ' \u00D7 ' + s.h + ' px, ' + fname(blob.type || s.f) + ', ' +
                formatSize(blob.size) + ' (' + changeTxt.toLowerCase() + ' vs original).');
        }

        function fail(my, step, msg) {
            if (my !== runId) return;
            setStep(step, 'error', msg);
            setMeta(msg, true);
            setBusy(false);
            log(msg + '. Try a smaller width and height.');
        }

        /* ---------- loading a file ---------- */
        function loadFile(f) {
            if (!f || !/^image\//.test(f.type)) {
                log('That file is not an image. Choose a PNG, JPEG, WebP or similar file.');
                $('fileName').textContent = 'That file is not an image. Try a PNG, JPEG or WebP.';
                return;
            }
            var url = URL.createObjectURL(f);
            var im = new Image();
            im.onload = function () {
                if (origUrl) URL.revokeObjectURL(origUrl);
                origUrl = url;
                img = im;
                file = f;
                outBlob = null;
                runId++;

                var o = document.createElement('img');
                o.src = url;
                o.alt = 'Original image preview';
                $('preview').innerHTML = '';
                $('preview').appendChild(o);

                $('origMeta').textContent = im.naturalWidth + ' \u00D7 ' + im.naturalHeight + ' px \u00B7 ' + formatSize(f.size);
                $('fileName').textContent = f.name;
                $('fileName').classList.add('has-file');
                wIn.value = im.naturalWidth;
                hIn.value = im.naturalHeight;
                dlBtn.disabled = true;
                syncControls();
                markDirty(false);

                lastLogged = readSettings();
                log('Loaded ' + f.name + ': ' + im.naturalWidth + ' \u00D7 ' + im.naturalHeight + ' px, ' + formatSize(f.size) + '.');
                run();
            };
            im.onerror = function () {
                URL.revokeObjectURL(url);
                log('Could not read ' + f.name + '. Try a different image.');
                $('fileName').textContent = 'Could not read that image.';
            };
            im.src = url;
        }

        /* ---------- events ---------- */
        chooseBtn.addEventListener('click', function () { fileInput.click(); });
        fileInput.addEventListener('change', function (e) {
            if (e.target.files[0]) loadFile(e.target.files[0]);
            fileInput.value = '';
        });
        $('preview').addEventListener('click', function () { if (!img) fileInput.click(); });

        var drop = $('dropZone');
        ['dragenter', 'dragover'].forEach(function (ev) {
            drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('dragging'); });
        });
        ['dragleave', 'drop'].forEach(function (ev) {
            drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('dragging'); });
        });
        drop.addEventListener('drop', function (e) {
            if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
        });
        /* stop the browser opening a dropped file when it misses the preview */
        window.addEventListener('dragover', function (e) { e.preventDefault(); });
        window.addEventListener('drop', function (e) { e.preventDefault(); });

        wIn.addEventListener('input', function () {
            var w = Number(wIn.value);
            if (img && ratio.checked && w > 0) {
                hIn.value = Math.max(1, Math.round(w * img.naturalHeight / img.naturalWidth));
            }
            touch('Width changed');
        });
        hIn.addEventListener('input', function () {
            var h = Number(hIn.value);
            if (img && ratio.checked && h > 0) {
                wIn.value = Math.max(1, Math.round(h * img.naturalWidth / img.naturalHeight));
            }
            touch('Height changed');
        });
        ratio.addEventListener('change', function () {
            log('Aspect ratio ' + (ratio.checked ? 'locked: width and height move together.' : 'unlocked: width and height are independent.'));
            if (ratio.checked && img) {
                hIn.value = Math.max(1, Math.round(Number(wIn.value) * img.naturalHeight / img.naturalWidth));
                touch('Aspect ratio locked', 0);
            }
        });
        chips.forEach(function (c) {
            c.addEventListener('click', function () {
                if (!img) return;
                var sc = Number(c.getAttribute('data-scale'));
                wIn.value = Math.max(1, Math.round(img.naturalWidth * sc));
                hIn.value = Math.max(1, Math.round(img.naturalHeight * sc));
                touch('Quick scale ' + Math.round(sc * 100) + '%', 0);
            });
        });
        qIn.addEventListener('input', function () {
            $('qualityLabel').textContent = qIn.value + '%';
            touch('Quality moved', 250);
        });
        fmt.addEventListener('change', function () {
            syncControls();
            touch('Format changed', 0);
        });
        live.addEventListener('change', function () {
            log('Live preview ' + (live.checked ? 'on: every change is processed straight away.' : 'off: click Process Image to apply changes.'));
            if (live.checked && dirty) run();
        });
        procBtn.addEventListener('click', function () {
            clearTimeout(timer);
            var s = readSettings();
            log('Process Image clicked.');
            lastLogged = s;
            run();
        });
        dlBtn.addEventListener('click', function () {
            if (!outBlob) return;
            var url = URL.createObjectURL(outBlob);
            var a = document.createElement('a');
            a.href = url;
            a.download = outName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            log('Downloaded ' + outName + ' (' + formatSize(outBlob.size) + ').');
        });
        $('pixelView').addEventListener('change', function (e) {
            document.querySelector('.compare').classList.toggle('pixelated', e.target.checked);
            log(e.target.checked ? 'Showing real pixels as sharp squares.' : 'Smooth preview restored.');
        });

        syncControls();
    })();


    /* =====================================================
       PIXEL LAB
       ===================================================== */
    (function () {
        var n = 8;
        var cells = [];                       /* {r,g,b} per pixel */
        var mode = 'color';                   /* 'color' | 'bw' */
        var tool = 'paint';                   /* 'paint' | 'pick' */
        var brush = { r: 30, g: 136, b: 240 };
        var thr = 128;
        var sel = null;
        var btns = [];
        var painting = false, bwTarget = 1;
        var focusIdx = 0;

        var HEART = [
            '00000000',
            '01100110',
            '11111111',
            '11111111',
            '11111111',
            '01111110',
            '00111100',
            '00011000'
        ];

        var PALETTE = ['#000000', '#ffffff', '#0a1f5c', '#1e88f0', '#bcd9ff', '#6b2df0', '#e5484d', '#f5a524', '#f7d44a', '#2fb36d'];

        var grid = $('pgrid');

        function hex(r, g, b) {
            return '#' + [r, g, b].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
        }
        function parseHex(h) {
            var m = h.replace('#', '');
            return { r: parseInt(m.slice(0, 2), 16), g: parseInt(m.slice(2, 4), 16), b: parseInt(m.slice(4, 6), 16) };
        }
        function bright(c) { return Math.round(0.299 * c.r + 0.587 * c.g + 0.114 * c.b); }
        function bit(c) { return bright(c) >= thr ? 1 : 0; }
        function bin8(v) { return v.toString(2).padStart(8, '0'); }

        /* ---------- building the grid ---------- */
        function sample() {
            cells = [];
            for (var y = 0; y < n; y++) {
                for (var x = 0; x < n; x++) {
                    var on = HEART[Math.floor(y * 8 / n)][Math.floor(x * 8 / n)] === '1';
                    cells.push(on ? { r: 30, g: 136, b: 240 } : { r: 255, g: 255, b: 255 });
                }
            }
            /* one purple pixel, like the logo */
            cells[Math.floor(n * 0.2) * n + Math.floor(n * 0.2)] = { r: 107, g: 45, b: 240 };
        }

        function build() {
            grid.innerHTML = '';
            grid.style.setProperty('--n', n);
            grid.style.setProperty('--fs', n === 8 ? '20px' : n === 12 ? '14px' : '10px');
            btns = [];
            for (var i = 0; i < n * n; i++) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'px';
                b.dataset.i = i;
                b.tabIndex = i === focusIdx ? 0 : -1;
                b.setAttribute('aria-label', 'Pixel column ' + (i % n + 1) + ', row ' + (Math.floor(i / n) + 1));
                grid.appendChild(b);
                btns.push(b);
            }
            render();
        }

        /* ---------- drawing everything ---------- */
        function render() {
            for (var i = 0; i < btns.length; i++) {
                var c = cells[i], b = btns[i];
                if (mode === 'color') {
                    b.style.background = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
                    b.textContent = '';
                } else {
                    var v = bit(c);
                    b.style.background = v ? '#fff' : '#000';
                    b.style.color = v ? '#0a1f5c' : '#fff';
                    b.textContent = v;
                }
                b.classList.toggle('is-sel', i === sel);
            }
            renderInspect();
            renderData();
        }

        function renderInspect() {
            var sw = $('inSw');
            if (sel === null) {
                sw.style.background = '';
                $('inPos').textContent = '-';
                $('inRgb').textContent = '-';
                $('inBin').textContent = 'Click a pixel';
                $('inBinLabel').textContent = mode === 'color' ? '24-bit binary' : '1-bit value';
                return;
            }
            var c = cells[sel];
            $('inPos').textContent = 'column ' + (sel % n + 1) + ', row ' + (Math.floor(sel / n) + 1);
            $('inRgb').textContent = c.r + ', ' + c.g + ', ' + c.b;
            if (mode === 'color') {
                sw.style.background = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
                $('inBinLabel').textContent = '24-bit binary';
                $('inBin').textContent = bin8(c.r) + ' ' + bin8(c.g) + ' ' + bin8(c.b);
            } else {
                var v = bit(c);
                sw.style.background = v ? '#fff' : '#000';
                $('inBinLabel').textContent = '1-bit value';
                $('inBin').textContent = v + '  (brightness ' + bright(c) + (v ? ' \u2265 ' : ' < ') + thr + ')';
            }
        }

        function renderData() {
            var bpp = mode === 'color' ? 24 : 1;
            var total = n * n * bpp;
            $('pPixels').textContent = fmtNum(n * n);
            $('pBits').textContent = bpp;
            $('pTotal').textContent = fmtNum(total);
            $('pBytes').textContent = fmtNum(Math.ceil(total / 8));
            $('dataNote').textContent = mode === 'color'
                ? 'Each pixel = 3 numbers (R, G, B), written in hex.'
                : 'Each pixel = 1 bit. 0 is black, 1 is white.';

            var rows = [];
            for (var y = 0; y < n; y++) {
                var parts = [];
                for (var x = 0; x < n; x++) {
                    var i = y * n + x, c = cells[i];
                    var t = mode === 'color' ? hex(c.r, c.g, c.b).slice(1).toUpperCase() : String(bit(c));
                    parts.push('<span class="tok' + (i === sel ? ' sel' : '') + '">' + t + '</span>');
                }
                rows.push(parts.join(' '));
            }
            $('matrix').innerHTML = rows.join('\n');
        }

        /* ---------- painting ---------- */
        function setCell(i, c) { cells[i] = { r: c.r, g: c.g, b: c.b }; }

        function apply(i, first) {
            if (tool === 'pick' && mode === 'color') {
                if (first) { var c = cells[i]; setBrush(c.r, c.g, c.b); select(i); }
                return;
            }
            if (mode === 'color') {
                setCell(i, brush);
            } else {
                setCell(i, bwTarget ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 });
            }
            sel = i;
        }

        function pixelAt(e) {
            var el = document.elementFromPoint(e.clientX, e.clientY);
            return el && el.classList && el.classList.contains('px') ? Number(el.dataset.i) : null;
        }

        grid.addEventListener('pointerdown', function (e) {
            var i = pixelAt(e);
            if (i === null) return;
            e.preventDefault();
            painting = true;
            try { grid.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            if (mode === 'bw') bwTarget = bit(cells[i]) ? 0 : 1;
            focusIdx = i;
            apply(i, true);
            render();
        });
        grid.addEventListener('pointermove', function (e) {
            if (!painting) return;
            var i = pixelAt(e);
            if (i === null || i === sel) return;
            if (tool === 'pick' && mode === 'color') return;
            apply(i, false);
            render();
        });
        function stop() { painting = false; }
        grid.addEventListener('pointerup', stop);
        grid.addEventListener('pointercancel', stop);

        grid.addEventListener('keydown', function (e) {
            var i = Number(e.target.dataset.i);
            if (isNaN(i)) return;
            var x = i % n, y = Math.floor(i / n), j = i;
            if (e.key === 'ArrowRight') x = Math.min(n - 1, x + 1);
            else if (e.key === 'ArrowLeft') x = Math.max(0, x - 1);
            else if (e.key === 'ArrowDown') y = Math.min(n - 1, y + 1);
            else if (e.key === 'ArrowUp') y = Math.max(0, y - 1);
            else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (mode === 'bw') bwTarget = bit(cells[i]) ? 0 : 1;
                apply(i, true);
                render();
                btns[i].focus();
                return;
            } else return;
            e.preventDefault();
            j = y * n + x;
            btns[focusIdx].tabIndex = -1;
            focusIdx = j;
            btns[j].tabIndex = 0;
            btns[j].focus();
        });

        function select(i) { sel = i; }

        /* ---------- brush ---------- */
        function setBrush(r, g, b) {
            brush = { r: r, g: g, b: b };
            var h = hex(r, g, b);
            $('pickColor').value = h;
            $('hexOut').textContent = h.toUpperCase();
            $('rR').value = r; $('rG').value = g; $('rB').value = b;
            $('oR').textContent = r; $('oG').textContent = g; $('oB').textContent = b;
            Array.prototype.forEach.call($('palette').children, function (s) {
                s.classList.toggle('is-on', s.dataset.hex === h);
            });
        }

        $('pickColor').addEventListener('input', function (e) {
            var c = parseHex(e.target.value);
            setBrush(c.r, c.g, c.b);
        });
        ['rR', 'rG', 'rB'].forEach(function (id) {
            $(id).addEventListener('input', function () {
                setBrush(Number($('rR').value), Number($('rG').value), Number($('rB').value));
            });
        });
        PALETTE.forEach(function (h) {
            var s = document.createElement('button');
            s.type = 'button';
            s.className = 'sw';
            s.dataset.hex = h;
            s.style.background = h;
            s.setAttribute('aria-label', 'Use colour ' + h);
            s.addEventListener('click', function () {
                var c = parseHex(h);
                setBrush(c.r, c.g, c.b);
                setTool('paint');
            });
            $('palette').appendChild(s);
        });

        /* ---------- tool + mode ---------- */
        function setTool(t) {
            tool = t;
            $('toolPaint').classList.toggle('is-on', t === 'paint');
            $('toolPick').classList.toggle('is-on', t === 'pick');
            $('toolPaint').setAttribute('aria-pressed', t === 'paint');
            $('toolPick').setAttribute('aria-pressed', t === 'pick');
            hint();
        }
        $('toolPaint').addEventListener('click', function () { setTool('paint'); });
        $('toolPick').addEventListener('click', function () { setTool('pick'); });

        function hint() {
            $('paintHint').textContent = mode === 'bw'
                ? 'Click or drag to flip squares between black (0) and white (1).'
                : (tool === 'pick'
                    ? 'Click a square to copy its colour into the brush.'
                    : 'Click or drag across the squares to paint with the brush colour.');
        }

        function setMode(m) {
            mode = m;
            $('modeColor').classList.toggle('is-on', m === 'color');
            $('modeBW').classList.toggle('is-on', m === 'bw');
            $('modeColor').setAttribute('aria-pressed', m === 'color');
            $('modeBW').setAttribute('aria-pressed', m === 'bw');
            $('colorTools').hidden = m !== 'color';
            $('bwTools').hidden = m !== 'bw';
            hint();
            render();
        }
        $('modeColor').addEventListener('click', function () { setMode('color'); });
        $('modeBW').addEventListener('click', function () { setMode('bw'); });

        $('threshold').addEventListener('input', function (e) {
            thr = Number(e.target.value);
            $('oT').textContent = thr;
            render();
        });

        /* ---------- buttons ---------- */
        $('gridSize').addEventListener('change', function (e) {
            var m = Number(e.target.value), old = cells, on = n, next = [];
            for (var y = 0; y < m; y++) {
                for (var x = 0; x < m; x++) {
                    var c = old[Math.floor(y * on / m) * on + Math.floor(x * on / m)];
                    next.push({ r: c.r, g: c.g, b: c.b });
                }
            }
            n = m; cells = next; sel = null; focusIdx = 0;
            build();
        });
        $('btnSample').addEventListener('click', function () { sample(); sel = null; render(); });
        $('btnClear').addEventListener('click', function () {
            cells = cells.map(function () { return { r: 255, g: 255, b: 255 }; });
            sel = null; render();
        });
        $('btnInvert').addEventListener('click', function () {
            cells = cells.map(function (c) { return { r: 255 - c.r, g: 255 - c.g, b: 255 - c.b }; });
            render();
        });
        $('btnRandom').addEventListener('click', function () {
            cells = cells.map(function () {
                if (mode === 'bw') { var v = Math.random() < 0.5 ? 0 : 255; return { r: v, g: v, b: v }; }
                return {
                    r: Math.floor(Math.random() * 256),
                    g: Math.floor(Math.random() * 256),
                    b: Math.floor(Math.random() * 256)
                };
            });
            render();
        });

        sample();
        setBrush(30, 136, 240);
        build();
        hint();
    })();


    /* =====================================================
       QUIZ
       A bank of questions. Each round draws ROUND of them at random,
       shuffles the answer order, and prefers questions you haven't
       seen yet, so "Try again" gives you a fresh set.
       t = topic, q = question, o = options, a = index of the right one
       ===================================================== */
    (function () {
        var ROUND = 10;

        var BANK = [
            /* ---- Pixels and resolution ---- */
            { t: 'Pixels', q: 'What are the tiny squares that make up a digital image called?', o: ['Files', 'Pixels', 'Folders'], a: 1,
              why: 'Pixels are the smallest picture elements. Your whole image is a grid of them.' },
            { t: 'Pixels', q: 'The word "pixel" is short for which phrase?', o: ['Picture element', 'Pixel element', 'Print cell'], a: 0,
              why: 'Pixel comes from "picture element", the smallest part of a digital picture.' },
            { t: 'Pixels', q: 'What does the resolution of an image tell you?', o: ['How bright it is', 'How many pixels it has', 'How many colours it uses in total'], a: 1,
              why: 'Resolution is the number of pixels in an image, usually written as width × height.' },
            { t: 'Pixels', q: 'An image is 8 pixels wide and 8 pixels tall. How many pixels is that in total?', o: ['16', '64', '88'], a: 1,
              why: 'Total pixels = width × height, so 8 × 8 = 64.' },
            { t: 'Pixels', q: 'A photo is 1920 × 1080 pixels. About how many pixels is that?', o: ['About 2 million', 'About 200 thousand', 'About 20 million'], a: 0,
              why: '1920 × 1080 = 2,073,600 pixels, which is about 2 megapixels.' },
            { t: 'Pixels', q: 'What does one megapixel mean?', o: ['One thousand pixels', 'One million pixels', 'One billion pixels'], a: 1,
              why: 'Mega means million, so one megapixel is about one million pixels.' },
            { t: 'Pixels', q: 'What usually happens when you enlarge a small image a lot?', o: ['It becomes sharper', 'It looks blocky or blurry', 'It gains new colours'], a: 1,
              why: 'Enlarging stretches the same pixels over a bigger area. No real new detail is created.' },
            { t: 'Pixels', q: 'What is "aspect ratio"?', o: ['The ratio of width to height', 'The number of colours in an image', 'The file size divided by the width'], a: 0,
              why: 'Aspect ratio describes the shape of an image, such as 4:3 or 16:9.' },
            { t: 'Pixels', q: 'You resize an 800 × 600 image to a width of 400 and keep the aspect ratio. What should the height be?', o: ['200', '300', '600'], a: 1,
              why: 'The width was halved, so the height is halved too: 600 ÷ 2 = 300.' },
            { t: 'Pixels', q: 'What happens if you change only the width of an image and leave the height alone?', o: ['It looks stretched or squashed', 'Nothing changes', 'The file gets more colours'], a: 0,
              why: 'Changing one side without the other breaks the aspect ratio and distorts the picture.' },
            { t: 'Pixels', q: 'What does resizing an image to be smaller do to its pixel count?', o: ['It lowers it', 'It raises it', 'It keeps it the same'], a: 0,
              why: 'A smaller width and height means fewer pixels in total.' },
            { t: 'Pixels', q: 'What does PPI stand for?', o: ['Pictures per image', 'Pixels per inch', 'Points per icon'], a: 1,
              why: 'PPI measures how many pixels fit in one inch of a screen or print.' },
            { t: 'Pixels', q: 'What is a raster (bitmap) image made of?', o: ['A grid of pixels', 'Lines and curves described by maths', 'Only text'], a: 0,
              why: 'Raster images store a colour for every pixel in a grid. Photos are raster images.' },
            { t: 'Pixels', q: 'Which kind of image is built from shapes and maths instead of pixels, so it can scale without going blocky?', o: ['Raster', 'Vector', 'Binary'], a: 1,
              why: 'Vector images, such as SVG files, store shapes and paths, so they stay sharp at any size.' },

            /* ---- Colour ---- */
            { t: 'Colour', q: 'What does RGB stand for?', o: ['Red, Green, Blue', 'Read, Graph, Build', 'Resolution, Grid, Binary'], a: 0,
              why: 'Mixing different amounts of red, green and blue light makes every colour on a screen.' },
            { t: 'Colour', q: 'What colour is the RGB value (0, 0, 0)?', o: ['White', 'Black', 'Red'], a: 1,
              why: 'Zero light in all three channels means no light at all, which is black.' },
            { t: 'Colour', q: 'What colour is the RGB value (255, 255, 255)?', o: ['White', 'Black', 'Grey'], a: 0,
              why: 'All three channels at full strength add up to white light.' },
            { t: 'Colour', q: 'What colour is the RGB value (255, 0, 0)?', o: ['Green', 'Blue', 'Red'], a: 2,
              why: 'Red is at its maximum while green and blue are off, so the pixel is pure red.' },
            { t: 'Colour', q: 'Mixing full red and full green light, (255, 255, 0), gives which colour?', o: ['Purple', 'Yellow', 'Cyan'], a: 1,
              why: 'On a screen, red light plus green light looks yellow.' },
            { t: 'Colour', q: 'When red, green and blue all have the same value, such as (120, 120, 120), the colour is a shade of what?', o: ['Grey', 'Purple', 'Orange'], a: 0,
              why: 'Equal amounts of R, G and B give a neutral grey, from black up to white.' },
            { t: 'Colour', q: 'In the hex colour #1E88F0, which channel does the middle pair "88" control?', o: ['Red', 'Green', 'Blue'], a: 1,
              why: 'A hex colour is read as #RRGGBB, so the middle pair is the green value.' },
            { t: 'Colour', q: 'The hex colour #FF0000 is which colour?', o: ['Red', 'Green', 'Blue'], a: 0,
              why: 'FF is 255 in hex. Red is full and green and blue are 00, so it is pure red.' },
            { t: 'Colour', q: 'How many channel values make up one RGB colour?', o: ['Two', 'Three', 'Four'], a: 1,
              why: 'One value each for red, green and blue.' },
            { t: 'Colour', q: 'What does the alpha channel in an image store?', o: ['Transparency', 'Sound', 'File name'], a: 0,
              why: 'Alpha says how see-through each pixel is. PNG files can include it.' },
            { t: 'Colour', q: 'Which colour model do printers commonly use instead of RGB?', o: ['CMYK', 'HTML', 'USB'], a: 0,
              why: 'Printers mix cyan, magenta, yellow and black ink. Screens mix red, green and blue light.' },
            { t: 'Colour', q: 'In 24-bit colour, how many different values can the red channel have?', o: ['2', '256', '24'], a: 1,
              why: 'Each channel uses 8 bits, which gives 256 values from 0 to 255. Three channels make 24 bits.' },
            { t: 'Colour', q: 'About how many different colours can 24-bit RGB show?', o: ['About 256', 'About 65 thousand', 'About 16.7 million'], a: 2,
              why: '256 × 256 × 256 = 16,777,216 possible colours.' },
            { t: 'Colour', q: 'How many shades of grey can an 8-bit grayscale image show?', o: ['2', '256', '8'], a: 1,
              why: 'Eight bits give 2⁸ = 256 levels, from 0 (black) to 255 (white).' },
            { t: 'Colour', q: 'A higher bit depth means each pixel can be what?', o: ['One of more possible colours', 'Smaller on screen', 'Always transparent'], a: 0,
              why: 'More bits per pixel means more possible values, so smoother colours and gradients.' },

            /* ---- Data and binary ---- */
            { t: 'Data', q: 'Which digits does binary use?', o: ['1 and 2', '0 and 9', '0 and 1'], a: 2,
              why: 'Computers store everything as bits, and a bit is either 0 or 1.' },
            { t: 'Data', q: 'What is the smallest unit of data in a computer?', o: ['Byte', 'Bit', 'Pixel'], a: 1,
              why: 'A bit holds a single 0 or 1. Eight bits make one byte.' },
            { t: 'Data', q: 'How many bits are in one byte?', o: ['4', '8', '16'], a: 1,
              why: 'One byte is 8 bits, enough for 256 different values.' },
            { t: 'Data', q: 'How many different values can 3 bits store?', o: ['3', '6', '8'], a: 2,
              why: 'Each extra bit doubles the options: 2 × 2 × 2 = 8.' },
            { t: 'Data', q: 'How many colours can one pixel show in a 1-bit, black and white image?', o: ['Two', 'Eight', '256'], a: 0,
              why: 'One bit has two states: 0 for black and 1 for white.' },
            { t: 'Data', q: 'Why does a computer turn an image into numbers?', o: ['It can only store and process data as numbers (binary)', 'Numbers are prettier than colours', 'Images are already numbers on paper'], a: 0,
              why: 'Computers work with binary, so every pixel colour has to be written as numbers before it can be stored.' },
            { t: 'Data', q: 'In an uncompressed 24-bit image, how many bytes does one pixel use?', o: ['1', '3', '24'], a: 1,
              why: '24 bits ÷ 8 = 3 bytes, one byte each for red, green and blue.' },
            { t: 'Data', q: 'An uncompressed 24-bit image is 10 × 10 pixels. How many bytes of pixel data is that?', o: ['30', '100', '300'], a: 2,
              why: '10 × 10 = 100 pixels, and each pixel uses 3 bytes, so 100 × 3 = 300 bytes.' },
            { t: 'Data', q: 'A 100 × 100 pixel, 1-bit black and white image needs how many bits for its pixels?', o: ['100', '10,000', '1,000,000'], a: 1,
              why: '100 × 100 = 10,000 pixels, and each needs one bit.' },
            { t: 'Data', q: 'Doubling both the width and the height of an image multiplies its pixel count by what?', o: ['2', '4', '8'], a: 1,
              why: 'Twice as wide and twice as tall gives 2 × 2 = 4 times as many pixels.' },

            /* ---- Compression and file formats ---- */
            { t: 'Files', q: 'What is the main purpose of image compression?', o: ['To reduce the file size', 'To add more colours', 'To make the image taller'], a: 0,
              why: 'Compression makes files smaller so they are easier to store and share.' },
            { t: 'Files', q: 'What does lossy compression do?', o: ['Permanently throws away some image data', 'Keeps every bit exactly', 'Adds extra pixels'], a: 0,
              why: 'Lossy compression, like JPEG, removes detail that is hard to notice to make the file much smaller.' },
            { t: 'Files', q: 'What is special about lossless compression?', o: ['The original can be restored exactly', 'It always makes the smallest file', 'It only works on black and white images'], a: 0,
              why: 'Lossless compression packs the data smaller but can unpack it back to exactly the original.' },
            { t: 'Files', q: 'Which common format is usually the best fit for photos when you want a small file?', o: ['JPEG', 'TXT', 'ZIP'], a: 0,
              why: 'JPEG compresses photographs very well, which is why it is so common online.' },
            { t: 'Files', q: 'Which format keeps sharp edges and supports transparency, making it good for logos and screenshots?', o: ['JPEG', 'PNG', 'MP3'], a: 1,
              why: 'PNG uses lossless compression and can store an alpha channel.' },
            { t: 'Files', q: 'Which of these image formats uses lossless compression?', o: ['PNG', 'JPEG at low quality', 'None of them'], a: 0,
              why: 'PNG never throws away pixel data. JPEG usually does.' },
            { t: 'Files', q: 'What happens to a JPEG if you open it, edit it, and re-save it as JPEG again and again?', o: ['Quality slowly gets worse', 'It gets sharper', 'Nothing ever changes'], a: 0,
              why: 'Each lossy save discards a little more detail, and the damage builds up.' },
            { t: 'Files', q: 'You lower the quality setting when saving a JPEG. What usually happens?', o: ['Smaller file, more visible artifacts', 'Bigger file, fewer colours', 'The pixel count doubles'], a: 0,
              why: 'Lower quality means stronger compression: a smaller file but blocky or smudgy areas.' },
            { t: 'Files', q: 'A GIF image can use at most how many colours?', o: ['16', '256', 'About 16.7 million'], a: 1,
              why: 'GIF is limited to a palette of 256 colours, which suits simple graphics and short animations.' },
            { t: 'Files', q: 'The WebP format can do which of these?', o: ['Both lossy and lossless compression', 'Only lossless', 'Neither'], a: 0,
              why: 'WebP supports both, plus transparency, which often makes files smaller than JPEG or PNG.' },
            { t: 'Files', q: 'Which file is normally smaller for the same photo?', o: ['A compressed JPEG', 'An uncompressed bitmap (BMP)', 'They are always equal'], a: 0,
              why: 'A BMP stores every pixel in full, while JPEG compresses the data.' }
        ];

        var LETTERS = ['A', 'B', 'C', 'D'];
        var seen = {};                 // indexes already asked, so retries feel new
        var round = [];                // this round's questions, options already shuffled
        var idx = 0, answers = [];
        var body = $('quizBody'), bar = $('qBar');

        function shuffle(arr) {
            var a = arr.slice();
            for (var i = a.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var t = a[i]; a[i] = a[j]; a[j] = t;
            }
            return a;
        }

        function newRound() {
            var all = BANK.map(function (_, i) { return i; });
            var fresh = all.filter(function (i) { return !seen[i]; });

            /* not enough unseen questions left: start the cycle again */
            if (fresh.length < ROUND) { seen = {}; fresh = all; }

            var picked = shuffle(fresh).slice(0, ROUND);
            picked.forEach(function (i) { seen[i] = true; });

            round = picked.map(function (i) {
                var item = BANK[i];
                var order = shuffle(item.o.map(function (_, k) { return k; }));
                return {
                    t: item.t,
                    q: item.q,
                    why: item.why,
                    o: order.map(function (k) { return item.o[k]; }),
                    a: order.indexOf(item.a)
                };
            });
            idx = 0;
            answers = [];
        }

        function el(tag, cls, text) {
            var e = document.createElement(tag);
            if (cls) e.className = cls;
            if (text !== undefined) e.textContent = text;
            return e;
        }

        function showQuestion() {
            var item = round[idx];
            body.innerHTML = '';
            bar.style.width = (idx / round.length * 100) + '%';

            body.appendChild(el('p', 'qmeta', 'Question ' + (idx + 1) + ' of ' + round.length + '  \u00B7  ' + item.t));
            body.appendChild(el('h2', 'qtext', item.q));

            var list = el('div', 'opts');
            list.setAttribute('role', 'group');
            list.setAttribute('aria-label', 'Answers');
            var btns = item.o.map(function (text, i) {
                var b = el('button', 'opt');
                b.type = 'button';
                b.appendChild(el('span', 'key', LETTERS[i]));
                b.appendChild(el('span', 'label', text));
                b.addEventListener('click', function () { choose(i, btns, item); });
                list.appendChild(b);
                return b;
            });
            body.appendChild(list);
        }

        function choose(i, btns, item) {
            var right = i === item.a;
            answers[idx] = right;
            btns.forEach(function (b, k) {
                b.disabled = true;
                if (k === item.a) {
                    b.classList.add('is-right');
                    b.appendChild(el('em', '', 'Correct'));
                } else if (k === i) {
                    b.classList.add('is-wrong');
                    b.appendChild(el('em', '', 'Not quite'));
                }
            });

            var fb = el('div', 'feedback' + (right ? '' : ' bad'));
            fb.setAttribute('role', 'status');
            fb.appendChild(el('strong', '', right ? 'Correct.' : 'Not quite. The answer is ' + LETTERS[item.a] + '.'));
            fb.appendChild(el('span', '', item.why));
            body.appendChild(fb);

            var last = idx === round.length - 1;
            var next = el('button', 'btn', last ? 'See my score' : 'Next question');
            next.type = 'button';
            next.addEventListener('click', function () {
                if (last) showResult(); else { idx++; showQuestion(); }
            });
            body.appendChild(next);
            next.focus();
        }

        function showResult() {
            bar.style.width = '100%';
            var score = answers.filter(Boolean).length;
            var total = round.length;
            body.innerHTML = '';
            body.appendChild(el('p', 'qmeta', 'Your result'));
            body.appendChild(el('p', 'score', score + ' / ' + total));
            body.appendChild(el('p', 'score-msg',
                score === total ? 'Perfect. You know how an image becomes data.' :
                score >= total * 0.7 ? 'Nice work. Look at the ones you missed, then try the Pixel Lab again.' :
                'Good start. Play with the Pixel Lab and the Image Lab, then try again.'));

            var ul = el('ul', 'review');
            round.forEach(function (item, i) {
                var li = el('li', answers[i] ? 'ok' : 'no');
                li.appendChild(el('span', '', item.q));
                li.appendChild(el('b', '', answers[i] ? 'Correct' : 'Review'));
                ul.appendChild(li);
            });
            body.appendChild(ul);

            var again = el('button', 'btn', 'New random round');
            again.type = 'button';
            again.addEventListener('click', function () { newRound(); showQuestion(); });
            body.appendChild(again);
        }

        newRound();
        showQuestion();
    })();

})();
