<?php
declare(strict_types=1);
/*
 * Builds the search-friendly part of the site from the JSON catalogs:
 *  - statti/<slug>.html: one static page per article with the full text, meta tags and JSON-LD;
 *  - images/covers/*: local copies of external card covers (WebP when GD is available);
 *  - data/pages.json: article id -> static page, used by the catalog scripts and sitemap.php.
 * Run from the command line (scripts/build-site.php); the admin panel calls it after saving catalogs.
 */
require_once __DIR__ . '/env.php';
require_once __DIR__ . '/layout.php';

const HH_PAGES_DIR = 'statti';
const HH_COVERS_DIR = 'images/covers';
const HH_MANIFEST = 'data/pages.json';
const HH_COVER_MAX_WIDTH = 640;
const HH_COVER_MAX_HEIGHT = 900;
const HH_DOWNLOAD_LIMIT = 8 * 1024 * 1024;

// Specific sections first, so an article listed in both "Статті" and a section gets the section page.
const HH_CATALOGS = [
    'data/horror_games/articles_data.json',
    'data/horror_movies/articles_data.json',
    'data/reviews/articles_data.json',
    'data/internet_horror/articles_data.json',
    'data/horror_art/articles_data.json',
    'data/horror_literature/articles_data.json',
    'data/general/articles_data.json',
    'articles_data.json',
];

const HH_SECTIONS = [
    'articles' => ['label' => 'Статті', 'page' => 'articles.html'],
    'horror_games' => ['label' => 'Ігри Жахів', 'page' => 'horror_games.html'],
    'horror_movies' => ['label' => 'Фільми Жахів', 'page' => 'horror_movies.html'],
    'reviews' => ['label' => 'Огляди', 'page' => 'reviews.html'],
    'internet_horror' => ['label' => 'Інтернет Хоррор', 'page' => 'internet_horror.html'],
    'horror_art' => ['label' => 'Мистецтво', 'page' => 'horror_art.html'],
    'horror_literature' => ['label' => 'Література', 'page' => 'horror_literature.html'],
];

/** Pages listed in the sitemap besides the articles. */
const HH_STATIC_PAGES = ['index.html', 'articles.html', 'horror_games.html', 'horror_movies.html', 'reviews.html',
    'internet_horror.html', 'horror_art.html', 'horror_literature.html', 'game.html', 'contact.html', 'privacy.html'];

function hh_root(): string {
    return dirname(__DIR__);
}

function hh_e(string $value): string {
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
}

/**
 * @param array{fetch_missing?:bool, download_covers?:bool, log?:callable} $options
 * @return array<string,int|string[]>
 */
