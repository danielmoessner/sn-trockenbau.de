(function () {
  function applyStatus(form, status) {
    var wrapper = form.closest('.w-form');
    if (!wrapper) return;

    var done = wrapper.querySelector('.w-form-done');
    var fail = wrapper.querySelector('.w-form-fail');

    if (status === 'success') {
      form.style.display = 'none';
      if (done) done.style.display = 'block';
      if (fail) fail.style.display = 'none';
      return;
    }

    if (done) done.style.display = 'none';
    if (fail) {
      var textNode = fail.querySelector('div');
      if (textNode) {
        var baseText = fail.dataset.baseText || textNode.textContent || 'Fehler beim Senden.';
        fail.dataset.baseText = baseText;
        textNode.textContent = baseText + ' Fehlercode: ' + status;
      }
      fail.style.display = 'block';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var url = new URL(window.location.href);
    var status = url.searchParams.get('form_status');
    if (!status) return;

    var forms = document.querySelectorAll('form#wf-form-form-contact');
    forms.forEach(function (form) {
      applyStatus(form, status);
    });

    url.searchParams.delete('form_status');
    window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '') + url.hash);
  });
})();
