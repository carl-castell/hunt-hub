document.addEventListener('DOMContentLoaded', function () {

  // ── Open dialog ────────────────────────────────────────────────────────────
  document.body.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-dialog]');
    if (!btn) return;
    var dialog = document.getElementById(btn.getAttribute('data-dialog'));
    if (dialog) dialog.showModal();
  });

  // ── Close dialog ───────────────────────────────────────────────────────────
  document.body.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-close-dialog]');
    if (!btn) return;
    var dialog = document.getElementById(btn.getAttribute('data-close-dialog'));
    if (dialog) dialog.close();
  });

  // ── Table row navigation ───────────────────────────────────────────────────
  document.body.addEventListener('click', function (e) {
    var row = e.target.closest('tr[data-href]');
    if (!row) return;
    if (e.target.closest('a, button, summary, input, select, textarea, label, form')) return;
    window.location = row.getAttribute('data-href');
  });

  // ── Clipboard copy ─────────────────────────────────────────────────────────
  document.body.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-copy-target]');
    if (!btn) return;
    var target = document.getElementById(btn.getAttribute('data-copy-target'));
    if (!target) return;
    navigator.clipboard.writeText(target.value)
      .then(function () { btn.textContent = 'Copied!'; })
      .catch(function () { btn.textContent = 'Failed'; });
  });

});