function hh_build_site(array $options = []): array {
    $root = hh_root();
    $log = $options['log'] ?? static function (string $message): void {};
    $stats = ['pages' => 0, 'covers_downloaded' => 0, 'covers_local' => 0, 'covers_external' => 0, 'covers_failed' => 0, 'skipped' => 0, 'warnings' => []];

    // 1. Read catalogs and localize covers.
    $catalogs = [];
    $coverCache = [];
    foreach (HH_CATALOGS as $relative) {
        $path = $root . '/' . $relative;
        if (!is_file($path)) continue;
        $items = json_decode((string)file_get_contents($path), true);
        if (!is_array($items)) {
            $stats['warnings'][] = "$relative: не JSON-масив, пропущено";
            continue;
        }
        $changed = false;
        foreach ($items as $index => $item) {
            if (!is_array($item)) continue;
            $image = trim((string)($item['imageUrl'] ?? ''));
            $remote = (bool)preg_match('#^https?://#i', $image);
            if (!$remote && !array_key_exists($image, $coverCache)) {
                // A cover already converted to WebP (the old file is gone) or a heavy local image to optimize.
                $webp = (string)preg_replace('/\.(jpe?g|png|gif)$/i', '.webp', $image);
                if (str_starts_with($image, HH_COVERS_DIR . '/') && $webp !== $image && !is_file("$root/$image") && is_file("$root/$webp")) {
                    $coverCache[$image] = $webp;
                } elseif (!hh_is_heavy_local_image($image)) {
                    continue;
                }
            }
            if (!array_key_exists($image, $coverCache)) {
                $coverCache[$image] = $remote
                    ? (($options['download_covers'] ?? true) ? hh_localize_cover($image, $stats, $log) : '')
                    : hh_optimize_local_cover($image, $stats, $log);
            }
            if ($coverCache[$image] !== '') {
                $items[$index]['imageUrl'] = $coverCache[$image];
                $items[$index]['imageSource'] = $image;
                $changed = true;
            }
        }
        if ($changed) hh_write_json($path, array_values($items));
        $catalogs[$relative] = $items;
    }
    $remaining = [];
    foreach ($catalogs as $items) {
        foreach ($items as $item) {
            $image = is_array($item) ? trim((string)($item['imageUrl'] ?? '')) : '';
            if ($image === '') continue;
            if (preg_match('#^https?://#i', $image)) $remaining[$image] = true;
            else $stats['covers_local']++;
        }
    }
    $stats['covers_external'] = count($remaining);

    // 2. Collect unique articles.
    $articles = [];
    foreach ($catalogs as $items) {
        foreach ($items as $item) {
            if (!is_array($item) || trim((string)($item['title'] ?? '')) === '') continue;
            $id = hh_article_id($item);
            if ($id === '' || isset($articles[$id])) continue;
            $section = (string)($item['section'] ?? 'articles');
            if (!isset(HH_SECTIONS[$section])) $section = 'articles';
            $articles[$id] = ['id' => $id, 'section' => $section, 'item' => $item];
        }
    }

    // 3. Slugs (stable, unique) and the link map used to rewrite internal links.
    $used = [];
    foreach ($articles as $id => $article) {
        $slug = hh_slugify($id);
        $candidate = $slug;
        for ($n = 2; isset($used[$candidate]); $n++) $candidate = $slug . '-' . $n;
        $used[$candidate] = true;
        $articles[$id]['slug'] = $candidate;
        $articles[$id]['path'] = HH_PAGES_DIR . '/' . $candidate . '.html';
    }
    $linkMap = array_map(static fn($article) => $article['path'], $articles);

    // 4. Content.
    foreach ($articles as $id => $article) {
        $content = hh_article_source($article, (bool)($options['fetch_missing'] ?? true), $log);
        if ($content === null) {
            $stats['skipped']++;
            $stats['warnings'][] = "Немає тексту для «{$article['item']['title']}» ($id)";
            unset($articles[$id], $linkMap[$id]);
            continue;
        }
        $articles[$id] += $content;
    }

    // 5. Pages.
    $pagesDir = $root . '/' . HH_PAGES_DIR;
    if (!is_dir($pagesDir) && !mkdir($pagesDir, 0755, true) && !is_dir($pagesDir)) throw new RuntimeException('Cannot create ' . HH_PAGES_DIR);
    $bySection = [];
    foreach ($articles as $id => $article) $bySection[$article['section']][] = $id;

    $manifest = [];
    $written = [];
    foreach ($articles as $id => $article) {
        $body = hh_sanitize_article_html($article['html'], (string)$article['item']['title'], $linkMap);
        $related = hh_related($id, $articles, $bySection[$article['section']] ?? []);
        $html = hh_render_article_page($article, $body, $related);
        $file = $pagesDir . '/' . $article['slug'] . '.html';
        if (!is_file($file) || file_get_contents($file) !== $html) hh_write_file($file, $html);
        $written[basename($file)] = true;
        $manifest[$id] = [
            'path' => $article['path'],
            'title' => (string)$article['item']['title'],
            'section' => $article['section'],
            'lastmod' => gmdate('Y-m-d', $article['modified']),
            'minutes' => hh_reading_minutes($body),
        ];
        $stats['pages']++;
    }
    foreach (glob($pagesDir . '/*.html') ?: [] as $file) {
        if (!isset($written[basename($file)])) unlink($file);
    }

    ksort($manifest, SORT_STRING);
    hh_write_json($root . '/' . HH_MANIFEST, ['pages' => $manifest, 'static' => HH_STATIC_PAGES]);
    $log(sprintf('Сторінок: %d. Картки з локальною обкладинкою: %d, зовнішніх адрес лишилось: %d (завантажено зараз: %d, помилок: %d)',
        $stats['pages'], $stats['covers_local'], $stats['covers_external'], $stats['covers_downloaded'], $stats['covers_failed']));
    return $stats;
}

/** Same rules as getArticleId() in js/load_articles.js. */
function hh_article_id(array $item): string {
    $localId = (string)($item['localId'] ?? $item['local_id'] ?? '');
    if (preg_match('/^[a-z0-9_]+:[a-z0-9_-]{1,150}$/i', $localId)) return $localId;
    $url = (string)($item['url'] ?? '');
    if (preg_match('#^local://([a-z0-9_]+)/+(.+)$#i', $url, $match)) return $match[1] . ':' . $match[2];
    $parts = parse_url($url);
    if (!$parts || !in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true)
        || !in_array(strtolower($parts['host'] ?? ''), ['telegra.ph', 'www.telegra.ph'], true) || isset($parts['user'])) return '';
    $path = ltrim((string)($parts['path'] ?? ''), '/');
    return hh_valid_telegraph_id($path) ? $path : '';
}

