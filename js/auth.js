window.HorrorHub = (() => {
  let statusRequest;
  async function request(url, options = {}) {
    const response = await fetch(url, {
      ...options, credentials: 'same-origin',
      headers: { Accept: 'application/json', ...options.headers }
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.status === 'error') {
      throw new Error(data?.message || 'Не вдалося зв’язатися із сервером.');
    }
    return data;
  }
  function status(refresh = false) {
    if (refresh || !statusRequest) {
      statusRequest = request('api_auth.php?action=status').catch((error) => {
        statusRequest = null;
        throw error;
      });
    }
    return statusRequest;
  }
  async function post(url, body) {
    const auth = await status();
    const data = await request(url, {
      method: 'POST', body, headers: { 'X-CSRF-Token': auth.csrf_token }
    });
    if (data.status !== 'success') throw new Error('Некоректна відповідь сервера. Спробуйте ще раз.');
    if (url === 'api_auth.php') statusRequest = null;
    return data;
  }
  return { request, status, post };
})();

document.addEventListener('DOMContentLoaded', async () => {
  setupHeader();
  addSkipLink();

  const userMenu = document.getElementById('user-menu');
  if (!userMenu) return;
  userMenu.classList.add('user-menu');

  try {
    const data = await HorrorHub.status();
    if (data.logged_in && data.user) renderUserMenu(data.user);
    else renderGuestMenu();
  } catch (error) {
    console.error('Auth error:', error);
    renderGuestMenu();
  }

  // Theme switch, section menu on phones and the "/" search shortcut (markup: includes/layout.php).
  function setupHeader() {
    const header = document.querySelector('.site-header');
    if (!header) return;

    const themeButton = header.querySelector('.theme-toggle');
    const updateThemeButton = () => {
      const light = document.documentElement.dataset.theme === 'light';
      themeButton?.setAttribute('aria-label', light ? 'Увімкнути темну тему' : 'Увімкнути світлу тему');
      themeButton?.setAttribute('title', light ? 'Темна тема' : 'Світла тема');
    };
    updateThemeButton();
    themeButton?.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('hh-theme', next); } catch (error) { /* storage blocked */ }
      updateThemeButton();
    });

    const navToggle = header.querySelector('.nav-toggle');
    const setOpen = (open) => {
      header.classList.toggle('is-open', open);
      navToggle?.setAttribute('aria-expanded', String(open));
    };
    navToggle?.addEventListener('click', () => setOpen(!header.classList.contains('is-open')));
    header.querySelector('.site-nav')?.addEventListener('click', (event) => {
      if (event.target.closest('a')) setOpen(false);
    });
    window.matchMedia('(min-width: 769px)').addEventListener('change', (event) => {
      if (event.matches) setOpen(false);
    });

    const search = document.getElementById('searchInput');
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && header.classList.contains('is-open')) {
        setOpen(false);
        navToggle?.focus();
        return;
      }
      const typing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
      if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey && search) {
        event.preventDefault();
        search.focus();
      }
    });
  }

  function addSkipLink() {
    const main = document.querySelector('main');
    if (!main) return;
    main.id ||= 'main-content';
    const skip = document.createElement('a');
    skip.className = 'skip-link';
    skip.href = '#' + main.id;
    skip.textContent = 'До основного вмісту';
    document.body.prepend(skip);
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

    const logoutButton = document.createElement('button');
    logoutButton.type = 'button';
    logoutButton.className = 'user-menu__logout';
    logoutButton.textContent = 'Вийти';
    logoutButton.addEventListener('click', async () => {
      logoutButton.disabled = true;
      try {
        await HorrorHub.post('api_auth.php', new URLSearchParams({ action: 'logout' }));
        window.location.reload();
      } catch (error) {
        logoutButton.textContent = error.message;
        logoutButton.disabled = false;
      }
    });
    items.push(logoutButton);
    userMenu.replaceChildren(...items);
  }

  function renderGuestMenu() {
    const loginLink = document.createElement('a');
    loginLink.href = 'login.html';
    loginLink.className = 'user-menu__login';
    loginLink.textContent = 'Увійти';
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
