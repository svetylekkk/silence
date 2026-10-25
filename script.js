(function () {
  'use strict';

  var root = document.documentElement;
  var page = document.getElementById('page');
  var DESIGN_W = 1440; // ширина макета: компьютер 1440, телефон 390, планшет и лежащий телефон — реальная ширина
  var mobile = false;  // раскладка в одну колонку (телефон и планшет)
  var tablet = false;
  var lowMode = false; // низкий экран: телефон, повёрнутый горизонтально
  var feedMode = false; // телефон вертикально: карточки жестов лентой
  var unit = 1;   // сколько единиц getBoundingClientRect приходится на 1 css-px макета
  var pageZoom = 1; // во сколько раз увеличена страница (для курсора)
  var vh = 900;   // высота окна в px макета
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  /* ---------- Масштаб под ширину окна ----------
     компьютер (от 1024px): макет 1440, масштабируется под ширину;
     планшет вертикально (768–1023px): одна колонка в реальную ширину;
     телефон (до 768px): макет 390, масштабируется под ширину;
     лежащий телефон (высота меньше 500px): телефонная раскладка в реальную ширину */
  function layout() {
    root.style.zoom = 1;
    var w = root.clientWidth; // ширина без полосы прокрутки
    var h = window.innerHeight;
    var low = h < 500 && w < 1024;
    tablet = !low && w >= 768 && w < 1024;
    mobile = low || w < 1024;
    DESIGN_W = !mobile ? 1440 : (tablet || low) ? w : 390;
    root.classList.toggle('m', mobile);
    root.classList.toggle('t', tablet);
    lowMode = low;
    root.classList.toggle('low', low);
    feedMode = mobile && !tablet && !low;
    root.classList.toggle('feed', feedMode);
    root.style.setProperty('--mW', DESIGN_W + 'px');
    var zoom = w / DESIGN_W;
    pageZoom = zoom;
    root.style.zoom = zoom;
    vh = window.innerHeight / zoom;
    root.style.setProperty('--vh', vh + 'px');
    var fs = Math.min(1, vh / 900);
    root.style.setProperty('--fs', fs);
    root.style.setProperty('--ifs', 1 / fs); // закреплённый экран шире на столько, на сколько он уменьшен
    unit = page.getBoundingClientRect().width / DESIGN_W;
    placeWords();
    measureWheel();
    placeBlobs();
    if (typeof sizeMobCurve === 'function') sizeMobCurve();
    placeUnderHeadings();
  }

  /* На телефоне и планшете кривая и карточки встают ровно под заголовком, сколько бы строк он ни занял */
  function placeUnderHeadings() {
    var gap = tablet ? 50 : 30;
    [['.s7__h', '.s7__mob', '--s7top'], ['.mv__h', '.mv__grid', '--mvtop']].forEach(function (x) {
      var h = document.querySelector(x[0]), el = document.querySelector(x[1]);
      if (!h || !el) return;
      if (mobile) el.style.setProperty(x[2], (h.offsetTop + h.offsetHeight + gap) + 'px');
      else el.style.removeProperty(x[2]);
    });
  }

  /* Прогресс прохождения закреплённой секции: 0..1 */
  function pinProgress(el) {
    var r = el.getBoundingClientRect();
    var top = r.top / unit, h = r.height / unit;
    return h > vh ? clamp(-top / (h - vh), 0, 1) : 0;
  }
  /* Насколько секция видна: 0..1 */
  function visible(el) {
    var r = el.getBoundingClientRect();
    var top = r.top / unit, bottom = r.bottom / unit;
    return clamp((Math.min(bottom, vh) - Math.max(top, 0)) / Math.min(vh, bottom - top), 0, 1);
  }

  /* ---------- Фон: эллипсы раскладываются по высоте страницы ---------- */
  var blobs = $$('.blob');
  function placeBlobs() {
    var H = page.offsetHeight;
    blobs.forEach(function (b) {
      var f = parseFloat(b.getAttribute('data-f'));
      b.style.top = (f * H - b.offsetHeight / 2) + 'px';
    });
  }

  /* Мелкое зерно поверх фона */
  (function makeGrain() {
    var c = document.createElement('canvas');
    c.width = c.height = 256;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(256, 256);
    for (var i = 0; i < img.data.length; i += 4) {
      img.data[i + 3] = Math.random() * 0.24 * 255;
    }
    ctx.putImageData(img, 0, 0);
    var grainUrl = 'url(' + c.toDataURL('image/png') + ')';
    document.getElementById('grain').style.backgroundImage = grainUrl;
    document.getElementById('ldGrain').style.backgroundImage = grainUrl;
  })();

  /* ---------- Счётчик времени в шапке ---------- */
  var clock = document.getElementById('clock');
  var t0 = Date.now();
  var clockOn = true;
  function fmt(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  setInterval(function () {
    if (clockOn) clock.textContent = fmt(Math.floor((Date.now() - t0) / 1000));
  }, 250);

  /* ---------- Прогресс прочтения ---------- */
  var bar = document.getElementById('progress');
  function updateBar() {
    var max = root.scrollHeight - window.innerHeight;
    var p = max > 0 ? window.scrollY / max : 0;
    bar.style.width = clamp(p, 0, 1) * 100 + '%';
  }

  /* ---------- 1. Шум: слова дёргаются, мигают и затихают по мере ухода с первого экрана ---------- */
  var hero = document.getElementById('hero');
  var qs = $$('.q').map(function (el) {
    // у каждого слова свой нервный ритм
    el.style.animationDuration = (2.2 + Math.random() * 2.6).toFixed(2) + 's';
    el.style.animationDelay = (-Math.random() * 4).toFixed(2) + 's';
    return {
      el: el, d: parseFloat(el.getAttribute('data-depth')), x: 0, y: 0,
      l: parseFloat(el.style.left), t: parseFloat(el.style.top),
      // порядок затихания: чем «громче» слово, тем позже оно уходит
      fade: Math.random() * 0.5
    };
  });
  /* На телефоне и планшете слова шума раскладываются заново при каждом открытии:
     хаотично, но равномерно — каждое новое слово встаёт туда, где от остальных дальше всего,
     не задевая заголовок, подпись и соседей. На компьютере — места из макета. */
  var s1title = document.querySelector('.s1__title');
  var s1hint = document.querySelector('.s1__hint');
  var placedW = 0;
  function relRect(el, pad) {
    var b = el.getBoundingClientRect(), h = hero.getBoundingClientRect();
    return { l: (b.left - h.left) / unit - pad, t: (b.top - h.top) / unit - pad,
             r: (b.right - h.left) / unit + pad, b: (b.bottom - h.top) / unit + pad };
  }
  function hit(a, b) { return a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b; }
  function placeHint() {
    // подпись начинается от левого края первой буквы «ТИШИНЫ» и стоит сразу под словом
    var rg = document.createRange();
    rg.selectNodeContents(s1title);
    var b = rg.getBoundingClientRect(), h = hero.getBoundingClientRect();
    s1hint.style.left = ((b.left - h.left) / unit).toFixed(1) + 'px';
    s1hint.style.top = ((b.bottom - h.top) / unit + 4).toFixed(1) + 'px';
  }
  function placeWords(force) {
    if (!mobile) {
      placedW = 0;
      s1hint.style.left = s1hint.style.top = '';
      qs.forEach(function (q) { q.el.style.left = q.l + 'px'; q.el.style.top = q.t + 'px'; });
      return;
    }
    placeHint();
    if (!force && placedW === DESIGN_W) return; // при прокрутке на телефоне меняется высота окна — не перемешиваем
    placedW = DESIGN_W;
    var W = DESIGN_W, H = hero.offsetHeight;
    var blocks = [relRect(s1title, 16), relRect(s1hint, 14)];
    var placed = [];
    qs.slice().sort(function () { return Math.random() - 0.5; }).forEach(function (q) {
      var w = q.el.offsetWidth, h = q.el.offsetHeight, best = null, bestD = -1;
      for (var k = 0; k < 80; k++) {
        var x = 12 + Math.random() * (W - w - 24), y = 70 + Math.random() * (H - h - 100);
        var r = { l: x, t: y, r: x + w, b: y + h };
        var near = { l: x - 10, t: y - 8, r: x + w + 10, b: y + h + 8 };
        if (blocks.some(function (bl) { return hit(r, bl); })) continue;
        if (placed.some(function (p) { return hit(near, p); })) continue;
        var cx = x + w / 2, cy = y + h / 2, d = Infinity;
        placed.concat(blocks).forEach(function (p) {
          d = Math.min(d, Math.hypot(cx - (p.l + p.r) / 2, (cy - (p.t + p.b) / 2) * 1.5));
        });
        if (d > bestD) { bestD = d; best = r; }
      }
      if (!best) best = { l: 12, t: 70, r: 12 + w, b: 70 + h };
      q.el.style.left = best.l.toFixed(1) + 'px';
      q.el.style.top = best.t.toFixed(1) + 'px';
      placed.push(best);
    });
  }

  var mouse = { x: 0, y: 0 };
  window.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX / window.innerWidth - 0.5;
    mouse.y = e.clientY / window.innerHeight - 0.5;
  });
  function tickNoise() {
    var r = hero.getBoundingClientRect();
    var p = clamp(-r.top / unit / (r.height / unit * 0.6), 0, 1); // 0 — шум, 1 — тишина
    qs.forEach(function (q) {
      q.x += (mouse.x * q.d - q.x) * 0.08;
      q.y += (mouse.y * q.d - q.y) * 0.08;
      q.el.style.transform = 'translate3d(' + q.x.toFixed(2) + 'px,' + q.y.toFixed(2) + 'px,0)';
      q.el.style.setProperty('--calm', clamp(1 - (p - q.fade) / 0.5, 0, 1).toFixed(3));
    });
  }

  /* ---------- Тихие зоны: в паузе и в личной истории раздражители затихают ---------- */
  var quietZones = $$('#s4, #scene, #mv, .s10');
  function tickQuiet() {
    var q = quietZones.some(function (el) { return visible(el) > 0.55; });
    document.body.classList.toggle('is-quiet', q);
  }

  /* ---------- 2. Пять секунд ---------- */
  var PAUSE = 5;
  var s4 = document.getElementById('s4');
  var s4num = document.getElementById('s4num');
  var ring = document.getElementById('ring');
  var away = document.getElementById('s4away');
  var after = document.getElementById('s4after');
  var RING_LEN = 2 * Math.PI * 19.5;
  ring.style.strokeDasharray = RING_LEN;
  ring.style.strokeDashoffset = 0;
  var s4start = null;

  function startTimer() {
    if (s4start !== null) return;
    s4start = Date.now();
    s4.classList.add('is-run');
    ring.style.strokeDashoffset = RING_LEN;
    var iv = setInterval(function () {
      var left = Math.max(0, PAUSE - Math.floor((Date.now() - s4start) / 1000));
      s4num.textContent = left;
      if (left === 0) {
        clearInterval(iv);
        s4num.classList.add('is-gone');
        s4.classList.add('is-done');
      }
    }, 100);
  }
  // Только порог видимости: движение, скролл и клики ничего не ускоряют
  new IntersectionObserver(function (entries, obs) {
    entries.forEach(function (e) {
      if (e.intersectionRatio >= 0.6) { startTimer(); obs.disconnect(); }
    });
  }, { threshold: 0.6 }).observe(s4);

  $$('.btn13').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('.btn13').forEach(function (x) { x.classList.remove('is-picked'); });
      b.classList.add('is-picked');
      after.classList.add('on');
    });
  });

  function plural(n, one, few, many) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
    return many;
  }
  var hiddenAt = null;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt === null || s4start === null) return;
    var sec = Math.round((Date.now() - hiddenAt) / 1000);
    hiddenAt = null;
    away.textContent = 'Вас не\u00a0было ' + sec + '\u00a0' + plural(sec, 'секунду', 'секунды', 'секунд') + '. Что-нибудь пришло?';
  });

  /* ---------- Контекст: счёт до 15 минут ---------- */
  // счёт начинается, только когда цифра целиком на экране, и замедляется к концу
  var s6 = document.getElementById('s6');
  var s6num = document.getElementById('s6num');
  function countTo15() {
    s6.classList.add('is-in');
    var start = performance.now(), DUR = 2200;
    (function step(now) {
      var t = clamp((now - start) / DUR, 0, 1);
      s6num.textContent = Math.round(15 * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
    })(start);
  }
  new IntersectionObserver(function (entries, obs) {
    entries.forEach(function (e) {
      if (e.intersectionRatio >= 0.95) { obs.disconnect(); countTo15(); }
    });
  }, { threshold: [0.95, 1] }).observe(s6num);

  /* ---------- 3. Слова подсвечиваются по одному ---------- */
  var s2 = document.getElementById('s2');
  var words = [];
  $$('#s2text .ln').forEach(function (ln) {
    var parts = ln.textContent.split(' ');
    ln.textContent = '';
    parts.forEach(function (w, i) {
      var span = document.createElement('span');
      span.className = 'w';
      span.textContent = w;
      ln.appendChild(span);
      ln.appendChild(document.createTextNode(' '));
      words.push(span);
    });
  });
  var litPrev = -1;
  function tickWords() {
    var p = pinProgress(s2);
    var lit = Math.round(clamp(p / 0.85, 0, 1) * words.length);
    if (lit === litPrev) return;
    litPrev = lit;
    for (var i = 0; i < words.length; i++) words[i].classList.toggle('on', i < lit);
  }

  /* ---------- Колесо слов ---------- */
  var s3 = document.getElementById('s3');
  var STEP = 42.73, K = 0.11;
  var W_D = { CX: 1417.21, CY: 696.27, R: 452.32 };
  var W_M = { CX: 390, CY: 470, R: 205 }; // на телефоне; на планшете центр — у правого края страницы
  var wheel = $$('.ww').map(function (el) {
    return { el: el, a: parseFloat(el.getAttribute('data-a')), w: 0, h: 0 };
  });
  function measureWheel() {
    wheel.forEach(function (w) { w.w = w.el.offsetWidth; w.h = w.el.offsetHeight; });
  }
  var rot = null;
  function tickWheel() {
    var g = mobile ? W_M : W_D;
    if (mobile) { W_M.CX = DESIGN_W; W_M.R = tablet ? 300 : 205; W_M.CY = tablet ? 560 : 470; }
    var top = s3.getBoundingClientRect().top / unit;
    var target = top * K;               // 0, когда секция вверху окна
    rot = rot === null ? target : rot + (target - rot) * 0.1;
    wheel.forEach(function (w) {
      var a = w.a + rot;
      var rad = a * Math.PI / 180;
      var x = g.CX - g.R * Math.cos(rad) - w.w;
      var y = g.CY + g.R * Math.sin(rad) - w.h / 2;
      var abs = Math.abs(a), o;
      if (abs <= 3) o = 1;
      else if (abs <= STEP) o = 1 - 0.4 * (abs - 3) / (STEP - 3);
      else o = 0.6 * clamp(1 - (abs - STEP) / 30, 0, 1);
      w.el.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)';
      w.el.style.color = 'rgba(242,242,242,' + o.toFixed(3) + ')';
    });
  }

  /* ---------- Наблюдения: горизонтальный трек (на телефоне — обычный список) ---------- */
  var s5 = document.getElementById('s5');
  var track = document.getElementById('track');
  var TRACK_DIST = 2300;
  function tickTrack() {
    if (mobile) { track.style.transform = ''; return; }
    var p = pinProgress(s5);
    track.style.transform = 'translate3d(' + (-TRACK_DIST * p).toFixed(2) + 'px,0,0)';
  }

  /* ---------- 4. Кривая обещаний по скроллу ---------- */
  var s7 = document.getElementById('s7');
  var curve = document.getElementById('curve');
  var CURVE_LEN = curve.getTotalLength();
  curve.style.strokeDasharray = CURVE_LEN;
  curve.style.strokeDashoffset = CURVE_LEN;
  /* На телефоне и планшете — та же кривая, только повёрнутая вертикально (x и y меняются местами):
     она рисуется во всю высоту экрана, точки и фразы загораются прямо на ней */
  var VB_W = 571.001, VB_H = 1273.59;
  var MOB_DOTS = [ // центры точек в координатах повёрнутой кривой
    { x: 237.5, y: 202.5, at: 0.25 },
    { x: 342.5, y: 384.5, at: 0.45 },
    { x: 554.5, y: 734.5, at: 0.65 },
    { x: 1.5,   y: 1060.5, at: 0.90 }
  ];
  var mobArt = document.createElement('div');
  mobArt.className = 's7__mob';
  mobArt.setAttribute('aria-hidden', 'true');
  var dMob = curve.getAttribute('d').replace(/(-?[\d.]+) (-?[\d.]+)/g, function (_, x, y) { return y + ' ' + x; });
  var lblTexts = $$('.s7__img .lbl').map(function (l) { return l.textContent; });
  var html = '<svg viewBox="0 0 ' + VB_W + ' ' + VB_H + '" fill="none"><path id="curveMob" d="' + dMob + '" stroke="white" stroke-linejoin="round"/></svg>';
  MOB_DOTS.forEach(function (d, i) {
    var left = (d.x / VB_W * 100).toFixed(2) + '%', top = (d.y / VB_H * 100).toFixed(2) + '%';
    var side = d.x < 300 ? 'r' : 'l'; // фраза справа от точки или слева
    html += '<i class="s7__mdot" data-at="' + d.at + '" style="left:' + left + ';top:' + top + '"></i>';
    html += '<div class="s7__mlbl s7__mlbl--' + side + (i === 3 ? ' s7__mlbl--last' : '') + '" data-at="' + d.at + '" style="' +
      (side === 'r' ? 'left:calc(' + left + ' + 16px)' : 'right:calc(' + (100 - d.x / VB_W * 100).toFixed(2) + '% + 16px)') +
      ';top:' + top + '">' + lblTexts[i] + '</div>';
  });
  mobArt.innerHTML = html;
  curve.closest('.frame').appendChild(mobArt);
  var curveMob = document.getElementById('curveMob');
  var CURVE_MOB_LEN = curveMob.getTotalLength();
  curveMob.style.strokeDasharray = CURVE_MOB_LEN;
  curveMob.style.strokeDashoffset = CURVE_MOB_LEN;
  function sizeMobCurve() {
    // толщина линии — 2px на экране при любом масштабе
    if (!mobArt || !curveMob) return;
    var w = mobArt.getBoundingClientRect().width / unit;
    if (w > 0) curveMob.setAttribute('stroke-width', (2 * VB_W / w).toFixed(2));
  }

  var marks = $$('.s7 [data-at]').map(function (el) {
    return { el: el, at: parseFloat(el.getAttribute('data-at')) };
  });
  var hdr = document.querySelector('.hdr');
  function tickCurve() {
    var p = pinProgress(s7);
    // заголовок экрана стоит под шапкой — убираем шапку, пока экран закреплён
    var r7 = s7.getBoundingClientRect();
    hdr.classList.toggle('is-hidden', !mobile && r7.top / unit < 80 && r7.bottom / unit > 80);
    curve.style.strokeDashoffset = (CURVE_LEN * (1 - p)).toFixed(2);
    curveMob.style.strokeDashoffset = (CURVE_MOB_LEN * (1 - p)).toFixed(2);
    marks.forEach(function (m) { m.el.classList.toggle('on', p >= m.at); });
  }

  /* ---------- Лестница: от «мне скучно» к «мне нужно, чтобы меня заметили» ---------- */
  var s8 = document.getElementById('s8');
  var lad = $$('.lad__ln');
  var s8end = document.getElementById('s8end');
  function tickLadder() {
    var p = pinProgress(s8);
    // фразы по очереди проявляются и растворяются; в конце не остаётся ни одной, только вывод
    // фразы занимают первые две трети прокрутки, последняя треть отдана выводу — его не пролистать
    var cur = p > 0.02 && p < 0.62 ? Math.floor((p - 0.02) / 0.6 * lad.length) : -1;
    lad.forEach(function (ln, i) { ln.classList.toggle('on', i === cur); });
    s8end.classList.toggle('on', p > 0.64);
  }

  /* ---------- 5. Сцена ожидания: статус в телефоне живёт вместе с текстом ---------- */
  var sceneP = $$('.scene__text p');
  var phoneSt = document.getElementById('phoneSt');
  var phoneTicks = document.getElementById('phoneTicks');
  var curP = -1;
  function tickScene() {
    var mid = window.innerHeight * (mobile ? 0.62 : 0.55);
    var best = -1;
    sceneP.forEach(function (p, i) {
      if (p.getBoundingClientRect().top < mid) best = i;
    });
    if (best === curP) return;
    curP = best;
    sceneP.forEach(function (p, i) { p.classList.toggle('on', i === best); p.classList.toggle('past', i < best); });
    var src = sceneP[Math.max(best, 0)];
    var st = src.getAttribute('data-st');
    phoneSt.textContent = st;
    phoneSt.classList.toggle('is-typing', st === 'печатает…');
    phoneTicks.classList.toggle('is-read', src.getAttribute('data-read') === '1');
  }


  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  /* ---------- Шум захватывает → экран гаснет → тишина разрастается ---------- */
  var nz = document.getElementById('nz');
  var nzPhone = document.getElementById('nzPhone');
  var nzScreen = document.getElementById('nzScreen');
  var nzNum = document.getElementById('nzNum');
  var nzCap = document.getElementById('nzCap');
  var nzQuiet = document.getElementById('nzQuiet');
  var COUNTS = [1, 2, 3, 5, 8, 12, 19, 27, 34, 47, 63, 99];
  var nzRows = $$('.nz__row').map(function (row, i) {
    // строка повторяется, каждая буква — отдельный элемент, чтобы шум мог рассыпаться
    var txt = row.textContent;
    row.textContent = '';
    var letters = [];
    for (var r = 0; r < 4; r++) {
      txt.split('').forEach(function (ch) {
        var sp = document.createElement('span');
        sp.textContent = ch;
        row.appendChild(sp);
        // буква исчезает в свой момент второй фазы
        letters.push({ el: sp, t: 0.42 + Math.random() * 0.26, off: false });
      });
    }
    return { el: row, dir: parseFloat(row.getAttribute('data-dir')), i: i, letters: letters };
  });
  function tickNoiseScreen() {
    var p = pinProgress(nz);
    // 1. шум накатывает ряд за рядом и ускоряется
    nzRows.forEach(function (r) {
      var inK = ease(clamp((p - r.i * 0.045) / 0.12, 0, 1));
      // ряд всегда начинается за левым краем, поэтому пустых полей нет ни в начале, ни в конце
      var m = p * p * 2200;
      var x = (r.dir > 0 ? -1400 - m : -3600 + m) * (mobile ? 0.5 : 1);
      r.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)';
      r.el.style.opacity = inK.toFixed(3);
      // 2. когда экран гаснет, шум рассыпается по буквам
      r.letters.forEach(function (l) {
        var off = p > l.t;
        if (off !== l.off) { l.off = off; l.el.classList.toggle('off', off); }
      });
    });
    // счётчик уведомлений растёт, пока шум нарастает
    var c = clamp(p / 0.38, 0, 1);
    var n = COUNTS[Math.min(COUNTS.length - 1, Math.floor(c * COUNTS.length))];
    nzNum.textContent = n === 99 ? '99+' : n;
    nzCap.textContent = plural(n, 'новое', 'новых', 'новых');
    // экран гаснет
    nzScreen.style.opacity = (1 - clamp((p - 0.4) / 0.12, 0, 1)).toFixed(3);
    // 3. тёмный экран телефона разрастается до целого экрана
    var g = ease(clamp((p - 0.62) / 0.3, 0, 1));
    var W = DESIGN_W, H = vh;
    var w0 = tablet ? 240 : mobile ? 170 : 280, h0 = tablet ? 480 : mobile ? 340 : 560;
    nzPhone.style.width = (w0 + (W + 4 - w0) * g).toFixed(1) + 'px';
    nzPhone.style.height = (h0 + (H + 4 - h0) * g).toFixed(1) + 'px';
    nzPhone.style.borderRadius = ((mobile ? 28 : 44) * (1 - g)).toFixed(1) + 'px';
    nzQuiet.style.opacity = clamp((p - 0.86) / 0.1, 0, 1).toFixed(3);
    // когда экран телефона заполнил всё окно, чёрное тает и проступает фон сайта —
    // к моменту, когда экран уезжает, резкой границы чёрного и фона уже нет
    nzPhone.style.opacity = (1 - clamp((p - 0.9) / 0.1, 0, 1)).toFixed(3);
  }

  /* ---------- Мелкие движения складываются в картину ---------- */
  var mv = document.getElementById('mv');
  var mvEnd = document.getElementById('mvEnd');
  var mvCards = $$('.mv__card').map(function (el) {
    return { el: el, r: parseFloat(el.getAttribute('data-r')) };
  });
  function tickMoves() {
    // телефон вертикально: карточки идут лентой, каждая вплывает, когда до неё доходит прокрутка
    if (feedMode) {
      var vhPx = window.innerHeight;
      mvCards.forEach(function (c) {
        var top = c.el.parentNode.getBoundingClientRect().top; // колонка без сдвига — мерим по ней
        var k = ease(clamp((vhPx * 0.92 - top) / (vhPx * 0.3), 0, 1));
        var rot = c.r * (1 - k) + c.r * 0.25;
        c.el.style.transform = 'translate3d(0,' + ((1 - k) * 60).toFixed(1) + 'px,0) rotate(' + rot.toFixed(2) + 'deg)';
        c.el.style.opacity = k.toFixed(3);
      });
      mvEnd.classList.toggle('on', mvEnd.getBoundingClientRect().top < vhPx * 0.9);
      return;
    }
    var p = lowMode ? 1 : pinProgress(mv); // на низком экране карточки просто стоят списком
    mvCards.forEach(function (c, i) {
      var k = ease(clamp((p - i * 0.13) / 0.22, 0, 1));
      var rot = c.r * (1 - k) + c.r * 0.15;
      c.el.style.transform = 'translate3d(0,' + ((1 - k) * (mobile ? 160 : 420)).toFixed(1) + 'px,0) rotate(' + rot.toFixed(2) + 'deg)';
      c.el.style.opacity = k.toFixed(3);
    });
    mvEnd.classList.toggle('on', p > 0.86);
  }

  /* ---------- Центральный вопрос собирается по словам ---------- */
  var s10h = document.querySelector('.s10__h');
  var wi = 0;
  $$('.s10__h > span').forEach(function (line) {
    var parts = line.textContent.split(' ');
    line.textContent = '';
    parts.forEach(function (w) {
      var outer = document.createElement('span');
      outer.className = 'rv';
      var inner = document.createElement('span');
      inner.textContent = w;
      inner.style.transitionDelay = (wi++ * 0.09).toFixed(2) + 's';
      outer.appendChild(inner);
      line.appendChild(outer);
      line.appendChild(document.createTextNode(' '));
    });
  });
  new IntersectionObserver(function (entries, obs) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { s10h.classList.add('is-in'); obs.disconnect(); }
    });
  }, { threshold: 0.6 }).observe(s10h);

  /* ---------- 6. Финал ---------- */
  var submit = document.getElementById('submit');
  var result = document.getElementById('result');
  submit.addEventListener('click', function () {
    var sec = Math.floor((Date.now() - t0) / 1000);
    var m = Math.floor(sec / 60), s = sec % 60;
    var txt = 'Вы были на\u00a0этой странице ';
    if (m > 0) txt += m + '\u00a0' + plural(m, 'минуту', 'минуты', 'минут') + ' ';
    txt += s + '\u00a0' + plural(s, 'секунду', 'секунды', 'секунд') + '. Ответ остался у\u00a0вас.';
    result.textContent = txt;
    clockOn = false;
    clock.classList.add('is-off');
    submit.disabled = true;
  });

  /* ---------- Загрузка: от 0 до 100% примерно за 2,5 секунды ---------- */
  (function loader() {
    var ld = document.getElementById('loader');
    var num = document.getElementById('ldNum');
    var fill = document.getElementById('ldFill');
    var DUR = reduce ? 800 : 2500;
    var start = performance.now();
    var loaded = document.readyState === 'complete';
    window.addEventListener('load', function () { loaded = true; });
    // таймер, а не requestAnimationFrame: загрузка завершится, даже если вкладка открыта в фоне
    var iv = setInterval(function () {
      var t = clamp((performance.now() - start) / DUR, 0, 1);
      var v = 1 - Math.pow(1 - t, 2);          // к концу полоса замедляется
      if (!loaded) v = Math.min(v, 0.9);       // если сайт ещё грузится — ждём на 90%
      var pct = Math.round(v * 100);
      num.textContent = pct + '%';
      fill.style.width = pct + '%';
      if (pct < 100) return;
      clearInterval(iv);
      setTimeout(function () {
        ld.classList.add('is-done');
        root.classList.remove('is-loading');
        t0 = Date.now();                       // часы в шапке начинают считать с открытия сайта
        setTimeout(function () { ld.parentNode && ld.parentNode.removeChild(ld); }, 1000);
      }, 250);
    }, 16);
  })();

  /* ---------- Светящийся курсор: точка и ореол, который чуть отстаёт ---------- */
  (function cursor() {
    if (!window.matchMedia || !window.matchMedia('(pointer: fine)').matches) return;
    root.classList.add('has-cur');
    var cur = document.querySelector('.cur');
    var dot = document.getElementById('curDot');
    var glow = document.getElementById('curGlow');
    var x = 0, y = 0, gx = 0, gy = 0, first = true;
    window.addEventListener('mousemove', function (e) {
      // страница увеличена через zoom, поэтому координаты мыши переводим в её единицы
      x = e.clientX / pageZoom; y = e.clientY / pageZoom;
      if (first) { gx = x; gy = y; first = false; }
      cur.classList.add('is-on');
      cur.classList.toggle('is-hover', !!(e.target.closest && e.target.closest('a, button, textarea')));
    });
    document.addEventListener('mouseleave', function () { cur.classList.remove('is-on'); });
    (function move() {
      gx += (x - gx) * 0.15; gy += (y - gy) * 0.15;
      dot.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
      glow.style.transform = 'translate3d(' + gx.toFixed(1) + 'px,' + gy.toFixed(1) + 'px,0)';
      requestAnimationFrame(move);
    })();
  })();

  /* ---------- Цикл ---------- */
  function frame() {
    updateBar();
    tickNoise();
    tickQuiet();
    tickWords();
    tickWheel();
    tickTrack();
    tickCurve();
    tickLadder();
    tickScene();
    tickNoiseScreen();
    tickMoves();
    requestAnimationFrame(frame);
  }

  if (reduce) root.classList.add('reduce');
  layout();
  window.addEventListener('resize', layout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layout(); placeWords(true); });
  window.addEventListener('load', placeBlobs);
  requestAnimationFrame(frame);
})();
