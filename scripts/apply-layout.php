<?php
declare(strict_types=1);
/*
 * Builds the site's HTML pages from one layout (includes/layout.php):
 *  - catalog pages (home, sections) are generated whole from $catalogPages below;
 *  - other pages keep their <main> and get the shared <head> assets, header and footer.
 * Safe to run again after editing the layout:  C:\xampp\php\php.exe scripts/apply-layout.php
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require_once dirname(__DIR__) . '/includes/layout.php';
$root = dirname(__DIR__);
$e = 'hh_layout_e';

const HH_AUTH_SCRIPT = '<script src="js/auth.js?v=20261120-d"></script>';

$visuals = [
    'mosaic' => <<<'HTML'
      <div class="mosaic" aria-label="Розділи">
        <a class="mosaic__tile" href="horror_movies.html" style="--tile: #e3ad57"><img src="images/posters/shining.webp" alt="" loading="lazy"><span class="mosaic__label">Кіно</span><span class="mosaic__title">Культові фільми жахів</span></a>
        <a class="mosaic__tile" href="horror_games.html" style="--tile: #7cc0cf"><img src="images/covers/f2e102e84454df43f6fc.webp" alt="" loading="lazy"><span class="mosaic__label">Ігри</span><span class="mosaic__title">Silent Hill 2 і класика жанру</span></a>
        <a class="mosaic__tile" href="internet_horror.html" style="--tile: #e2d65c"><img src="images/covers/3123a4bbe3be8ef2ee49.webp" alt="" loading="lazy"><span class="mosaic__label">Інтернет-хоррор</span><span class="mosaic__title">Аналоговий хоррор і крипіпасти</span></a>
        <a class="mosaic__tile mosaic__tile--culture" href="culture.html" style="--tile: #d2b07a"><span class="mosaic__label">Культура</span><span class="mosaic__title">Від готики до Лавкрафта</span></a>
      </div>
HTML,
    'posters' => <<<'HTML'
      <div class="posters" aria-label="Класика кіножаху">
        <figure><img src="images/posters/psycho.webp" alt="Постер «Психо»" loading="lazy"><figcaption>1960</figcaption></figure>
        <figure><img src="images/posters/exorcist.webp" alt="Постер «Екзорциста»" loading="lazy"><figcaption>1973</figcaption></figure>
        <figure><img src="images/posters/shining.webp" alt="Постер «Сяйва»" loading="lazy"><figcaption>1980</figcaption></figure>
        <figure><img src="images/posters/get-out.webp" alt="Постер «Пастки»" loading="lazy"><figcaption>2017</figcaption></figure>
      </div>
HTML,
    'crt' => <<<'HTML'
      <figure class="crt">
        <img src="images/covers/f2e102e84454df43f6fc.webp" alt="Обкладинка Silent Hill 2">
        <figcaption>SILENT HILL 2 · 2001</figcaption>
      </figure>
HTML,
    'glitch' => <<<'HTML'
      <figure class="glitch">
        <img src="images/covers/3123a4bbe3be8ef2ee49.webp" alt="Долоня на екрані старого телевізора">
        <figcaption>&gt; analog_horror.vhs — перешкоди, старі касети й сигнал, якого не мало бути_</figcaption>
      </figure>
HTML,
    'quote' => <<<'HTML'
      <blockquote class="hero-quote">
        <p><span class="dropcap" aria-hidden="true">Н</span><span class="visually-hidden">Н</span>айдавніша й найсильніша емоція людства — страх, а найдавніший і найсильніший його різновид — страх невідомого.</p>
        <footer>— Г. Ф. Лавкрафт, «Надприродний жах у літературі», 1927</footer>
      </blockquote>
HTML,
];

/*
 * file => [section, active tab, <title>, description, kicker, h1, lead, quick links, visual,
 *          data sources, "studio" facet title, show "section" facet]
 * A source "path#regex" keeps only entries whose genre matches the regex.
 */
