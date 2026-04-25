<?php
require 'db.php';

header('Content-Type: application/json; charset=utf-8');

function respond(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function post_string(string $key): string {
    return trim((string)($_POST[$key] ?? ''));
}

function normalize_avatar(?string $avatar): ?string {
    $avatar = trim((string)$avatar);
    if ($avatar === '') {
        return null;
    }

    if (preg_match('/^https?:\/\/[^\s]+$/i', $avatar)) {
        return $avatar;
    }

    if (preg_match('/^images\/[a-zA-Z0-9._\/-]+$/', $avatar)) {
        return $avatar;
    }

    return null;
}

function text_length(string $value): int {
    return function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
}

function session_user_payload(): array {
    return [
        'username' => $_SESSION['username'] ?? '',
        'avatar' => $_SESSION['avatar'] ?? 'images/default_avatar.png',
        'role' => $_SESSION['role'] ?? 'user'
    ];
}

$action = $_POST['action'] ?? $_GET['action'] ?? '';

if ($action === 'register') {
    $username = post_string('username');
    $email = post_string('email');
    $password = (string)($_POST['password'] ?? '');

    if ($username === '' || $email === '' || $password === '') {
        respond(['status' => 'error', 'message' => 'Заповніть всі поля'], 422);
    }

    if (text_length($username) < 3 || text_length($username) > 40) {
        respond(['status' => 'error', 'message' => 'Нікнейм має містити від 3 до 40 символів'], 422);
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        respond(['status' => 'error', 'message' => 'Введіть дійсний email'], 422);
    }

    if (strlen($password) < 6) {
        respond(['status' => 'error', 'message' => 'Пароль має містити щонайменше 6 символів'], 422);
    }

    try {
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("INSERT INTO users (username, email, password) VALUES (?, ?, ?)");
        $stmt->execute([$username, $email, $hash]);
        respond(['status' => 'success', 'message' => 'Реєстрація успішна! Тепер увійдіть.']);
    } catch (PDOException $e) {
        respond(['status' => 'error', 'message' => 'Користувач або email вже існує!'], 409);
    }
}

if ($action === 'login') {
    $email = post_string('email');
    $password = (string)($_POST['password'] ?? '');

    if ($email === '' || $password === '') {
        respond(['status' => 'error', 'message' => 'Введіть email і пароль'], 422);
    }

    $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user || !password_verify($password, $user['password'])) {
        respond(['status' => 'error', 'message' => 'Невірний email або пароль'], 401);
    }

    $_SESSION['user_id'] = $user['id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['role'] = $user['role'] ?? 'user';
    $_SESSION['avatar'] = $user['avatar'] ?: 'images/default_avatar.png';

    respond(['status' => 'success', 'message' => 'Успішний вхід']);
}

if ($action === 'status') {
    if (!isset($_SESSION['user_id'])) {
        respond(['logged_in' => false]);
    }

    respond([
        'logged_in' => true,
        'user' => session_user_payload()
    ]);
}

if ($action === 'logout') {
    session_destroy();
    respond(['status' => 'success']);
}

if ($action === 'update_profile') {
    if (!isset($_SESSION['user_id'])) {
        respond(['status' => 'error', 'message' => 'Ви не авторизовані!'], 401);
    }

    $userId = $_SESSION['user_id'];
    $newAvatar = normalize_avatar($_POST['avatar'] ?? null);
    $rawAvatar = post_string('avatar');
    $newPassword = (string)($_POST['new_password'] ?? '');
    $responseMessage = 'Зміни збережено!';

    if ($rawAvatar !== '' && $newAvatar === null) {
        respond(['status' => 'error', 'message' => 'Посилання на аватар має бути http(s) URL або шляхом images/...'], 422);
    }

    if ($newPassword !== '' && strlen($newPassword) < 6) {
        respond(['status' => 'error', 'message' => 'Новий пароль має містити щонайменше 6 символів'], 422);
    }

    if ($newAvatar !== null) {
        $stmt = $pdo->prepare("UPDATE users SET avatar = ? WHERE id = ?");
        $stmt->execute([$newAvatar, $userId]);
        $_SESSION['avatar'] = $newAvatar;
    }

    if ($newPassword !== '') {
        $hash = password_hash($newPassword, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("UPDATE users SET password = ? WHERE id = ?");
        $stmt->execute([$hash, $userId]);
        $responseMessage = $newAvatar !== null ? 'Пароль та дані оновлено!' : 'Пароль оновлено!';
    }

    respond(['status' => 'success', 'message' => $responseMessage]);
}

respond(['status' => 'error', 'message' => 'Невідома дія'], 400);
?>