function hh_valid_telegraph_id(string $id): bool {
    return $id !== '' && strlen($id) <= 300 && (bool)preg_match('/^[A-Za-z0-9%._~-]+$/', $id)
        && !str_contains(rawurldecode($id), '/') && !str_contains(rawurldecode($id), '\\') && !str_contains($id, '..');
}

function hh_slugify(string $id): string {
    $text = rawurldecode($id);
    if (($colon = strpos($text, ':')) !== false) $text = substr($text, $colon + 1);
    $text = mb_strtolower($text, 'UTF-8');
    $text = strtr($text, [
        'а' => 'a', 'б' => 'b', 'в' => 'v', 'г' => 'h', 'ґ' => 'g', 'д' => 'd', 'е' => 'e', 'є' => 'ye', 'ж' => 'zh',
        'з' => 'z', 'и' => 'y', 'і' => 'i', 'ї' => 'yi', 'й' => 'y', 'к' => 'k', 'л' => 'l', 'м' => 'm', 'н' => 'n',
        'о' => 'o', 'п' => 'p', 'р' => 'r', 'с' => 's', 'т' => 't', 'у' => 'u', 'ф' => 'f', 'х' => 'kh', 'ц' => 'ts',
        'ч' => 'ch', 'ш' => 'sh', 'щ' => 'shch', 'ь' => '', 'ю' => 'yu', 'я' => 'ya', 'ё' => 'yo', 'ы' => 'y', 'э' => 'e',
        'ъ' => '', '’' => '', "'" => '', 'ʼ' => '',
    ]);
    $text = trim((string)preg_replace('/[^a-z0-9]+/', '-', $text), '-');
    $text = trim(substr($text, 0, 110), '-');
    return $text !== '' ? $text : 'stattia';
}

/** @return array{html:string, author:string, modified:int, source:string}|null */
function hh_article_source(array $article, bool $fetchMissing, callable $log): ?array {
    $root = hh_root();
    $item = $article['item'];
    $inline = (string)($item['contentHtml'] ?? $item['content_html'] ?? '');
    if (trim($inline) !== '') {
        return ['html' => $inline, 'author' => '', 'modified' => time(), 'source' => ''];
    }
    $contentPath = (string)($item['contentPath'] ?? $item['content_path'] ?? '');
    if ($contentPath !== '') {
        $file = hh_safe_local_file($contentPath, ['content', 'articles']);
        if ($file === null) return null;
        return ['html' => (string)file_get_contents($file), 'author' => '', 'modified' => (int)filemtime($file), 'source' => ''];
    }

    $id = $article['id'];
    if (!hh_valid_telegraph_id($id)) return null;
    $source = 'https://telegra.ph/' . $id;
    $folders = ['articles/' . ($article['section'] === 'articles' ? 'general' : $article['section']), 'articles'];
    foreach ($folders as $folder) {
        $file = $root . '/' . $folder . '/' . $id . '.html';
        if (!is_file($file)) continue;
        $raw = (string)file_get_contents($file);
        $author = preg_match('/Автор:\s*([^<]{1,80})</u', $raw, $match) ? trim(html_entity_decode($match[1], ENT_QUOTES | ENT_HTML5, 'UTF-8')) : '';
        return ['html' => $raw, 'author' => $author, 'modified' => (int)filemtime($file), 'source' => $source];
    }
    if (!$fetchMissing) return null;

    $log("Завантажую з Telegraph: $id");
    $response = hh_http_get('https://api.telegra.ph/getPage/' . $id . '?return_content=true', 2 * 1024 * 1024);
    $data = $response === null ? null : json_decode($response['body'], true);
    if (!is_array($data) || empty($data['ok']) || !is_array($data['result']['content'] ?? null)) return null;
    $html = '';
    foreach ($data['result']['content'] as $node) $html .= hh_telegraph_node_html($node);
    $author = trim((string)($data['result']['author_name'] ?? ''));
    $title = (string)($data['result']['title'] ?? $item['title']);
    $backup = "<!DOCTYPE html>\n<html lang='uk'>\n<head>\n<meta charset='UTF-8'>\n<title>" . hh_e($title) . "</title>\n</head>\n<body>\n"
        . "<p>Автор: " . hh_e($author !== '' ? $author : 'Невідомий') . "</p>\n<div class='article-content'>\n$html\n</div>\n</body>\n</html>";
    hh_write_file($root . '/articles/' . $id . '.html', $backup);
    return ['html' => $backup, 'author' => $author, 'modified' => time(), 'source' => $source];
}