$catalogPages = [
    'index.html' => ['home', 'home', 'Horror Hub — фільми жахів, ігри, крипіпасти й культура жаху',
        'Horror Hub — україномовний провідник у темряву: культові фільми жахів, ігри, крипіпасти, огляди й історія жанру.',
        'Кіно · ігри · мережеві легенди · культура', 'Провідник у темряву',
        'Культові фільми жахів, ігри, крипіпасти, огляди й історія жанру — українською.',
        ['Що подивитися вночі' => 'horror_movies.html', 'Класика 90-х' => 'horror_games.html?decade=1990-ті', 'Аналоговий хоррор' => 'internet_horror.html?q=аналогов', 'Готика й Лавкрафт' => 'culture.html?q=Лавкрафт'],
        'mosaic', 'articles_data.json', 'Автори й студії', true],
    'articles.html' => ['home', 'home', 'Усі матеріали — Horror Hub',
        'Усі статті Horror Hub: фільми й ігри жахів, інтернет-хоррор, огляди та культура жаху з пошуком і фільтрами.',
        'Архів', 'Усі матеріали',
        'Кіно, ігри, інтернет-хоррор і культура жаху в одному списку. Шукайте за назвою, роком або студією.',
        [], '', 'articles_data.json', 'Автори й студії', true],
    'horror_movies.html' => ['movies', 'movies', 'Фільми жахів — Horror Hub',
        'Фільми жахів на Horror Hub: культова класика, психологічний хоррор і огляди — від «Психо» до «Спадковості».',
        '▶ Сеанс починається · фільми жахів', 'Фільми жахів',
        'Від «Психо» й «Екзорциста» до «Сяйва», «Пастки» та «Спадковості»: як кіно навчило нас боятися.',
        ['Культова класика' => 'horror_movies.html?q=культові', 'Психологічний хоррор' => 'horror_movies.html?q=психологічний', 'Огляди фільмів' => 'reviews.html?q=фільм'],
        'posters', 'data/horror_movies/articles_data.json,data/reviews/articles_data.json#фільм', 'Режисери', false],
    'horror_games.html' => ['games', 'games', 'Ігри жахів — Horror Hub',
        'Ігри жахів на Horror Hub: survival horror, психологічні кошмари, ретро-класика й забуті перлини жанру.',
        'Press start · ігри жахів', 'Ігри жахів',
        'Survival horror, психологічні кошмари й забуті перлини — від Alone in the Dark до Penumbra.',
        ['Survival horror' => 'horror_games.html?genre=Survival horror', '1990-ті' => 'horror_games.html?decade=1990-ті', '2000-ні' => 'horror_games.html?decade=2000-ні', 'Флеш та інді' => 'horror_games.html?q=flash'],
        'crt', 'data/horror_games/articles_data.json,data/general/articles_data.json,data/reviews/articles_data.json#гр', 'Студії', false],
    'internet_horror.html' => ['internet', 'internet', 'Інтернет-хоррор — Horror Hub',
        'Інтернет-хоррор на Horror Hub: крипіпасти, Backrooms, аналоговий хоррор і SCP — страхи, що виросли з мережі.',
        '&gt; Підключення… інтернет-хоррор', 'Інтернет-хоррор',
        'Крипіпасти, Backrooms, аналоговий хоррор і SCP: страхи, що виросли з форумів, відео й вікі.',
        ['Крипіпасти' => 'internet_horror.html?q=крипіпаст', 'Backrooms' => 'internet_horror.html?q=Backrooms', 'Аналоговий хоррор' => 'internet_horror.html?q=аналогов', 'SCP' => 'internet_horror.html?q=SCP'],
        'glitch', 'data/internet_horror/articles_data.json', 'Джерела', false],
    'culture.html' => ['culture', 'culture', 'Культура жаху: література й мистецтво — Horror Hub',
        'Література й мистецтво жаху на Horror Hub: готика, По, Лавкрафт, Ґоя, Ґігер і міські легенди.',
        'Література · мистецтво', 'Культура жаху',
        'Готичні романи, По й Лавкрафт, Ґоя й Ґігер, міські легенди — звідки жанр узяв свою мову.',
        ['Жах у літературі' => 'horror_literature.html', 'Жах у мистецтві' => 'horror_art.html', 'Лавкрафт' => 'culture.html?q=Лавкрафт'],
        'quote', 'data/horror_literature/articles_data.json,data/horror_art/articles_data.json', 'Автори', false],
    'horror_literature.html' => ['culture', 'culture', 'Жах у літературі — Horror Hub',
        'Жах у літературі: готичні романи, По, Шеллі, Лавкрафт і міські легенди на Horror Hub.',
        'Культура · література', 'Жах у літературі',
        'Готичні романи, По, Шеллі, Лавкрафт і міські легенди — тексти, з яких виросли сучасні страшні історії.',
        ['Уся культура' => 'culture.html', 'Жах у мистецтві' => 'horror_art.html'],
        '', 'data/horror_literature/articles_data.json', 'Автори', false],
    'horror_art.html' => ['culture', 'culture', 'Жах у мистецтві — Horror Hub',
        'Жах у мистецтві: Ґоя, Беклін, Ґігер, гравюра, сюрреалізм і візуальна мова хоррору на Horror Hub.',
        'Культура · мистецтво', 'Жах у мистецтві',
        'Від Ґої до Ґігера: живопис, гравюра й біомеханіка, з яких хоррор узяв свою візуальну мову.',
        ['Уся культура' => 'culture.html', 'Жах у літературі' => 'horror_literature.html'],
        '', 'data/horror_art/articles_data.json', 'Автори', false],
    'reviews.html' => ['reviews', 'reviews', 'Огляди ігор і фільмів жахів — Horror Hub',
        'Огляди Horror Hub: ігри й фільми жахів без спойлерів — атмосфера, темп і чи варті вони ваших нервів.',
        'Огляди · без спойлерів', 'Огляди',
        'Розбираємо ігри та фільми жахів: атмосфера, темп і чи варті вони ваших нервів.',
        [], '', 'data/reviews/articles_data.json', 'Автори й студії', false],
];

