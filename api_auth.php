<?php
require 'db.php';
header('Content-Type: application/json');

$action = $_POST['action'] ?? $_GET['action'] ?? '';

if ($action == 'register') {
    $user = trim($_POST['username']);
    $email = trim($_POST['email']);
    $pass = $_POST['password'];

    if(empty($user) || empty($email) || empty($pass)) {
        echo json_encode(['status' => 'error', 'message' => 'Заповніть всі поля']); exit;
    }

    $hash = password_hash($pass, PASSWORD_DEFAULT);

    try {
        $stmt = $pdo->prepare("INSERT INTO users (username, email, password) VALUES (?, ?, ?)");
        $stmt->execute([$user, $email, $hash]);
        echo json_encode(['status' => 'success', 'message' => 'Реєстрація успішна! Тепер увійдіть.']);
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => 'Користувач або email вже існує!']);
    }
}

elseif ($action == 'login') {
    $email = trim($_POST['email']);
    $pass = $_POST['password'];

    $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user && password_verify($pass, $user['password'])) {
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['username'] = $user['username'];
        $_SESSION['role'] = $user['role'];
        $_SESSION['avatar'] = $user['avatar'];
        echo json_encode(['status' => 'success', 'message' => 'Успішний вхід']);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Невірний email або пароль']);
    }
}

elseif ($action == 'status') {
    if (isset($_SESSION['user_id'])) {
        echo json_encode([
            'logged_in' => true,
            'user' => [
                'username' => $_SESSION['username'],
                'avatar' => $_SESSION['avatar'],
                'role' => $_SESSION['role']
            ]
        ]);
    } else {
        echo json_encode(['logged_in' => false]);
    }
}

elseif ($action == 'logout') {
    session_destroy();
    echo json_encode(['status' => 'success']);
}
elseif ($action == 'update_profile') {
    // Перевіряємо, чи користувач авторизований
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['status' => 'error', 'message' => 'Ви не авторизовані!']); 
        exit;
    }

    $user_id = $_SESSION['user_id'];
    $new_avatar = trim($_POST['avatar']);
    $new_password = $_POST['new_password'];
    $response_msg = 'Зміни збережено!';

    // Оновлюємо аватарку, якщо поле не пусте
    if (!empty($new_avatar)) {
        $stmt = $pdo->prepare("UPDATE users SET avatar = ? WHERE id = ?");
        $stmt->execute([$new_avatar, $user_id]);
        $_SESSION['avatar'] = $new_avatar; // Оновлюємо в сесії, щоб одразу змінилось в меню
    }

    // Оновлюємо пароль, якщо поле не пусте
    if (!empty($new_password)) {
        $hash = password_hash($new_password, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("UPDATE users SET password = ? WHERE id = ?");
        $stmt->execute([$hash, $user_id]);
        $response_msg = 'Пароль та дані оновлено!';
    }

    echo json_encode(['status' => 'success', 'message' => $response_msg]);
}
?>