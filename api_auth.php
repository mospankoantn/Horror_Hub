<?php
require_once __DIR__ . '/includes/bootstrap.php';

$action = hh_input(($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' ? $_POST : $_GET, 'action');
if ($action === 'status') {
    hh_method('GET');
    $user = hh_current_user();
    hh_json(['logged_in' => $user !== null, 'csrf_token' => hh_csrf_token()] + ($user ? ['user' => [
        'username' => $user['username'], 'avatar' => $user['avatar'] ?: 'images/default_avatar.png', 'role' => $user['role']
    ]] : []));
}
if (!in_array($action, ['register', 'login', 'logout', 'update_profile'], true)) {
    hh_json(['status' => 'error', 'message' => 'Невідома дія.'], 400);
}
hh_method('POST');
hh_check_csrf();
if ($action === 'logout') {
    hh_destroy_session();
    hh_json(['status' => 'success']);
}

if ($action === 'register' || $action === 'login') {
    $email = hh_input($_POST, 'email');
    $password = hh_input($_POST, 'password', false);
    if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '' || strlen($password) > 72) {
        hh_json(['status' => 'error', 'message' => 'Введіть дійсний email і пароль (до 72 байтів).'], 422);
    }
    if ($action === 'register') {
        $username = hh_input($_POST, 'username');
        if (hh_length($username) < 3 || hh_length($username) > 40 || preg_match('/[<>\x00-\x1f\x7f]/', $username)) {
            hh_json(['status' => 'error', 'message' => 'Нікнейм має містити від 3 до 40 символів.'], 422);
        }
        if (hh_length($password) < 8) hh_json(['status' => 'error', 'message' => 'Пароль має містити щонайменше 8 символів.'], 422);
        hh_rate_limit('register', 5, 900);
        try {
            $stmt = hh_db()->prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)');
            $stmt->execute([$username, $email, password_hash($password, PASSWORD_DEFAULT)]);
        } catch (PDOException $error) {
            if ($error->getCode() !== '23000') throw $error;
            hh_json(['status' => 'error', 'message' => 'Користувач або email вже існує.'], 409);
        }
        hh_json(['status' => 'success', 'message' => 'Реєстрація успішна! Тепер увійдіть.']);
    }
    hh_rate_limit('login', 15, 900);
    $stmt = hh_db()->prepare('SELECT id, password, is_banned FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();
    if (!$user || !password_verify($password, $user['password']) || !empty($user['is_banned'])) {
        hh_json(['status' => 'error', 'message' => 'Невірний email або пароль, або доступ обмежений.'], 401);
    }
    session_regenerate_id(true);
    $_SESSION = ['user_id' => $user['id'], 'csrf_token' => bin2hex(random_bytes(32))];
    hh_json(['status' => 'success', 'message' => 'Успішний вхід']);
}

$user = hh_current_user();
if (!$user) hh_json(['status' => 'error', 'message' => 'Ви не авторизовані.'], 401);
hh_rate_limit('profile', 20, 600);
$avatar = hh_input($_POST, 'avatar');
$password = hh_input($_POST, 'new_password', false);
$currentPassword = hh_input($_POST, 'current_password', false);
if ($avatar !== '' && (strlen($avatar) > 2048 || (!hh_safe_url($avatar) && !hh_local_path($avatar, 'images', ['jpg', 'jpeg', 'png', 'gif', 'webp'])))) {
    hh_json(['status' => 'error', 'message' => 'Вкажіть http(s) URL або наявне зображення у папці images.'], 422);
}
if ($password !== '' && (hh_length($password) < 8 || strlen($password) > 72)) {
    hh_json(['status' => 'error', 'message' => 'Новий пароль: від 8 символів до 72 байтів.'], 422);
}
if ($password !== '' && !password_verify($currentPassword, $user['password'])) {
    hh_json(['status' => 'error', 'message' => 'Поточний пароль невірний.'], 422);
}
$pdo = hh_db();
$pdo->beginTransaction();
try {
    if ($avatar !== '') $pdo->prepare('UPDATE users SET avatar = ? WHERE id = ?')->execute([$avatar, $user['id']]);
    if ($password !== '') $pdo->prepare('UPDATE users SET password = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
    $pdo->commit();
} catch (Throwable $error) {
    $pdo->rollBack();
    throw $error;
}
if ($password !== '') session_regenerate_id(true);
hh_json(['status' => 'success', 'message' => 'Зміни збережено!']);
