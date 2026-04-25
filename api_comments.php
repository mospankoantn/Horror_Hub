<?php
require 'db.php';

header('Content-Type: application/json; charset=utf-8');

function respond(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function clean_string(string $value): string {
    return trim(str_replace(["\0"], '', $value));
}

function text_length(string $value): int {
    return function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
}

$action = $_POST['action'] ?? $_GET['action'] ?? '';

if ($action === 'get') {
    $articleId = clean_string((string)($_GET['article_id'] ?? ''));
    if ($articleId === '') {
        respond(['status' => 'error', 'message' => 'Не вказано статтю'], 422);
    }

    $stmt = $pdo->prepare("
        SELECT c.comment_text, c.created_at, u.username, u.avatar, u.role
        FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.article_id = ?
        ORDER BY c.created_at DESC
    ");
    $stmt->execute([$articleId]);
    respond($stmt->fetchAll(PDO::FETCH_ASSOC));
}

if ($action === 'post') {
    if (!isset($_SESSION['user_id'])) {
        respond(['status' => 'error', 'message' => 'Потрібно увійти'], 401);
    }

    $userId = $_SESSION['user_id'];
    $articleId = clean_string((string)($_POST['article_id'] ?? ''));
    $text = clean_string((string)($_POST['comment_text'] ?? ''));

    if ($articleId === '') {
        respond(['status' => 'error', 'message' => 'Не вказано статтю'], 422);
    }

    if ($text === '') {
        respond(['status' => 'error', 'message' => 'Коментар порожній'], 422);
    }

    if (text_length($text) > 2000) {
        respond(['status' => 'error', 'message' => 'Коментар занадто довгий'], 422);
    }

    $stmt = $pdo->prepare("SELECT is_banned FROM users WHERE id = ?");
    $stmt->execute([$userId]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        session_destroy();
        respond(['status' => 'error', 'message' => 'Сесію не знайдено. Увійдіть ще раз.'], 401);
    }

    if (!empty($user['is_banned'])) {
        respond(['status' => 'error', 'message' => 'Ваш акаунт заблоковано за порушення правил.'], 403);
    }

    $stmt = $pdo->prepare("INSERT INTO comments (article_id, user_id, comment_text) VALUES (?, ?, ?)");
    $stmt->execute([$articleId, $userId, $text]);

    respond(['status' => 'success']);
}

respond(['status' => 'error', 'message' => 'Невідома дія'], 400);
?>