function hh_telegraph_node_html(mixed $node): string {
    if (is_string($node)) return hh_e($node);
    if (!is_array($node)) return '';
    $tag = strtolower((string)($node['tag'] ?? ''));
    if (!preg_match('/^[a-z][a-z0-9]{0,9}$/', $tag)) return '';
    $attributes = '';
    foreach (['href', 'src', 'alt'] as $name) {
        if (isset($node['attrs'][$name]) && is_string($node['attrs'][$name])) $attributes .= ' ' . $name . '="' . hh_e($node['attrs'][$name]) . '"';
    }
    $children = '';
    foreach ((array)($node['children'] ?? []) as $child) $children .= hh_telegraph_node_html($child);
    return in_array($tag, ['br', 'hr', 'img'], true) ? "<$tag$attributes>" : "<$tag$attributes>$children</$tag>";
}

function hh_safe_local_file(string $value, array $directories): ?string {
    $decoded = rawurldecode($value);
    if (preg_match('/[\x00-\x20\\\\?#:]/', $decoded) || !preg_match('/\.html$/i', $decoded)) return null;
    $parts = explode('/', $decoded);
    if (!in_array($parts[0], $directories, true)) return null;
    foreach ($parts as $part) if ($part === '' || $part === '.' || $part === '..') return null;
    $root = realpath(hh_root() . '/' . $parts[0]);
    $path = realpath(hh_root() . '/' . $decoded);
    if ($root === false || $path === false || !is_file($path)) return null;
    return str_starts_with(strtolower($path), strtolower($root . DIRECTORY_SEPARATOR)) ? $path : null;
}

/* ---------- HTML sanitizing ---------- */

function hh_sanitize_article_html(string $html, string $title, array $linkMap): string {
    $previous = libxml_use_internal_errors(true);
    $document = new DOMDocument();
    $document->loadHTML('<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body>'
        . $html . '</body></html>', LIBXML_NONET | LIBXML_COMPACT);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);

    $xpath = new DOMXPath($document);
    $source = $xpath->query("//*[contains(concat(' ', normalize-space(@class), ' '), ' article-content ')]")->item(0)
        ?? $document->getElementsByTagName('body')->item(0);
    if (!$source) return '';
    $context = ['title' => $title, 'links' => $linkMap, 'alt' => ''];
    $output = '';
    foreach ($source->childNodes as $child) $output .= hh_sanitize_node($child, $context);
    return trim((string)preg_replace("/\n{3,}/", "\n\n", $output));
}

function hh_sanitize_node(DOMNode $node, array $context): string {
    if ($node instanceof DOMText) return hh_e($node->nodeValue ?? '');
    if (!$node instanceof DOMElement) return '';

    $tag = strtolower($node->tagName);
    if (in_array($tag, ['script', 'style', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea', 'meta', 'link',
        'title', 'head', 'noscript', 'svg', 'math', 'template', 'video', 'audio', 'canvas'], true)) return '';

    if ($tag === 'iframe') return hh_video_link($node->getAttribute('src'));

    $children = static function () use ($node, $context): string {
        $html = '';
        foreach ($node->childNodes as $child) $html .= hh_sanitize_node($child, $context);
        return $html;
    };

    switch ($tag) {
        case 'figure':
            $caption = '';
            foreach ($node->getElementsByTagName('figcaption') as $figcaption) $caption = trim($figcaption->textContent);
            $context['alt'] = $caption;
            $inner = '';
            foreach ($node->childNodes as $child) $inner .= hh_sanitize_node($child, $context);
            return str_contains($inner, '<img') ? "<figure>$inner</figure>\n" : $inner;
        case 'figcaption':
            $inner = trim($children());
            return $inner === '' ? '' : "<figcaption>$inner</figcaption>";
        case 'img':
            $src = hh_absolute_url($node->getAttribute('src'));
            if ($src === '') return '';
            $alt = trim($node->getAttribute('alt')) ?: ($context['alt'] !== '' ? $context['alt'] : 'Ілюстрація до статті «' . $context['title'] . '»');
            return '<img src="' . hh_e($src) . '" alt="' . hh_e(mb_substr($alt, 0, 200)) . '" loading="lazy" decoding="async" referrerpolicy="no-referrer">';
        case 'a':
            $inner = $children();
            $href = hh_rewrite_link($node->getAttribute('href'), $context['links']);
            if ($href === null) return $inner;
            $external = preg_match('#^(https?:|mailto:)#i', $href);
            return '<a href="' . hh_e($href) . '"' . ($external ? ' target="_blank" rel="noopener noreferrer"' : '') . ">$inner</a>";
        case 'br':
        case 'hr':
            return "<$tag>";
        case 'p':
            $inner = $children();
            $visible = trim(html_entity_decode(strip_tags(str_replace(['<br>', '<hr>'], '', $inner)), ENT_QUOTES | ENT_HTML5, 'UTF-8'), " \t\n\r\0\x0B\u{00A0}");
            if ($visible === '' && !str_contains($inner, '<img') && !str_contains($inner, '<a ')) return '';
            return str_contains($inner, '<p') ? $inner : "<p>$inner</p>\n";
        case 'h1':
        case 'h2':
            $inner = trim($children());
            return $inner === '' ? '' : "<h3>$inner</h3>\n";
        case 'aside':
        case 'b':
        case 'blockquote':
        case 'code':
        case 'em':
        case 'h3':
        case 'h4':
        case 'i':
        case 'li':
        case 'ol':
        case 'pre':
        case 's':
        case 'strong':
        case 'u':
        case 'ul':
            $inner = $children();
            if (in_array($tag, ['h3', 'h4', 'li', 'blockquote', 'aside'], true) && trim(strip_tags($inner, '<img>')) === '') return '';
            $block = in_array($tag, ['h3', 'h4', 'ol', 'ul', 'blockquote', 'aside', 'pre'], true) ? "\n" : '';
            return "<$tag>$inner</$tag>$block";
        default:
            return $children();
    }
}

