/*
 * state.js — theme toggle, hue reroll, footer stats, project filter chips,
 * and the about-page email-copy button.
 *
 * Cross-file event contract: this file dispatches a custom `rave:hue-change`
 * event on `window` whenever the theme is switched or the hue is rerolled.
 * background.js and flowfield.js both listen for it to recolour/reseed
 * immediately instead of waiting for their next scheduled frame.
 *
 * Must stay in sync with the pre-paint bootstrap script in <head> (added by
 * the template stream): same HUES list, same localStorage keys
 * (`rave-theme`, `rave-hue`, `rave-hue-override`), same `data-hue-source`
 * attribute values.
 */
(function () {
  'use strict';

  var HUES = [
    { n: 'yellow', h: 105 },
    { n: 'orange', h: 45 },
    { n: 'pink', h: 355 },
    { n: 'purple', h: 295 },
    { n: 'green', h: 145 },
    { n: 'cyan', h: 210 }
  ];

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function dispatchHueChange() {
    window.dispatchEvent(new Event('rave:hue-change'));
  }

  ready(function () {
    var html = document.documentElement;

    // --- Theme toggle -----------------------------------------------------
    var themeButtons = document.querySelectorAll('button.theme-toggle__option[data-theme-option]');
    if (themeButtons.length) {
      var syncActive = function () {
        var current = html.classList.contains('dark') ? 'dark' : 'fluoro';
        themeButtons.forEach(function (btn) {
          btn.classList.toggle('is-active', btn.dataset.themeOption === current);
        });
      };
      syncActive();
      themeButtons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var value = btn.dataset.themeOption;
          if (value !== 'dark' && value !== 'fluoro') return;
          html.classList.remove('dark', 'fluoro');
          html.classList.add(value);
          try { localStorage.setItem('rave-theme', value); } catch (e) {}
          syncActive();
          dispatchHueChange();
        });
      });
    }

    var hueValueEl = document.getElementById('hue-value');
    var hueSourceEl = document.getElementById('hue-source');
    function updateHueFooter() {
      if (hueValueEl) {
        hueValueEl.textContent = getComputedStyle(html).getPropertyValue('--h').trim();
      }
      if (hueSourceEl) {
        hueSourceEl.textContent = html.dataset.hueSource === 'you' ? 'set by you' : 'random on load';
      }
    }
    updateHueFooter();

    // --- Reroll ---------------------------------------------------------
    var rerollBtn = document.getElementById('hue-reroll');
    if (rerollBtn) {
      rerollBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var current = parseFloat(getComputedStyle(html).getPropertyValue('--h'));
        var pool = HUES.filter(function (x) { return x.h !== current; });
        var pick = pool[Math.floor(Math.random() * pool.length)] || HUES[0];
        html.style.setProperty('--h', pick.h);
        try {
          localStorage.setItem('rave-hue-override', pick.h);
          localStorage.setItem('rave-hue', pick.h);
        } catch (err) {}
        html.setAttribute('data-hue-source', 'you');
        updateHueFooter();
        dispatchHueChange();
      });
    }

    // --- Filter chips (/projects only) --------------------------------------
    var filterChips = document.querySelector('.filter-chips');
    if (filterChips) {
      var chips = filterChips.querySelectorAll('button.chip.filter-chip[data-tag]');
      var cards = document.querySelectorAll('.project-card[data-tag]');
      chips.forEach(function (chip) {
        chip.addEventListener('click', function () {
          chips.forEach(function (c) { c.classList.remove('is-active'); });
          chip.classList.add('is-active');
          var tag = chip.dataset.tag;
          cards.forEach(function (card) {
            // The featured card is a rest that only appears under "all"
            // (README, "Projects /projects" — "Featured card (only when
            // the filter is 'all')"), independent of whether its own tag
            // matches the active filter.
            if (card.classList.contains('project-card--featured')) {
              card.hidden = tag !== 'all';
              return;
            }
            card.hidden = tag !== 'all' && card.dataset.tag !== tag;
          });
        });
      });
    }

    // --- Copy email (about page) ---------------------------------------
    var emailButtons = document.querySelectorAll('button.email-reveal[data-email]');
    emailButtons.forEach(function (btn) {
      var original = btn.textContent;
      var timer = null;
      btn.addEventListener('click', function () {
        var email = btn.dataset.email;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(email).catch(function () {});
        }
        btn.textContent = 'copied hello@';
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
          btn.textContent = original;
          timer = null;
        }, 1600);
      });
    });
  });

  // --- Footer stats -----------------------------------------------------
  // Read on `load`, not inside `ready()` above: state.js is `defer`red, so
  // by the time it runs `document.readyState` is already 'interactive' and
  // `ready()` calls its callback immediately, before DOMContentLoaded has
  // actually fired — at that point `domContentLoadedEventEnd` is still 0.
  // `load` always fires after DOMContentLoaded completes, so the timing
  // entry is populated by then.
  function paintDomReadyStat() {
    var domReadyStat = document.getElementById('dom-ready-stat');
    if (!domReadyStat) return;
    var navEntries = performance.getEntriesByType && performance.getEntriesByType('navigation');
    var nav = navEntries && navEntries[0];
    if (nav) domReadyStat.textContent = Math.round(nav.domContentLoadedEventEnd);
  }
  if (document.readyState === 'complete') {
    paintDomReadyStat();
  } else {
    window.addEventListener('load', paintDomReadyStat);
  }
})();
