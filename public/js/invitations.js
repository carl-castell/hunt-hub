document.addEventListener('DOMContentLoaded', function () {

  // ── Invitation picker (picker.ejs) ─────────────────────────────────────────
  var pickerTable = document.getElementById('picker-table');
  if (pickerTable) {
    var selected = new Set();

    pickerTable.addEventListener('change', function (e) {
      if (!e.target.matches('input[type=checkbox]')) return;
      var id = Number(e.target.value);
      e.target.checked ? selected.add(id) : selected.delete(id);
      document.getElementById('selected-count').textContent = selected.size;
      document.getElementById('stage-btn').disabled = selected.size === 0;
    });

    document.body.addEventListener('htmx:afterSwap', function (e) {
      if (e.detail.target.id !== 'picker-body') return;
      e.detail.target.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
        if (selected.has(Number(cb.value))) cb.checked = true;
      });
    });

    document.getElementById('stage-btn').addEventListener('click', function () {
      var form = document.getElementById('stage-form');
      form.querySelectorAll('input[name="guestIds"]').forEach(function (i) { i.remove(); });
      selected.forEach(function (id) {
        var inp = document.createElement('input');
        inp.type = 'hidden';
        inp.name = 'guestIds';
        inp.value = id;
        form.appendChild(inp);
      });
      form.submit();
    });
  }

  // ── Send invitations (send.ejs) ────────────────────────────────────────────
  var selectAll = document.getElementById('select-all');
  if (selectAll) {
    selectAll.addEventListener('change', function () {
      document.querySelectorAll('input[name="invitationIds"]')
        .forEach(function (cb) { cb.checked = selectAll.checked; });
    });

    document.querySelectorAll('input[name="invitationIds"]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var all = document.querySelectorAll('input[name="invitationIds"]');
        var checked = document.querySelectorAll('input[name="invitationIds"]:checked');
        selectAll.checked = all.length === checked.length;
        selectAll.indeterminate = checked.length > 0 && checked.length < all.length;
      });
    });

    var previewBtn = document.getElementById('preview-btn');
    if (previewBtn) {
      previewBtn.addEventListener('click', function () {
        var message = document.querySelector('textarea[name="message"]').value;
        var eventId = previewBtn.dataset.eventId;
        var url = '/manager/events/' + eventId + '/invitations/preview?message=' + encodeURIComponent(message);
        window.open(url, '_blank', 'noopener');
      });
    }

    document.getElementById('open-confirm-btn').addEventListener('click', function () {
      var checked = Array.from(document.querySelectorAll('input[name="invitationIds"]:checked'));
      if (!checked.length) { alert('Please select at least one guest.'); return; }
      var list = document.getElementById('confirm-list');
      list.innerHTML = checked.map(function (cb) {
        var row = cb.closest('tr');
        var cells = row.querySelectorAll('td');
        return '<li>' + cells[0].textContent.trim() + ' ' + cells[1].textContent.trim() +
               ' <span style="color:var(--pico-muted-color);">(' + cells[2].textContent.trim() + ')</span></li>';
      }).join('');
      document.getElementById('confirm-dialog').showModal();
    });

    document.getElementById('do-send-btn').addEventListener('click', function () {
      document.getElementById('confirm-dialog').close();
      document.getElementById('loading-overlay').classList.add('active');
      htmx.trigger(document.getElementById('send-form'), 'confirmed');
    });
  }

  // ── Invitation list (list.ejs) ─────────────────────────────────────────────
  var clearFilters = document.getElementById('clear-filters');
  if (clearFilters) {
    document.body.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-remove-action]');
      if (!btn) return;
      e.preventDefault();
      document.getElementById('remove-inv-name').textContent = btn.getAttribute('data-remove-name');
      document.getElementById('remove-inv-form').action = btn.getAttribute('data-remove-action');
      document.getElementById('remove-inv-dialog').showModal();
    });

    clearFilters.addEventListener('click', function () {
      document.querySelector('select[name="status"]').value = '';
      document.querySelector('select[name="response"]').value = '';
      htmx.trigger(document.querySelector('select[name="status"]'), 'change');
    });
  }

  // ── Invitation show (show.ejs) ─────────────────────────────────────────────
  var invGrid = document.querySelector('.inv-grid');
  if (invGrid) {
    var form = invGrid.closest('form');
    var save = document.getElementById('inv-save');
    if (form && save) {
      form.querySelectorAll('select').forEach(function (s) {
        s.addEventListener('change', function () { save.style.display = 'block'; });
      });
    }
  }

});
