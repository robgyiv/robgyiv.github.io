/*
 * background.js — fixed full-viewport pulsing dithered background (#bg-canvas).
 *
 * Cross-file event contract: listens for a custom `rave:hue-change` event on
 * `window`, dispatched by state.js whenever the theme is toggled or the hue
 * is rerolled. On receipt this file recomputes glow colours and redraws
 * immediately, instead of waiting for the next scheduled tick.
 *
 * Renders at low resolution (1 canvas px = 3 CSS px) and relies on the
 * `image-rendering: pixelated` CSS the template/sass stream applies to
 * #bg-canvas to upscale it. Two elliptical glows are thresholded against an
 * 8x8 Bayer matrix each redraw, giving three states per low-res pixel: glow
 * A colour, glow B colour, or transparent (page --bg shows through).
 */
(function () {
  'use strict';

  var canvas = document.getElementById('bg-canvas');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  var html = document.documentElement;

  var CELL = 3; // 1 canvas px = 3 CSS px

  function buildBayer(n) {
    var m = [[0]];
    while (m.length < n) {
      var s = m.length;
      var r = [];
      for (var y = 0; y < s * 2; y++) {
        r.push([]);
        for (var x = 0; x < s * 2; x++) {
          var q = [[0, 2], [3, 1]][Math.floor(y / s)][Math.floor(x / s)];
          r[y].push(4 * m[y % s][x % s] + q);
        }
      }
      m = r;
    }
    return m;
  }

  var bayer8 = buildBayer(8);
  var B8 = new Array(64);
  for (var by = 0; by < 8; by++) {
    for (var bx = 0; bx < 8; bx++) {
      B8[by * 8 + bx] = (bayer8[by][bx] + 0.5) / 64;
    }
  }

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mobileQuery = window.matchMedia('(max-width: 640px)');

  var W = 0, H = 0;
  var colorA = '#000', colorB = '#000';
  var strengthA = 1, strengthB = 0.6;
  var intervalId = null;
  var t0 = performance.now();

  function isDark() {
    return html.classList.contains('dark');
  }

  function updateColors() {
    var h = parseFloat(getComputedStyle(html).getPropertyValue('--h')) || 0;
    if (isDark()) {
      colorA = 'oklch(0.5 0.2 ' + h + ')';
      colorB = 'oklch(0.42 0.15 ' + (h + 50) + ')';
      strengthA = 0.6;
      strengthB = 0.4;
    } else {
      colorA = 'oklch(0.88 0.23 ' + h + ')';
      colorB = 'oklch(0.9 0.12 ' + (h + 50) + ')';
      strengthA = 1;
      strengthB = 0.6;
    }
  }

  function resizeCanvas() {
    var cssW = window.innerWidth;
    var cssH = window.innerHeight;
    W = Math.max(1, Math.ceil(cssW / CELL));
    H = Math.max(1, Math.ceil(cssH / CELL));
    canvas.width = W;
    canvas.height = H;
  }

  function smoothstep(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return x * x * (3 - 2 * x);
  }

  function draw(now) {
    if (!W || !H) return;
    var reduced = reducedMotion.matches;
    var t = reduced ? 0 : (now - t0) / 1000;
    var ph = reduced ? 0 : (Math.sin((t * Math.PI) / 9) + 1) / 2;
    var scale = 1 + 0.12 * ph;
    var amp = 1 - 0.25 * ph;

    var ax = 0.9 * W, ay = 0.02 * H, arx = 0.62 * W * scale, ary = 0.8 * H * scale;
    var bx = 0.02 * W, by = 0.98 * H, brx = 0.5 * W * scale, bry = 0.55 * H * scale;
    var sa = strengthA * amp, sb = strengthB * amp;

    ctx.clearRect(0, 0, W, H);

    var x, y, dx, dy, a, t8;

    ctx.fillStyle = colorA;
    for (y = 0; y < H; y++) {
      var rowA = (y & 7) * 8;
      for (x = 0; x < W; x++) {
        t8 = B8[rowA + (x & 7)];
        dx = (x - ax) / arx;
        dy = (y - ay) / ary;
        a = 1 - Math.sqrt(dx * dx + dy * dy);
        a = a > 0 ? smoothstep(a) * sa : 0;
        if (a > t8) ctx.fillRect(x, y, 1, 1);
      }
    }

    ctx.fillStyle = colorB;
    for (y = 0; y < H; y++) {
      var rowB = (y & 7) * 8;
      for (x = 0; x < W; x++) {
        t8 = B8[rowB + (x & 7)];
        dx = (x - ax) / arx;
        dy = (y - ay) / ary;
        a = 1 - Math.sqrt(dx * dx + dy * dy);
        a = a > 0 ? smoothstep(a) * sa : 0;
        if (a > t8) continue; // already painted as glow A
        var dx2 = (x - bx) / brx;
        var dy2 = (y - by) / bry;
        var b = 1 - Math.sqrt(dx2 * dx2 + dy2 * dy2);
        b = b > 0 ? smoothstep(b) * sb : 0;
        if (b > t8) ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  function redrawNow() {
    updateColors();
    draw(performance.now());
  }

  function stopLoop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function scheduleLoop() {
    stopLoop();
    if (reducedMotion.matches) {
      redrawNow();
      return;
    }
    var interval = mobileQuery.matches ? 1000 : 90;
    intervalId = setInterval(function () {
      if (document.hidden) return;
      draw(performance.now());
    }, interval);
  }

  function fullRedraw() {
    resizeCanvas();
    redrawNow();
    scheduleLoop();
  }

  window.addEventListener('resize', fullRedraw);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stopLoop();
    } else {
      scheduleLoop();
    }
  });

  if (mobileQuery.addEventListener) {
    mobileQuery.addEventListener('change', scheduleLoop);
  } else if (mobileQuery.addListener) {
    mobileQuery.addListener(scheduleLoop);
  }

  if (reducedMotion.addEventListener) {
    reducedMotion.addEventListener('change', fullRedraw);
  } else if (reducedMotion.addListener) {
    reducedMotion.addListener(fullRedraw);
  }

  window.addEventListener('rave:hue-change', redrawNow);

  fullRedraw();
})();
