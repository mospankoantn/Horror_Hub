<?php
require_once __DIR__ . '/../includes/bootstrap.php';
require_once __DIR__ . '/../includes/games.php';
chdir(__DIR__);
set_time_limit(300);

$aggregate_json_file = '../articles_data.json';
$admin_password = getenv('HORROR_HUB_ADMIN_PASSWORD') ?: '';
$admin_password_hash = getenv('HORROR_HUB_ADMIN_PASSWORD_HASH') ?: '';


$article_sections = [
    'articles' => [
        'label' => 'Загальні статті',
        'short_label' => 'Статті',
        'table' => 'articles',
        'json' => '../data/general/articles_data.json',
        'seed_json' => '../articles_data.json',
        'folder' => '../articles/general',
        'page' => '../articles.html',
    ],
    'horror_games' => [
        'label' => 'Ігри Жахів',
        'short_label' => 'Ігри',
        'table' => 'articles_games',
        'json' => '../data/horror_games/articles_data.json',
        'folder' => '../articles/horror_games',
        'page' => '../horror_games.html',
    ],
    'horror_movies' => [
        'label' => 'Фільми Жахів',
        'short_label' => 'Фільми',
        'table' => 'articles_movies',
        'json' => '../data/horror_movies/articles_data.json',
        'folder' => '../articles/horror_movies',
        'page' => '../horror_movies.html',
    ],
    'reviews' => [
        'label' => 'Огляди',
        'short_label' => 'Огляди',
        'table' => 'articles_reviews',
        'json' => '../data/reviews/articles_data.json',
        'folder' => '../articles/reviews',
        'page' => '../reviews.html',
    ],
    'internet_horror' => [
        'label' => 'Крипіпасти та інтернет-хоррор',
        'short_label' => 'Інтернет хоррор',
        'table' => 'articles_internet_horror',
        'json' => '../data/internet_horror/articles_data.json',
        'folder' => '../articles/internet_horror',
        'page' => '../internet_horror.html',
    ],
    'horror_art' => [
        'label' => 'Жах у мистецтві',
        'short_label' => 'Мистецтво',
        'table' => 'articles_horror_art',
        'json' => '../data/horror_art/articles_data.json',
        'folder' => '../articles/horror_art',
        'page' => '../horror_art.html',
    ],
    'horror_literature' => [
        'label' => 'Жах у літературі',
        'short_label' => 'Література',
        'table' => 'articles_horror_literature',
        'json' => '../data/horror_literature/articles_data.json',
        'folder' => '../articles/horror_literature',
        'page' => '../horror_literature.html',
    ],
];

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') hh_check_csrf();
if (isset($_POST['logout'])) {
    hh_destroy_session();
    header('Location: admin.php');
    exit;
}

