<?php
require_once __DIR__ . '/includes/bootstrap.php';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$source = $method === 'POST' ? $_POST : $_GET;
$action = hh_input($source, 'action');
if (!in_array($action, ['get', 'post'], true)) hh_json(['status' => 'error', 'message' => 'Невідома дія.'], 400);
hh_method($action === 'get' ? 'GET' : 'POST');
if ($action === 'post') hh_check_csrf();
$articleId = hh_input($source, 'article_id');
if ($articleId === '' || strlen($articleId) > 512 || preg_match('/[\x00-\x20?#\\\\]/', $articleId)) {
    hh_json(['status' => 'error', 'message' => 'Некоректний ідентифікатор статті.'], 422);
}
if ($action === 'get') {
    $stmt = hh_db()->prepare('SELECT c.id, c.comment_text, c.created_at, u.username, u.avatar, u.role FROM comments c JOIN users u ON u.id = c.user_id WHERE c.article_id = ? ORDER BY c.created_at DESC, c.id DESC LIMIT 100');
    $stmt->execute([$articleId]);
    hh_json($stmt->fetchAll());
}
$user = hh_current_user();
if (!$user) hh_json(['status' => 'error', 'message' => 'Увійдіть, щоб залишити коментар.'], 401);
hh_rate_limit('comments', 10, 300);
$comment = hh_input($_POST, 'comment_text');
if (hh_length($comment) < 1 || hh_length($comment) > 2000) hh_json(['status' => 'error', 'message' => 'Коментар має містити від 1 до 2000 символів.'], 422);
hh_db()->prepare('INSERT INTO comments (user_id, article_id, comment_text) VALUES (?, ?, ?)')->execute([$user['id'], $articleId, $comment]);
hh_json(['status' => 'success', 'message' => 'Коментар додано.']);
