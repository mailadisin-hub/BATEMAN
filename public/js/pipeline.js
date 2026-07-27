/* Pipeline & Clients table interactions (shared by both pages) */
(function () {
  'use strict';

  const page = document.body.dataset.page; // 'pipeline' or 'clients'
  const defaultEntity = page === 'clients' ? 'clients' : 'pipeline';

  // --- Add-entry modal -------------------------------------------------------
  const modal = document.getElementById('addModal');
  const openBtn = document.getElementById('openAddModal');
  const closeBtn = document.getElementById('closeAddModal');

  if (openBtn && modal) {
    openBtn.addEventListener('click', function () { modal.hidden = false; });
    closeBtn.addEventListener('click', function () { modal.hidden = true; });
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.hidden = true;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) modal.hidden = true;
    });
  }

  // --- Inline status updates ---------------------------------------------------
  document.querySelectorAll('.status-select').forEach(function (select) {
    select.addEventListener('change', async function () {
      const id = select.dataset.id;
      const entity = select.dataset.entity || defaultEntity;
      const newStatus = select.value;

      try {
        await window.apiPatch('/dashboard/' + entity + '/' + id, { status: newStatus });
        // Swap the colour class to match the new status
        select.className = 'status-select status-' + newStatus.toLowerCase();
        window.showToast('Status updated to ' + newStatus.replace('_', ' '), 'success');
      } catch (err) {
        window.showToast(err.message || 'Could not update status.', 'error');
      }
    });
  });

  // --- Delete rows ------------------------------------------------------------
  document.querySelectorAll('.delete-row').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      const id = btn.dataset.id;
      const entity = btn.dataset.entity || defaultEntity;
      const row = btn.closest('tr');
      const name = row ? (row.querySelector('strong') || {}).textContent : 'this entry';

      if (!window.confirmAction('Delete ' + name + '? This cannot be undone.')) return;

      try {
        await window.apiDelete('/dashboard/' + entity + '/' + id);
        if (row) row.remove();
        window.showToast('Deleted.', 'success');
      } catch (err) {
        window.showToast(err.message || 'Could not delete.', 'error');
      }
    });
  });

  // --- Client-side column sorting -------------------------------------------
  const table = document.getElementById('pipelineTable') || document.getElementById('clientsTable');
  if (!table) return;

  table.querySelectorAll('th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      const key = th.dataset.sort;
      const tbody = table.querySelector('tbody');
      const rows = Array.from(tbody.querySelectorAll('tr')).filter(function (r) {
        return !r.querySelector('.empty-row');
      });

      const ascending = !th.classList.contains('sorted-asc');
      table.querySelectorAll('th').forEach(function (h) {
        h.classList.remove('sorted-asc', 'sorted-desc');
      });
      th.classList.add(ascending ? 'sorted-asc' : 'sorted-desc');

      rows.sort(function (a, b) {
        let va = a.dataset[key] || '';
        let vb = b.dataset[key] || '';
        const na = parseFloat(va);
        const nb = parseFloat(vb);
        if (!isNaN(na) && !isNaN(nb)) {
          return ascending ? na - nb : nb - na;
        }
        return ascending ? va.localeCompare(vb) : vb.localeCompare(va);
      });

      rows.forEach(function (r) { tbody.appendChild(r); });
    });
  });
})();
