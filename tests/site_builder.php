<?php
// C:\xampp\php\php.exe tests/site_builder.php — checks the static page generator without touching site files.
require_once dirname(__DIR__) . '/includes/site_builder.php';
function check(bool $condition, string $name): void {
    if (!$condition) throw new RuntimeException('FAIL: ' . $name);
}

check(hh_article_id(['localId' => 'reviews:hereditary-review']) === 'reviews:hereditary-review', 'Local id');
check(hh_article_id(['url' => 'local://reviews/hereditary-review']) === 'reviews:hereditary-review', 'local:// url');
check(hh_article_id(['url' => 'https://telegra.ph/Doom-Klasika-11-13']) === 'Doom-Klasika-11-13', 'Telegraph id');
check(hh_article_id(['url' => 'https://evil.test/Doom']) === '', 'Foreign host');
check(hh_article_id(['url' => 'https://telegra.ph/..%2F.env']) === '', 'Traversal id');

check(hh_slugify('%D0%86stor%D1%96ya-kosm%D1%96chnogo-zhahu-Enemy-Zero-1996-11-17') === 'istoriya-kosmichnogo-zhahu-enemy-zero-1996-11-17', 'Slug from Telegraph id');
check(hh_slugify('reviews:hereditary-review') === 'hereditary-review', 'Slug from local id');
check(hh_slugify('Їжак і Ґанок') === 'yizhak-i-ganok', 'Ukrainian transliteration');

$links = ['horror_movies:psychological-horror-cinema' => 'statti/psychological-horror-cinema.html', 'Doom-11-13' => 'statti/doom-11-13.html'];
$html = hh_sanitize_article_html(
    '<div class="article-content"><p onclick="x()">Текст <a href="javascript:alert(1)">погане</a> '
    . '<a href="article.html?id=horror_movies:psychological-horror-cinema">внутрішнє</a> '
    . '<a href="https://telegra.ph/Doom-11-13">телеграф</a> <a href="https://example.com/">зовнішнє</a></p>'
    . '<script>alert(1)</script><p><br></p>'
    . '<figure><img src="/file/a.jpg"><figcaption>Підпис</figcaption></figure>'
    . '<figure><iframe src="https://telegra.ph/embed/youtube?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DaBBtt72aJLA"></iframe><figcaption></figcaption></figure>'
    . '<img src="data:image/png;base64,AAAA"><h2>Розділ</h2></div>',
    'Назва', $links
);
check(!str_contains($html, 'script') && !str_contains($html, 'onclick') && !str_contains($html, 'javascript:'), 'Scripts and handlers removed');
check(str_contains($html, 'погане') && str_contains($html, '<a href="statti/psychological-horror-cinema.html">внутрішнє</a>'), 'Internal link rewritten');
check(str_contains($html, '<a href="statti/doom-11-13.html">телеграф</a>'), 'Telegraph link to static page');
check(str_contains($html, 'href="https://example.com/" target="_blank" rel="noopener noreferrer"'), 'External link');
check(str_contains($html, '<img src="https://telegra.ph/file/a.jpg" alt="Підпис" loading="lazy"'), 'Relative Telegraph image with caption alt');
check(str_contains($html, '<p class="video-link"><a href="https://www.youtube.com/watch?v=aBBtt72aJLA"'), 'YouTube embed becomes link');
check(!str_contains($html, 'data:image') && !str_contains($html, '<p></p>') && !str_contains($html, '<figcaption></figcaption>'), 'Empty and unsafe nodes removed');
check(str_contains($html, '<h3>Розділ</h3>'), 'Headings normalized');

$page = hh_render_article_page(
    ['id' => 'reviews:test', 'path' => 'statti/test.html', 'section' => 'reviews', 'author' => '', 'modified' => 0, 'source' => '',
        'item' => ['title' => 'Тест </script><b>', 'previewText' => 'Опис', 'imageUrl' => 'images/covers/x.webp']],
    '<p>Текст</p>', []
);
check(substr_count($page, '<h1>') === 1 && str_contains($page, '<h1>Тест &lt;/script&gt;&lt;b&gt;</h1>'), 'Title escaped, single h1');
check(!str_contains($page, '</script><b>'), 'JSON-LD cannot close the script tag');
check(str_contains($page, '<base href="../">') && str_contains($page, 'data-article-id="reviews:test"'), 'Static page wiring');
echo "PASS: article ids, slugs, sanitizing and page template\n";
