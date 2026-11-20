document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contactForm');
  const message = document.getElementById('statusMessage');
  const button = document.getElementById('submitButton');
  if (!form || !message || !button) return;
  const label = button.textContent;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    button.disabled = true;
    button.textContent = 'Надсилання...';
    message.textContent = '';
    try {
      const data = await HorrorHub.post('save_contact.php', new FormData(form));
      message.className = 'success';
      message.textContent = data.message;
      form.reset();
    } catch (error) {
      message.className = 'error';
      message.textContent = error.message;
    } finally {
      message.style.display = 'block';
      button.disabled = false;
      button.textContent = label;
    }
  });
});