function hh_page_head(string $title, string $description, string $extra = ''): string {
    return "<!DOCTYPE html>\n<html lang=\"uk\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"
        . '  <title>' . hh_layout_e($title) . "</title>\n  <meta name=\"description\" content=\"" . hh_layout_e($description) . "\">\n  "
        . hh_site_head_assets() . "\n" . $extra . '  ' . HH_AUTH_SCRIPT . "\n</head>\n";
}

foreach ($catalogPages as $file => [$section, $active, $title, $description, $kicker, $h1, $lead, $quick, $visual, $sources, $devTitle, $kindFacet]) {
    $extraHead = '';
    if ($file === 'index.html') {
        $extraHead = "  <meta property=\"og:type\" content=\"website\">\n  <meta property=\"og:title\" content=\"Horror Hub — фільми жахів, ігри, крипіпасти й культура жаху\">\n"
            . "  <meta property=\"og:description\" content=\"" . $e($description) . "\">\n"
            . "  <script type=\"application/ld+json\">{\"@context\":\"https://schema.org\",\"@type\":\"WebSite\",\"name\":\"Horror Hub\",\"inLanguage\":\"uk\",\"description\":\"" . $e($description) . "\"}</script>\n";
    }
    $quickHtml = '';
    foreach ($quick as $label => $href) $quickHtml .= '          <a href="' . $e($href) . '">' . $e($label) . "</a>\n";
    $quickBlock = $quickHtml === '' ? '' : "        <div class=\"hero__quick\">\n$quickHtml        </div>\n";
    $visualHtml = $visual === '' ? '' : $visuals[$visual] . "\n";
    $inner = $visual === '' ? 'hero__inner hero__inner--solo' : 'hero__inner';

    $html = hh_page_head($title, $description, $extraHead)
        . "<body data-section=\"$section\">\n" . hh_site_header($section, $active) . "\n\n"
        . "<main id=\"main\">\n"
        . "  <section class=\"hero hero--$section\" aria-labelledby=\"pageTitle\">\n    <div class=\"$inner\">\n"
        . "      <div class=\"hero__text\">\n"
        . "        <span class=\"hero__kicker\">$kicker</span>\n"
        . "        <h1 class=\"hero__title\" id=\"pageTitle\">" . $e($h1) . "</h1>\n"
        . "        <p class=\"hero__lead\">" . $e($lead) . "</p>\n"
        . $quickBlock
        . "      </div>\n$visualHtml    </div>\n  </section>\n\n"
        . "  <div class=\"catalog\" id=\"catalog\">\n"
        . "    <button type=\"button\" class=\"filters-toggle\" aria-expanded=\"false\" aria-controls=\"facets\">Фільтри <span id=\"filtersSummary\"></span></button>\n"
        . "    <aside class=\"facets\" id=\"facets\" aria-label=\"Фільтри\">\n"
        . "      <div id=\"facetGroups\" class=\"facet-groups\"></div>\n"
        . "      <a class=\"promo\" href=\"game.html\"><span class=\"promo__kicker\">ІГРОВА КІМНАТА</span><span class=\"promo__title\">Квест «Підвал під сценою» і Темний лабіринт</span><span class=\"promo__more\">Грати в браузері →</span></a>\n"
        . "    </aside>\n"
        . "    <section class=\"results\" aria-labelledby=\"resultsInfo\">\n"
        . "      <div class=\"results__bar\">\n"
        . "        <h2 class=\"results__count\" id=\"resultsInfo\" aria-live=\"polite\">Завантаження матеріалів…</h2>\n"
        . "        <div class=\"results__tools\">\n"
        . "          <label>Сортувати\n            <select id=\"sortSelect\">\n"
        . "              <option value=\"newest\" selected>Спочатку нові</option>\n              <option value=\"oldest\">Спочатку старі</option>\n"
        . "              <option value=\"release_desc\">Рік: новіші спершу</option>\n              <option value=\"release_asc\">Рік: старіші спершу</option>\n"
        . "            </select>\n          </label>\n"
        . "          <div class=\"view-toggle\" role=\"group\" aria-label=\"Вигляд списку\">\n"
        . "            <button type=\"button\" data-view=\"list\" aria-pressed=\"true\">Список</button>\n"
        . "            <button type=\"button\" data-view=\"cards\" aria-pressed=\"false\">Картки</button>\n"
        . "          </div>\n        </div>\n      </div>\n"
        . "      <div class=\"entries is-list\" id=\"articlesGrid\" data-sources=\"" . $e($sources) . "\" data-dev-title=\"" . $e($devTitle) . "\"" . ($kindFacet ? ' data-kind-facet="1"' : '') . ">\n"
        . "        <p class=\"empty-state\">Завантаження матеріалів…</p>\n      </div>\n"
        . "      <nav class=\"pagination\" aria-label=\"Сторінки\">\n"
        . "        <button type=\"button\" id=\"prevPage\" class=\"btn\">← Попередня</button>\n"
        . "        <span id=\"pageInfo\" class=\"page-info\">Сторінка 1 з 1</span>\n"
        . "        <button type=\"button\" id=\"nextPage\" class=\"btn\">Наступна →</button>\n"
        . "      </nav>\n    </section>\n  </div>\n</main>\n\n"
        . hh_site_footer() . "\n\n<script src=\"js/load_articles.js?v=20261125-stub\"></script>\n</body>\n</html>\n";
    file_put_contents("$root/$file", $html);
    echo "generated $file\n";
}

