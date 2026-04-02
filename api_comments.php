<?php
require 'db.php';
header('Content-Type: application/json');

$action = $_POST['action'] ?? $_GET['action'] ?? '';

if ($action == 'get') {
    $article_id = $_GET['article_id'];
    $stmt = $pdo->prepare("
        SELECT c.comment_text, c.created_at, u.username, u.avatar, u.role 
        FROM comments c 
        JOIN users u ON c.user_id = u.id 
        WHERE c.article_id = ? 
        ORDER BY c.created_at DESC
    ");
    $stmt->execute([$article_id]);
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
}

elseif ($action == 'post') {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['status' => 'error', 'message' => 'Потрібно увійти']); exit;
    }

    $user_id = $_SESSION['user_id'];

    // ПЕРЕВІРКА НА БАН
    $stmt = $pdo->prepare("SELECT is_banned FROM users WHERE id = ?");
    $stmt->execute([$user_id]);
    $user = $stmt->fetch();
    
    if ($user['is_banned']) {
        echo json_encode(['status' => 'error', 'message' => 'Ваш акаунт заблоковано за порушення правил.']); exit;
    }

    $article_id = $_POST['article_id'];
    $text = htmlspecialchars(trim($_POST['comment_text']));

    if (empty($text)) {
        echo json_encode(['status' => 'error', 'message' => 'Коментар порожній']); exit;
    }

    $stmt = $pdo->prepare("INSERT INTO comments (article_id, user_id, comment_text) VALUES (?, ?, ?)");
    $stmt->execute([$article_id, $user_id, $text]);
    
    echo json_encode(['status' => 'success']);
}
?>