function toggleWfsToken() {
  const field = document.getElementById('wfs-token-field');
  const btn = document.getElementById('wfs-toggle-btn');
  if (!field || !btn) return;
  if (field.type === 'password') {
    field.type = 'text';
    btn.textContent = 'Hide';
  } else {
    field.type = 'password';
    btn.textContent = 'Show';
  }
}

function copyWfsToken() {
  const field = document.getElementById('wfs-token-field');
  if (!field) return;
  navigator.clipboard.writeText(field.value).catch(() => {
    field.select();
    document.execCommand('copy');
  });
}
