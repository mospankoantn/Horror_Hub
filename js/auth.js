document.addEventListener('DOMContentLoaded', async () => {
  const userMenu = document.getElementById('user-menu');
  if (!userMenu) return;

  userMenu.classList.add('user-menu');

  try {
    const response = await fetch('api_auth.php?action=status', {
      headers: { Accept: 'application/json' }
    });
    const data = await response.json();

    if (data.logged_in && data.user) {
      renderUserMenu(data.user);
    } else {
      renderGuestMenu();
    }
  } catch (error) {
    console.error('Auth error:', error);
    renderGuestMenu();
  }

  function renderUserMenu(user) {
    const profileLink = document.createElement('a');
    profileLink.href = 'profile.html';
    profileLink.className = 'user-menu__profile';

    const avatar = document.createElement('img');
    avatar.src = getSafeImageUrl(user.avatar);
    avatar.alt = '';
    avatar.loading = 'lazy';
    avatar.addEventListener('error', () => {
      avatar.src = 'images/default_avatar.png';
    }, { once: true });

    const name = document.createElement('span');
    name.textContent = user.username || 'Профіль';

    profileLink.append(avatar, name);

    const items = [profileLink];

    if (user.role === 'admin') {
      const adminLink = document.createElement('a');
      adminLink.href = 'admin/admin.php';
      adminLink.className = 'user-menu__admin';
      adminLink.textContent = 'Адмінка';
      items.push(adminLink);
    }

    const logoutLink = document.createElement('a');
    logoutLink.href = '#';
    logoutLink.className = 'user-menu__logout';
    logoutLink.textContent = 'Вийти';
    logoutLink.addEventListener('click', async (event) => {
      event.preventDefault();
      await fetch('api_auth.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'action=logout'
      });
      window.location.reload();
    });
    items.push(logoutLink);

    userMenu.replaceChildren(...items);
  }

  function renderGuestMenu() {
    const loginLink = document.createElement('a');
    loginLink.href = 'login.html';
    loginLink.className = 'user-menu__login';
    loginLink.textContent = 'Увійти / Реєстрація';
    userMenu.replaceChildren(loginLink);
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
