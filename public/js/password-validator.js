(function () {
  var pw = document.getElementById('password') || document.getElementById('new-password');
  if (!pw) return;
  var hl = document.getElementById('hint-length');
  var hu = document.getElementById('hint-upper');
  var hn = document.getElementById('hint-number');
  var hs = document.getElementById('hint-special');
  if (!hl || !hu || !hn || !hs) return;
  pw.addEventListener('input', function () {
    hl.style.color = pw.value.length >= 8           ? '#16a34a' : '#6b7280';
    hu.style.color = /[A-Z]/.test(pw.value)         ? '#16a34a' : '#6b7280';
    hn.style.color = /[0-9]/.test(pw.value)         ? '#16a34a' : '#6b7280';
    hs.style.color = /[^a-zA-Z0-9]/.test(pw.value) ? '#16a34a' : '#6b7280';
  });
})();
