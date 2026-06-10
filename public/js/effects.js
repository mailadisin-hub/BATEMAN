/* Trendzation — landing page visual effects
   Particle constellation, text scramble, counters, card spotlight, tilt.
   Vanilla JS, no dependencies. All decorative motion respects
   prefers-reduced-motion. */
(function () {
  'use strict';

  var reducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isTouch = window.matchMedia &&
    window.matchMedia('(hover: none), (pointer: coarse)').matches;

  /* ========================================================================
     1. Particle constellation canvas (hero)
     ======================================================================== */
  (function initConstellation() {
    var canvas = document.getElementById('heroCanvas');
    if (!canvas || reducedMotion) return;

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var hero = canvas.parentElement;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var width = 0;
    var height = 0;
    var particles = [];
    var PARTICLE_COUNT = 70;
    var LINK_DIST = 120;
    var MOUSE_DIST = 150;
    var mouse = { x: -9999, y: -9999, active: false };
    var rafId = null;
    var running = false;

    // Two brand tones: accent blue and silver.
    var COLORS = [
      { r: 107, g: 140, b: 206 }, // --accent
      { r: 196, g: 204, b: 216 }  // --silver
    ];

    function resize() {
      var rect = hero.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn() {
      particles.length = 0;
      var count = width < 640 ? 40 : PARTICLE_COUNT;
      for (var i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.28,
          vy: (Math.random() - 0.5) * 0.28,
          r: Math.random() * 1.4 + 0.6,
          c: COLORS[Math.random() < 0.7 ? 0 : 1],
          a: Math.random() * 0.45 + 0.25
        });
      }
    }

    function step() {
      rafId = requestAnimationFrame(step);
      ctx.clearRect(0, 0, width, height);

      var i, j, p, q, dx, dy, dist;

      for (i = 0; i < particles.length; i++) {
        p = particles[i];

        // Gentle mouse repulsion.
        if (mouse.active) {
          dx = p.x - mouse.x;
          dy = p.y - mouse.y;
          dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MOUSE_DIST && dist > 0.001) {
            var force = (MOUSE_DIST - dist) / MOUSE_DIST * 0.018;
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
          }
        }

        // Damp back toward drift speed.
        p.vx *= 0.985;
        p.vy *= 0.985;

        p.x += p.vx;
        p.y += p.vy;

        // Wrap edges.
        if (p.x < -10) p.x = width + 10;
        else if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        else if (p.y > height + 10) p.y = -10;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + p.c.r + ',' + p.c.g + ',' + p.c.b + ',' + p.a + ')';
        ctx.fill();
      }

      // Links between near particles.
      ctx.lineWidth = 1;
      for (i = 0; i < particles.length; i++) {
        p = particles[i];
        for (j = i + 1; j < particles.length; j++) {
          q = particles[j];
          dx = p.x - q.x;
          dy = p.y - q.y;
          if (Math.abs(dx) > LINK_DIST || Math.abs(dy) > LINK_DIST) continue;
          dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < LINK_DIST) {
            var o = (1 - dist / LINK_DIST) * 0.22;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = 'rgba(107,140,206,' + o.toFixed(3) + ')';
            ctx.stroke();
          }
        }

        // Link to cursor.
        if (mouse.active) {
          dx = p.x - mouse.x;
          dy = p.y - mouse.y;
          dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MOUSE_DIST) {
            var mo = (1 - dist / MOUSE_DIST) * 0.28;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.strokeStyle = 'rgba(126,159,212,' + mo.toFixed(3) + ')';
            ctx.stroke();
          }
        }
      }
    }

    function start() {
      if (running) return;
      running = true;
      rafId = requestAnimationFrame(step);
    }

    function stop() {
      running = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    hero.addEventListener('mousemove', function (e) {
      var rect = hero.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    });
    hero.addEventListener('mouseleave', function () {
      mouse.active = false;
      mouse.x = -9999;
      mouse.y = -9999;
    });

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        resize();
        spawn();
      }, 150);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else start();
    });

    resize();
    spawn();
    start();
  })();

  /* ========================================================================
     2. Text scramble effect (hero h1 accent line)
     ======================================================================== */
  (function initScramble() {
    var el = document.getElementById('scrambleText');
    if (!el) return;

    var finalText = el.textContent;
    if (reducedMotion) return; // text already present — nothing to do

    var GLYPHS = '!<>-_\\/[]{}—=+*^?#';
    var DURATION = 1200;
    var start = null;

    // Reserve layout so the line doesn't jump.
    el.style.display = 'inline-block';
    el.style.minWidth = el.offsetWidth ? el.offsetWidth + 'px' : '';

    function randGlyph() {
      return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    }

    function frame(ts) {
      if (start === null) start = ts;
      var progress = Math.min((ts - start) / DURATION, 1);
      var resolved = Math.floor(progress * finalText.length);
      var out = finalText.slice(0, resolved);
      for (var i = resolved; i < finalText.length; i++) {
        var ch = finalText[i];
        out += (ch === ' ') ? ' ' : (Math.random() < 0.55 ? randGlyph() : ch);
      }
      el.textContent = out;
      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        el.textContent = finalText;
        el.style.minWidth = '';
      }
    }

    requestAnimationFrame(frame);
  })();

  /* ========================================================================
     3. Animated counters (stats count up on scroll into view)
     ======================================================================== */
  (function initCounters() {
    var counters = document.querySelectorAll('[data-count]');
    if (!counters.length) return;

    function animate(el) {
      var target = parseFloat(el.getAttribute('data-count'));
      var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
      var suffix = el.getAttribute('data-suffix') || '';
      if (isNaN(target)) return;

      if (reducedMotion) {
        el.textContent = target.toFixed(decimals) + suffix;
        return;
      }

      var DURATION = 1400;
      var start = null;

      function frame(ts) {
        if (start === null) start = ts;
        var t = Math.min((ts - start) / DURATION, 1);
        // easeOutCubic
        var eased = 1 - Math.pow(1 - t, 3);
        el.textContent = (target * eased).toFixed(decimals) + suffix;
        if (t < 1) requestAnimationFrame(frame);
        else el.textContent = target.toFixed(decimals) + suffix;
      }

      requestAnimationFrame(frame);
    }

    if ('IntersectionObserver' in window) {
      var seen = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animate(entry.target);
            seen.unobserve(entry.target);
          }
        });
      }, { threshold: 0.4 });
      counters.forEach(function (el) { seen.observe(el); });
    } else {
      counters.forEach(animate);
    }
  })();

  /* ========================================================================
     4. Card spotlight (--mx/--my CSS vars track the cursor)
     ======================================================================== */
  (function initSpotlight() {
    if (isTouch) return;
    var cards = document.querySelectorAll('.card, .pricing-card, .step');
    if (!cards.length) return;

    cards.forEach(function (card) {
      card.addEventListener('mousemove', function (e) {
        var rect = card.getBoundingClientRect();
        var mx = ((e.clientX - rect.left) / rect.width) * 100;
        var my = ((e.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty('--mx', mx.toFixed(2) + '%');
        card.style.setProperty('--my', my.toFixed(2) + '%');
      });
      card.addEventListener('mouseleave', function () {
        card.style.setProperty('--mx', '50%');
        card.style.setProperty('--my', '50%');
      });
    });
  })();

  /* ========================================================================
     5. Tilt effect on pricing cards
     ======================================================================== */
  (function initTilt() {
    if (isTouch || reducedMotion) return;
    var cards = document.querySelectorAll('.pricing-card');
    if (!cards.length) return;

    var MAX_DEG = 4;

    cards.forEach(function (card) {
      var raf = null;
      var nextTransform = '';

      function apply() {
        raf = null;
        card.style.transform = nextTransform;
      }

      card.addEventListener('mousemove', function (e) {
        var rect = card.getBoundingClientRect();
        var px = (e.clientX - rect.left) / rect.width - 0.5;  // -0.5..0.5
        var py = (e.clientY - rect.top) / rect.height - 0.5;
        var rx = (-py * MAX_DEG).toFixed(2);
        var ry = (px * MAX_DEG).toFixed(2);
        nextTransform = 'perspective(900px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) translateY(-3px)';
        if (raf === null) raf = requestAnimationFrame(apply);
      });

      card.addEventListener('mouseleave', function () {
        if (raf !== null) {
          cancelAnimationFrame(raf);
          raf = null;
        }
        card.style.transform = '';
      });
    });
  })();
})();