function hh_absolute_url(string $value): string {
    $value = trim($value);
    if ($value === '' || preg_match('/[\x00-\x1f\\\\]/', $value)) return '';
    if (str_starts_with($value, '//')) $value = 'https:' . $value;
    elseif (str_starts_with($value, '/')) $value = 'https://telegra.ph' . $value;
    $parts = parse_url($value);
    if (!$parts || !in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true) || empty($parts['host']) || isset($parts['user'])) return '';
    return $value;
}

function hh_video_link(string $src): string {
    $parts = parse_url(hh_absolute_url($src));
    if (!$parts) return '';
    $target = '';
    if (in_array($parts['host'] ?? '', ['telegra.ph', 'www.telegra.ph'], true) && str_starts_with($parts['path'] ?? '', '/embed/')) {
        parse_str($parts['query'] ?? '', $query);
        $target = is_string($query['url'] ?? null) ? $query['url'] : '';
    } elseif (preg_match('/(^|\.)youtube(-nocookie)?\.com$/', $parts['host'] ?? '') && preg_match('#^/embed/([A-Za-z0-9_-]{6,20})#', $parts['path'] ?? '', $match)) {
        $target = 'https://www.youtube.com/watch?v=' . $match[1];
    }
    $target = hh_absolute_url($target);
    $host = (string)parse_url($target, PHP_URL_HOST);
    if ($target === '' || !preg_match('/(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/', $host)) return '';
    $label = str_contains($host, 'vimeo') ? 'Vimeo' : 'YouTube';
    return '<p class="video-link"><a href="' . hh_e($target) . '" target="_blank" rel="noopener noreferrer">▶ Дивитися відео на ' . $label . "</a></p>\n";
}

/** Internal article links point to static pages; returns null for unsafe links. */
function hh_rewrite_link(string $href, array $links): ?string {
    $href = trim($href);
    if ($href === '' || preg_match('/[\x00-\x1f\\\\]/', $href)) return null;
    if (str_starts_with($href, '#')) return null;
    if (preg_match('#^(?:\./)?article\.html\?id=([^&\#]+)#', $href, $match)) {
        $id = rawurldecode($match[1]);
        return isset($links[$id]) ? $links[$id] : null;
    }
    if (preg_match('#^mailto:#i', $href)) return filter_var(substr($href, 7), FILTER_VALIDATE_EMAIL) ? $href : null;
    if (preg_match('#^https?://(www\.)?telegra\.ph/([^/?\#]+)#i', $href, $match) && isset($links[$match[2]])) return $links[$match[2]];
    if (preg_match('#^[a-z0-9_-]+\.html(\#[a-z0-9_-]*)?$#i', $href)) return $href;
    $absolute = hh_absolute_url($href);
    return $absolute === '' ? null : $absolute;
}

/* ---------- Covers ---------- */

function hh_localize_cover(string $url, array &$stats, callable $log): string {
    $root = hh_root();
    $directory = $root . '/' . HH_COVERS_DIR;
    $name = substr(sha1($url), 0, 20);
    if (is_file("$directory/$name.webp")) return HH_COVERS_DIR . "/$name.webp";
    foreach (['jpg', 'png', 'gif'] as $extension) {
        if (!is_file("$directory/$name.$extension")) continue;
        // Saved earlier without GD (e.g. by the admin panel): convert now if GD is available.
        if (!function_exists('imagewebp')) return HH_COVERS_DIR . "/$name.$extension";
        $path = hh_store_cover((string)file_get_contents("$directory/$name.$extension"), $extension, $name);
        if ($path !== HH_COVERS_DIR . "/$name.$extension") unlink("$directory/$name.$extension");
        return $path;
    }
    if (hh_absolute_url($url) === '') return '';
    $response = hh_http_get($url, HH_DOWNLOAD_LIMIT);
    $info = $response === null ? false : @getimagesizefromstring($response['body']);
    $types = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_GIF => 'gif', IMAGETYPE_WEBP => 'webp'];
    if ($info === false || !isset($types[$info[2]]) || $info[0] < 16 || $info[1] < 16) {
        $stats['covers_failed']++;
        $stats['warnings'][] = "Не вдалося завантажити обкладинку: $url";
        $log("  ✗ $url");
        return '';
    }
    $path = hh_store_cover($response['body'], $types[$info[2]], $name);
    $stats['covers_downloaded']++;
    $log(sprintf('  ✓ %s (%d КБ)', $path, (int)ceil(filesize($root . '/' . $path) / 1024)));
    return $path;
}

