document.addEventListener('DOMContentLoaded', () => {
  bindAuthForm({
    formId: 'loginForm',
    messageId: 'loginMessage',
    action: 'login',
    successRedirect: 'index.html'
  });

  bindAuthForm({
    formId: 'registerForm',
    messageId: 'registerMessage',
    action: 'register'
  });

  function bindAuthForm({ formId, messageId, action, successRedirect }) {
    const form = document.getElementById(formId);
    const message = document.getElementById(messageId);
    if (!form || !message) return;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitButton = form.querySelector('button[type="submit"]');
      const formData = new FormData(form);
      formData.append('action', action);

      setLoading(submitButton, true);
      showMessage(message, '', '');

      try {
        const response = await fetch('api_auth.php', {
          method: 'POST',
          body: formData,
          headers: { Accept: 'application/json' }
        });
        const data = await response.json();

        if (!response.ok || data.status !== 'success') {
          throw new Error(data.message || 'Сталася помилка. Спробуйте ще раз.');
        }

        showMessage(message, data.message, 'success');
        form.reset();

        if (successRedirect) {
          window.location.href = successRedirect;
        }
      } catch (error) {
        showMessage(message, error.message, 'error');
      } finally {
        setLoading(submitButton, false);
      }
    });
  }

  function setLoading(button, isLoading) {
    if (!button) return;
    if (!button.dataset.defaultText) {
      button.dataset.defaultText = button.textContent;
    }

    button.disabled = isLoading;
    button.textContent = isLoading ? 'Зачекайте...' : button.dataset.defaultText;
  }

  function showMessage(element, text, type) {
    element.textContent = text;
    element.classList.toggle('is-success', type === 'success');
    element.classList.toggle('is-error', type === 'error');
  }
});
