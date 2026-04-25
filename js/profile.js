document.addEventListener('DOMContentLoaded', async () => {
  const profileInfo = document.getElementById('profile-info');
  const profileForm = document.getElementById('profileForm');
  const avatarInput = document.getElementById('avatarInput');
  const profileMessage = document.getElementById('profileMessage');
  const saveButton = document.getElementById('saveBtn');

  if (!profileInfo || !profileForm || !avatarInput || !profileMessage) return;

  try {
    const response = await fetch('api_auth.php?action=status', {
      headers: { Accept: 'application/json' }
    });
    const auth = await response.json();

    if (!auth.logged_in || !auth.user) {
      window.location.href = 'login.html';
      return;
    }

    renderProfile(auth.user);
    avatarInput.value = auth.user.avatar || '';
    profileForm.hidden = false;
  } catch (error) {
    console.error('Помилка завантаження профілю:', error);
    profileInfo.replaceChildren(createMessage("Помилка зв'язку з базою даних.", true));
  }

  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setSaveState(true);
    showProfileMessage('', '');

    try {
      const formData = new FormData(profileForm);
      formData.append('action', 'update_profile');

      const response = await fetch('api_auth.php', {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' }
      });
      const result = await response.json();

      if (!response.ok || result.status !== 'success') {
        throw new Error(result.message || 'Не вдалося зберегти зміни.');
      }

      showProfileMessage(result.message, 'success');
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      showProfileMessage(error.message, 'error');
      setSaveState(false);
    }
  });

  function renderProfile(user) {
    const avatar = document.createElement('img');
    avatar.src = getSafeImageUrl(user.avatar);
    avatar.alt = 'Аватар';
    avatar.className = 'profile-avatar';
    avatar.addEventListener('error', () => {
      avatar.src = 'images/default_avatar.png';
    }, { once: true });

    const name = document.createElement('div');
    name.className = 'profile-name';
    name.textContent = user.username || 'Користувач';

    const role = document.createElement('div');
    role.className = 'profile-role';
    role.textContent = user.role === 'admin' ? 'Адміністратор' : 'Користувач';

    profileInfo.replaceChildren(avatar, name, role);
  }

  function setSaveState(isSaving) {
    if (!saveButton) return;
    saveButton.disabled = isSaving;
    saveButton.textContent = isSaving ? 'Збереження...' : 'Зберегти зміни';
  }

  function showProfileMessage(text, type) {
    profileMessage.textContent = text;
    profileMessage.classList.toggle('is-success', type === 'success');
    profileMessage.classList.toggle('is-error', type === 'error');
  }

  function createMessage(text, isError = false) {
    const message = document.createElement('p');
    message.className = isError ? 'error-text' : 'muted-text';
    message.textContent = text;
    return message;
  }

  function getSafeImageUrl(rawUrl) {
    try {
      const url = new URL(rawUrl || 'images/default_avatar.png', window.location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : 'images/default_avatar.png';
    } catch (error) {
      return 'images/default_avatar.png';
    }
  }
});