/** Local catalog images over 150 KB (e.g. a 1.9 MB PNG poster) get a resized WebP copy in images/covers. */
function hh_is_heavy_local_image(string $image): bool {
    if (!preg_match('#^images/[A-Za-z0-9_./-]+\.(jpe?g|png|gif|webp)$#i', $image) || str_contains($image, '..')) return false;
    $file = hh_root() . '/' . $image;
    if (!is_file($file) || !function_exists('imagewebp')) return false;
    if (str_starts_with($image, HH_COVERS_DIR . '/')) return !str_ends_with(strtolower($image), '.webp');
    return filesize($file) > 150 * 1024;
}

function hh_optimize_local_cover(string $image, array &$stats, callable $log): string {
    $root = hh_root();
    if (str_starts_with($image, HH_COVERS_DIR . '/')) {
        // A cover saved without GD: replace it with a WebP of the same name.
        $name = pathinfo($image, PATHINFO_FILENAME);
        $path = hh_store_cover((string)file_get_contents($root . '/' . $image), strtolower(pathinfo($image, PATHINFO_EXTENSION)), $name);
        if ($path !== $image) unlink($root . '/' . $image);
        $log("  ✓ $image → $path");
        return $path;
    }
    $name = 'local-' . substr(sha1($image), 0, 14);
    foreach (['webp', 'jpg', 'png', 'gif'] as $extension) {
        if (is_file("$root/" . HH_COVERS_DIR . "/$name.$extension")) return HH_COVERS_DIR . "/$name.$extension";
    }
    if (!function_exists('imagewebp')) return '';
    $bytes = (string)file_get_contents($root . '/' . $image);
    $path = hh_store_cover($bytes, strtolower(pathinfo($image, PATHINFO_EXTENSION)), $name);
    if (!str_ends_with($path, '.webp')) {
        unlink($root . '/' . $path);
        return '';
    }
    $log(sprintf('  ✓ %s → %s (%d КБ)', $image, $path, (int)ceil(filesize($root . '/' . $path) / 1024)));
    return $path;
}

/** Saves an image as a resized WebP when GD is available, otherwise as the original bytes. */
function hh_store_cover(string $bytes, string $extension, string $name): string {
    $directory = hh_root() . '/' . HH_COVERS_DIR;
    if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) throw new RuntimeException('Cannot create covers directory');
    if ($extension === 'jpeg') $extension = 'jpg';
    if (function_exists('imagewebp') && function_exists('imagecreatefromstring')) {
        $image = @imagecreatefromstring($bytes);
        if ($image !== false) {
            [$width, $height] = [imagesx($image), imagesy($image)];
            $scale = min(1, HH_COVER_MAX_WIDTH / $width, HH_COVER_MAX_HEIGHT / $height);
            if ($scale < 1) {
                $resized = imagescale($image, max(1, (int)round($width * $scale)), max(1, (int)round($height * $scale)), IMG_BICUBIC);
                if ($resized !== false) {
                    imagedestroy($image);
                    $image = $resized;
                }
            }
            imagepalettetotruecolor($image);
            imagealphablending($image, true);
            imagesavealpha($image, true);
            ob_start();
            $ok = imagewebp($image, null, 80);
            $webp = (string)ob_get_clean();
            imagedestroy($image);
            if ($ok && $webp !== '') {
                $bytes = $webp;
                $extension = 'webp';
            }
        }
    }
    hh_write_file("$directory/$name.$extension", $bytes);
    return HH_COVERS_DIR . "/$name.$extension";
}

