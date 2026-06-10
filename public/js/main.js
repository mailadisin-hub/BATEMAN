/* Trendzation — public site JS */
(function () {
  'use strict';

  // --- Nav scroll effect ---------------------------------------------------
  const nav = document.getElementById('siteNav');
  function onScroll() {
    nav.classList.toggle('scrolled', window.scrollY > 50);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // --- Mobile nav ----------------------------------------------------------
  const hamburger = document.getElementById('navHamburger');
  const navLinks = document.getElementById('navLinks');

  hamburger.addEventListener('click', function () {
    const open = navLinks.classList.toggle('open');
    hamburger.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', String(open));
  });

  navLinks.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      navLinks.classList.remove('open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });

  // --- Scroll-in animations ------------------------------------------------
  const animated = document.querySelectorAll('[data-animate]');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            // Cascade .visible to direct children that need stagger
            entry.target.querySelectorAll('.card, .step, .pricing-card').forEach(function (child) {
              // Tiny delay so CSS nth-child delays have time to apply
              requestAnimationFrame(function () { child.classList.add('visible'); });
            });
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 }
    );
    animated.forEach(function (el) { observer.observe(el); });
  } else {
    animated.forEach(function (el) {
      el.classList.add('visible');
      el.querySelectorAll('.card, .step, .pricing-card').forEach(function (c) { c.classList.add('visible'); });
    });
  }

  // --- Contact form --------------------------------------------------------
  const form = document.getElementById('contactForm');
  if (!form) return;

  const feedback = document.getElementById('formFeedback');
  const submitBtn = document.getElementById('contactSubmit');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    feedback.textContent = '';
    feedback.className = 'form-feedback';

    const payload = {
      _csrf: form.querySelector('input[name="_csrf"]').value,
      name: form.name.value,
      business_name: form.business_name.value,
      email: form.email.value,
      message: form.message.value,
    };

    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    submitBtn.textContent = 'Sending…';

    try {
      const res = await fetch('/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        feedback.textContent = data.message || "Thanks! We'll be in touch within 1 business day.";
        feedback.classList.add('success');
        form.reset();
      } else {
        feedback.textContent = (data.errors && data.errors.join(' ')) || data.error || 'Something went wrong. Please try again.';
        feedback.classList.add('error');
      }
    } catch (err) {
      feedback.textContent = 'Could not send your message. Please check your connection and try again.';
      feedback.classList.add('error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });
})();