/* Game room: the catalog, leaderboard and player are filled by js/game-room/core.js from data/games.json. */
$schematic = str_repeat('<span></span>', 54);
$gameRoom = hh_page_head('Ігрова кімната — Horror Hub',
        'Ігрова кімната Horror Hub: текстові квести й міні-ігри жаху в браузері, колекція фіналів і таблиця лідерів.')
    . "<body data-section=\"room\">\n" . hh_site_header('room', 'room') . "\n\n"
    . <<<HTML
<main id="main">
  <section class="hero hero--room" aria-labelledby="pageTitle">
    <div class="hero__inner">
      <div class="hero__text">
        <span class="hero__kicker">Ігрова кімната · грається в браузері</span>
        <h1 class="hero__title" id="pageTitle">Ігрова кімната</h1>
        <p class="hero__lead">Текстові квести й міні-ігри жаху: проходьте, збирайте фінали та змагайтеся за найшвидшу втечу.</p>
        <div class="hero__quick">
          <a href="#games">Усі ігри</a>
          <a href="#leaderboard">Таблиця лідерів</a>
        </div>
      </div>
      <div class="room-schematic" aria-hidden="true">$schematic</div>
    </div>
  </section>

  <div class="room__body">
    <section class="room-games" id="games" aria-labelledby="gamesTitle">
      <div class="room__head">
        <h2 class="room__title" id="gamesTitle">Ігри</h2>
        <div class="facet__chips" id="gameFilters" role="group" aria-label="Тип гри"></div>
      </div>
      <div class="game-grid" id="gameGrid" aria-live="polite">
        <p class="empty-state">Завантаження ігор…</p>
      </div>
    </section>

    <section class="leaderboard" id="leaderboard" aria-labelledby="leaderboardTitle">
      <h2 id="leaderboardTitle">Таблиця лідерів</h2>
      <p class="leaderboard__lead">Найкращі результати зареєстрованих гравців — по одному на гравця.</p>
      <div class="leaderboard__tabs" id="leaderboardTabs" role="group" aria-label="Гра й режим"></div>
      <ol class="leaderboard__list" id="leaderboardList" aria-live="polite"></ol>
      <p class="leaderboard__note" id="leaderboardNote"></p>
    </section>
  </div>

  <section class="player theme-dark-scope" id="player" tabindex="-1" aria-labelledby="playerTitle" hidden>
    <div class="player__bar">
      <button type="button" class="player__btn" data-player="menu" data-icon="back"><span>Ігри</span></button>
      <h2 class="player__title" id="playerTitle"></h2>
      <div class="player__tools">
        <button type="button" class="player__btn" data-player="restart" data-icon="restart"><span>Заново</span></button>
        <button type="button" class="player__btn" data-player="pause" data-icon="pause" aria-pressed="false"><span>Пауза</span></button>
        <button type="button" class="player__btn" data-player="sound" aria-pressed="true"><span>Звук</span></button>
        <button type="button" class="player__btn" data-player="fullscreen" data-icon="fullscreen"><span>На весь екран</span></button>
        <button type="button" class="player__btn" data-player="help" data-icon="help"><span>Як грати</span></button>
      </div>
    </div>
    <div class="player__hud" id="playerHud"></div>
    <div class="player__screen">
      <div class="player__stage" id="playerStage"></div>
      <div class="player__overlay" id="playerOverlay" hidden></div>
    </div>
    <div class="player__touch" id="playerTouch"></div>
  </section>
