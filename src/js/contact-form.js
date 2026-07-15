(function () {
  function showStatusFromQuery(form) {
    var url = new URL(window.location.href);
    var status = url.searchParams.get('form_status');
    if (!status) {
      return;
    }

    var wrapper = form.closest('.w-form');
    if (!wrapper) {
      return;
    }

    var done = wrapper.querySelector('.w-form-done');
    var fail = wrapper.querySelector('.w-form-fail');

    if (status === 'success') {
      form.style.display = 'none';
      if (done) {
        done.style.display = 'block';
      }
      if (fail) {
        fail.style.display = 'none';
      }
    } else {
      if (done) {
        done.style.display = 'none';
      }
      if (fail) {
        fail.style.display = 'block';
      }
    }

    // Keep URL clean after status is displayed.
    url.searchParams.delete('form_status');
    window.history.replaceState({}, '', url.pathname + (url.search ? '?' + url.searchParams.toString() : '') + url.hash);
  }

  function initForm(form) {
    var ts = form.querySelector('input[name="form_started"]');
    if (ts && !ts.value) {
      ts.value = String(Math.floor(Date.now() / 1000));
    }

    showStatusFromQuery(form);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var forms = document.querySelectorAll('form#wf-form-form-contact');
    forms.forEach(initForm);
  });
})();
