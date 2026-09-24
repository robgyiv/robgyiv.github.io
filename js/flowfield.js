/*
 * flowfield.js — homepage particle canvas (#flowfield-canvas, inside
 * .flowfield-panel). Harmless no-op on pages that don't have that element.
 *
 * Cross-file event contract: listens for a custom `rave:hue-change` event on
 * `window`, dispatched by state.js whenever the theme is toggled or the hue
 * is rerolled. On receipt this file reseeds its particles, clears the
 * canvas, and restarts its animation loop so colours/hue stay in sync.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('flowfield-canvas');
  if (!canvas) return;

  var panel = canvas.closest('.flowfield-panel') || canvas.parentElement;
  if (!panel) return;

  var ctx = canvas.getContext('2d');
  var html = document.documentElement;

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  var particles = [];
  var pointer = null;
  var t = 0;
  var w = 0, h = 0, dpr = 1;
  var rafId = null;

  function isDark() {
    return html.classList.contains('dark');
  }

  function strokeColors() {
    var hue = parseFloat(getComputedStyle(html).getPropertyValue('--h')) || 0;
    if (isDark()) {
      return {
        a: 'oklch(0.85 0.2 ' + hue + ' / .5)',
        b: 'oklch(0.72 0.18 ' + (hue + 50) + ' / .4)'
      };
    }
    return {
      a: 'oklch(0.55 0.23 ' + hue + ' / .5)',
      b: 'oklch(0.62 0.2 ' + (hue + 50) + ' / .4)'
    };
  }

  function cardColor() {
    var v = getComputedStyle(canvas).getPropertyValue('--card').trim();
    if (!v) v = getComputedStyle(html).getPropertyValue('--card').trim();
    return v || '#000';
  }

  function seedParticles() {
    var count = Math.max(1, Math.round((w * h) / 420));
    particles = [];
    for (var i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        life: 100 + Math.random() * 200
      });
    }
  }

  function resize() {
    var rect = panel.getBoundingClientRect();
    w = Math.max(1, Math.round(rect.width));
    h = Math.max(1, Math.round(rect.height));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = cardColor();
    ctx.fillRect(0, 0, w, h);
    seedParticles();
    t = 0;
  }

  function step(still) {
    t += still ? 0 : 0.0022;

    ctx.globalAlpha = 0.07;
    ctx.fillStyle = cardColor();
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;

    var col = strokeColors();
    var half = particles.length >> 1;
    var groups = [
      [0, half, col.a],
      [half, particles.length, col.b]
    ];

    for (var g = 0; g < groups.length; g++) {
      var from = groups[g][0], to = groups[g][1], stroke = groups[g][2];
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var i = from; i < to; i++) {
        var p = particles[i];
        var ang =
          (Math.sin(p.x * 0.006 + t * 3) +
            Math.cos(p.y * 0.007 - t * 2) +
            Math.sin((p.x + p.y) * 0.003 + t)) *
          Math.PI *
          0.9;
        var vx = Math.cos(ang) * 1.2;
        var vy = Math.sin(ang) * 1.2;

        if (pointer) {
          var dx = p.x - pointer.x;
          var dy = p.y - pointer.y;
          var d2 = dx * dx + dy * dy;
          if (d2 < 9000) {
            var d = Math.sqrt(d2) || 1;
            var f = (1 - d2 / 9000) * 3;
            vx += (dx / d) * f;
            vy += (dy / d) * f;
          }
        }

        ctx.moveTo(p.x, p.y);
        p.x += vx;
        p.y += vy;
        ctx.lineTo(p.x, p.y);
        p.life--;

        if (p.life < 0 || p.x < 0 || p.x > w || p.y < 0 || p.y > h) {
          p.x = Math.random() * w;
          p.y = Math.random() * h;
          p.life = 100 + Math.random() * 200;
        }
      }
      ctx.stroke();
    }
  }

  function runReducedOnce() {
    for (var i = 0; i < 260; i++) step(true);
  }

  function loop() {
    if (document.hidden) {
      rafId = null;
      return;
    }
    step(false);
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (reducedMotion.matches) {
      runReducedOnce();
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  function reset() {
    resize();
    start();
  }

  function handlePointer(e) {
    var rect = canvas.getBoundingClientRect();
    pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.style.touchAction = 'pan-y';
  canvas.addEventListener('pointermove', handlePointer);
  canvas.addEventListener('pointerdown', handlePointer);
  canvas.addEventListener('pointerleave', function () {
    pointer = null;
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !reducedMotion.matches && !rafId) {
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

  window.addEventListener('rave:hue-change', reset);

  reset();
})();
