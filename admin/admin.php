<?php
session_start();
// Збільшуємо ліміт часу виконання на випадок, якщо статей дуже багато
set_time_limit(300); 

// ==========================================
// НАЛАШТУВАННЯ АДМІН-ПАНЕЛІ
// ==========================================
$admin_password = 'admin'; // ЗМІНИТИ НА СВІЙ ПАРОЛЬ!
$json_file = '../articles_data.json';

// --- Логіка виходу (Logout) ---
if (isset($_GET['logout'])) {
    session_destroy();
    header("Location: admin.php");
    exit;
}

// --- Логіка входу (Login) ---
if (isset($_POST['login'])) {
    if ($_POST['password'] === $admin_password) {
        $_SESSION['is_admin'] = true;
        header("Location: admin.php");
        exit;
    } else {
        $error_msg = "Невірний пароль!";
    }
}

// Перевірка авторизації
if (!isset($_SESSION['is_admin']) || $_SESSION['is_admin'] !== true) {
    ?>
    <!DOCTYPE html>
    <html lang="uk">
    <head>
        <meta charset="UTF-8">
        <title>Вхід в Адмін-панель</title>
        <link href="https://fonts.googleapis.com/css2?family=Special+Elite&family=Raleway:wght@400;700&display=swap" rel="stylesheet">
        <style>
            body { background: #040404; color: #c4c4c4; font-family: 'Raleway', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .login-box { background: #111; padding: 2rem; border: 1px solid #380000; border-radius: 4px; box-shadow: 0 0 20px rgba(158,0,0,0.4); text-align: center; }
            h1 { font-family: 'Special Elite', cursive; color: #c0392b; }
            input { background: #000; color: #fff; border: 1px solid #333; padding: 10px; width: 80%; margin-bottom: 1rem; }
            button { background: #9e0000; color: #fff; border: none; padding: 10px 20px; cursor: pointer; font-weight: bold; text-transform: uppercase; }
            button:hover { background: #c0392b; }
            .error { color: red; margin-bottom: 1rem; }
        </style>
    </head>
    <body>
        <div class="login-box">
            <h1>Horror Hub Admin</h1>
            <?php if(isset($error_msg)) echo "<p class='error'>$error_msg</p>"; ?>
            <form method="POST">
                <input type="password" name="password" placeholder="Введіть пароль" required autofocus><br>
                <button type="submit" name="login">Увійти</button>
            </form>
        </div>
    </body>
    </html>
    <?php
    exit;
}

// ==========================================
// ФУНКЦІЇ ДЛЯ РОБОТИ З JSON ТА ТЕЛЕГРАФОМ
// ==========================================
function getArticles($file) {
    if (!file_exists($file)) return [];
    $data = json_decode(file_get_contents($file), true);
    return is_array($data) ? $data : [];
}

function saveArticles($file, $data) {
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return file_put_contents($file, $json);
}

// Рекурсивна функція парсингу вузлів Telegraph у HTML (для бекапу)
function parseTelegraphNodeToHTML($node) {
    if (is_string($node)) {
        return htmlspecialchars($node);
    }
    
    $html = "<{$node['tag']}";
    if (isset($node['attrs'])) {
        foreach ($node['attrs'] as $key => $value) {
            if ($key === 'src' && strpos($value, '/') === 0) {
                $value = 'https://telegra.ph' . $value;
            }
            $html .= " {$key}=\"" . htmlspecialchars($value) . "\"";
        }
    }
    $html .= ">";
    
    if (isset($node['children'])) {
        foreach ($node['children'] as $child) {
            $html .= parseTelegraphNodeToHTML($child);
        }
    }
    
    $html .= "</{$node['tag']}>";
    return $html;
}

$articles = getArticles($json_file);

// ==========================================
// ОБРОБКА ФОРМ ТА AJAX
// ==========================================

// --- AJAX ОБРОБНИК: Зміна порядку перетягуванням ---
if (isset($_POST['action']) && $_POST['action'] === 'reorder') {
    header('Content-Type: application/json');
    $new_order = json_decode($_POST['new_order'], true);
    
    if (is_array($new_order)) {
        $reordered_articles = [];
        foreach ($new_order as $old_index) {
            if (isset($articles[$old_index])) {
                $reordered_articles[] = $articles[$old_index];
            }
        }
        saveArticles($json_file, $reordered_articles);
        echo json_encode(['status' => 'success']);
        exit;
    }
    echo json_encode(['status' => 'error']);
    exit;
}

// --- СТВОРЕННЯ БЕКАПУ СТАТЕЙ ---
if (isset($_POST['backup_articles'])) {
    $backup_dir = '../articles';
    // Створюємо папку, якщо її немає
    if (!is_dir($backup_dir)) {
        mkdir($backup_dir, 0777, true);
    }

    $saved = 0;
    $skipped = 0;
    $errors = 0;

    foreach ($articles as $article) {
        $path = basename(parse_url($article['url'], PHP_URL_PATH));
        if (empty($path)) continue;

        $file_path = $backup_dir . '/' . $path . '.html';

        // Якщо файл вже існує — пропускаємо
        if (file_exists($file_path)) {
            $skipped++;
            continue;
        }

        // Завантажуємо контент з Telegraph
        $api_url = "https://api.telegra.ph/getPage/{$path}?return_content=true";
        $response = @file_get_contents($api_url);
        
        if ($response) {
            $data = json_decode($response, true);
            if (isset($data['ok']) && $data['ok'] === true) {
                $page = $data['result'];
                
                $content_html = "";
                foreach ($page['content'] as $node) {
                    $content_html .= parseTelegraphNodeToHTML($node);
                }

                // Шаблон локальної HTML сторінки
                $full_html = "<!DOCTYPE html>\n<html lang='uk'>\n<head>\n";
                $full_html .= "<meta charset='UTF-8'>\n<meta name='viewport' content='width=device-width, initial-scale=1.0'>\n";
                $full_html .= "<title>" . htmlspecialchars($page['title']) . " - Локальна Копія</title>\n";
                $full_html .= "<link rel='stylesheet' href='../style.css'>\n"; // Підключаємо основний стиль сайту
                $full_html .= "<style>.single-article { background: var(--surface); border: 1px solid var(--border-red); padding: 3rem 2rem; border-radius: var(--radius); max-width: 900px; margin: 2rem auto; box-shadow: var(--shadow-card); color: #ddd; } .single-article img { max-width: 100%; border-radius: 4px; } .backup-notice { background: #9e0000; color: #fff; text-align: center; padding: 10px; font-weight: bold; }</style>\n";
                $full_html .= "</head>\n<body>\n";
                $full_html .= "<div class='backup-notice'>ЦЕ ЛОКАЛЬНА РЕЗЕРВНА КОПІЯ СТАТТІ. Оригінал: <a href='{$article['url']}' style='color: #fff; text-decoration: underline;'>Telegraph</a></div>\n";
                $full_html .= "<main class='single-article'>\n";
                $full_html .= "<h1 style='color: var(--red-bright); font-family: var(--font-headings);'>" . htmlspecialchars($page['title']) . "</h1>\n";
                $full_html .= "<p style='color: var(--text-muted); border-bottom: 1px solid var(--border); padding-bottom: 10px;'>Автор: " . htmlspecialchars($page['author_name'] ?? 'Невідомий') . "</p>\n";
                $full_html .= "<div class='article-content'>\n" . $content_html . "\n</div>\n";
                $full_html .= "</main>\n</body>\n</html>";

                if (file_put_contents($file_path, $full_html)) {
                    $saved++;
                } else {
                    $errors++;
                }
            } else {
                $errors++;
            }
        } else {
            $errors++;
        }
    }

    $backup_status = "Бекап завершено! Збережено нових статей: <b>$saved</b>. Пропущено (вже існують): <b>$skipped</b>. Помилок: <b>$errors</b>.";
    header("Location: admin.php?backup_status=" . urlencode($backup_status));
    exit;
}

// ДОДАВАННЯ
if (isset($_POST['add_article'])) {
    $new_article = [
        "url" => trim($_POST['url']),
        "imageUrl" => trim($_POST['imageUrl']),
        "title" => trim($_POST['title']),
        "previewText" => trim($_POST['previewText'])
    ];
    
    // Перевіряємо галочку "Додати в кінець"
    if (isset($_POST['add_to_end'])) {
        $articles[] = $new_article; 
    } else {
        array_unshift($articles, $new_article); 
    }
    
    saveArticles($json_file, $articles);
    header("Location: admin.php?status=added");
    exit;
}

// РЕДАГУВАННЯ (Збереження)
if (isset($_POST['save_edit'])) {
    $id = (int)$_POST['edit_id'];
    if (isset($articles[$id])) {
        $articles[$id] = [
            "url" => trim($_POST['url']),
            "imageUrl" => trim($_POST['imageUrl']),
            "title" => trim($_POST['title']),
            "previewText" => trim($_POST['previewText'])
        ];
        saveArticles($json_file, $articles);
        header("Location: admin.php?status=edited");
        exit;
    }
}

// ВИДАЛЕННЯ
if (isset($_POST['delete_article'])) {
    $id = (int)$_POST['delete_id'];
    if (isset($articles[$id])) {
        array_splice($articles, $id, 1);
        saveArticles($json_file, $articles);
        header("Location: admin.php?status=deleted");
        exit;
    }
}

// ПІДГОТОВКА ДАНИХ ДЛЯ РЕДАГУВАННЯ
$is_editing = false;
$edit_data = ['title' => '', 'url' => '', 'imageUrl' => '', 'previewText' => ''];
$edit_id = -1;

if (isset($_GET['edit'])) {
    $edit_id = (int)$_GET['edit'];
    if (isset($articles[$edit_id])) {
        $is_editing = true;
        $edit_data = $articles[$edit_id];
    }
}
?>

<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8">
    <title>Адмін-панель - Horror Hub</title>
    <link href="https://fonts.googleapis.com/css2?family=Special+Elite&family=Raleway:wght@400;700&display=swap" rel="stylesheet">
    <style>
        body { background: #040404; color: #c4c4c4; font-family: 'Raleway', sans-serif; margin: 0; padding: 2rem; }
        .admin-container { max-width: 1200px; margin: 0 auto; }
        
        .header-bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #380000; padding-bottom: 10px; margin-bottom: 20px; }
        h1 { font-family: 'Special Elite', cursive; color: #c0392b; margin: 0; }
        .btn { padding: 8px 15px; text-decoration: none; border-radius: 4px; font-weight: bold; cursor: pointer; border: none; font-family: 'Raleway', sans-serif; }
        .btn-logout { background: #333; color: #fff; }
        .btn-logout:hover { background: #555; }
        
        .alert { padding: 15px; margin-bottom: 20px; border-radius: 4px; font-weight: bold; }
        .alert-success { background: rgba(0, 128, 0, 0.2); color: #0f0; border: 1px solid #0f0; }
        .alert-info { background: rgba(42, 171, 238, 0.2); color: #2AABEE; border: 1px solid #2AABEE; }
        
        .form-panel { background: #111; padding: 2rem; border: 1px solid #380000; border-radius: 4px; box-shadow: 0 0 15px rgba(0,0,0,0.8); margin-bottom: 30px; }
        .form-panel h2 { color: #fff; margin-top: 0; }
        label { display: block; margin-top: 15px; font-weight: bold; color: #888; }
        input[type="text"], textarea { width: 100%; background: #000; color: #fff; border: 1px solid #333; padding: 10px; margin-top: 5px; box-sizing: border-box; font-family: 'Raleway', sans-serif; }
        input:focus, textarea:focus { outline: none; border-color: #c0392b; }
        .help-text { font-size: 0.8rem; color: #666; margin-top: 3px; }
        
        .input-group { display: flex; gap: 10px; align-items: center; margin-top: 5px; }
        .input-group input { margin-top: 0; flex: 1; }
        .btn-autofill { background: #2AABEE; color: #fff; padding: 10px 15px; white-space: nowrap; transition: 0.3s; }
        .btn-autofill:hover { background: #1c88c7; }
        .btn-autofill:disabled { background: #555; cursor: not-allowed; }

        .btn-submit { background: #9e0000; color: #fff; margin-top: 20px; padding: 12px 25px; text-transform: uppercase; font-size: 1rem; }
        .btn-submit:hover { background: #c0392b; }
        .btn-cancel { background: #555; color: #fff; margin-top: 20px; padding: 12px 25px; margin-left: 10px; }
        .btn-cancel:hover { background: #777; }
        .btn-backup { background: #f39c12; color: #000; margin-bottom: 15px; display: inline-block; padding: 10px 20px; }
        .btn-backup:hover { background: #e67e22; }

        .table-panel { background: #111; padding: 1rem; border: 1px solid #380000; border-radius: 4px; overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #222; }
        th { background: #0a0a0a; color: #c0392b; font-family: 'Special Elite', cursive; letter-spacing: 1px; }
        
        .draggable-row { transition: background 0.2s; }
        .draggable-row:hover { background: #1a1a1a; }
        .draggable-row.dragging { opacity: 0.5; background: #222; }
        .drag-handle { cursor: grab; font-size: 1.5rem; color: #555; text-align: center; width: 40px; user-select: none;}
        .drag-handle:hover { color: #fff; }
        .drag-handle:active { cursor: grabbing; }
        
        .thumb { width: 80px; height: 50px; object-fit: cover; border: 1px solid #333; border-radius: 3px; }
        .article-title { color: #fff; font-weight: bold; font-size: 1.1rem; margin-bottom: 5px; }
        .article-desc { color: #888; font-size: 0.85rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        
        .actions { display: flex; gap: 10px; }
        .btn-edit { background: #2AABEE; color: #fff; font-size: 0.8rem; }
        .btn-edit:hover { background: #1c88c7; }
        .btn-delete { background: #9e0000; color: #fff; font-size: 0.8rem; }
        .btn-delete:hover { background: #c0392b; }

        #toast { visibility: hidden; min-width: 250px; background-color: #2AABEE; color: #fff; text-align: center; border-radius: 4px; padding: 16px; position: fixed; z-index: 1000; right: 30px; bottom: 30px; font-weight: bold; opacity: 0; transition: opacity 0.5s, bottom 0.5s; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
        #toast.show { visibility: visible; opacity: 1; bottom: 50px; }
    </style>
</head>
<body>

<div class="admin-container">
    
    <div class="header-bar">
        <h1>Horror Hub Admin</h1>
        <div>
            <a href="../articles.html" target="_blank" class="btn btn-logout" style="background:#2AABEE; margin-right:10px;">На сайт</a>
            <a href="?logout=1" class="btn btn-logout">Вийти</a>
        </div>
    </div>

    <?php if(isset($_GET['status'])): ?>
        <?php if($_GET['status'] == 'added') echo '<div class="alert alert-success">Статтю успішно додано!</div>'; ?>
        <?php if($_GET['status'] == 'edited') echo '<div class="alert alert-success">Зміни успішно збережено!</div>'; ?>
        <?php if($_GET['status'] == 'deleted') echo '<div class="alert alert-success">Статтю видалено!</div>'; ?>
    <?php endif; ?>

    <?php if(isset($_GET['backup_status'])): ?>
        <div class="alert alert-info"><?= $_GET['backup_status'] ?></div>
    <?php endif; ?>

    <!-- ФОРМА -->
    <div class="form-panel">
        <h2><?= $is_editing ? 'Редагування статті' : 'Додати нову статтю' ?></h2>
        <form method="POST" action="admin.php" id="articleForm">
            
            <?php if($is_editing): ?>
                <input type="hidden" name="edit_id" value="<?= $edit_id ?>">
            <?php endif; ?>

            <label>URL статті на Telegraph:</label>
            <div class="input-group">
                <input type="text" name="url" id="urlInput" required value="<?= htmlspecialchars($edit_data['url']) ?>" placeholder="https://telegra.ph/Moya-stattya-11-04">
                <button type="button" class="btn btn-autofill" id="autofillBtn">✨ Автозаповнити</button>
            </div>
            <div class="help-text">Вставте посилання і натисніть "Автозаповнити", щоб не писати все вручну.</div>

            <label>Назва статті:</label>
            <input type="text" name="title" id="titleInput" required value="<?= htmlspecialchars($edit_data['title']) ?>" placeholder="Огляд: Найстрашніша гра...">

            <label>URL картинки (Прев'ю):</label>
            <input type="text" name="imageUrl" id="imageInput" required value="<?= htmlspecialchars($edit_data['imageUrl']) ?>" placeholder="https://site.com/image.jpg">

            <label>Короткий опис (Анонс):</label>
            <textarea name="previewText" id="previewInput" rows="3" required><?= htmlspecialchars($edit_data['previewText']) ?></textarea>

            <?php if(!$is_editing): ?>
                <div style="margin-top: 15px; background: #000; padding: 10px; border: 1px solid #333; border-radius: 4px;">
                    <label style="margin-top: 0; cursor: pointer; display: flex; align-items: center; gap: 10px; font-weight: normal; color: #fff;">
                        <input type="checkbox" name="add_to_end" value="1" checked style="width: auto; margin: 0; transform: scale(1.2);">
                        Додати в кінець списку (вважатиметься найновішою статтею на сайті)
                    </label>
                </div>
            <?php endif; ?>

            <?php if($is_editing): ?>
                <button type="submit" name="save_edit" class="btn btn-submit">Зберегти зміни</button>
                <a href="admin.php" class="btn btn-cancel">Скасувати</a>
            <?php else: ?>
                <button type="submit" name="add_article" class="btn btn-submit">Опублікувати</button>
            <?php endif; ?>
        </form>
    </div>

    <!-- ТАБЛИЦЯ З DRAG & DROP -->
    <div class="table-panel">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
            <div>
                <h2>Керування статтями (Всього: <?= count($articles) ?>)</h2>
                <p class="help-text" style="margin-bottom: 15px;">💡 Затисніть іконку <b>☰</b> зліва, щоб перетягнути статтю і змінити її порядок.</p>
            </div>
            
            <!-- КНОПКА БЕКАПУ -->
            <form method="POST" action="admin.php" onsubmit="return confirm('Процес може зайняти хвилину. Продовжити?');">
                <button type="submit" name="backup_articles" class="btn btn-backup">📥 Зберегти всі статті локально</button>
            </form>
        </div>
        
        <table>
            <thead>
                <tr>
                    <th width="40"></th>
                    <th width="100">Зображення</th>
                    <th>Інформація про статтю</th>
                    <th width="180">Дії</th>
                </tr>
            </thead>
            <tbody id="sortable-tbody">
                <?php if (empty($articles)): ?>
                    <tr><td colspan="4" style="text-align:center;">Статей поки немає.</td></tr>
                <?php else: ?>
                    <?php foreach($articles as $index => $article): ?>
                        <tr draggable="true" data-index="<?= $index ?>" class="draggable-row">
                            <td class="drag-handle" title="Потягніть, щоб змінити порядок">☰</td>
                            <td>
                                <img src="<?= htmlspecialchars($article['imageUrl']) ?>" class="thumb" alt="preview" draggable="false">
                            </td>
                            <td>
                                <div class="article-title"><?= htmlspecialchars($article['title']) ?></div>
                                <div style="margin-bottom: 5px;">
                                    <a href="<?= htmlspecialchars($article['url']) ?>" target="_blank" style="color: #2AABEE; font-size: 0.85rem;">Telegraph Link ↗</a>
                                </div>
                                <div class="article-desc"><?= htmlspecialchars($article['previewText']) ?></div>
                            </td>
                            <td>
                                <div class="actions">
                                    <a href="?edit=<?= $index ?>" class="btn btn-edit">✎ Редаг.</a>
                                    
                                    <form method="POST" action="admin.php" style="display:inline;" onsubmit="return confirm('Ви впевнені, що хочете назавжди видалити цю статтю?');">
                                        <input type="hidden" name="delete_id" value="<?= $index ?>">
                                        <button type="submit" name="delete_article" class="btn btn-delete">✖ Видал.</button>
                                    </form>
                                </div>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<div id="toast">✅ Порядок успішно збережено!</div>

<!-- МАГІЯ АВТОЗАПОВНЕННЯ ТА DRAG&DROP -->
<script>
document.getElementById('autofillBtn').addEventListener('click', async function() {
    const urlInput = document.getElementById('urlInput').value.trim();
    if (!urlInput) {
        alert("Будь ласка, вставте посилання на Telegraph у поле URL!");
        return;
    }

    try {
        const urlObj = new URL(urlInput);
        const path = urlObj.pathname.substring(1); 

        const btn = this;
        const originalText = btn.innerHTML;
        btn.innerHTML = '⏳ Шукаю...';
        btn.disabled = true;

        const response = await fetch(`https://api.telegra.ph/getPage/${path}?return_content=true`);
        const data = await response.json();

        if (!data.ok) throw new Error("Не вдалося знайти статтю на Telegraph.");

        const page = data.result;
        document.getElementById('titleInput').value = page.title;

        let firstImageUrl = '';
        let firstParagraph = '';

        function parseNode(node) {
            if (typeof node === 'string') return node;
            let text = '';
            if (node.tag === 'img' && !firstImageUrl) {
                let src = node.attrs.src;
                if (src.startsWith('/')) src = 'https://telegra.ph' + src;
                firstImageUrl = src;
            }
            if (node.children) {
                for (let child of node.children) text += parseNode(child);
            }
            return text;
        }

        for (let node of page.content) {
            if ((node.tag === 'p' || node.tag === 'aside') && !firstParagraph) {
                let pText = parseNode(node).trim();
                if (pText.length > 10) firstParagraph = pText;
            } else {
                parseNode(node);
            }
            if (firstImageUrl && firstParagraph) break;
        }

        if (firstImageUrl) {
            document.getElementById('imageInput').value = firstImageUrl;
        } else {
            document.getElementById('imageInput').value = '../images/article-fallback.jpg';
        }

        if (firstParagraph) {
            let shortDesc = firstParagraph.length > 250 ? firstParagraph.substring(0, 250) + '...' : firstParagraph;
            document.getElementById('previewInput').value = shortDesc;
        }

        btn.innerHTML = '✨ Успішно!';
        setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);

    } catch (error) {
        alert(error.message || "Некоректне посилання.");
        this.innerHTML = '✨ Автозаповнити';
        this.disabled = false;
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const tbody = document.getElementById('sortable-tbody');
    let draggedRow = null;

    tbody.addEventListener('dragstart', function(e) {
        draggedRow = e.target.closest('tr');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', draggedRow.innerHTML);
        draggedRow.classList.add('dragging');
    });

    tbody.addEventListener('dragover', function(e) {
        e.preventDefault(); 
        e.dataTransfer.dropEffect = 'move';
        const targetRow = e.target.closest('tr.draggable-row');
        
        if (targetRow && targetRow !== draggedRow) {
            const bounding = targetRow.getBoundingClientRect();
            const offset = bounding.y + (bounding.height / 2);
            if (e.clientY - offset > 0) {
                targetRow.after(draggedRow);
            } else {
                targetRow.before(draggedRow);
            }
        }
    });

    tbody.addEventListener('dragend', function(e) {
        draggedRow.classList.remove('dragging');
        saveNewOrder();
    });

    async function saveNewOrder() {
        const rows = tbody.querySelectorAll('tr.draggable-row');
        const newOrder = Array.from(rows).map(row => row.getAttribute('data-index'));
        
        const fd = new FormData();
        fd.append('action', 'reorder');
        fd.append('new_order', JSON.stringify(newOrder));

        try {
            const res = await fetch('admin.php', { method: 'POST', body: fd });
            const data = await res.json();
            
            if (data.status === 'success') {
                rows.forEach((row, i) => row.setAttribute('data-index', i));
                const toast = document.getElementById('toast');
                toast.className = "show";
                setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 3000);
            }
        } catch (err) {
            console.error(err);
            alert('Сталася помилка при збереженні порядку.');
        }
    }
});
</script>

</body>
</html>