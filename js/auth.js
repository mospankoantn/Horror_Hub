document.addEventListener('DOMContentLoaded', async () => {
  ensureSiteNavigation();

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

  function ensureSiteNavigation() {
    const navigationItems = [
      { href: 'index.html', label: 'Головна' },
      { href: 'horror_games.html', label: 'Ігри Жахів' },
      { href: 'horror_movies.html', label: 'Фільми Жахів' },
      { href: 'reviews.html', label: 'Огляди' },
      { href: 'articles.html', label: 'Статті' },
      { href: 'internet_horror.html', label: 'Інтернет Хоррор' },
      { href: 'horror_art.html', label: 'Мистецтво' },
      { href: 'horror_literature.html', label: 'Література' },
      { href: 'game.html', label: 'Ігрова Кімната' },
      { href: 'contact.html', label: 'Контакти' }
    ];

    const currentPage = getCurrentPageName();

    document.querySelectorAll('nav').forEach((nav) => {
      const userMenuNode = nav.querySelector('#user-menu');
      const telegramLink = nav.querySelector('a.tg-link');
      const existingLinks = new Map(
        Array.from(nav.querySelectorAll('a[href]')).map((link) => [normalizeHref(link.getAttribute('href')), link])
      );

      let insertBeforeNode = telegramLink || userMenuNode || null;

      navigationItems.forEach((item) => {
        const normalizedHref = normalizeHref(item.href);
        let link = existingLinks.get(normalizedHref);

        if (!link) {
          link = document.createElement('a');
          link.href = item.href;
          link.textContent = item.label;
          nav.insertBefore(link, insertBeforeNode);
          existingLinks.set(normalizedHref, link);
        }

        link.classList.toggle('active', normalizedHref === currentPage || (currentPage === 'article.html' && normalizedHref === 'articles.html'));
      });

      const desiredOrder = navigationItems
        .map((item) => existingLinks.get(normalizeHref(item.href)))
        .filter(Boolean);

      desiredOrder.forEach((link) => {
        nav.insertBefore(link, insertBeforeNode);
      });
    });
  }

  function getCurrentPageName() {
    const path = window.location.pathname.split('/').pop() || 'index.html';
    return normalizeHref(path);
  }

  function normalizeHref(href) {
    return String(href || '')
      .split('#')[0]
      .split('?')[0]
      .replace(/^\.?\//, '');
  }
});
