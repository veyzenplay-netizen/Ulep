/* ULEP Guide: a built-in helper that answers questions about this website.
   It is not a full AI. It matches keywords to ready-made answers, so it only
   knows ULEP topics (pixels, colour, binary, image editing, how to use the tools). */
(function () {
    'use strict';

    var onTool = !!document.getElementById('panel-image');

    /* ---------- knowledge base ---------- */
    /* k: keywords (a word-start match is enough, "pixel" also matches "pixels")
       a: answer text, or a function returning text
       go: optional shortcut buttons   next: optional follow-up suggestions */
    var KB = [
        { id: 'greet', k: ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'yo'],
          a: 'Hello! I am the ULEP Guide. Ask me about pixels, colours, binary, or how to use the Image Lab, Pixel Lab and Quiz.' },

        { id: 'thanks', k: ['thanks', 'thank you', 'salamat', 'ok thanks'],
          a: 'You are welcome! Ask me anything else about ULEP.' },

        { id: 'bot', k: ['are you ai', 'are you a bot', 'are you real', 'who are you', 'what are you', 'chatbot'],
          a: 'I am the ULEP Guide, a helper built into this website. I am not a full AI. I use ready-made answers, so I only know ULEP topics like images, pixels and how the tools work.' },

        { id: 'ulep', k: ['what is ulep', 'about ulep', 'ulep mean', 'this website', 'this site', 'purpose'],
          a: 'ULEP is a student project that makes digital image to data conversion easier to understand. You can edit images (resize, compress, change format) and learn how pixels, colours and binary work.',
          go: [{ l: 'Try the tools', t: 'tool' }] },

        { id: 'howto', k: ['how to use', 'how do i use', 'how it works', 'get started', 'start', 'steps', 'guide me', 'help'],
          a: 'Quick start:\n1. Open Image Lab and choose an image.\n2. Change width, height, quality or format. The result updates live.\n3. Watch "What is happening" to see each step.\n4. Click Download to save it.\n\nWant to learn how it works inside? Try the Pixel Lab.',
          go: [{ l: 'Open Image Lab', t: 'image' }, { l: 'Open Pixel Lab', t: 'pixel' }] },

        { id: 'upload', k: ['upload', 'choose image', 'choose file', 'add image', 'drag', 'drop', 'open image', 'select image', 'supported', 'file type'],
          a: 'In the Image Lab, click "Choose image" or drop a picture onto the Original preview. PNG, JPEG, WebP and other formats your browser can open will work.',
          go: [{ l: 'Open Image Lab', t: 'image' }] },

        { id: 'resize', k: ['resize', 'width', 'height', 'aspect', 'ratio', 'stretch', 'scale', 'smaller image', 'bigger image', 'dimension'],
          a: 'Resizing changes the number of pixels. Type a new width or height in pixels (1 to 8000). "Keep aspect ratio" moves both together so the picture is not stretched. Quick scale buttons set 10%, 25%, 50% or 100% in one click.' },

        { id: 'quality', k: ['quality', 'slider', 'blurry', 'sharp'],
          a: 'The quality slider controls how much detail JPEG and WebP keep. Lower quality gives a smaller file but more blur and blocky patches. PNG is lossless, so the slider is switched off for it.' },

        { id: 'formats', k: ['format', 'jpeg', 'jpg', 'png', 'webp', 'difference between'],
          a: 'JPEG: small files for photos, loses a little detail, no transparency.\nPNG: keeps every pixel exactly (lossless) and supports transparency, but files are bigger.\nWebP: modern format, usually smaller than both and can do lossy or lossless.' },

        { id: 'compress', k: ['compress', 'lossy', 'lossless', 'reduce size', 'reduce file', 'make smaller', 'file size', 'smaller file'],
          a: 'Compression makes a file smaller. Lossless (PNG) stores the same pixels in less space. Lossy (JPEG, WebP) throws away detail your eyes barely notice. To shrink a file in ULEP: lower the width and height, lower the quality, or switch to WebP.' },

        { id: 'bigger', k: ['bigger', 'larger', 'increased', 'got bigger', 'file bigger', 'size went up', 'more kb'],
          a: 'A file can grow if you: switch a JPEG photo to PNG (lossless is bigger), raise quality to 100%, or enlarge the image so it has more pixels. Check the Change number in "What is happening".' },

        { id: 'download', k: ['download', 'save image', 'save result', 'export'],
          a: 'After the result appears, click Download at the top of the Image Lab. The file is named after your original with "-ulep" added.' },

        { id: 'live', k: ['live preview', 'process image', 'process button', 'not updating', 'doesnt update', "doesn't update", 'automatic'],
          a: 'With Live preview on, every change is processed straight away. Turn it off if you want to set several things first, then click "Process Image" to apply them. A purple glow on the button means changes are waiting.' },

        { id: 'process', k: ['what is happening', 'pipeline', 'read resize', 'encode', 'draw pixels', 'process steps', 'how is it processed'],
          a: 'Each time you process, ULEP does five steps:\n1. Read: loads your picture and counts its pixels.\n2. Resize: works out the new width and height.\n3. Draw pixels: paints the new grid of pixels on a canvas.\n4. Encode: packs them into JPEG, PNG or WebP.\n5. Result: shows the final file size.' },

        { id: 'raw', k: ['raw data', 'raw size', 'uncompressed', 'how many bytes', 'calculate size'],
          a: 'Raw data = width x height x 3 bytes (one byte each for red, green and blue). A 1000 x 1000 image has 1,000,000 pixels and about 3 MB of raw data. The file is smaller because encoding compresses it.' },

        { id: 'realpix', k: ['real pixels', 'sharp squares', 'pixelated', 'see pixels', 'zoom'],
          a: 'Tick "Show real pixels" under the previews. Small images then show as crisp squares instead of smooth blur. Try Quick scale 10% to see it clearly.' },

        { id: 'pixel', k: ['what is a pixel', 'pixel mean', 'pixels', 'pixel'],
          a: 'A pixel is the smallest square of a digital image. Your screen shows a grid of them, and each one holds a colour. Zoom in far enough and any picture breaks into squares.',
          go: [{ l: 'Open Pixel Lab', t: 'pixel' }] },

        { id: 'resolution', k: ['resolution', 'megapixel', 'hd', '1080', '4k'],
          a: 'Resolution is how many pixels an image has, written width x height. For example, 1920 x 1080 is 2,073,600 pixels. More pixels means more detail and a bigger file.' },

        { id: 'rgb', k: ['rgb', 'red green blue', 'colour model', 'color model', 'how colours', 'how colors', 'mix colour', 'mix color'],
          a: 'Screens make every colour by mixing red, green and blue light. Each of the three gets a number from 0 to 255. (255, 0, 0) is red, (0, 0, 0) is black and (255, 255, 255) is white.',
          go: [{ l: 'Try it in Pixel Lab', t: 'pixel' }] },

        { id: 'binary', k: ['binary', 'bit', 'bits', 'byte', 'bytes', '0 and 1', 'zeros and ones', '24-bit', '24 bit'],
          a: 'A bit is a 0 or a 1. Eight bits make one byte, which can hold a number from 0 to 255. A colour pixel uses 3 bytes (24 bits), one for red, one for green and one for blue. That gives 256 x 256 x 256 = 16,777,216 colours.',
          go: [{ l: 'See it in Pixel Lab', t: 'pixel' }] },

        { id: 'hex', k: ['hex', 'hexadecimal', '#1e88f0', 'colour code', 'color code'],
          a: 'Hex is a short way to write RGB. #1E88F0 means red = 1E, green = 88, blue = F0. In decimal that is 30, 136, 240. The Pixel Lab data panel shows pixels in hex.' },

        { id: 'onebit', k: ['1-bit', '1 bit', 'black and white', 'black white', 'monochrome', 'threshold', 'cut-off', 'cutoff', 'brightness'],
          a: 'In black and white mode each pixel keeps just 1 bit: 0 = black, 1 = white. The brightness cut-off decides which colours turn white: brighter than the cut-off becomes 1, the rest becomes 0. That is why the file is tiny: 64 pixels need only 8 bytes.',
          go: [{ l: 'Open Pixel Lab', t: 'pixel' }] },

        { id: 'pixellab', k: ['pixel lab', 'paint', 'brush', 'palette', 'pick colour', 'pick color', 'draw', 'grid size', 'sample', 'invert', 'random'],
          a: 'In Pixel Lab: pick a brush colour (colour box, RGB sliders or palette), then click or drag on the grid to paint. "Pick colour" copies a colour from a square. Sample loads a heart, Random fills with random colours, Invert flips colours. The panel below shows the numbers behind your picture.',
          go: [{ l: 'Open Pixel Lab', t: 'pixel' }] },

        { id: 'quiz', k: ['quiz', 'test', 'questions', 'score', 'exam', 'answer'],
          a: 'The Quiz has 5 short questions with instant feedback and a score at the end. Stuck? Try the Pixel Lab first, then ask me about pixels, RGB or binary.',
          go: [{ l: 'Open Quiz', t: 'quiz' }] },

        { id: 'privacy', k: ['privacy', 'private', 'safe', 'upload server', 'stored', 'secure', 'does it save'],
          a: 'Your image is processed in your own browser. It is not sent to a server by ULEP. Still, avoid using private or sensitive pictures and make sure you have permission to use the image.' },

        { id: 'limit', k: ['error', 'not working', 'problem', 'cannot', "can't", 'fail', 'too large', 'maximum', 'limit', '8000'],
          a: 'Common fixes: width and height must be whole numbers from 1 to 8000. Very large sizes can fail on phones, so try a smaller size. Make sure the file is a real image (PNG, JPEG, WebP). If a step turns purple in "What is happening", it shows what went wrong.' },

        { id: 'team', k: ['team', 'members', 'who made', 'who created', 'developer', 'leader', 'creator', 'group'],
          a: 'Team ULEP: Henzel Mark Galvesolo (Leader / Website Director / QA), Angelbert Gido (Lead Developer), Sabina Go (Lead Graphics Designer), Jayana Equito (Developer / QA) and Nathaniel Lizare (Graphics Designer).' },

        { id: 'school', k: ['school', 'course', 'subject', 'bsis', 'college', 'bacolod'],
          a: 'ULEP is an educational project from Bacolod City College, BSIS - ACT - 1D, for COMP 1 - Introduction to Computing.' },

        { id: 'disclaimer', k: ['disclaimer', 'professional', 'permission', 'copyright'],
          a: 'ULEP is for learning, not a replacement for professional image software. Results vary by image and settings, and resizing or compression can lower quality. Only use images you have permission to use.' },

        { id: 'myimage', k: ['my image', 'my picture', 'my photo', 'image size', 'how big is', 'current image', 'my result', 'my file'],
          a: function () {
              var o = document.getElementById('origMeta'), r = document.getElementById('resMeta');
              if (!o || !/\d/.test(o.textContent)) {
                  return 'No image is loaded yet. Open Image Lab and choose one, then ask me again.';
              }
              return 'Your original is ' + o.textContent + '. ' +
                  (r && /\d/.test(r.textContent) ? 'The processed result is ' + r.textContent + '.' : 'It has not been processed yet.');
          },
          go: [{ l: 'Open Image Lab', t: 'image' }] }
    ];

    var CHIPS_TOOL = {
        image: ['How do I use Image Lab?', 'Why is my file bigger?', 'JPEG vs PNG vs WebP', 'What is happening?'],
        pixel: ['What is a pixel?', 'What is RGB?', 'What is a bit?', 'What is black and white mode?'],
        quiz: ['What is binary?', 'What does RGB mean?', 'What is a pixel?']
    };
    var CHIPS_HOME = ['What is ULEP?', 'How do I use it?', 'What is a pixel?', 'Who made ULEP?'];

    /* ---------- matching ---------- */
    function norm(s) {
        return ' ' + s.toLowerCase().replace(/[^a-z0-9#'\- ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
    }

    function find(text) {
        var t = norm(text), best = null, bestScore = 0;
        KB.forEach(function (e) {
            var score = 0;
            e.k.forEach(function (kw) {
                var k = kw.length <= 3 ? norm(kw) : norm(kw).trimEnd();   /* short words must match whole; others match word start */
                if (t.indexOf(k) !== -1) score += kw.split(' ').length + 0.01 * kw.length;
            });
            if (score > bestScore) { bestScore = score; best = e; }
        });
        return best;
    }

    /* ---------- building the widget ---------- */
    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    var launcher = el('button', 'ug-launch');
    launcher.type = 'button';
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-controls', 'ugPanel');
    launcher.innerHTML = '<span class="ug-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>Ask ULEP Guide</span>';

    var panel = el('section', 'ug-panel');
    panel.id = 'ugPanel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'ULEP Guide');

    var head = el('header', 'ug-head');
    var title = el('div', 'ug-title');
    title.appendChild(el('strong', '', 'ULEP Guide'));
    title.appendChild(el('span', '', 'Answers about this website'));
    var close = el('button', 'ug-close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close guide');
    close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    head.appendChild(title);
    head.appendChild(close);

    var log = el('div', 'ug-log');
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');

    var chips = el('div', 'ug-chips');

    var form = el('form', 'ug-form');
    var input = el('input');
    input.type = 'text';
    input.placeholder = 'Ask about pixels, colours, tools...';
    input.setAttribute('aria-label', 'Type your question');
    input.maxLength = 200;
    input.autocomplete = 'off';
    var send = el('button', '', 'Send');
    send.type = 'submit';
    form.appendChild(input);
    form.appendChild(send);

    panel.appendChild(head);
    panel.appendChild(log);
    panel.appendChild(chips);
    panel.appendChild(form);
    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    /* ---------- messages ---------- */
    function scroll() { log.scrollTop = log.scrollHeight; }

    function addUser(text) {
        log.appendChild(el('p', 'ug-msg ug-user', text));
        scroll();
    }

    function go(target) {
        if (onTool) {
            if (target === 'tool') target = 'image';
            var tab = document.getElementById('tab-' + target);
            if (tab) tab.click();
            panel.hidden = false;
        } else if (target === 'learning') {
            location.hash = '#learning';
        } else {
            location.href = 'pixel-to-data.html#' + (target === 'tool' ? 'image' : target);
        }
    }

    function addBot(text, actions) {
        var wrap = el('div', 'ug-msg ug-bot');
        text.split('\n').forEach(function (line, i) {
            if (i > 0) wrap.appendChild(document.createElement('br'));
            wrap.appendChild(document.createTextNode(line));
        });
        if (actions && actions.length) {
            var row = el('div', 'ug-actions');
            actions.forEach(function (a) {
                var b = el('button', '', a.l);
                b.type = 'button';
                b.addEventListener('click', function () { go(a.t); });
                row.appendChild(b);
            });
            wrap.appendChild(row);
        }
        log.appendChild(wrap);
        scroll();
    }

    function ask(text) {
        text = text.trim();
        if (!text) return;
        addUser(text);

        var typing = el('p', 'ug-msg ug-bot ug-typing', '...');
        typing.setAttribute('aria-hidden', 'true');
        log.appendChild(typing);
        scroll();

        setTimeout(function () {
            typing.remove();
            var hit = find(text);
            if (hit) {
                addBot(typeof hit.a === 'function' ? hit.a() : hit.a, hit.go);
            } else {
                addBot('I am not sure about that one. I can help with pixels, resolution, RGB colours, binary, image formats and compression, and how to use the Image Lab, Pixel Lab and Quiz. Try one of the questions below.');
            }
        }, 350);
    }

    /* ---------- suggestions follow the open tool ---------- */
    function currentTab() {
        var t = document.querySelector('.tab.is-active');
        return t ? t.getAttribute('data-tab') : 'image';
    }
    function showChips() {
        var list = onTool ? (CHIPS_TOOL[currentTab()] || CHIPS_TOOL.image) : CHIPS_HOME;
        chips.innerHTML = '';
        list.forEach(function (q) {
            var b = el('button', '', q);
            b.type = 'button';
            b.addEventListener('click', function () { ask(q); });
            chips.appendChild(b);
        });
    }

    /* ---------- open / close ---------- */
    var greeted = false;
    function open() {
        panel.hidden = false;
        launcher.hidden = true;
        launcher.setAttribute('aria-expanded', 'true');
        showChips();
        if (!greeted) {
            greeted = true;
            addBot('Hi! I am the ULEP Guide. I can explain pixels, colours and binary, and show you how to use the tools. What would you like to know?');
        }
        input.focus();
    }
    function shut() {
        panel.hidden = true;
        launcher.hidden = false;
        launcher.setAttribute('aria-expanded', 'false');
        launcher.focus();
    }

    launcher.addEventListener('click', open);
    close.addEventListener('click', shut);
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') shut(); });
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = input.value;
        input.value = '';
        ask(v);
    });

    if (onTool) {
        Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
            t.addEventListener('click', function () { if (!panel.hidden) showChips(); });
        });
    }
})();
