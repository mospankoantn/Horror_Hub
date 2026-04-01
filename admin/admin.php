<?php
session_start();

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
// ФУНКЦІЇ ДЛЯ РОБОТИ З JSON
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

$articles = getArticles($json_file);

// ==========================================
// ОБРОБКА ФОРМ (Додавання / Редагування / Видалення)
// ==========================================

// ДОДАВАННЯ
if (isset($_POST['add_article'])) {
    $new_article = [
        "url" => trim($_POST['url']),
        "imageUrl" => trim($_POST['imageUrl']),
        "title" => trim($_POST['title']),
        "previewText" => trim($_POST['previewText'])
    ];
    array_unshift($articles, $new_article);
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
        
        .form-panel { background: #111; padding: 2rem; border: 1px solid #380000; border-radius: 4px; box-shadow: 0 0 15px rgba(0,0,0,0.8); margin-bottom: 30px; }
        .form-panel h2 { color: #fff; margin-top: 0; }
        label { display: block; margin-top: 15px; font-weight: bold; color: #888; }
        input[type="text"], textarea { width: 100%; background: #000; color: #fff; border: 1px solid #333; padding: 10px; margin-top: 5px; box-sizing: border-box; font-family: 'Raleway', sans-serif; }
        input:focus, textarea:focus { outline: none; border-color: #c0392b; }
        .help-text { font-size: 0.8rem; color: #666; margin-top: 3px; }
        
        /* Блок для URL + Кнопка автозаповнення */
        .input-group { display: flex; gap: 10px; align-items: center; margin-top: 5px; }
        .input-group input { margin-top: 0; flex: 1; }
        .btn-autofill { background: #2AABEE; color: #fff; padding: 10px 15px; white-space: nowrap; transition: 0.3s; }
        .btn-autofill:hover { background: #1c88c7; }
        .btn-autofill:disabled { background: #555; cursor: not-allowed; }

        .btn-submit { background: #9e0000; color: #fff; margin-top: 20px; padding: 12px 25px; text-transform: uppercase; width: 200px; font-size: 1rem; }
        .btn-submit:hover { background: #c0392b; }
        .btn-cancel { background: #555; color: #fff; margin-top: 20px; padding: 12px 25px; margin-left: 10px; }
        .btn-cancel:hover { background: #777; }

        .table-panel { background: #111; padding: 1rem; border: 1px solid #380000; border-radius: 4px; overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #222; }
        th { background: #0a0a0a; color: #c0392b; font-family: 'Special Elite', cursive; letter-spacing: 1px; }
        tr:hover { background: #1a1a1a; }
        
        .thumb { width: 80px; height: 50px; object-fit: cover; border: 1px solid #333; border-radius: 3px; }
        .article-title { color: #fff; font-weight: bold; font-size: 1.1rem; margin-bottom: 5px; }
        .article-desc { color: #888; font-size: 0.85rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        
        .actions { display: flex; gap: 10px; }
        .btn-edit { background: #2AABEE; color: #fff; font-size: 0.8rem; }
        .btn-edit:hover { background: #1c88c7; }
        .btn-delete { background: #9e0000; color: #fff; font-size: 0.8rem; }
        .btn-delete:hover { background: #c0392b; }
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

            <?php if($is_editing): ?>
                <button type="submit" name="save_edit" class="btn btn-submit">Зберегти зміни</button>
                <a href="admin.php" class="btn btn-cancel">Скасувати</a>
            <?php else: ?>
                <button type="submit" name="add_article" class="btn btn-submit">Опублікувати</button>
            <?php endif; ?>
        </form>
    </div>

    <!-- ТАБЛИЦЯ -->
    <div class="table-panel">
        <h2>Керування статтями (Всього: <?= count($articles) ?>)</h2>
        <table>
            <thead>
                <tr>
                    <th width="100">Зображення</th>
                    <th>Інформація про статтю</th>
                    <th width="180">Дії</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($articles)): ?>
                    <tr><td colspan="3" style="text-align:center;">Статей поки немає.</td></tr>
                <?php else: ?>
                    <?php foreach($articles as $index => $article): ?>
                        <tr>
                            <td>
                                <img src="<?= htmlspecialchars($article['imageUrl']) ?>" class="thumb" alt="preview">
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

<!-- МАГІЯ АВТОЗАПОВНЕННЯ (JavaScript) -->
<script>
document.getElementById('autofillBtn').addEventListener('click', async function() {
    const urlInput = document.getElementById('urlInput').value.trim();
    if (!urlInput) {
        alert("Будь ласка, вставте посилання на Telegraph у поле URL!");
        return;
    }

    try {
        const urlObj = new URL(urlInput);
        const path = urlObj.pathname.substring(1); // Отримуємо 'Moya-stattya-11-04'

        // Змінюємо стан кнопки
        const btn = this;
        const originalText = btn.innerHTML;
        btn.innerHTML = '⏳ Шукаю...';
        btn.disabled = true;

        // Звертаємось до API
        const response = await fetch(`https://api.telegra.ph/getPage/${path}?return_content=true`);
        const data = await response.json();

        if (!data.ok) {
            throw new Error("Не вдалося знайти статтю на Telegraph. Перевірте посилання.");
        }

        const page = data.result;

        // 1. ЗАПОВНЮЄМО ЗАГОЛОВОК
        document.getElementById('titleInput').value = page.title;

        // Змінні для пошуку
        let firstImageUrl = '';
        let firstParagraph = '';

        // Рекурсивна функція для пошуку тексту та картинок всередині вузлів Telegraph
        function parseNode(node) {
            if (typeof node === 'string') {
                return node;
            }
            
            let text = '';
            
            // Шукаємо першу картинку (зазвичай тег img)
            if (node.tag === 'img' && !firstImageUrl) {
                let src = node.attrs.src;
                if (src.startsWith('/')) {
                    src = 'https://telegra.ph' + src;
                }
                firstImageUrl = src;
            }

            if (node.children) {
                for (let child of node.children) {
                    text += parseNode(child);
                }
            }
            return text;
        }

        // 2. ПРОХОДИМОСЬ ПО КОНТЕНТУ
        for (let node of page.content) {
            // Шукаємо перший абзац (тег 'p' або 'aside'), який має текст
            if ((node.tag === 'p' || node.tag === 'aside') && !firstParagraph) {
                let pText = parseNode(node).trim();
                // Відсікаємо занадто короткі абзаци (наприклад, пусті рядки)
                if (pText.length > 10) {
                    firstParagraph = pText;
                }
            } else {
                // Якщо це не абзац, все одно парсимо, щоб знайти картинки всередині (наприклад, у тегу figure)
                parseNode(node);
            }

            // Якщо знайшли і текст, і картинку — можемо зупинити цикл, щоб не сканувати всю статтю
            if (firstImageUrl && firstParagraph) {
                break;
            }
        }

        // 3. ЗАПОВНЮЄМО ІНШІ ПОЛЯ
        if (firstImageUrl) {
            document.getElementById('imageInput').value = firstImageUrl;
        } else {
            document.getElementById('imageInput').value = '../images/article-fallback.jpg'; // Резервна картинка, якщо в статті немає
        }

        if (firstParagraph) {
            // Обрізаємо опис до 250 символів, щоб він гарно виглядав у карточці
            let shortDesc = firstParagraph.length > 250 ? firstParagraph.substring(0, 250) + '...' : firstParagraph;
            document.getElementById('previewInput').value = shortDesc;
        }

        // Повертаємо кнопку в норму
        btn.innerHTML = '✨ Успішно!';
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }, 2000);

    } catch (error) {
        alert(error.message || "Некоректне посилання. Використовуйте посилання формату https://telegra.ph/...");
        this.innerHTML = '✨ Автозаповнити';
        this.disabled = false;
    }
});
</script>

</body>
</html>