<?php
/*
 * Game room API (js/game-room/core.js):
 *   GET  ?action=top&game=maze&mode=normal      top-10 and the caller's rank
 *   POST action=start   game, mode               one-time run token (logged-in players)
 *   POST action=finish  token, score_ms          checks the run against server time
 *   GET  ?action=progress&game=quest-cinema      saved progress (found endings)
 *   POST action=progress game, endings (JSON)     merges new endings
 */
require_once __DIR__ . '/includes/bootstrap.php';
require_once __DIR__ . '/includes/games.php';

const HH_RUN_TTL_MS = 30 * 60 * 1000;
const HH_RUN_SLACK_MS = 2000;

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$source = $method === 'POST' ? $_POST : $_GET;
$action = hh_input($source, 'action');
$routes = ['top' => 'GET', 'start' => 'POST', 'finish' => 'POST', 'progress' => $method === 'POST' ? 'POST' : 'GET'];
if (!isset($routes[$action])) hh_json(['status' => 'error', 'message' => 'Невідома дія.'], 400);
hh_method($routes[$action]);
if ($method === 'POST') hh_check_csrf();

$pdo = hh_db();
hh_ensure_game_tables($pdo);
$now = (int)floor(microtime(true) * 1000);

if ($action === 'finish') {
    $user = hh_require_player();
    hh_rate_limit('game-finish', 60, 600);
    $token = hh_input($_POST, 'token');
    $score = hh_input($_POST, 'score_ms');
    if (!preg_match('/^[a-f0-9]{64}$/', $token) || !ctype_digit($score) || strlen($score) > 9) {
        hh_json(['status' => 'error', 'message' => 'Некоректний результат.'], 422);
    }
    $score = (int)$score;
    $pdo->beginTransaction();
    $stmt = $pdo->prepare("SELECT id, game_id, mode, started_ms FROM game_runs WHERE token_hash = ? AND user_id = ? AND status = 'started' FOR UPDATE");
    $stmt->execute([hash('sha256', $token), $user['id']]);
    $run = $stmt->fetch();
    $game = $run ? hh_game((string)$run['game_id']) : null;
    if (!$run || !$game || empty($game['leaderboard'])) {
        $pdo->rollBack();
        hh_json(['status' => 'error', 'message' => 'Забіг не знайдено або його вже зараховано.'], 409);
    }
    $elapsed = $now - (int)$run['started_ms'];
    $rules = $game['leaderboard'];
    $valid = $elapsed <= HH_RUN_TTL_MS
        && $score >= (int)($rules['minMs'] ?? 0)
        && $score <= (int)($rules['maxMs'] ?? HH_RUN_TTL_MS)
        && $score <= $elapsed + HH_RUN_SLACK_MS;
    $pdo->prepare('UPDATE game_runs SET status = ?, finished_ms = ?, score_ms = ? WHERE id = ?')
        ->execute([$valid ? 'finished' : 'rejected', $now, $score, $run['id']]);
    $pdo->commit();
    if (!$valid) hh_json(['status' => 'error', 'message' => 'Результат не зараховано: він не збігається з часом гри.'], 422);
    $rank = hh_game_player_rank($pdo, $game, (string)$run['mode'], (int)$user['id']);
    hh_json(['status' => 'success', 'score_ms' => $score, 'best_ms' => $rank['score_ms'] ?? $score,
        'rank' => $rank['rank'] ?? null, 'record' => ($rank['score_ms'] ?? null) === $score]);
}

$game = hh_game(hh_input($source, 'game'));
if (!$game) hh_json(['status' => 'error', 'message' => 'Невідома гра.'], 404);

if ($action === 'top') {
    if (empty($game['leaderboard'])) hh_json(['status' => 'error', 'message' => 'У цієї гри немає таблиці лідерів.'], 404);
    $mode = hh_game_mode($game, hh_input($_GET, 'mode'));
    if ($mode === null) hh_json(['status' => 'error', 'message' => 'Невідомий режим.'], 422);
    $user = hh_current_user();
    $entries = [];
    foreach (hh_game_board($pdo, $game, $mode) as $index => $row) {
        $entries[] = ['rank' => $index + 1, 'username' => $row['username'], 'avatar' => $row['avatar'] ?: 'images/default_avatar.png',
            'score_ms' => $row['score_ms'], 'me' => $user !== null && $row['user_id'] === (int)$user['id']];
    }
    hh_json(['status' => 'success', 'game' => $game['id'], 'mode' => $mode, 'entries' => $entries,
        'me' => $user ? hh_game_player_rank($pdo, $game, $mode, (int)$user['id']) : null, 'logged_in' => $user !== null]);
}

if ($action === 'start') {
    $user = hh_require_player();
    if (empty($game['leaderboard'])) hh_json(['status' => 'error', 'message' => 'У цієї гри немає таблиці лідерів.'], 404);
    $mode = hh_game_mode($game, hh_input($_POST, 'mode'));
    if ($mode === null) hh_json(['status' => 'error', 'message' => 'Невідомий режим.'], 422);
    hh_rate_limit('game-start', 30, 600);
    // Unfinished runs older than a day are only noise.
    $pdo->prepare("DELETE FROM game_runs WHERE status = 'started' AND started_ms < ?")->execute([$now - 86400000]);
    $token = bin2hex(random_bytes(32));
    $pdo->prepare('INSERT INTO game_runs (user_id, game_id, mode, token_hash, started_ms) VALUES (?, ?, ?, ?, ?)')
        ->execute([$user['id'], $game['id'], $mode, hash('sha256', $token), $now]);
    hh_json(['status' => 'success', 'token' => $token]);
}

// progress
$user = hh_require_player();
if (($game['progress']['type'] ?? '') !== 'endings') hh_json(['status' => 'error', 'message' => 'Гра не зберігає прогрес.'], 404);
$allowed = hh_quest_endings($game);
$stmt = $pdo->prepare('SELECT data FROM game_progress WHERE user_id = ? AND game_id = ?');
$stmt->execute([$user['id'], $game['id']]);
$saved = json_decode((string)$stmt->fetchColumn(), true);
$endings = array_values(array_intersect($allowed, (array)($saved['endings'] ?? [])));
if ($method === 'POST') {
    hh_rate_limit('game-progress', 60, 600);
    $sent = json_decode(hh_input($_POST, 'endings'), true);
    if (!is_array($sent) || count($sent) > 100 || array_filter($sent, static fn($id) => !is_string($id) || !in_array($id, $allowed, true))) {
        hh_json(['status' => 'error', 'message' => 'Невідомий фінал.'], 422);
    }
    $endings = array_values(array_intersect($allowed, array_unique(array_merge($endings, $sent))));
    $pdo->prepare('INSERT INTO game_progress (user_id, game_id, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)')
        ->execute([$user['id'], $game['id'], json_encode(['endings' => $endings], JSON_THROW_ON_ERROR)]);
}
hh_json(['status' => 'success', 'endings' => $endings, 'total' => count($allowed)]);

function hh_require_player(): array {
    $user = hh_current_user();
    if (!$user) hh_json(['status' => 'error', 'message' => 'Увійдіть, щоб зберігати результати.'], 401);
    return $user;
}
