/* Settings page interactions */
(function () {
  'use strict';

  // --- Tab switching ---------------------------------------------------------
  const tabs = document.querySelectorAll('#settingsTabs .tab');
  const panels = {
    account: document.getElementById('tab-account'),
    bateman: document.getElementById('tab-bateman'),
    pricing: document.getElementById('tab-pricing'),
    dne: document.getElementById('tab-dne'),
    brand: document.getElementById('tab-brand'),
  };

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      Object.keys(panels).forEach(function (key) {
        if (panels[key]) panels[key].hidden = key !== tab.dataset.tab;
      });
    });
  });

  // --- Password change ---------------------------------------------------------
  const passwordForm = document.getElementById('passwordForm');
  if (passwordForm) {
    const feedback = document.getElementById('passwordFeedback');
    const hashOutput = document.getElementById('hashOutput');

    passwordForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      feedback.textContent = '';
      feedback.className = 'form-feedback';
      hashOutput.hidden = true;

      const current = document.getElementById('currentPassword').value;
      const next = document.getElementById('newPassword').value;
      const confirm = document.getElementById('confirmPassword').value;

      if (next !== confirm) {
        feedback.textContent = 'New passwords do not match.';
        feedback.classList.add('error');
        return;
      }
      if (next.length < 10) {
        feedback.textContent = 'New password must be at least 10 characters.';
        feedback.classList.add('error');
        return;
      }

      try {
        const data = await window.apiPost('/dashboard/settings/password', {
          current_password: current,
          new_password: next,
          confirm_password: confirm,
        });
        feedback.textContent = data.message || 'Hash generated.';
        feedback.classList.add('success');
        hashOutput.textContent = 'ADMIN_PASSWORD_HASH=' + data.hash;
        hashOutput.hidden = false;
        passwordForm.reset();
      } catch (err) {
        feedback.textContent = err.message || 'Could not change password.';
        feedback.classList.add('error');
      }
    });
  }

  // --- Pricing JSON validation before submit -----------------------------------
  const pricingForm = document.getElementById('pricingForm');
  if (pricingForm) {
    const pricingFeedback = document.getElementById('pricingFeedback');
    pricingForm.addEventListener('submit', function (e) {
      pricingFeedback.textContent = '';
      pricingFeedback.className = 'form-feedback';
      try {
        JSON.parse(document.getElementById('pricingJson').value);
      } catch (err) {
        e.preventDefault();
        pricingFeedback.textContent = 'Invalid JSON: ' + err.message;
        pricingFeedback.classList.add('error');
      }
    });
  }

  // --- DNE list ------------------------------------------------------------------
  const dneForm = document.getElementById('dneForm');
  if (dneForm) {
    dneForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const emailInput = document.getElementById('dneEmail');
      const reasonInput = document.getElementById('dneReason');

      try {
        const data = await window.apiPost('/dashboard/dne', {
          email: emailInput.value,
          reason: reasonInput.value,
        });

        const tbody = document.querySelector('#dneTable tbody');
        const emptyRow = tbody.querySelector('.empty-row');
        if (emptyRow) emptyRow.closest('tr').remove();

        const tr = document.createElement('tr');
        tr.dataset.id = data.entry.id;

        function cell(content, strong) {
          const td = document.createElement('td');
          if (strong) {
            const s = document.createElement('strong');
            s.textContent = content;
            td.appendChild(s);
          } else {
            td.textContent = content;
          }
          return td;
        }

        tr.appendChild(cell(data.entry.email, true));
        tr.appendChild(cell(data.entry.domain || '—'));
        tr.appendChild(cell(data.entry.reason || '—'));
        tr.appendChild(cell('just now'));

        const actionTd = document.createElement('td');
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-icon dne-delete';
        delBtn.dataset.id = data.entry.id;
        delBtn.setAttribute('aria-label', 'Remove');
        delBtn.innerHTML = '&times;';
        bindDneDelete(delBtn);
        actionTd.appendChild(delBtn);
        tr.appendChild(actionTd);

        tbody.insertBefore(tr, tbody.firstChild);
        dneForm.reset();
        window.showToast(data.entry.email + ' added to DNE list.', 'success');
      } catch (err) {
        window.showToast(err.message || 'Could not add to DNE list.', 'error');
      }
    });
  }

  function bindDneDelete(btn) {
    btn.addEventListener('click', async function () {
      const row = btn.closest('tr');
      const email = row ? (row.querySelector('strong') || {}).textContent : 'this entry';
      if (!window.confirmAction('Remove ' + email + ' from the DNE list?')) return;

      try {
        await window.apiDelete('/dashboard/dne/' + btn.dataset.id);
        if (row) row.remove();
        window.showToast('Removed from DNE list.', 'success');
      } catch (err) {
        window.showToast(err.message || 'Could not remove entry.', 'error');
      }
    });
  }

  document.querySelectorAll('.dne-delete').forEach(bindDneDelete);
})();
