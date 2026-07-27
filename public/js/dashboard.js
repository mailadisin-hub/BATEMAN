/* Bateman Command Centre — shared dashboard JS */
(function () {
  'use strict';

  // --- CSRF helper ---------------------------------------------------------
  window.getCsrfToken = function () {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
  };

  // --- Sidebar mobile toggle -----------------------------------------------
  const toggle = document.getElementById('sidebarToggle');
  const sidebar = document.querySelector('.sidebar');

  if (toggle && sidebar) {
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      sidebar.classList.toggle('open');
    });
    document.addEventListener('click', function (e) {
      if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== toggle) {
        sidebar.classList.remove('open');
      }
    });
  }

  // --- Toast notifications ---------------------------------------------------
  let toastContainer = null;

  window.showToast = function (message, type) {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }
    const toast = document.createElement('div');
    toast.className = 'toast' + (type ? ' ' + type : '');
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(function () { toast.remove(); }, 320);
    }, 3500);
  };

  // --- Confirm wrapper -------------------------------------------------------
  window.confirmAction = function (message) {
    return window.confirm(message || 'Are you sure?');
  };

  // --- JSON request helpers --------------------------------------------------
  async function jsonRequest(method, url, body) {
    const res = await fetch(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': window.getCsrfToken(),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try {
      data = await res.json();
    } catch (_) { /* non-JSON response */ }
    if (!res.ok) {
      throw new Error(data.error || 'Request failed (' + res.status + ')');
    }
    return data;
  }

  window.apiPatch = function (url, body) { return jsonRequest('PATCH', url, body); };
  window.apiPost = function (url, body) { return jsonRequest('POST', url, body); };
  window.apiDelete = function (url) { return jsonRequest('DELETE', url); };
})();