/** @return array{body:string, type:string}|null */
function hh_http_get(string $url, int $limit): ?array {
    if (!function_exists('curl_init')) return null;
    $body = '';
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 4,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 25,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; HorrorHubSiteBuilder/1.0)',
        CURLOPT_HTTPHEADER => ['Accept: image/avif,image/webp,image/*,application/json;q=0.8,*/*;q=0.5'],
        CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$body, $limit): int {
            if (strlen($body) + strlen($chunk) > $limit) return 0;
            $body .= $chunk;
            return strlen($chunk);
        },
    ]);
    $ok = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $type = (string)curl_getinfo($curl, CURLINFO_CONTENT_TYPE);
    curl_close($curl);
    return $ok && $status >= 200 && $status < 300 && $body !== '' ? ['body' => $body, 'type' => $type] : null;
}

/* ---------- Page rendering ---------- */

function hh_related(string $id, array $articles, array $sectionIds): array {
    $pool = array_values(array_filter($sectionIds, static fn($other) => $other !== $id));
    if (count($pool) < 3) {
        foreach (array_keys($articles) as $other) {
            if ($other !== $id && !in_array($other, $pool, true)) $pool[] = $other;
            if (count($pool) >= 12) break;
        }
    }
    if (!$pool) return [];
    // Deterministic but varied: start after the article's own position.
    $position = array_search($id, $sectionIds, true);
    $offset = $position === false ? 0 : $position % count($pool);
    $picked = [];
    for ($i = 0; $i < min(3, count($pool)); $i++) $picked[] = $articles[$pool[($offset + $i) % count($pool)]];
    return $picked;
}

function hh_meta_description(array $item, string $body): string {
    $text = trim((string)($item['previewText'] ?? ''));
    if (mb_strlen($text) < 60) {
        $plain = trim((string)preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($body), ENT_QUOTES | ENT_HTML5, 'UTF-8')));
        $text = $text === '' ? $plain : $text . ' ' . $plain;
    }
    if (mb_strlen($text) > 160) $text = preg_replace('/[\s,.;:—-]+$/u', '', mb_substr($text, 0, 157)) . '…';
    return $text;
}

function hh_absolute(string $base, string $path): string {
    if (preg_match('#^https?://#i', $path)) return $path;
    return $base === '' ? '' : $base . '/' . ltrim($path, '/');
}


