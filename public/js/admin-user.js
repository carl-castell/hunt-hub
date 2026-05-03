document.addEventListener('DOMContentLoaded', function () {

  // ── Edit user toggle ───────────────────────────────────────────────────────
  var editUserBtn      = document.getElementById('editUserBtn');
  var editUserForm     = document.getElementById('editUserForm');
  var cancelEditUserBtn = document.getElementById('cancelEditUserBtn');

  if (editUserBtn && editUserForm) {
    editUserBtn.addEventListener('click', function () {
      editUserForm.style.display = 'block';
      editUserBtn.style.display = 'none';
    });
    cancelEditUserBtn.addEventListener('click', function () {
      editUserForm.style.display = 'none';
      editUserBtn.style.display = 'inline-block';
    });
  }

  // ── Copy activation link ───────────────────────────────────────────────────
  var copyLinkBtn = document.getElementById('copyLinkBtn');
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', function () {
      var text = document.getElementById('activationLinkInput').textContent;
      navigator.clipboard.writeText(text).then(function () {
        copyLinkBtn.textContent = 'Copied!';
        setTimeout(function () { copyLinkBtn.textContent = 'Copy'; }, 2000);
      });
    });
  }

  // ── Delete user confirmation ───────────────────────────────────────────────
  var deleteUserBtn = document.getElementById('deleteUserBtn');
  if (deleteUserBtn) {
    var deleteUserConfirm    = document.getElementById('deleteUserConfirm');
    var confirmDeleteUserBtn = document.getElementById('confirmDeleteUserBtn');
    var cancelDeleteUserBtn  = document.getElementById('cancelDeleteUserBtn');

    deleteUserBtn.addEventListener('click', function () {
      deleteUserBtn.style.display = 'none';
      deleteUserConfirm.style.display = 'flex';
    });
    cancelDeleteUserBtn.addEventListener('click', function () {
      deleteUserConfirm.style.display = 'none';
      deleteUserBtn.style.display = 'inline-block';
    });
    confirmDeleteUserBtn.addEventListener('click', function () {
      document.getElementById('deleteUserForm').submit();
    });
  }

});
