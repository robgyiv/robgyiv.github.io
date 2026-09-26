/*
 * reveal.js — two independent jobs, each guarded so this file is harmless
 * on pages without the relevant elements:
 *   1. Mobile thumbnail reveal: scroll-driven .is-revealed toggling on
 *      .project-card__media for viewports <640px (desktop reveal is pure
 *      CSS :hover, handled by the sass stream).
 *   2. Seeded pixel tiles for image-less project cards
 *      (.project-card__media[data-pixel-label]), via FNV-1a -> mulberry32.
 *
 * Also listens for the shared `rave:hue-change` event (see background.js /
 * waves.js for the full contract) so pixel tiles stay in sync with the
 * page's current --h after a theme toggle or reroll.
 */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  // --- Job 1: mobile thumbnail reveal ---------------------------------------
  function setupMobileReveal() {
    var medias = document.querySelectorAll('.project-card__media');
    if (!medias.length) return;

    var mq = window.matchMedia('(max-width: 640px)');
    var ticking = false;

    function reveal() {
      ticking = false;
      if (!mq.matches) return;
      var vh = window.innerHeight;
      var mid = vh / 2;
      var best = null;
      var bestDist = Infinity;

      medias.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        var d = Math.abs((r.top + r.bottom) / 2 - mid);
        if (d < bestDist) {
          bestDist = d;
          best = el;
        }
      });

      medias.forEach(function (el) {
        el.classList.toggle('is-revealed', el === best);
      });
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(reveal);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    reveal();
  }

  // --- Job 2: seeded pixel tiles ---------------------------------------------
  var L_LEVELS = [0.2, 0.38, 0.6, 0.8, 0.93];
  var COLS = 16;
  var ROWS = 10;

  function fnv1a(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    var a = seed;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function drawPixelTile(el) {
    var canvas = el.querySelector('canvas.project-card__pixel-tile');
    if (!canvas) return;

    var seedText = el.dataset.pixelSeed || el.dataset.pixelLabel || '';
    var hue = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--h')) || 0;

    var rect = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var rand = mulberry32(fnv1a(seedText));
    var cellW = w / COLS;
    var cellH = h / ROWS;

    for (var i = 0; i < COLS * ROWS; i++) {
      var v = rand();
      var L = L_LEVELS[Math.floor(rand() * L_LEVELS.length)];
      var cellHue = v < 0.14 ? hue + 50 : v < 0.24 ? hue - 40 : hue;
      var chroma = L > 0.9 ? 0.07 : 0.2;
      var col = i % COLS;
      var row = Math.floor(i / COLS);
      ctx.fillStyle = 'oklch(' + L + ' ' + chroma + ' ' + cellHue + ')';
      ctx.fillRect(col * cellW, row * cellH, Math.ceil(cellW), Math.ceil(cellH));
    }

    if (!el.querySelector('.project-card__pixel-label')) {
      var label = document.createElement('div');
      label.className = 'project-card__pixel-label';
      label.textContent = el.dataset.pixelLabel || '';
      el.appendChild(label);
    }
  }

  function setupPixelTiles() {
    var tiles = document.querySelectorAll('.project-card__media[data-pixel-label]');
    if (!tiles.length) return;

    tiles.forEach(drawPixelTile);

    window.addEventListener('rave:hue-change', function () {
      tiles.forEach(drawPixelTile);
    });
  }

  ready(function () {
    setupMobileReveal();
    setupPixelTiles();
  });
})();
