/*
 * waves.js — homepage ocean canvas (#waves-canvas, inside .waves-panel).
 * Harmless no-op on pages that don't have that element.
 *
 * Renders a top-down view of a swirling sea in an 8-bit style: a five-colour
 * palette, chunky pixels, and ordered dithering between bands. Like
 * background.js it draws at low resolution (one canvas pixel per cell) and
 * relies on the `image-rendering: pixelated` CSS the sass stream applies to
 * #waves-canvas to upscale it.
 *
 * Each cell samples a height field of three directional sine waves, warped
 * by a slow curl so the swell swirls rather than marching in straight lines.
 * The gradient of that field decides where the sun glints. A separate field
 * of pointer-stirred displacement, decaying every frame, offsets the sample
 * coordinates, so the cursor drags a swirling wake through the water.
 *
 * None of it is real fluid simulation — it is eye candy, tuned by eye. The
 * constants below are worth nudging, not deriving.
 *
 * Cross-file event contract: listens for a custom `rave:hue-change` event on
 * `window`, dispatched by state.js whenever the theme is toggled or the hue
 * is rerolled. On receipt this file rebuilds its palette and redraws
 * immediately so colours/hue stay in sync.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('waves-canvas');
  if (!canvas) return;

  var panel = canvas.closest('.waves-panel') || canvas.parentElement;
  if (!panel) return;

  var ctx = canvas.getContext('2d');
  var html = document.documentElement;

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  var CELL = 6;        // CSS px per rendered pixel (the 8-bit chunkiness)
  var MAX_CELLS = 24000; // upper bound on grid area, CELL grows to respect it
  var LEVELS = 5;      // palette entries, deep water -> sun glint

  // --- Sine lookup ------------------------------------------------------
  // Several trig calls per cell per frame; a table keeps that cheap, and the
  // quantisation it introduces is invisible once the output is banded down to
  // five colours anyway.
  var LUT = 2048, MASK = LUT - 1, K = LUT / (Math.PI * 2);
  var SIN = new Float32Array(LUT);
  for (var s = 0; s < LUT; s++) SIN[s] = Math.sin((s / LUT) * Math.PI * 2);
  var QUARTER = LUT >> 2;

  function sinL(p) { return SIN[(p * K) & MASK]; }
  function cosL(p) { return SIN[((p * K) + QUARTER) & MASK]; }

  // --- Ordered dither ---------------------------------------------------
  var B4 = [
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5
  ].map(function (v) { return ((v + 0.5) / 16 - 0.5) * 0.55; });

  // --- Wave set ---------------------------------------------------------
  // kx/ky are per-cell phase steps, sp is temporal speed, amp is weight.
  var WAVES = [
    { kx: 0.180, ky: 0.205, sp: 1.10, amp: 1.00 },
    { kx: 0.225, ky: -0.100, sp: 0.85, amp: 0.42 },
    { kx: -0.110, ky: 0.380, sp: 1.55, amp: 0.22 }
  ];
  // Deliberately below the sum of the amplitudes: a sum of sines clusters
  // around its mean, so dividing by the true maximum leaves every cell
  // sitting between the same two palette bands and the whole panel reads as
  // one flat dither. Clipping the tails spreads the swell across the ramp.
  var NORM = 1.15;

  // Sun glitter: a cell sparkles when its slope is near (GX, GY), which picks
  // out one face of each crest. SLOPE scales the raw gradient into the same
  // range, GTIGHT is how narrow the sparkle is.
  var SLOPE = 6;
  var GX = -0.48, GY = 0.82, GTIGHT = 7;

  var gw = 0, gh = 0;
  var img = null, pix = null;
  var fx = null, fy = null;
  var palette = new Uint32Array(LEVELS);
  var pointer = null;
  var t = 0;
  var rafId = null;
  var last = 0;

  function isDark() {
    return html.classList.contains('dark');
  }

  // --- OKLCH -> packed ABGR --------------------------------------------
  // Done in JS rather than via canvas fillStyle so the palette can be written
  // straight into the ImageData buffer.
  function oklch(L, C, hDeg) {
    var hr = (hDeg * Math.PI) / 180;
    var a = C * Math.cos(hr);
    var b = C * Math.sin(hr);

    var l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    var m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    var s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    var l = l_ * l_ * l_, m = m_ * m_ * m_, sc = s_ * s_ * s_;

    var r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * sc;
    var g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * sc;
    var bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * sc;

    return (255 << 24) | (gamma(bl) << 16) | (gamma(g) << 8) | gamma(r);
  }

  function gamma(v) {
    v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    v = Math.round(v * 255);
    return v < 0 ? 0 : (v > 255 ? 255 : v);
  }

  function buildPalette() {
    var h = parseFloat(getComputedStyle(html).getPropertyValue('--h')) || 0;
    var g = h + 45; // glints pull slightly off-hue, like sun on water
    if (isDark()) {
      palette[0] = oklch(0.20, 0.06, h);
      palette[1] = oklch(0.30, 0.09, h);
      palette[2] = oklch(0.42, 0.12, h);
      palette[3] = oklch(0.60, 0.16, h);
      palette[4] = oklch(0.92, 0.14, g);
    } else {
      palette[0] = oklch(0.56, 0.15, h);
      palette[1] = oklch(0.69, 0.17, h);
      palette[2] = oklch(0.80, 0.16, h);
      palette[3] = oklch(0.90, 0.12, h);
      palette[4] = oklch(0.99, 0.04, g);
    }
  }

  function resize() {
    var rect = panel.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var hpx = Math.max(1, Math.round(rect.height));

    var cell = CELL;
    while (Math.ceil(w / cell) * Math.ceil(hpx / cell) > MAX_CELLS) cell++;

    gw = Math.max(1, Math.ceil(w / cell));
    gh = Math.max(1, Math.ceil(hpx / cell));

    canvas.width = gw;
    canvas.height = gh;

    img = ctx.createImageData(gw, gh);
    pix = new Uint32Array(img.data.buffer);

    var n = gw * gh;
    fx = new Float32Array(n);
    fy = new Float32Array(n);
    pointer = null;
  }

  // --- Pointer field ----------------------------------------------------
  function stir() {
    if (!pointer) return;
    var R = Math.max(8, gw * 0.16);
    var R2 = R * R;
    var x0 = Math.max(0, Math.floor(pointer.x - R));
    var x1 = Math.min(gw - 1, Math.ceil(pointer.x + R));
    var y0 = Math.max(0, Math.floor(pointer.y - R));
    var y1 = Math.min(gh - 1, Math.ceil(pointer.y + R));

    for (var j = y0; j <= y1; j++) {
      var dy = j - pointer.y;
      for (var i = x0; i <= x1; i++) {
        var dx = i - pointer.x;
        var d2 = dx * dx + dy * dy;
        if (d2 > R2) continue;
        var d = Math.sqrt(d2) || 1;
        var fall = 1 - d / R;
        fall *= fall * fall;
        var idx = j * gw + i;
        // Tangential component swirls the water, the pointer's own velocity
        // pushes it along, so a still cursor still stirs a slow eddy.
        fx[idx] += ((-dy / d) * 0.55 + pointer.vx * 0.40) * fall;
        fy[idx] += ((dx / d) * 0.55 + pointer.vy * 0.40) * fall;
      }
    }

    pointer.vx *= 0.82;
    pointer.vy *= 0.82;
  }

  // Let the wake fade instead of sitting on the surface forever. The clamp
  // matters: without it a cursor parked in one spot keeps adding to the same
  // cells every frame and tears the wave field apart.
  function decay(f) {
    for (var i = 0; i < f.length; i++) {
      var v = f[i] * 0.97;
      f[i] = v > 5 ? 5 : (v < -5 ? -5 : v);
    }
  }

  function step(dt) {
    t += dt;
    stir();
    decay(fx);
    decay(fy);

    var w0 = WAVES[0], w1 = WAVES[1], w2 = WAVES[2];
    var invW = 1 / gw, invH = 1 / gh;
    var band = 0.78 + 0.22 * sinL(t * 0.22);

    for (var j = 0; j < gh; j++) {
      var row = j * gw;
      var brow = (j & 3) * 4;
      for (var i = 0; i < gw; i++) {
        var idx = row + i;

        // Domain warp: a slow curl makes the swell swirl, the pointer field
        // drags it around on top of that.
        var dxf = fx[idx], dyf = fy[idx];
        var x = i + sinL(j * 0.030 + t * 0.55) * 4.0 + dxf;
        var y = j + cosL(i * 0.022 - t * 0.45) * 4.0 + dyf;

        var hv = 0, gx = 0, gy = 0, p, c;

        p = x * w0.kx + y * w0.ky + t * w0.sp;
        hv += sinL(p) * w0.amp; c = cosL(p) * w0.amp;
        gx += c * w0.kx; gy += c * w0.ky;

        p = x * w1.kx + y * w1.ky + t * w1.sp;
        hv += sinL(p) * w1.amp; c = cosL(p) * w1.amp;
        gx += c * w1.kx; gy += c * w1.ky;

        p = x * w2.kx + y * w2.ky + t * w2.sp;
        hv += sinL(p) * w2.amp; c = cosL(p) * w2.amp;
        gx += c * w2.kx; gy += c * w2.ky;

        var ex = gx * SLOPE - GX;
        var ey = gy * SLOPE - GY;
        var spec = 1 / (1 + (ex * ex + ey * ey) * GTIGHT);

        // A slow secondary pattern makes the glints travel across the swell
        // instead of sitting on the same crests.
        var dance = 0.6 + 0.4 * sinL(x * 0.07 + t * 1.6) * sinL(y * 0.06 - t * 1.2);

        // Broad diagonal band where the sun's reflection sits, drifting
        // slowly: glints outside it are dimmer, so the light reads as coming
        // from a direction rather than from everywhere at once.
        var bd = (i * invW + j * invH * 0.75) - band;
        dance *= 0.30 + 0.90 / (1 + bd * bd * 11);

        // Stirred water catches more light — the cursor leaves a bright wake.
        var wake = Math.sqrt(dxf * dxf + dyf * dyf) * 0.055;
        if (wake > 0.30) wake = 0.30;

        var hn = hv / NORM;
        if (hn < -1) hn = -1; else if (hn > 1) hn = 1;

        // The swell occupies the lower three bands; glints and wake are what
        // push a cell up into the two bright ones.
        var v = (hn * 0.5 + 0.5) * 0.62 + spec * dance * 1.05 + wake;
        if (v < 0) v = 0; else if (v > 1) v = 1;

        var lv = v * (LEVELS - 1) + B4[brow + (i & 3)];
        var level = lv < 0 ? 0 : (lv > LEVELS - 1 ? LEVELS - 1 : Math.round(lv));

        pix[idx] = palette[level];
      }
    }

    ctx.putImageData(img, 0, 0);
  }

  // Driven off the rAF timestamp rather than a fixed 1/60, so the swell
  // moves at the same speed on a 120Hz display as on a 60Hz one. The clamp
  // stops a background tab or a long stall from jumping the sea forward.
  function loop(now) {
    if (document.hidden) {
      rafId = null;
      last = 0;
      return;
    }
    var dt = last ? (now - last) / 1000 : 1 / 60;
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.05) dt = 0.05;
    last = now;
    step(dt);
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    last = 0;
    if (reducedMotion.matches) {
      step(0); // one still frame, no loop
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  function reset() {
    resize();
    buildPalette();
    start();
  }

  function handlePointer(e) {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var x = ((e.clientX - rect.left) / rect.width) * gw;
    var y = ((e.clientY - rect.top) / rect.height) * gh;
    if (pointer) {
      pointer.vx = x - pointer.x;
      pointer.vy = y - pointer.y;
    } else {
      pointer = { x: x, y: y, vx: 0, vy: 0 };
    }
    pointer.x = x;
    pointer.y = y;
  }

  canvas.style.touchAction = 'pan-y';
  canvas.addEventListener('pointermove', handlePointer);
  canvas.addEventListener('pointerdown', handlePointer);
  canvas.addEventListener('pointerleave', function () {
    pointer = null;
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !reducedMotion.matches && !rafId) {
      last = 0;
      rafId = requestAnimationFrame(loop);
    }
  });

  window.addEventListener('resize', reset);

  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function () {
      reset();
    });
    ro.observe(panel);
  }

  if (reducedMotion.addEventListener) {
    reducedMotion.addEventListener('change', reset);
  } else if (reducedMotion.addListener) {
    reducedMotion.addListener(reset);
  }

  window.addEventListener('rave:hue-change', function () {
    buildPalette();
    if (reducedMotion.matches) step(0);
  });

  reset();
})();