function hh_reading_minutes(string $body): int {
    $words = (int)preg_match_all('/[\p{L}\p{N}’\'-]+/u', html_entity_decode(strip_tags($body), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    return max(1, (int)round($words / 200));
}

function hh_render_article_page(array $article, string $body, array $related): string {
    $item = $article['item'];
    $site = HH_CATALOG_TO_SITE_SECTION[$article['section']] ?? 'home';
    [$sectionLabel, $sectionPage] = HH_LAYOUT_SECTIONS[$site];
    $title = trim((string)$item['title']);
    $description = hh_meta_description($item, $body);
    $base = hh_site_url();
    $canonical = hh_absolute($base, $article['path']);
    $cover = trim((string)($item['imageUrl'] ?? ''));
    $coverAbsolute = $cover === '' ? '' : hh_absolute($base, $cover);
    $minutes = hh_reading_minutes($body);
    $author = in_array($article['author'], ['', 'Невідомий', 'Unknown'], true) ? 'Horror Hub' : $article['author'];
    $metaParts = array_filter(array_map('trim', [(string)($item['genre'] ?? ''), (string)($item['release_date'] ?? ''), (string)($item['developer'] ?? '')]));

    $schema = [
        '@context' => 'https://schema.org',
        '@graph' => array_values(array_filter([
            array_filter([
                '@type' => 'Article',
                'headline' => mb_substr($title, 0, 110),
                'description' => $description,
                'inLanguage' => 'uk',
                'image' => $coverAbsolute ?: null,
                'author' => ['@type' => $author === 'Horror Hub' ? 'Organization' : 'Person', 'name' => $author],
                'publisher' => ['@type' => 'Organization', 'name' => 'Horror Hub'],
                'dateModified' => gmdate('Y-m-d', $article['modified']),
                'mainEntityOfPage' => $canonical ?: null,
                'isBasedOn' => $article['source'] ?: null,
            ], static fn($value) => $value !== null),
            $base === '' ? null : [
                '@type' => 'BreadcrumbList',
                'itemListElement' => [
                    ['@type' => 'ListItem', 'position' => 1, 'name' => 'Головна', 'item' => $base . '/'],
                    ['@type' => 'ListItem', 'position' => 2, 'name' => $sectionLabel, 'item' => hh_absolute($base, $sectionPage)],
                    ['@type' => 'ListItem', 'position' => 3, 'name' => $title],
                ],
            ],
        ])),
    ];
    $jsonLd = str_replace('</', '<\/', json_encode($schema, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR));

    $head = [
        '<meta charset="UTF-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
        '<base href="../">',
        '<title>' . hh_e($title) . ' — Horror Hub</title>',
        '<meta name="description" content="' . hh_e($description) . '">',
        '<meta name="robots" content="index, follow, max-image-preview:large">',
    ];
    if ($canonical !== '') $head[] = '<link rel="canonical" href="' . hh_e($canonical) . '">';
    $head[] = '<meta property="og:type" content="article">';
    $head[] = '<meta property="og:site_name" content="Horror Hub">';
    $head[] = '<meta property="og:locale" content="uk_UA">';
    $head[] = '<meta property="og:title" content="' . hh_e($title) . '">';
    $head[] = '<meta property="og:description" content="' . hh_e($description) . '">';
    if ($canonical !== '') $head[] = '<meta property="og:url" content="' . hh_e($canonical) . '">';
    if ($coverAbsolute !== '') $head[] = '<meta property="og:image" content="' . hh_e($coverAbsolute) . '">';
    $head[] = '<meta name="twitter:card" content="summary_large_image">';
    $head[] = hh_site_head_assets();
    $head[] = '<script type="application/ld+json">' . $jsonLd . '</script>';
    $head[] = '<script src="js/auth.js?v=20261120-d"></script>';

    $relatedHtml = '';
    foreach ($related as $other) {
        $otherCover = trim((string)($other['item']['imageUrl'] ?? '')) ?: 'images/placeholder.jpg';
        $relatedHtml .= '      <a class="related-card" href="' . hh_e($other['path']) . '">'
            . '<img src="' . hh_e($otherCover) . '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
            . '<span>' . hh_e((string)$other['item']['title']) . "</span></a>\n";
    }

    $source = $article['source'] !== ''
        ? '<a class="source-link" href="' . hh_e($article['source']) . '" target="_blank" rel="noopener noreferrer">Оригінал у Telegraph</a>'
        : '';
    $metaLine = hh_e(implode(' · ', $metaParts));
    $scp = $article['id'] === 'internet_horror:scp' ? ' data-scp-simulator' : '';

    return "<!DOCTYPE html>\n<html lang=\"uk\">\n<head>\n  " . implode("\n  ", $head) . "\n</head>\n"
        . "<body data-section=\"$site\">\n" . hh_site_header($site, $site) . "\n\n"
        . "<main class=\"container\" id=\"main\">\n"
        . "  <ol class=\"breadcrumbs\" aria-label=\"Ви тут\">\n"
        . "    <li><a href=\"index.html\">Головна</a></li>\n"
        . "    <li><a href=\"" . hh_e($sectionPage) . "\">" . hh_e($sectionLabel) . "</a></li>\n"
        . "    <li aria-current=\"page\">" . hh_e($title) . "</li>\n  </ol>\n\n"
        . "  <article class=\"single-article\" id=\"article-content\" data-static-article data-article-id=\"" . hh_e($article['id']) . "\"$scp>\n"
        . "    <h1>" . hh_e($title) . "</h1>\n"
        . "    <div class=\"article-meta\"><span>" . ($metaLine !== '' ? $metaLine . ' · ' : '') . 'Автор: ' . hh_e($author)
        . ' · ' . $minutes . " хв читання</span>$source</div>\n"
        . "    <div class=\"article-body\">\n$body\n    </div>\n  </article>\n\n"
        . ($relatedHtml !== '' ? "  <section class=\"related-articles\" aria-labelledby=\"related-title\">\n    <h2 id=\"related-title\">Читайте також</h2>\n    <div class=\"related-grid\">\n$relatedHtml    </div>\n  </section>\n\n" : '')
        . "  <section class=\"single-article comments-section\" aria-labelledby=\"comments-title\">\n"
        . "    <h2 id=\"comments-title\">Коментарі</h2>\n"
        . "    <div id=\"comment-form-container\"></div>\n"
        . "    <div id=\"comments-list\" class=\"comments-list\"><p class=\"muted-text\">Завантаження коментарів...</p></div>\n"
        . "  </section>\n</main>\n\n"
        . hh_site_footer() . "\n\n"
        . "<script src=\"js/render_article.js?v=20261120-d\"></script>\n</body>\n</html>\n";
}

/* ---------- Files ---------- */

function hh_write_file(string $path, string $contents): void {
    $directory = dirname($path);
    if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) throw new RuntimeException("Cannot create $directory");
    $temporary = tempnam($directory, '.build-');
    try {
        if ($temporary === false || file_put_contents($temporary, $contents, LOCK_EX) !== strlen($contents)) throw new RuntimeException("Cannot write $path");
        if (is_file($path) && PHP_OS_FAMILY === 'Windows') @unlink($path);
        if (!rename($temporary, $path)) throw new RuntimeException("Cannot publish $path");
    } finally {
        if ($temporary !== false && is_file($temporary)) unlink($temporary);
    }
}

function hh_write_json(string $path, array $data): void {
    hh_write_file($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n");
}
