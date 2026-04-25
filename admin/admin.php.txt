<?php
session_start();
set_time_limit(300); // Збільшуємо ліміт часу для бекапу

// ==========================================
// НАЛАШТУВАННЯ
// ==========================================
$admin_password = 'admin'; // ПАРОЛЬ!
$json_file = '../articles_data.json';

// Підключення до БД
require_once '../db.php'; 

if (isset($_GET['logout'])) { session_destroy(); header("Location: admin.php"); exit; }

if (isset($_POST['login'])) {
    if ($_POST['password'] === $admin_password) {
        $_SESSION['is_admin'] = true; header("Location: admin.php"); exit;
    } else { $error_msg = "Невірний пароль!"; }
}

if (!isset($_SESSION['is_admin']) || $_SESSION['is_admin'] !== true) {
    echo '<!DOCTYPE html><html lang="uk"><head><title>Вхід</title><style>body{background:#040404;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;} form{background:#111;padding:2rem;border:1px solid #9e0000;} input,button{padding:10px;margin:5px;}</style></head><body><form method="POST"><h2>Horror Admin</h2><input type="password" name="password"><button type="submit" name="login">Вхід</button></form></body></html>';
    exit;
}

// ==========================================
// ФУНКЦІЇ (Синхронізація та Парсинг для бекапу)
// ==========================================
function syncDbToJson($pdo, $json_file) {
    $stmt = $pdo->query("SELECT url, image_url as imageUrl, title, preview_text as previewText, release_date, developer, genre FROM articles ORDER BY sort_order ASC");
    $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
    file_put_contents($json_file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

function parseTelegraphNodeToHTML($node) {
    if (is_string($node)) return htmlspecialchars($node);
    $html = "<{$node['tag']}";
    if (isset($node['attrs'])) {
        foreach ($node['attrs'] as $key => $value) {
            if ($key === 'src' && strpos($value, '/') === 0) $value = 'https://telegra.ph' . $value;
            $html .= " {$key}=\"" . htmlspecialchars($value) . "\"";
        }
    }
    $html .= ">";
    if (isset($node['children'])) {
        foreach ($node['children'] as $child) $html .= parseTelegraphNodeToHTML($child);
    }
    $html .= "</{$node['tag']}>";
    return $html;
}

// АВТО-МІГРАЦІЯ З JSON У БД (якщо БД порожня)
$countDB = $pdo->query("SELECT COUNT(*) FROM articles")->fetchColumn();
if ($countDB == 0 && file_exists($json_file)) {
    $jsonData = json_decode(file_get_contents($json_file), true);
    if (!empty($jsonData)) {
        $stmt = $pdo->prepare("INSERT INTO articles (url, image_url, title, preview_text, sort_order) VALUES (?, ?, ?, ?, ?)");
        foreach ($jsonData as $index => $item) {
            $stmt->execute([$item['url'], $item['imageUrl'], $item['title'], $item['previewText'], $index]);
        }
    }
}

// ==========================================
// AJAX: ЗМІНА ПОРЯДКУ (Drag & Drop)
// ==========================================
if (isset($_POST['action']) && $_POST['action'] === 'reorder') {
    $new_order = json_decode($_POST['new_order'], true);
    if (is_array($new_order)) {
        $stmt = $pdo->prepare("UPDATE articles SET sort_order = ? WHERE id = ?");
        foreach ($new_order as $sort_index => $id) {
            $stmt->execute([$sort_index, $id]);
        }
        syncDbToJson($pdo, $json_file);
        echo json_encode(['status' => 'success']); exit;
    }
}

// ==========================================
// БЕКАП У HTML (Збереження локально)
// ==========================================
if (isset($_POST['backup_articles'])) {
    $backup_dir = '../articles';
    if (!is_dir($backup_dir)) mkdir($backup_dir, 0777, true);

    $saved = 0; $skipped = 0; $errors = 0;
    
    // Беремо всі статті з бази
    $db_articles = $pdo->query("SELECT * FROM articles")->fetchAll(PDO::FETCH_ASSOC);

    foreach ($db_articles as $article) {
        $path = basename(parse_url($article['url'], PHP_URL_PATH));
        if (empty($path)) continue;
        $file_path = $backup_dir . '/' . $path . '.html';

        if (file_exists($file_path)) { $skipped++; continue; }

        $api_url = "https://api.telegra.ph/getPage/{$path}?return_content=true";
        $response = @file_get_contents($api_url);
        
        if ($response) {
            $data = json_decode($response, true);
            if (isset($data['ok']) && $data['ok'] === true) {
                $page = $data['result'];
                $content_html = "";
                foreach ($page['content'] as $node) $content_html .= parseTelegraphNodeToHTML($node);

                $full_html = "<!DOCTYPE html>\n<html lang='uk'>\n<head>\n<meta charset='UTF-8'>\n<meta name='viewport' content='width=device-width, initial-scale=1.0'>\n<title>" . htmlspecialchars($page['title']) . " - Локальна Копія</title>\n<link rel='stylesheet' href='../style.css'>\n<style>.single-article { background: var(--surface); border: 1px solid var(--border-red); padding: 3rem 2rem; border-radius: var(--radius); max-width: 900px; margin: 2rem auto; box-shadow: var(--shadow-card); color: #ddd; } .single-article img { max-width: 100%; border-radius: 4px; } .backup-notice { background: #9e0000; color: #fff; text-align: center; padding: 10px; font-weight: bold; }</style>\n</head>\n<body>\n<div class='backup-notice'>ЦЕ ЛОКАЛЬНА РЕЗЕРВНА КОПІЯ СТАТТІ. Оригінал: <a href='{$article['url']}' style='color: #fff; text-decoration: underline;'>Telegraph</a></div>\n<main class='single-article'>\n<h1 style='color: var(--red-bright); font-family: var(--font-headings);'>" . htmlspecialchars($page['title']) . "</h1>\n<p style='color: var(--text-muted); border-bottom: 1px solid var(--border); padding-bottom: 10px;'>Автор: " . htmlspecialchars($page['author_name'] ?? 'Невідомий') . "</p>\n<div class='article-content'>\n" . $content_html . "\n</div>\n</main>\n</body>\n</html>";

                if (file_put_contents($file_path, $full_html)) $saved++;
                else $errors++;
            } else $errors++;
        } else $errors++;
    }
    header("Location: admin.php?tab=articles&msg=Бекап завершено! Нових: $saved. Пропущено: $skipped. Помилок: $errors."); exit;
}

// ==========================================
// ОБРОБКА ФОРМ СТАТЕЙ
// ==========================================
if (isset($_POST['add_article'])) {
    $sort_val = 0;
    if (isset($_POST['add_to_end'])) {
        $sort_val = $pdo->query("SELECT MAX(sort_order) FROM articles")->fetchColumn() + 1;
    } else {
        $pdo->query("UPDATE articles SET sort_order = sort_order + 1");
    }

    $stmt = $pdo->prepare("INSERT INTO articles (url, image_url, title, preview_text, release_date, developer, genre, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([trim($_POST['url']), trim($_POST['imageUrl']), trim($_POST['title']), trim($_POST['previewText']), trim($_POST['release_date']), trim($_POST['developer']), trim($_POST['genre']), $sort_val]);
    syncDbToJson($pdo, $json_file);
    header("Location: admin.php?tab=articles&msg=Статтю додано"); exit;
}

if (isset($_POST['save_edit'])) {
    $stmt = $pdo->prepare("UPDATE articles SET url=?, image_url=?, title=?, preview_text=?, release_date=?, developer=?, genre=? WHERE id=?");
    $stmt->execute([trim($_POST['url']), trim($_POST['imageUrl']), trim($_POST['title']), trim($_POST['previewText']), trim($_POST['release_date']), trim($_POST['developer']), trim($_POST['genre']), $_POST['edit_id']]);
    syncDbToJson($pdo, $json_file);
    header("Location: admin.php?tab=articles&msg=Зміни збережено"); exit;
}

if (isset($_POST['delete_article'])) {
    $stmt = $pdo->prepare("DELETE FROM articles WHERE id=?");
    $stmt->execute([$_POST['delete_id']]);
    syncDbToJson($pdo, $json_file);
    header("Location: admin.php?tab=articles&msg=Статтю видалено"); exit;
}

// ==========================================
// ОБРОБКА МОДЕРАЦІЇ КОМЕНТАРІВ
// ==========================================
if (isset($_POST['delete_comment'])) {
    $stmt = $pdo->prepare("DELETE FROM comments WHERE id=?");
    $stmt->execute([$_POST['comment_id']]);
    header("Location: admin.php?tab=comments&msg=Коментар видалено"); exit;
}
if (isset($_POST['ban_user'])) {
    $ban_val = $_POST['ban_status'] == '1' ? 0 : 1; 
    $stmt = $pdo->prepare("UPDATE users SET is_banned=? WHERE id=?");
    $stmt->execute([$ban_val, $_POST['user_id']]);
    header("Location: admin.php?tab=comments&msg=Статус користувача змінено"); exit;
}

// ==========================================
// ЗБІР ДАНИХ ДЛЯ ВІДОБРАЖЕННЯ
// ==========================================
$active_tab = $_GET['tab'] ?? 'stats';

$stats = [
    'users' => $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn(),
    'comments_today' => $pdo->query("SELECT COUNT(*) FROM comments WHERE DATE(created_at) = CURDATE()")->fetchColumn(),
    'articles' => $pdo->query("SELECT COUNT(*) FROM articles")->fetchColumn()
];

$articles = $pdo->query("SELECT * FROM articles ORDER BY sort_order ASC")->fetchAll(PDO::FETCH_ASSOC);

$comments = $pdo->query("
    SELECT c.id as cid, c.comment_text, c.created_at, c.article_id, u.id as uid, u.username, u.is_banned 
    FROM comments c JOIN users u ON c.user_id = u.id 
    ORDER BY c.created_at DESC LIMIT 50
")->fetchAll(PDO::FETCH_ASSOC);

$is_editing = false;
$edit_data = ['id'=>'', 'title'=>'', 'url'=>'', 'imageUrl'=>'', 'previewText'=>'', 'release_date'=>'', 'developer'=>'', 'genre'=>''];
if (isset($_GET['edit'])) {
    $stmt = $pdo->prepare("SELECT * FROM articles WHERE id=?");
    $stmt->execute([$_GET['edit']]);
    $edit_data = $stmt->fetch(PDO::FETCH_ASSOC);
    if($edit_data) { $is_editing = true; $active_tab = 'articles'; }
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
        .nav-sidebar { width: 250px; background: #0a0a0a; height: 100vh; position: fixed; border-right: 1px solid #380000; padding-top: 20px;}
        .nav-sidebar h1 { color: #c0392b; font-family: 'Special Elite'; text-align: center; font-size: 1.5rem;}
        .nav-sidebar a { display: block; padding: 15px 20px; color: #fff; text-decoration: none; border-bottom: 1px solid #1a1a1a; transition: 0.3s;}
        .nav-sidebar a:hover, .nav-sidebar a.active { background: #9e0000; }
        
        .main-content { margin-left: 250px; padding: 30px; }
        .card { background: #111; padding: 20px; border: 1px solid #380000; border-radius: 4px; margin-bottom: 20px; }
        
        .stats-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
        .stat-box { background: #1a1a1a; padding: 20px; text-align: center; border-radius: 4px; border: 1px dashed #380000;}
        .stat-num { font-size: 3rem; color: #c0392b; font-family: 'Special Elite'; }
        
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #222; }
        th { color: #c0392b; font-family: 'Special Elite'; }
        tr:hover { background: #1a1a1a; }
        
        input[type="text"], textarea { width: 100%; background: #000; color: #fff; border: 1px solid #333; padding: 10px; margin-top: 5px; box-sizing: border-box; }
        .btn { background: #9e0000; color: #fff; border: none; padding: 10px 15px; cursor: pointer; text-decoration: none; border-radius: 3px; display: inline-block;}
        .btn:hover { background: #c0392b; }
        .btn-blue { background: #2AABEE; }
        .btn-gray { background: #555; }
        .btn-backup { background: #f39c12; color: #000; }
        .btn-backup:hover { background: #e67e22; }
        
        .alert { background: rgba(0, 255, 0, 0.1); color: #0f0; padding: 10px; margin-bottom: 15px; border: 1px solid #0f0; }
        
        .draggable-row { cursor: grab; }
        .drag-handle { cursor: grab; font-size: 1.5rem; color: #555; user-select: none; text-align:center;}
        .flex-group { display: flex; gap: 10px; }
        .flex-group > div { flex: 1; }
    </style>
</head>
<body>

<div class="nav-sidebar">
    <h1>Horror Hub</h1>
    <a href="?tab=stats" class="<?= $active_tab=='stats'?'active':'' ?>">📊 Статистика</a>
    <a href="?tab=articles" class="<?= $active_tab=='articles'?'active':'' ?>">📝 Статті (БД)</a>
    <a href="?tab=comments" class="<?= $active_tab=='comments'?'active':'' ?>">💬 Модерація Коментарів</a>
    <a href="../index.html" target="_blank" style="color: #2AABEE; margin-top: 50px;">На сайт ↗</a>
    <a href="?logout=1" style="color: #666;">Вийти</a>
</div>

<div class="main-content">
    
    <?php if(isset($_GET['msg'])): ?>
        <div class="alert">✅ <?= htmlspecialchars($_GET['msg']) ?></div>
    <?php endif; ?>

    <!-- Вкладка: СТАТИСТИКА -->
    <?php if($active_tab == 'stats'): ?>
        <h2>Дашборд</h2>
        <div class="stats-grid">
            <div class="stat-box">
                <div>Зареєстровано Жертв</div>
                <div class="stat-num"><?= $stats['users'] ?></div>
            </div>
            <div class="stat-box">
                <div>Коментарів сьогодні</div>
                <div class="stat-num"><?= $stats['comments_today'] ?></div>
            </div>
            <div class="stat-box">
                <div>Всього статей</div>
                <div class="stat-num"><?= $stats['articles'] ?></div>
            </div>
        </div>
    <?php endif; ?>

    <!-- Вкладка: МОДЕРАЦІЯ КОМЕНТАРІВ -->
    <?php if($active_tab == 'comments'): ?>
        <h2>Останні 50 коментарів</h2>
        <div class="card">
            <table>
                <tr>
                    <th>Користувач</th>
                    <th>Коментар</th>
                    <th>Стаття</th>
                    <th>Дії</th>
                </tr>
                <?php foreach($comments as $c): ?>
                    <tr style="<?= $c['is_banned'] ? 'opacity: 0.5; background: #220000;' : '' ?>">
                        <td><b><?= htmlspecialchars($c['username']) ?></b><br><small><?= $c['created_at'] ?></small></td>
                        <td><?= htmlspecialchars($c['comment_text']) ?></td>
                        <td><small><?= htmlspecialchars($c['article_id']) ?></small></td>
                        <td>
                            <form method="POST" style="display:inline;">
                                <input type="hidden" name="comment_id" value="<?= $c['cid'] ?>">
                                <button type="submit" name="delete_comment" class="btn" onclick="return confirm('Видалити коментар?');">✖</button>
                            </form>
                            <form method="POST" style="display:inline;">
                                <input type="hidden" name="user_id" value="<?= $c['uid'] ?>">
                                <input type="hidden" name="ban_status" value="<?= $c['is_banned'] ?>">
                                <button type="submit" name="ban_user" class="btn <?= $c['is_banned'] ? 'btn-blue' : 'btn-gray' ?>">
                                    <?= $c['is_banned'] ? 'Розбанити' : 'Забанити' ?>
                                </button>
                            </form>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </table>
        </div>
    <?php endif; ?>

    <!-- Вкладка: СТАТТІ -->
    <?php if($active_tab == 'articles'): ?>
        <div class="card">
            <h2><?= $is_editing ? 'Редагування статті' : 'Додати нову статтю' ?></h2>
            <form method="POST" id="articleForm">
                <?php if($is_editing): ?><input type="hidden" name="edit_id" value="<?= $edit_data['id'] ?>"><?php endif; ?>

                <div style="display:flex; gap:10px;">
                    <div style="flex:1;">
                        <label>URL Telegraph:</label>
                        <input type="text" name="url" id="urlInput" required value="<?= htmlspecialchars($edit_data['url']) ?>">
                    </div>
                    <div style="align-self:flex-end;">
                        <button type="button" class="btn btn-blue" id="autofillBtn">✨ Автозаповнити</button>
                    </div>
                </div>

                <label>Назва статті:</label>
                <input type="text" name="title" id="titleInput" required value="<?= htmlspecialchars($edit_data['title']) ?>">

                <label>URL картинки:</label>
                <input type="text" name="imageUrl" id="imageInput" required value="<?= htmlspecialchars($edit_data['image_url'] ?? '') ?>">

                <label>Короткий опис:</label>
                <textarea name="previewText" id="previewInput" rows="2" required><?= htmlspecialchars($edit_data['preview_text'] ?? '') ?></textarea>

                <div class="flex-group">
                    <div>
                        <label>Дата виходу гри/фільму:</label>
                        <input type="text" name="release_date" placeholder="Напр: 2003 рік" value="<?= htmlspecialchars($edit_data['release_date'] ?? '') ?>">
                    </div>
                    <div>
                        <label>Розробник/Режисер:</label>
                        <input type="text" name="developer" placeholder="Напр: Rockstar Games" value="<?= htmlspecialchars($edit_data['developer'] ?? '') ?>">
                    </div>
                    <div>
                        <label>Жанр:</label>
                        <input type="text" name="genre" placeholder="Напр: Survival Horror" value="<?= htmlspecialchars($edit_data['genre'] ?? '') ?>">
                    </div>
                </div>

                <?php if(!$is_editing): ?>
                    <label style="margin-top: 15px;"><input type="checkbox" name="add_to_end" value="1" checked> Додати в кінець списку (як найновішу)</label>
                <?php endif; ?>

                <div style="margin-top: 20px;">
                    <?php if($is_editing): ?>
                        <button type="submit" name="save_edit" class="btn">Зберегти зміни</button>
                        <a href="admin.php?tab=articles" class="btn btn-gray">Скасувати</a>
                    <?php else: ?>
                        <button type="submit" name="add_article" class="btn">Опублікувати</button>
                    <?php endif; ?>
                </div>
            </form>
        </div>

        <!-- ТАБЛИЦЯ СТАТЕЙ -->
        <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3 style="margin:0;">Керування (Drag & Drop працює)</h3>
                
                <!-- КНОПКА БЕКАПУ -->
                <form method="POST" action="admin.php" onsubmit="return confirm('Процес може зайняти хвилину. Всі нові статті будуть завантажені у папку /articles. Продовжити?');">
                    <button type="submit" name="backup_articles" class="btn btn-backup">📥 Зберегти всі статті локально (Бекап HTML)</button>
                </form>
            </div>
            
            <table>
                <thead><tr><th width="40"></th><th width="80">Img</th><th>Інфо</th><th>Дії</th></tr></thead>
                <tbody id="sortable-tbody">
                    <?php foreach($articles as $article): ?>
                        <tr draggable="true" data-id="<?= $article['id'] ?>" class="draggable-row">
                            <td class="drag-handle">☰</td>
                            <td><img src="<?= htmlspecialchars($article['image_url']) ?>" style="width:60px;height:40px;object-fit:cover;"></td>
                            <td>
                                <b><?= htmlspecialchars($article['title']) ?></b><br>
                                <small style="color:#888;"><?= htmlspecialchars($article['genre']) ?> | <?= htmlspecialchars($article['release_date']) ?></small>
                            </td>
                            <td>
                                <a href="?tab=articles&edit=<?= $article['id'] ?>" class="btn btn-blue" style="padding:5px;">Редаг.</a>
                                <form method="POST" style="display:inline;" onsubmit="return confirm('Видалити?');">
                                    <input type="hidden" name="delete_id" value="<?= $article['id'] ?>">
                                    <button type="submit" name="delete_article" class="btn" style="padding:5px;">✖</button>
                                </form>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    <?php endif; ?>

</div>

<!-- СКРИПТИ: Автозаповнення + Drag&Drop -->
<script>
const autofillBtn = document.getElementById('autofillBtn');
if (autofillBtn) {
    autofillBtn.addEventListener('click', async function() {
        const urlInput = document.getElementById('urlInput').value.trim();
        if (!urlInput) { alert("Вставте посилання!"); return; }
        try {
            const path = new URL(urlInput).pathname.substring(1); 
            this.innerHTML = '⏳...'; this.disabled = true;
            const res = await fetch(`https://api.telegra.ph/getPage/${path}?return_content=true`);
            const data = await res.json();
            if (!data.ok) throw new Error("Не знайдено.");
            
            document.getElementById('titleInput').value = data.result.title;
            let firstImg = '', firstP = '';
            
            function parseNode(node) {
                if (typeof node === 'string') return node;
                let text = '';
                if (node.tag === 'img' && !firstImg) firstImg = node.attrs.src.startsWith('/') ? 'https://telegra.ph'+node.attrs.src : node.attrs.src;
                if (node.children) node.children.forEach(c => text += parseNode(c));
                return text;
            }
            
            for (let node of data.result.content) {
                if ((node.tag === 'p' || node.tag === 'aside') && !firstP) {
                    let text = parseNode(node).trim();
                    if(text.length > 10) firstP = text;
                } else parseNode(node);
                if (firstImg && firstP) break;
            }
            
            document.getElementById('imageInput').value = firstImg || '../images/article-fallback.jpg';
            document.getElementById('previewInput').value = firstP ? (firstP.length>250 ? firstP.substring(0,250)+'...' : firstP) : '';
            
            this.innerHTML = '✨ Ок!'; setTimeout(() => { this.innerHTML = '✨ Автозаповнити'; this.disabled = false; }, 2000);
        } catch (e) { alert("Помилка парсингу."); this.innerHTML = '✨ Автозаповнити'; this.disabled = false; }
    });
}

const tbody = document.getElementById('sortable-tbody');
if (tbody) {
    let draggedRow = null;
    tbody.addEventListener('dragstart', e => { draggedRow = e.target.closest('tr'); e.dataTransfer.effectAllowed = 'move'; draggedRow.style.opacity = '0.5'; });
    tbody.addEventListener('dragover', e => {
        e.preventDefault();
        const targetRow = e.target.closest('tr.draggable-row');
        if (targetRow && targetRow !== draggedRow) {
            const rect = targetRow.getBoundingClientRect();
            (e.clientY - rect.top > rect.height/2) ? targetRow.after(draggedRow) : targetRow.before(draggedRow);
        }
    });
    tbody.addEventListener('dragend', async e => {
        draggedRow.style.opacity = '1';
        const rows = Array.from(tbody.querySelectorAll('tr.draggable-row'));
        const newOrder = rows.map(r => r.getAttribute('data-id')); 
        
        const fd = new FormData(); fd.append('action', 'reorder'); fd.append('new_order', JSON.stringify(newOrder));
        await fetch('admin.php', { method: 'POST', body: fd });
    });
}
</script>

</body>
</html>