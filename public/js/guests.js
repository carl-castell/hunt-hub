document.addEventListener('DOMContentLoaded', function () {

  // ── Add-to-group dialog: select / new-group mutual exclusion ───────────────
  var atgSelect = document.getElementById('atg-select');
  var atgNew    = document.getElementById('atg-new');
  if (atgSelect && atgNew) {
    atgSelect.addEventListener('change', function () {
      if (atgSelect.value) { atgNew.value = ''; atgNew.disabled = true; }
      else atgNew.disabled = false;
    });
    atgNew.addEventListener('input', function () {
      if (atgNew.value.trim()) { atgSelect.value = ''; atgSelect.disabled = true; }
      else atgSelect.disabled = false;
    });
  }

  // ── File upload: size check + loading state ────────────────────────────────
  var MAX_BYTES = 20 * 1024 * 1024;

  function checkFileSizes(input) {
    var files = Array.from(input.files);
    var tooBig = files.filter(function (f) { return f.size > MAX_BYTES; });
    if (tooBig.length) {
      alert('The following file(s) exceed the 20 MB limit and cannot be uploaded:\n' +
        tooBig.map(function (f) {
          return '• ' + f.name + ' (' + (f.size / 1024 / 1024).toFixed(1) + ' MB)';
        }).join('\n'));
      input.value = '';
      return false;
    }
    return true;
  }

  function bindUploadForm(formId, uploadBtnId, cancelBtnId) {
    var form = document.getElementById(formId);
    if (!form) return;
    var fileInput = form.querySelector('input[type="file"]');
    if (fileInput) {
      fileInput.addEventListener('change', function () { checkFileSizes(fileInput); });
    }
    form.addEventListener('submit', function (e) {
      if (fileInput && !checkFileSizes(fileInput)) { e.preventDefault(); return; }
      var btn    = document.getElementById(uploadBtnId);
      var cancel = document.getElementById(cancelBtnId);
      if (btn)    btn.setAttribute('aria-busy', 'true');
      if (cancel) cancel.disabled = true;
    });
  }

  bindUploadForm('license-upload-form',     'license-upload-btn',     'license-cancel-btn');
  bindUploadForm('certificate-upload-form', 'certificate-upload-btn', 'certificate-cancel-btn');

});