</main>


HTML
    . hh_site_footer() . "\n\n<script src=\"js/game-room/core.js?v=20261120-room\"></script>\n</body>\n</html>\n";
file_put_contents("$root/game.html", $gameRoom);
echo "generated game.html\n";

/* Pages with their own content: only head assets, header and footer change. */
$patchPages = [
    'contact.html' => ['home', ''],
    'login.html' => ['home', ''],
    'profile.html' => ['home', ''],
    'privacy.html' => ['home', ''],
    'article.html' => ['home', ''],
    '404.html' => ['home', ''],
];
foreach ($patchPages as $file => [$section, $active]) {
    $path = "$root/$file";
    $html = str_replace(["\r\n", "\r"], "\n", (string)file_get_contents($path));
    // Head: drop old icons, fonts, stylesheet and auth script; AdSense leftovers too.
    $html = preg_replace('#\s*<!--\s*(Шрифти|Стилі|Підключаємо auth|Підключення|GOOGLE ADSENSE|SEO|Served)[\s\S]*?-->#u', '', $html);
    $html = preg_replace('#\n\s*<link rel="(icon|apple-touch-icon|preconnect)"[^>]*>#', '', $html);
    $html = preg_replace('#\n\s*<link href="https://fonts\.googleapis\.com/[^"]*" rel="stylesheet">#', '', $html);
    $html = preg_replace('#\n\s*<link rel="stylesheet" href="style\.css[^"]*">#', '', $html);
    $html = preg_replace('#\n\s*<script src="js/(auth|theme)\.js[^"]*"></script>#', '', $html);
    $anchor = str_contains($html, '<base href=') ? '#(<base href="[^"]*">)#' : '#(<meta name="viewport"[^>]*>)#';
    $html = preg_replace($anchor, "$1\n  " . str_replace('$', '\$', hh_site_head_assets()) . "\n  " . HH_AUTH_SCRIPT, $html, 1);
    // Body: header before <main>, footer after </main>.
    $html = preg_replace('#<body([^>]*)>[\s\S]*?(<main\b)#', "<body$1>\n" . str_replace('$', '\$', hh_site_header($section, $active)) . "\n\n$2", $html, 1);
    $html = preg_replace('#<body(?![^>]*data-section)([^>]*)>#', "<body data-section=\"$section\"$1>", $html, 1);
    $html = preg_replace('#(</main>)[\s\S]*?(\s*<script\b|\s*</body>)#', "$1\n\n" . str_replace('$', '\$', hh_site_footer()) . "\n$2", $html, 1);
    // Tidy up so that running the script again changes nothing: no blank lines in <head>, at most one elsewhere.
    [$head, $rest] = explode('</head>', $html, 2);
    $head = preg_replace("/\n[ \t]*(?=\n)/", '', $head);
    $html = $head . '</head>' . preg_replace("/\n{3,}/", "\n\n", $rest);
    file_put_contents($path, $html);
    echo "patched $file\n";
}