function e($value): string {
    return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

function hasAdminAccess(): bool {
    $credential = (getenv('HORROR_HUB_ADMIN_PASSWORD_HASH') ?: '') . '|' . (getenv('HORROR_HUB_ADMIN_PASSWORD') ?: '');
    if (!empty($_SESSION['is_admin']) && ($_SESSION['admin_expires'] ?? 0) > time()
        && hash_equals(hash('sha256', $credential), $_SESSION['admin_credential'] ?? '')) return true;
    $user = hh_current_user();
    return $user !== null && $user['role'] === 'admin';
}

function csrfField(): string {
    return '<input type="hidden" name="csrf_token" value="' . e(hh_csrf_token()) . '">';
}

function adminPasswordMatches(string $password, string $plainPassword, string $passwordHash): bool {
    if ($passwordHash !== '') {
        return password_verify($password, $passwordHash);
    }

    return $plainPassword !== '' && hash_equals($plainPassword, $password);
}

function validSectionKey(array $sections, $key): string {
    if (!is_string($key)) hh_json(['status' => 'error', 'message' => 'Некоректний розділ.'], 422);
    return isset($sections[$key]) ? $key : 'articles';
}

function sectionTable(array $sections, string $key): string {
    return $sections[$key]['table'];
}

function ensureDirectory(string $path): void {
    if (!is_dir($path) && !mkdir($path, 0755, true) && !is_dir($path)) throw new RuntimeException('Cannot create directory');
}

function columnExists(PDO $pdo, string $table, string $column): bool {
    $stmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
    ");
    $stmt->execute([$table, $column]);
    return (int)$stmt->fetchColumn() > 0;
}

function ensureColumn(PDO $pdo, string $table, string $column, string $definition): void {
    if (!columnExists($pdo, $table, $column)) {
        $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN {$column} {$definition}");
    }
}

function ensureArticleTable(PDO $pdo, string $table): void {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `{$table}` (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            url TEXT NOT NULL,
            image_url TEXT NULL,
            title VARCHAR(255) NOT NULL,
            preview_text TEXT NULL,
            release_date VARCHAR(100) NULL,
            developer VARCHAR(255) NULL,
            genre VARCHAR(255) NULL,
            content_html MEDIUMTEXT NULL,
            content_path VARCHAR(255) NULL,
            local_id VARCHAR(191) NULL,
            sort_order INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_sort_order (sort_order),
            KEY idx_local_id (local_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    ");

    ensureColumn($pdo, $table, 'release_date', 'VARCHAR(100) NULL');
    ensureColumn($pdo, $table, 'developer', 'VARCHAR(255) NULL');
    ensureColumn($pdo, $table, 'genre', 'VARCHAR(255) NULL');
    ensureColumn($pdo, $table, 'content_html', 'MEDIUMTEXT NULL');
    ensureColumn($pdo, $table, 'content_path', 'VARCHAR(255) NULL');
    ensureColumn($pdo, $table, 'local_id', 'VARCHAR(191) NULL');
    ensureColumn($pdo, $table, 'sort_order', 'INT NOT NULL DEFAULT 0');
}

function normalizeArticleRow(array $row, string $sectionKey, array $section): array {
    $article = [
        'url' => (string)($row['url'] ?? ''),
        'imageUrl' => (string)($row['imageUrl'] ?? $row['image_url'] ?? ''),
        'title' => (string)($row['title'] ?? ''),
        'previewText' => (string)($row['previewText'] ?? $row['preview_text'] ?? ''),
        'release_date' => (string)($row['release_date'] ?? ''),
        'developer' => (string)($row['developer'] ?? ''),
        'genre' => (string)($row['genre'] ?? ''),
        'section' => $sectionKey,
        'sectionLabel' => $section['label'],
    ];

    $optional = [
        'id' => $row['id'] ?? null,
        'localId' => $row['localId'] ?? $row['local_id'] ?? '',
        'contentHtml' => $row['contentHtml'] ?? $row['content_html'] ?? '',
        'contentPath' => $row['contentPath'] ?? $row['content_path'] ?? '',
    ];

    foreach ($optional as $key => $value) {
        if ($value !== null && $value !== '') {
            $article[$key] = $value;
        }
    }

    return $article;
}

function writeJsonFile(string $path, array $data): void {
    ensureDirectory(dirname($path));
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $temporary = tempnam(dirname($path), '.catalog-');
    try {
        if ($temporary === false || file_put_contents($temporary, $json, LOCK_EX) !== strlen($json) || !rename($temporary, $path)) throw new RuntimeException('Cannot publish article catalog');
    } finally {
        if ($temporary !== false && is_file($temporary)) unlink($temporary);
    }
}

function fetchSectionArticles(PDO $pdo, array $sections, string $sectionKey): array {
    $table = sectionTable($sections, $sectionKey);
    $stmt = $pdo->query("
        SELECT id, url, image_url, title, preview_text, release_date, developer, genre,
               content_html, content_path, local_id
        FROM `{$table}`
        ORDER BY sort_order ASC, id ASC
    ");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    return array_map(
        fn($row) => normalizeArticleRow($row, $sectionKey, $sections[$sectionKey]),
        $rows
    );
}

function syncAllSectionsToJson(PDO $pdo, array $sections, string $aggregatePath): void {
    $aggregate = [];
    $seen = [];

    foreach ($sections as $sectionKey => $section) {
        $articles = fetchSectionArticles($pdo, $sections, $sectionKey);
        writeJsonFile($section['json'], $articles);

        foreach ($articles as $article) {
            $key = $article['localId'] ?? $article['url'] ?? $article['title'] ?? '';
            if ($key !== '' && isset($seen[$key])) {
                continue;
            }
            if ($key !== '') {
                $seen[$key] = true;
            }
            $aggregate[] = $article;
        }
    }

    writeJsonFile($aggregatePath, $aggregate);

    // Static article pages, local covers and data/pages.json follow every catalog change.
    try {
        require_once __DIR__ . '/../includes/site_builder.php';
        hh_build_site();
    } catch (Throwable $error) {
        error_log('Horror Hub: static site build failed: ' . $error->getMessage());
    }
}

function slugifyTitle(string $title): string {
    $map = [
        'а'=>'a','б'=>'b','в'=>'v','г'=>'h','ґ'=>'g','д'=>'d','е'=>'e','є'=>'ie','ж'=>'zh','з'=>'z','и'=>'y','і'=>'i','ї'=>'i','й'=>'i','к'=>'k','л'=>'l','м'=>'m','н'=>'n','о'=>'o','п'=>'p','р'=>'r','с'=>'s','т'=>'t','у'=>'u','ф'=>'f','х'=>'kh','ц'=>'ts','ч'=>'ch','ш'=>'sh','щ'=>'shch','ь'=>'','ю'=>'iu','я'=>'ia',
        'А'=>'a','Б'=>'b','В'=>'v','Г'=>'h','Ґ'=>'g','Д'=>'d','Е'=>'e','Є'=>'ie','Ж'=>'zh','З'=>'z','И'=>'y','І'=>'i','Ї'=>'i','Й'=>'i','К'=>'k','Л'=>'l','М'=>'m','Н'=>'n','О'=>'o','П'=>'p','Р'=>'r','С'=>'s','Т'=>'t','У'=>'u','Ф'=>'f','Х'=>'kh','Ц'=>'ts','Ч'=>'ch','Ш'=>'sh','Щ'=>'shch','Ь'=>'','Ю'=>'iu','Я'=>'ia',
    ];

    $slug = strtr($title, $map);
    $slug = strtolower($slug);
    $slug = preg_replace('/[^a-z0-9]+/', '-', $slug);
    $slug = trim((string)$slug, '-');

    return $slug !== '' ? $slug : 'article-' . date('YmdHis');
}

function buildArticlePayload(array $sections, string $fallbackSection): array {
    $sectionKey = validSectionKey($sections, $_POST['section'] ?? $fallbackSection);
    $title = hh_input($_POST, 'title');
    $url = hh_input($_POST, 'url');
    $contentHtml = hh_input($_POST, 'contentHtml');
    $contentPath = hh_input($_POST, 'contentPath');
    $localId = hh_input($_POST, 'localId');
    $image = hh_input($_POST, 'imageUrl') ?: 'images/placeholder.jpg';
    $preview = hh_input($_POST, 'previewText');
    $release = hh_input($_POST, 'release_date');
    $developer = hh_input($_POST, 'developer');
    $genre = hh_input($_POST, 'genre');
    if ($title === '' || hh_length($title) > 255 || strlen($contentHtml) > 500000
        || strlen($url) > 2048 || strlen($image) > 2048 || hh_length($contentPath) > 255
        || hh_length($preview) > 10000 || hh_length($release) > 100 || hh_length($developer) > 255 || hh_length($genre) > 255
        || ($url !== '' && !hh_safe_url($url) && !preg_match('~^local://[a-z0-9_]+/[a-z0-9_-]+$~i', $url))
        || ($localId !== '' && !preg_match('/^[a-z0-9_]+:[a-z0-9_-]{1,150}$/i', $localId))
        || (!hh_safe_url($image) && !hh_local_path($image, 'images', ['jpg', 'jpeg', 'png', 'gif', 'webp']))
        || ($contentPath !== '' && !hh_local_path($contentPath, 'content', ['html']) && !hh_local_path($contentPath, 'articles', ['html']))) {
        hh_json(['status' => 'error', 'message' => 'Перевірте назву, URL, зображення та локальні шляхи статті.'], 422);
    }

    if ($localId === '' && ($contentHtml !== '' || $contentPath !== '' || $url === '')) {
        $localId = $sectionKey . ':' . substr(slugifyTitle($title), 0, 150);
    }

    if ($url === '' && $localId !== '') {
        $url = 'local://' . str_replace(':', '/', $localId);
    }

    return [
        'section' => $sectionKey,
        'url' => $url,
        'image_url' => $image,
        'title' => $title,
        'preview_text' => $preview,
        'release_date' => $release,
        'developer' => $developer,
        'genre' => $genre,
        'content_html' => $contentHtml,
        'content_path' => $contentPath,
        'local_id' => $localId,
    ];
}

function insertArticle(PDO $pdo, string $table, array $payload, bool $addToEnd): void {
    if ($addToEnd) {
        $maxSort = $pdo->query("SELECT COALESCE(MAX(sort_order), -1) FROM `{$table}`")->fetchColumn();
        $sortValue = (int)$maxSort + 1;
    } else {
        $pdo->query("UPDATE `{$table}` SET sort_order = sort_order + 1");
        $sortValue = 0;
    }

    $stmt = $pdo->prepare("
        INSERT INTO `{$table}` (
            url, image_url, title, preview_text, release_date, developer, genre,
            content_html, content_path, local_id, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([
        $payload['url'],
        $payload['image_url'],
        $payload['title'],
        $payload['preview_text'],
        $payload['release_date'],
        $payload['developer'],
        $payload['genre'],
        $payload['content_html'],
        $payload['content_path'],
        $payload['local_id'],
        $sortValue,
    ]);
}

function importJsonSeed(PDO $pdo, array $sections, string $sectionKey, string $aggregatePath): void {
    $section = $sections[$sectionKey];
    $table = $section['table'];
    $count = (int)$pdo->query("SELECT COUNT(*) FROM `{$table}`")->fetchColumn();
    if ($count > 0) {
        return;
    }

    $seedPath = $section['seed_json'] ?? $section['json'];
    if (!file_exists($seedPath) && $sectionKey === 'articles' && file_exists($aggregatePath)) {
        $seedPath = $aggregatePath;
    }

    if (!file_exists($seedPath)) {
        return;
    }

    $items = json_decode((string)file_get_contents($seedPath), true);
    if (!is_array($items) || $items === []) {
        return;
    }

    if ($sectionKey === 'articles') {
        $items = array_values(array_filter($items, function ($item) {
            $itemSection = $item['section'] ?? '';
            return $itemSection === '' || $itemSection === 'articles' || $itemSection === 'general';
        }));
    }

    $stmt = $pdo->prepare("
        INSERT INTO `{$table}` (
            url, image_url, title, preview_text, release_date, developer, genre,
            content_html, content_path, local_id, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");

    foreach ($items as $index => $item) {
        if (empty($item['title'])) {
            continue;
        }

        $localId = trim((string)($item['localId'] ?? $item['local_id'] ?? ''));
        $url = trim((string)($item['url'] ?? ''));

        if ($url === '' && $localId !== '') {
            $url = 'local://' . str_replace(':', '/', $localId);
        }

        if ($url === '') {
            $url = 'local://' . $sectionKey . '/' . slugifyTitle((string)$item['title']);
        }

        $stmt->execute([
            $url,
            $item['imageUrl'] ?? $item['image_url'] ?? 'images/placeholder.jpg',
            $item['title'] ?? '',
            $item['previewText'] ?? $item['preview_text'] ?? '',
            $item['release_date'] ?? '',
            $item['developer'] ?? '',
            $item['genre'] ?? '',
            $item['contentHtml'] ?? $item['content_html'] ?? '',
            $item['contentPath'] ?? $item['content_path'] ?? '',
            $localId,
            $index,
        ]);
    }
}

function parseTelegraphNodeToHTML($node): string {
    if (is_string($node)) {
        return htmlspecialchars($node, ENT_QUOTES, 'UTF-8');
    }

    if (!is_array($node)) return '';
    $tag = strtolower((string)($node['tag'] ?? ''));
    $allowed_tags = ['a','aside','b','blockquote','br','code','em','figcaption','figure','h3','h4','hr','i','img','li','ol','p','pre','s','strong','u','ul'];
    if (!in_array($tag, $allowed_tags, true)) {
        $html = '';
        foreach (($node['children'] ?? []) as $child) {
            $html .= parseTelegraphNodeToHTML($child);
        }
        return $html;
    }

    $html = "<{$tag}";
    foreach (($node['attrs'] ?? []) as $key => $value) {
        if (!preg_match('/^[a-zA-Z_:.-]+$/', (string)$key)) {
            continue;
        }
        if (!in_array($key, ['href', 'src', 'alt', 'title'], true)) {
            continue;
        }
        if ($key === 'src' && strpos((string)$value, '/') === 0) {
            $value = 'https://telegra.ph' . $value;
        }
        if (($key === 'href' || $key === 'src') && (!is_string($value) || !hh_safe_url($value, $key === 'href'))) continue;
        $html .= " {$key}=\"" . htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8') . "\"";
    }
    $html .= '>';

    foreach (($node['children'] ?? []) as $child) {
        $html .= parseTelegraphNodeToHTML($child);
    }

    if (!in_array($tag, ['br', 'hr', 'img'], true)) {
        $html .= "</{$tag}>";
    }

    return $html;
}

function redirectAdmin(array $params): void {
    header('Location: admin.php?' . http_build_query($params));
    exit;
}

if (isset($_POST['login'])) {
    hh_rate_limit('admin_login', 10, 900);
    if (adminPasswordMatches(hh_input($_POST, 'password', false), $admin_password, $admin_password_hash)) {
        session_regenerate_id(true);
        $_SESSION['is_admin'] = true;
        $_SESSION['admin_expires'] = time() + 3600;
        $_SESSION['admin_credential'] = hash('sha256', $admin_password_hash . '|' . $admin_password);
        header('Location: admin.php');
        exit;
    }

    $error_msg = 'Невірний пароль або адмін-пароль не налаштовано.';
}

if (!hasAdminAccess()) {
    $error = isset($error_msg) ? '<p style="color:#f03030;">' . e($error_msg) . '</p>' : '';
    echo '<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Вхід - Horror Hub</title><link rel="stylesheet" href="../style.css"></head><body><main class="container"><form method="POST" class="contact-wrapper contact-form"><h2>Horror Admin</h2>' . $error . csrfField() . '<label for="admin-password">Пароль адміністратора</label><input id="admin-password" type="password" name="password" autocomplete="current-password" required><button type="submit" name="login">Вхід</button><a href="../index.html">На сайт</a></form></main></body></html>';
    exit;
}

$pdo = hh_db();
foreach ($article_sections as $sectionKey => $section) {
    ensureArticleTable($pdo, $section['table']);
    ensureDirectory(dirname($section['json']));
    ensureDirectory($section['folder']);
    importJsonSeed($pdo, $article_sections, $sectionKey, $aggregate_json_file);
}

if (!is_file($aggregate_json_file)) syncAllSectionsToJson($pdo, $article_sections, $aggregate_json_file);

if (isset($_POST['action']) && $_POST['action'] === 'reorder') {
    header('Content-Type: application/json; charset=utf-8');
    $sectionKey = validSectionKey($article_sections, $_POST['section'] ?? '');
    $table = sectionTable($article_sections, $sectionKey);
    $newOrder = json_decode(hh_input($_POST, 'new_order'), true);
    $existing = array_map('intval', $pdo->query('SELECT id FROM ' . $table)->fetchAll(PDO::FETCH_COLUMN));
    if (!is_array($newOrder) || !array_is_list($newOrder) || array_filter($newOrder, fn($id) => !is_int($id) && !(is_string($id) && ctype_digit($id)))) {
        hh_json(['status' => 'error', 'message' => 'Невірний порядок.'], 422);
    }
    $requested = array_map('intval', $newOrder);
    sort($existing);
    sort($requested);
    if ($requested !== $existing) hh_json(['status' => 'error', 'message' => 'Оновіть список статей.'], 422);

    if (is_array($newOrder)) {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare("UPDATE `{$table}` SET sort_order = ? WHERE id = ?");
        foreach ($newOrder as $sortIndex => $id) {
            $stmt->execute([(int)$sortIndex, (int)$id]);
        }
        $pdo->commit();
        syncAllSectionsToJson($pdo, $article_sections, $aggregate_json_file);
        echo json_encode(['status' => 'success']);
        exit;
    }

    echo json_encode(['status' => 'error', 'message' => 'Невірний порядок']);
    exit;
}

if (isset($_POST['backup_articles'])) {
    $sectionKey = validSectionKey($article_sections, $_POST['backup_section'] ?? '');
    $section = $article_sections[$sectionKey];
    $table = $section['table'];
    $backupDir = $section['folder'];
    ensureDirectory($backupDir);

    $saved = 0;
    $skipped = 0;
    $errors = 0;
    $local = 0;

    $dbArticles = $pdo->query("SELECT * FROM `{$table}` ORDER BY sort_order ASC")->fetchAll(PDO::FETCH_ASSOC);

    foreach ($dbArticles as $article) {
        $url = (string)($article['url'] ?? '');
        if (!preg_match('/^https?:\/\/(www\.)?telegra\.ph\//i', $url)) {
            $local++;
            continue;
        }

        $path = basename((string)parse_url($url, PHP_URL_PATH));
        if ($path === '') {
            $errors++;
            continue;
        }

        $filePath = $backupDir . '/' . $path . '.html';
        if (file_exists($filePath)) {
            $skipped++;
            continue;
        }

        $context = stream_context_create(['http' => ['timeout' => 8, 'follow_location' => 0]]);
        $response = @file_get_contents("https://api.telegra.ph/getPage/" . rawurlencode($path) . "?return_content=true", false, $context);
        if (!$response) {
            $errors++;
            continue;
        }

        $data = json_decode($response, true);
        if (empty($data['ok']) || empty($data['result'])) {
            $errors++;
            continue;
        }

        $page = $data['result'];
        $contentHtml = '';
        foreach (($page['content'] ?? []) as $node) {
            $contentHtml .= parseTelegraphNodeToHTML($node);
        }

        $fullHtml = "<!DOCTYPE html>\n<html lang='uk'>\n<head>\n<meta charset='UTF-8'>\n<meta name='viewport' content='width=device-width, initial-scale=1.0'>\n<title>" . e($page['title'] ?? $article['title']) . " - Локальна копія</title>\n<link rel='stylesheet' href='../../style.css'>\n<style>.single-article{background:var(--surface);border:1px solid var(--border-red);padding:3rem 2rem;border-radius:var(--radius);max-width:900px;margin:2rem auto;box-shadow:var(--shadow-card);color:#ddd}.single-article img{max-width:100%;border-radius:4px}.backup-notice{background:#9e0000;color:#fff;text-align:center;padding:10px;font-weight:bold}</style>\n</head>\n<body>\n<div class='backup-notice'>Локальна резервна копія. Оригінал: <a href='" . e($url) . "' style='color:#fff;text-decoration:underline;'>Telegraph</a></div>\n<main class='single-article'>\n<h1 style='color:var(--red-bright);font-family:var(--font-headings);'>" . e($page['title'] ?? $article['title']) . "</h1>\n<p style='color:var(--text-muted);border-bottom:1px solid var(--border);padding-bottom:10px;'>Автор: " . e($page['author_name'] ?? 'Невідомий') . "</p>\n<div class='article-content'>\n{$contentHtml}\n</div>\n</main>\n</body>\n</html>";

        if (file_put_contents($filePath, $fullHtml)) {
            $saved++;
        } else {
            $errors++;
        }
    }

    redirectAdmin([
        'tab' => 'articles',
        'section' => $sectionKey,
        'msg' => "Бекап {$section['label']}: нових {$saved}, пропущено {$skipped}, локальних {$local}, помилок {$errors}.",
    ]);
}

if (isset($_POST['add_article'])) {
    $payload = buildArticlePayload($article_sections, 'articles');
    $table = sectionTable($article_sections, $payload['section']);
    $pdo->beginTransaction();
    insertArticle($pdo, $table, $payload, isset($_POST['add_to_end']));
    $pdo->commit();
    syncAllSectionsToJson($pdo, $article_sections, $aggregate_json_file);
    redirectAdmin(['tab' => 'articles', 'section' => $payload['section'], 'msg' => 'Статтю додано']);
}

if (isset($_POST['save_edit'])) {
    $sourceSection = validSectionKey($article_sections, $_POST['source_section'] ?? '');
    $payload = buildArticlePayload($article_sections, $sourceSection);
    $sourceTable = sectionTable($article_sections, $sourceSection);
    $targetTable = sectionTable($article_sections, $payload['section']);
    $articleId = (int)($_POST['edit_id'] ?? 0);
    $pdo->beginTransaction();
    $source = $pdo->prepare('SELECT id FROM ' . $sourceTable . ' WHERE id = ? FOR UPDATE');
    $source->execute([$articleId]);
    if (!$source->fetchColumn()) {
        $pdo->rollBack();
        hh_json(['status' => 'error', 'message' => 'Статтю вже видалено.'], 404);
    }

    if ($sourceSection !== $payload['section']) {
        $sortValue = (int)$pdo->query("SELECT COALESCE(MAX(sort_order), -1) FROM `{$targetTable}`")->fetchColumn() + 1;
        $stmt = $pdo->prepare("
            INSERT INTO `{$targetTable}` (
                url, image_url, title, preview_text, release_date, developer, genre,
                content_html, content_path, local_id, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $payload['url'],
            $payload['image_url'],
            $payload['title'],
            $payload['preview_text'],
            $payload['release_date'],
            $payload['developer'],
            $payload['genre'],
            $payload['content_html'],
            $payload['content_path'],
            $payload['local_id'],
            $sortValue,
        ]);
        $pdo->prepare("DELETE FROM `{$sourceTable}` WHERE id = ?")->execute([$articleId]);
    } else {
        $stmt = $pdo->prepare("
            UPDATE `{$sourceTable}`
            SET url = ?, image_url = ?, title = ?, preview_text = ?, release_date = ?,
                developer = ?, genre = ?, content_html = ?, content_path = ?, local_id = ?
            WHERE id = ?
        ");
        $stmt->execute([
            $payload['url'],
            $payload['image_url'],
            $payload['title'],
            $payload['preview_text'],
            $payload['release_date'],
            $payload['developer'],
            $payload['genre'],
            $payload['content_html'],
            $payload['content_path'],
            $payload['local_id'],
            $articleId,
        ]);
    }

    $pdo->commit();
    syncAllSectionsToJson($pdo, $article_sections, $aggregate_json_file);
    redirectAdmin(['tab' => 'articles', 'section' => $payload['section'], 'msg' => 'Зміни збережено']);
}

if (isset($_POST['delete_article'])) {
    $sectionKey = validSectionKey($article_sections, $_POST['delete_section'] ?? '');
    $table = sectionTable($article_sections, $sectionKey);
    $stmt = $pdo->prepare("DELETE FROM `{$table}` WHERE id = ?");
    $stmt->execute([(int)($_POST['delete_id'] ?? 0)]);
    syncAllSectionsToJson($pdo, $article_sections, $aggregate_json_file);
    redirectAdmin(['tab' => 'articles', 'section' => $sectionKey, 'msg' => 'Статтю видалено']);
}

if (isset($_POST['delete_comment'])) {
    $stmt = $pdo->prepare('DELETE FROM comments WHERE id = ?');
    $stmt->execute([(int)$_POST['comment_id']]);
    redirectAdmin(['tab' => 'comments', 'msg' => 'Коментар видалено']);
}

if (isset($_POST['remove_game_run'])) {
    hh_ensure_game_tables($pdo);
    $pdo->prepare("UPDATE game_runs SET status = 'removed' WHERE id = ? AND status = 'finished'")->execute([(int)hh_input($_POST, 'run_id')]);
    redirectAdmin(['tab' => 'games', 'msg' => 'Результат прибрано з таблиці лідерів']);
}

if (isset($_POST['ban_user'])) {
    $stmt = $pdo->prepare("UPDATE users SET is_banned = 1 - is_banned WHERE id = ? AND role <> 'admin'");
    $stmt->execute([(int)hh_input($_POST, 'user_id')]);
    redirectAdmin(['tab' => 'comments', 'msg' => 'Статус користувача змінено']);
}

$active_tab = hh_input($_GET, 'tab') ?: 'stats';

$game_boards = [];
if ($active_tab === 'games') {
    hh_ensure_game_tables($pdo);
    foreach (hh_games() as $game) {
        if (empty($game['leaderboard'])) continue;
        $modes = array_column((array)($game['modes'] ?? []), 'id') ?: ['default'];
        foreach ($modes as $mode) {
            $game_boards[] = ['title' => $game['title'] . ($mode === 'default' ? '' : ' · ' . hh_game_mode_label($game, $mode)), 'rows' => hh_game_board($pdo, $game, $mode, 20)];
        }
    }
}

function adminFormatMs(int $ms): string {
    $tenths = intdiv($ms + 50, 100);
    return sprintf('%02d:%02d.%d', intdiv($tenths, 600), intdiv($tenths % 600, 10), $tenths % 10);
}
$selected_section = validSectionKey($article_sections, $_GET['section'] ?? 'articles');

$section_counts = [];
foreach ($article_sections as $sectionKey => $section) {
    $table = $section['table'];
    $section_counts[$sectionKey] = (int)$pdo->query("SELECT COUNT(*) FROM `{$table}`")->fetchColumn();
}

$stats = [
    'users' => (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn(),
    'comments_today' => (int)$pdo->query('SELECT COUNT(*) FROM comments WHERE DATE(created_at) = CURDATE()')->fetchColumn(),
    'articles' => array_sum($section_counts),
];

$selected_table = sectionTable($article_sections, $selected_section);
$articles = $pdo->query("SELECT * FROM `{$selected_table}` ORDER BY sort_order ASC, id ASC")->fetchAll(PDO::FETCH_ASSOC);

$comments = $pdo->query("
    SELECT c.id as cid, c.comment_text, c.created_at, c.article_id, u.id as uid, u.username, u.is_banned
    FROM comments c JOIN users u ON c.user_id = u.id
    ORDER BY c.created_at DESC LIMIT 50
")->fetchAll(PDO::FETCH_ASSOC);

$is_editing = false;
$edit_section = $selected_section;
$edit_data = [
    'id' => '',
    'title' => '',
    'url' => '',
    'image_url' => '',
    'preview_text' => '',
    'release_date' => '',
    'developer' => '',
    'genre' => '',
    'content_html' => '',
    'content_path' => '',
    'local_id' => '',
];

if (isset($_GET['edit'])) {
    $edit_section = validSectionKey($article_sections, $_GET['edit_section'] ?? $selected_section);
    $edit_table = sectionTable($article_sections, $edit_section);
    $stmt = $pdo->prepare("SELECT * FROM `{$edit_table}` WHERE id = ?");
    $stmt->execute([(int)$_GET['edit']]);
    $found = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($found) {
        $edit_data = array_merge($edit_data, $found);
        $is_editing = true;
        $active_tab = 'articles';
        $selected_section = $edit_section;
    }
}
?>

<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8">
    <title>Адмін - Horror Hub</title>
    <link href="https://fonts.googleapis.com/css2?family=Special+Elite&family=Raleway:wght@400;700&display=swap" rel="stylesheet">
    <style>
        body { background: #040404; color: #c4c4c4; font-family: 'Raleway', sans-serif; margin: 0; padding: 0; }
        .nav-sidebar { width: 250px; background: #0a0a0a; height: 100vh; position: fixed; border-right: 1px solid #380000; padding-top: 20px; overflow-y: auto; }
        .nav-sidebar h1 { color: #c0392b; font-family: 'Special Elite'; text-align: center; font-size: 1.5rem; }
        .nav-sidebar a { display: block; padding: 15px 20px; color: #fff; text-decoration: none; border-bottom: 1px solid #1a1a1a; transition: 0.3s; }
        .nav-sidebar a:hover, .nav-sidebar a.active { background: #9e0000; }
        .main-content { margin-left: 250px; padding: 30px; }
        .card { background: #111; padding: 20px; border: 1px solid #380000; border-radius: 4px; margin-bottom: 20px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 20px; }
        .stat-box { background: #1a1a1a; padding: 20px; text-align: center; border-radius: 4px; border: 1px dashed #380000; }
        .stat-num { font-size: 3rem; color: #c0392b; font-family: 'Special Elite'; }
        .section-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 16px; }
        .section-tabs a { color: #ddd; border: 1px solid #333; background: #080808; padding: 8px 12px; text-decoration: none; border-radius: 3px; }
        .section-tabs a.active { border-color: #9e0000; background: #2a0000; color: #fff; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #222; vertical-align: top; }
        th { color: #c0392b; font-family: 'Special Elite'; }
        tr:hover { background: #1a1a1a; }
        input[type="text"], textarea, select { width: 100%; background: #000; color: #fff; border: 1px solid #333; padding: 10px; margin-top: 5px; box-sizing: border-box; }
        textarea { min-height: 80px; resize: vertical; }
        .btn { background: #9e0000; color: #fff; border: none; padding: 10px 15px; cursor: pointer; text-decoration: none; border-radius: 3px; display: inline-block; }
        .btn:hover { background: #c0392b; }
        .btn-blue { background: #2AABEE; }
        .btn-gray { background: #555; }
        .btn-backup { background: #f39c12; color: #000; }
        .btn-backup:hover { background: #e67e22; }
        .alert { background: rgba(0, 255, 0, 0.1); color: #0f0; padding: 10px; margin-bottom: 15px; border: 1px solid #0f0; }
        .note { color: #888; font-size: 0.9rem; margin: 6px 0 0; }
        .draggable-row { cursor: grab; }
        .drag-handle { cursor: grab; font-size: 1.5rem; color: #555; user-select: none; text-align: center; }
        .flex-group { display: flex; gap: 10px; }
        .flex-group > div { flex: 1; min-width: 0; }
        .inline-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
        @media (max-width: 900px) {
            .nav-sidebar { position: static; width: auto; height: auto; }
            .main-content { margin-left: 0; }
            .flex-group { flex-direction: column; }
        }
    </style>
</head>
<body>

<div class="nav-sidebar">
    <h1>Horror Hub</h1>
    <a href="?tab=stats" class="<?= $active_tab === 'stats' ? 'active' : '' ?>">Статистика</a>
    <a href="?tab=articles&section=<?= e($selected_section) ?>" class="<?= $active_tab === 'articles' ? 'active' : '' ?>">Статті та розділи</a>
    <a href="?tab=comments" class="<?= $active_tab === 'comments' ? 'active' : '' ?>">Модерація коментарів</a>
    <a href="?tab=games" class="<?= $active_tab === 'games' ? 'active' : '' ?>">Ігри й рекорди</a>
    <a href="../index.html" target="_blank" style="color:#2AABEE;margin-top:50px;">На сайт</a>
    <form method="POST"><?= csrfField() ?><button type="submit" name="logout" class="btn btn-gray">Вийти</button></form>
</div>

<div class="main-content">
    <?php if (isset($_GET['msg'])): ?>
        <div class="alert"><?= e(hh_input($_GET, 'msg')) ?></div>
    <?php endif; ?>

    <?php if ($active_tab === 'stats'): ?>
        <h2>Дашборд</h2>
        <div class="stats-grid">
            <div class="stat-box">
                <div>Користувачів</div>
                <div class="stat-num"><?= $stats['users'] ?></div>
            </div>
            <div class="stat-box">
                <div>Коментарів сьогодні</div>
                <div class="stat-num"><?= $stats['comments_today'] ?></div>
            </div>
            <div class="stat-box">
                <div>Статей у всіх розділах</div>
                <div class="stat-num"><?= $stats['articles'] ?></div>
            </div>
            <?php foreach ($article_sections as $sectionKey => $section): ?>
                <div class="stat-box">
                    <div><?= e($section['short_label']) ?></div>
                    <div class="stat-num"><?= $section_counts[$sectionKey] ?></div>
                </div>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>

    <?php if ($active_tab === 'comments'): ?>
        <h2>Останні 50 коментарів</h2>
        <div class="card">
            <table>
                <tr>
                    <th>Користувач</th>
                    <th>Коментар</th>
                    <th>Стаття</th>
                    <th>Дії</th>
                </tr>
                <?php foreach ($comments as $comment): ?>
                    <tr style="<?= $comment['is_banned'] ? 'opacity:0.5;background:#220000;' : '' ?>">
                        <td><b><?= e($comment['username']) ?></b><br><small><?= e($comment['created_at']) ?></small></td>
                        <td><?= e($comment['comment_text']) ?></td>
                        <td><small><?= e($comment['article_id']) ?></small></td>
                        <td>
                            <form method="POST" style="display:inline;">
                                <?= csrfField() ?>
                                <input type="hidden" name="comment_id" value="<?= (int)$comment['cid'] ?>">
                                <button type="submit" name="delete_comment" class="btn" onclick="return confirm('Видалити коментар?');">Видалити</button>
                            </form>
                            <form method="POST" style="display:inline;">
                                <?= csrfField() ?>
                                <input type="hidden" name="user_id" value="<?= (int)$comment['uid'] ?>">
                                <input type="hidden" name="ban_status" value="<?= (int)$comment['is_banned'] ?>">
                                <button type="submit" name="ban_user" class="btn <?= $comment['is_banned'] ? 'btn-blue' : 'btn-gray' ?>">
                                    <?= $comment['is_banned'] ? 'Розбанити' : 'Забанити' ?>
                                </button>
                            </form>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </table>
        </div>
    <?php endif; ?>

    <?php if ($active_tab === 'games'): ?>
        <h2>Таблиці лідерів Ігрової кімнати</h2>
        <p style="color:#aaa;">Прибраний результат не видаляється з бази (статус <code>removed</code>), а гравець опускається до свого наступного результату. Забанені гравці в таблиці не потрапляють.</p>
        <?php if (!$game_boards): ?>
            <div class="card">Немає ігор із таблицею лідерів у data/games.json.</div>
        <?php endif; ?>
        <?php foreach ($game_boards as $board): ?>
            <h3><?= e($board['title']) ?></h3>
            <div class="card">
                <?php if (!$board['rows']): ?>
                    <p style="color:#aaa;">Поки немає результатів.</p>
                <?php else: ?>
                <table>
                    <tr><th>#</th><th>Гравець</th><th>Час</th><th>Забіг</th><th>Дії</th></tr>
                    <?php foreach ($board['rows'] as $index => $row): ?>
                        <tr>
                            <td><?= $index + 1 ?></td>
                            <td><b><?= e($row['username']) ?></b></td>
                            <td><?= e(adminFormatMs($row['score_ms'])) ?></td>
                            <td><small>#<?= (int)$row['run_id'] ?></small></td>
                            <td>
                                <form method="POST" style="display:inline;">
                                    <?= csrfField() ?>
                                    <input type="hidden" name="run_id" value="<?= (int)$row['run_id'] ?>">
                                    <button type="submit" name="remove_game_run" class="btn" onclick="return confirm('Прибрати цей результат із таблиці?');">Прибрати результат</button>
                                </form>
                                <form method="POST" style="display:inline;">
                                    <?= csrfField() ?>
                                    <input type="hidden" name="user_id" value="<?= (int)$row['user_id'] ?>">
                                    <button type="submit" name="ban_user" class="btn btn-gray">Забанити</button>
                                </form>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </table>
                <?php endif; ?>
            </div>
        <?php endforeach; ?>
    <?php endif; ?>

    <?php if ($active_tab === 'articles'): ?>
        <h2>Статті за розділами</h2>
        <div class="section-tabs">
            <?php foreach ($article_sections as $sectionKey => $section): ?>
                <a href="?tab=articles&section=<?= e($sectionKey) ?>" class="<?= $selected_section === $sectionKey ? 'active' : '' ?>">
                    <?= e($section['short_label']) ?> (<?= $section_counts[$sectionKey] ?>)
                </a>
            <?php endforeach; ?>
        </div>

        <div class="card">
            <h2><?= $is_editing ? 'Редагування статті' : 'Додати нову статтю' ?></h2>
            <form method="POST" id="articleForm">
                <?= csrfField() ?>
                <?php if ($is_editing): ?>
                    <input type="hidden" name="edit_id" value="<?= (int)$edit_data['id'] ?>">
                    <input type="hidden" name="source_section" value="<?= e($edit_section) ?>">
                <?php endif; ?>

                <label>Розділ:</label>
                <select name="section" id="sectionSelect">
                    <?php foreach ($article_sections as $sectionKey => $section): ?>
                        <option value="<?= e($sectionKey) ?>" <?= $selected_section === $sectionKey ? 'selected' : '' ?>><?= e($section['label']) ?></option>
                    <?php endforeach; ?>
                </select>

                <div style="display:flex;gap:10px;margin-top:12px;">
                    <div style="flex:1;">
                        <label>URL Telegraph або зовнішнє посилання:</label>
                        <input type="text" name="url" id="urlInput" value="<?= e($edit_data['url']) ?>">
                        <p class="note">Для локальної статті можна залишити порожнім і заповнити поле контенту нижче.</p>
                    </div>
                    <div style="align-self:flex-end;">
                        <button type="button" class="btn btn-blue" id="autofillBtn">Автозаповнити з Telegraph</button>
                    </div>
                </div>

                <label>Назва статті:</label>
                <input type="text" name="title" id="titleInput" required value="<?= e($edit_data['title']) ?>">

                <label>URL картинки:</label>
                <input type="text" name="imageUrl" id="imageInput" value="<?= e($edit_data['image_url']) ?>" placeholder="images/placeholder.jpg">

                <label>Короткий опис:</label>
                <textarea name="previewText" id="previewInput" rows="2" required><?= e($edit_data['preview_text']) ?></textarea>

                <div class="flex-group">
                    <div>
                        <label>Дата / період:</label>
                        <input type="text" name="release_date" placeholder="Напр: 2003 або 2010-ті" value="<?= e($edit_data['release_date']) ?>">
                    </div>
                    <div>
                        <label>Автор / студія / режисер:</label>
                        <input type="text" name="developer" placeholder="Напр: Konami, Ari Aster, H. P. Lovecraft" value="<?= e($edit_data['developer']) ?>">
                    </div>
                    <div>
                        <label>Жанр / тема:</label>
                        <input type="text" name="genre" placeholder="Напр: Survival Horror, Creepypasta" value="<?= e($edit_data['genre']) ?>">
                    </div>
                </div>

                <div class="flex-group">
                    <div>
                        <label>Local ID:</label>
                        <input type="text" name="localId" id="localIdInput" value="<?= e($edit_data['local_id']) ?>" placeholder="internet_horror:classic-creepypastas">
                    </div>
                    <div>
                        <label>Шлях до HTML-фрагмента:</label>
                        <input type="text" name="contentPath" value="<?= e($edit_data['content_path']) ?>" placeholder="content/internet_horror/classic-creepypastas.html">
                    </div>
                </div>

                <label>Локальний контент HTML:</label>
                <textarea name="contentHtml" rows="8" placeholder="<p>Текст статті...</p>"><?= e($edit_data['content_html']) ?></textarea>
                <p class="note">Можна використовувати p, h3, h4, ul/ol, li, blockquote, strong, em, a, img. Якщо є Telegraph URL, це поле необов'язкове.</p>

                <?php if (!$is_editing): ?>
                    <label style="display:block;margin-top:15px;"><input type="checkbox" name="add_to_end" value="1" checked> Додати в кінець списку</label>
                <?php endif; ?>

                <div style="margin-top:20px;">
                    <?php if ($is_editing): ?>
                        <button type="submit" name="save_edit" class="btn">Зберегти зміни</button>
                        <a href="admin.php?tab=articles&section=<?= e($selected_section) ?>" class="btn btn-gray">Скасувати</a>
                    <?php else: ?>
                        <button type="submit" name="add_article" class="btn">Опублікувати</button>
                    <?php endif; ?>
                </div>
            </form>
        </div>

        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px;">
                <div>
                    <h3 style="margin:0;">Керування: <?= e($article_sections[$selected_section]['label']) ?></h3>
                    <p class="note">JSON: <?= e($article_sections[$selected_section]['json']) ?> · Таблиця: <?= e($article_sections[$selected_section]['table']) ?></p>
                </div>
                <form method="POST" action="admin.php" onsubmit="return confirm('Зберегти Telegraph-статті цього розділу локально?');">
                    <?= csrfField() ?>
                    <input type="hidden" name="backup_section" value="<?= e($selected_section) ?>">
                    <button type="submit" name="backup_articles" class="btn btn-backup">Бекап HTML розділу</button>
                </form>
            </div>

            <table>
                <thead>
                    <tr>
                        <th width="40"></th>
                        <th width="80">Img</th>
                        <th>Інфо</th>
                        <th width="210">Дії</th>
                    </tr>
                </thead>
                <tbody id="sortable-tbody" data-section="<?= e($selected_section) ?>">
                    <?php foreach ($articles as $article): ?>
                        <tr draggable="true" data-id="<?= (int)$article['id'] ?>" class="draggable-row">
                            <td class="drag-handle">☰</td>
                            <td><img src="<?= e($article['image_url'] ?: '../images/placeholder.jpg') ?>" style="width:60px;height:40px;object-fit:cover;" alt=""></td>
                            <td>
                                <b><?= e($article['title']) ?></b><br>
                                <small style="color:#888;"><?= e($article['genre']) ?> | <?= e($article['release_date']) ?></small><br>
                                <small style="color:#666;"><?= e($article['local_id'] ?: $article['url']) ?></small>
                            </td>
                            <td>
                                <div class="inline-actions">
                                    <a href="?tab=articles&section=<?= e($selected_section) ?>&edit_section=<?= e($selected_section) ?>&edit=<?= (int)$article['id'] ?>" class="btn btn-blue" style="padding:5px;">Редаг.</a>
                                    <form method="POST" style="display:inline;" onsubmit="return confirm('Видалити статтю?');">
                                        <?= csrfField() ?>
                                        <input type="hidden" name="delete_id" value="<?= (int)$article['id'] ?>">
                                        <input type="hidden" name="delete_section" value="<?= e($selected_section) ?>">
                                        <button type="submit" name="delete_article" class="btn" style="padding:5px;">Видалити</button>
                                    </form>
                                </div>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    <?php endif; ?>
</div>

<script>
const autofillBtn = document.getElementById('autofillBtn');
if (autofillBtn) {
    autofillBtn.addEventListener('click', async function() {
        const urlInput = document.getElementById('urlInput').value.trim();
        if (!urlInput) {
            alert('Вставте посилання Telegraph.');
            return;
        }

        try {
            const parsedUrl = new URL(urlInput);
            if (!['telegra.ph', 'www.telegra.ph'].includes(parsedUrl.hostname) || !['http:', 'https:'].includes(parsedUrl.protocol)) {
                alert('Автозаповнення працює тільки з Telegraph.');
                return;
            }

            const path = parsedUrl.pathname.substring(1);
            this.textContent = 'Завантаження...';
            this.disabled = true;

            const res = await fetch(`https://api.telegra.ph/getPage/${path}?return_content=true`);
            const data = await res.json();
            if (!data.ok) throw new Error('Не знайдено.');

            document.getElementById('titleInput').value = data.result.title || '';
            let firstImg = '';
            let firstP = '';

            function parseNode(node) {
                if (typeof node === 'string') return node;
                let text = '';
                if (node.tag === 'img' && !firstImg && node.attrs?.src) {
                    firstImg = node.attrs.src.startsWith('/') ? 'https://telegra.ph' + node.attrs.src : node.attrs.src;
                }
                if (node.children) node.children.forEach(c => text += parseNode(c));
                return text;
            }

            for (const node of data.result.content || []) {
                if ((node.tag === 'p' || node.tag === 'aside') && !firstP) {
                    const text = parseNode(node).trim();
                    if (text.length > 10) firstP = text;
                } else {
                    parseNode(node);
                }
                if (firstImg && firstP) break;
            }

            document.getElementById('imageInput').value = firstImg || 'images/placeholder.jpg';
            document.getElementById('previewInput').value = firstP ? (firstP.length > 250 ? firstP.substring(0, 250) + '...' : firstP) : '';
            this.textContent = 'Готово';
            setTimeout(() => { this.textContent = 'Автозаповнити з Telegraph'; this.disabled = false; }, 1500);
        } catch (error) {
            alert('Помилка парсингу Telegraph.');
            this.textContent = 'Автозаповнити з Telegraph';
            this.disabled = false;
        }
    });
}

const tbody = document.getElementById('sortable-tbody');
if (tbody) {
    let draggedRow = null;
    let originalRows = [];
    let saving = false;
    tbody.addEventListener('dragstart', (event) => {
        if (saving) { event.preventDefault(); return; }
        draggedRow = event.target.closest('tr');
        if (!draggedRow) return;
        originalRows = Array.from(tbody.children);
        event.dataTransfer.effectAllowed = 'move';
        draggedRow.style.opacity = '0.5';
    });

    tbody.addEventListener('dragover', (event) => {
        event.preventDefault();
        const targetRow = event.target.closest('tr.draggable-row');
        if (draggedRow && targetRow && targetRow !== draggedRow) {
            const rect = targetRow.getBoundingClientRect();
            (event.clientY - rect.top > rect.height / 2) ? targetRow.after(draggedRow) : targetRow.before(draggedRow);
        }
    });

    tbody.addEventListener('dragend', async () => {
        if (!draggedRow) return;
        draggedRow.style.opacity = '1';
        const rows = Array.from(tbody.querySelectorAll('tr.draggable-row'));
        const formData = new FormData();
        formData.append('action', 'reorder');
        formData.append('section', tbody.dataset.section || 'articles');
        formData.append('new_order', JSON.stringify(rows.map(row => row.dataset.id)));
        saving = true;
        try {
            const response = await fetch('admin.php', {
                method: 'POST', body: formData,
                headers: { 'X-CSRF-Token': <?= json_encode(hh_csrf_token()) ?> }
            });
            const data = await response.json();
            if (!response.ok || data.status !== 'success') throw new Error(data.message || 'Не вдалося зберегти порядок.');
        } catch (error) {
            tbody.replaceChildren(...originalRows);
            alert(error.message);
        } finally {
            saving = false;
        }
        draggedRow = null;
    });
}
</script>

</body>
</html>
