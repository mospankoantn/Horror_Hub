<?php
declare(strict_types=1);
/*
 * Shared site chrome: the header (search, theme switch, section tabs) and the footer.
 * Used by scripts/apply-layout.php for the HTML pages and by includes/site_builder.php for statti/*.html,
 * so every page gets exactly the same markup.
 */

/** Section key => [tab label, page, badge under the logo, search placeholder]. */
const HH_LAYOUT_SECTIONS = [
    'home' => ['Усе', 'index.html', 'Усе про жах', 'Фільм, гра, крипіпаста або рік…'],
    'movies' => ['Кіно', 'horror_movies.html', 'Кінозал', 'Фільм, режисер або рік…'],
    'games' => ['Ігри', 'horror_games.html', 'Ігровий архів', 'Гра, студія або рік — напр. «Capcom 1996»'],
    'internet' => ['Інтернет-хоррор', 'internet_horror.html', 'Мережевий фольклор', 'Крипіпаста, вікі або мем…'],
    'culture' => ['Культура', 'culture.html', 'Книги й полотна', 'Автор, книга або художник…'],
    'reviews' => ['Огляди', 'reviews.html', 'Огляди', 'Гра або фільм для огляду…'],
    'room' => ['Ігрова кімната', 'game.html', 'Ігрова кімната', 'Фільм, гра, крипіпаста або рік…'],
];

/** Catalog section (data "section" field) => site section with its own sub-theme. */
const HH_CATALOG_TO_SITE_SECTION = [
    'articles' => 'games',
    'horror_games' => 'games',
    'horror_movies' => 'movies',
    'reviews' => 'reviews',
    'internet_horror' => 'internet',
    'horror_art' => 'culture',
    'horror_literature' => 'culture',
];

function hh_layout_e(string $value): string {
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
}

/** @param string $active key of the active tab ('' for none); $section sets badge and search hint. */
function hh_site_header(string $section, string $active): string {
    $config = HH_LAYOUT_SECTIONS[$section] ?? HH_LAYOUT_SECTIONS['home'];
    $tabs = '';
    foreach (HH_LAYOUT_SECTIONS as $key => [$label, $page]) {
        $current = $key === $active ? ' aria-current="page"' : '';
        $tabs .= "      <a href=\"$page\" data-tab=\"$key\"$current>" . hh_layout_e($label) . "</a>\n";
    }
    return <<<HTML
<header class="site-header">
  <div class="site-header__bar">
    <a class="brand" href="index.html">
      <span class="brand__logo">Horror Hub</span>
      <span class="brand__badge">{$config[2]}</span>
    </a>
    <form class="site-search" action="index.html" method="get" role="search">
      <label class="visually-hidden" for="searchInput">Пошук по сайту</label>
      <svg class="site-search__icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <input type="search" id="searchInput" name="q" placeholder="{$config[3]}" autocomplete="off">
      <kbd aria-hidden="true">/</kbd>
    </form>
    <div class="site-header__actions">
      <button type="button" class="icon-btn theme-toggle" aria-label="Перемкнути тему">
        <svg class="theme-toggle__sun" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
        <svg class="theme-toggle__moon" aria-hidden="true" viewBox="0 0 24 24"><path d="M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10z"/></svg>
      </button>
      <div id="user-menu" class="user-menu"></div>
      <button type="button" class="icon-btn nav-toggle" aria-expanded="false" aria-controls="siteNav" aria-label="Розділи сайту">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>
    </div>
  </div>
  <nav id="siteNav" class="site-nav" aria-label="Розділи">
$tabs  </nav>
</header>
HTML;
}

function hh_site_footer(): string {
    $links = '';
    foreach (HH_LAYOUT_SECTIONS as [$label, $page]) $links .= "        <a href=\"$page\">" . hh_layout_e($label) . "</a>\n";
    $year = gmdate('Y');
    return <<<HTML
<footer class="site-footer">
  <div class="site-footer__inner">
    <div class="site-footer__brand">
      <a class="brand__logo" href="index.html">Horror Hub</a>
      <p>Україномовний провідник у темряву: кіно, ігри, мережеві легенди й культура жаху.</p>
    </div>
    <nav class="site-footer__col" aria-label="Розділи сайту">
      <span class="site-footer__title">Розділи</span>
$links    </nav>
    <div class="site-footer__col">
      <span class="site-footer__title">Сайт</span>
      <a href="contact.html">Контакти</a>
      <a href="privacy.html">Конфіденційність</a>
      <a href="https://t.me/moyi_statti" target="_blank" rel="noopener noreferrer">Telegram-канал</a>
    </div>
  </div>
  <p class="site-footer__copy">&copy; $year Horror Hub</p>
</footer>
HTML;
}

/** Lines for <head>: theme bootstrap first (prevents a flash of the wrong theme), then fonts and styles. */
function hh_site_head_assets(): string {
    return <<<HTML
<script src="js/theme.js?v=20261120-d"></script>
  <link rel="icon" href="favicon.ico" sizes="32x32">
  <link rel="icon" type="image/png" href="images/favicon.png">
  <link rel="apple-touch-icon" href="images/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Nosifer&amp;family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,600&amp;family=IBM+Plex+Sans:wght@400;500;600;700&amp;family=IBM+Plex+Mono:wght@400;500;600&amp;display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css?v=20261120-d">
HTML;
}
