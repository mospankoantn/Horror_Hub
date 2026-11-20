<?php
declare(strict_types=1);
/*
 * Game room helpers shared by api_games.php and the admin panel.
 * data/games.json is the single list of games, modes and leaderboard rules.
 */

/** @return array<string,array> games keyed by id */
function hh_games(): array {
    static $games = null;
    if ($games !== null) return $games;
    $manifest = json_decode((string)@file_get_contents(dirname(__DIR__) . '/data/games.json'), true);
    $games = [];
    foreach ((array)($manifest['games'] ?? []) as $game) {
        if (is_array($game) && is_string($game['id'] ?? null) && preg_match('/^[a-z0-9-]{1,40}$/', $game['id'])) {
            $games[$game['id']] = $game;
        }
    }
    return $games;
}

function hh_game(string $id): ?array {
    return hh_games()[$id] ?? null;
}

/** Mode id for the leaderboard; games without modes use "default". */
function hh_game_mode(array $game, string $mode): ?string {
    $modes = array_column((array)($game['modes'] ?? []), 'id');
    if (!$modes) return $mode === '' || $mode === 'default' ? 'default' : null;
    return in_array($mode, $modes, true) ? $mode : null;
}

function hh_game_mode_label(array $game, string $mode): string {
    foreach ((array)($game['modes'] ?? []) as $item) {
        if (($item['id'] ?? '') === $mode) return (string)($item['label'] ?? $mode);
    }
    return $mode;
}

/** Ending ids (scene ids with "ending") of a quest game, read from its data file. */
function hh_quest_endings(array $game): array {
    $path = (string)($game['data'] ?? '');
    if (!preg_match('#^data/games/[a-z0-9/_-]+\.json$#', $path)) return [];
    $quest = json_decode((string)@file_get_contents(dirname(__DIR__) . '/' . $path), true);
    $endings = [];
    foreach ((array)($quest['scenes'] ?? []) as $id => $scene) {
        if (is_array($scene) && !empty($scene['ending']) && preg_match('/^[a-z0-9_-]{1,40}$/', (string)$id)) $endings[] = (string)$id;
    }
    return $endings;
}

function hh_ensure_game_tables(PDO $pdo): void {
    static $done = false;
    if ($done) return;
    $pdo->exec("CREATE TABLE IF NOT EXISTS game_runs (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        game_id VARCHAR(40) NOT NULL,
        mode VARCHAR(20) NOT NULL,
        token_hash CHAR(64) NOT NULL,
        started_ms BIGINT UNSIGNED NOT NULL,
        finished_ms BIGINT UNSIGNED NULL,
        score_ms INT UNSIGNED NULL,
        status VARCHAR(10) NOT NULL DEFAULT 'started',
        UNIQUE KEY uniq_token (token_hash),
        KEY idx_board (game_id, mode, status, score_ms),
        KEY idx_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS game_progress (
        user_id INT UNSIGNED NOT NULL,
        game_id VARCHAR(40) NOT NULL,
        data TEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, game_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $done = true;
}

/**
 * Best result per player for one board, banned players excluded.
 * @return list<array{user_id:int, username:string, avatar:?string, score_ms:int, run_id:int}>
 */
function hh_game_board(PDO $pdo, array $game, string $mode, int $limit = 10): array {
    $desc = ($game['leaderboard']['order'] ?? 'asc') === 'desc';
    $aggregate = $desc ? 'MAX' : 'MIN';
    $order = $desc ? 'DESC' : 'ASC';
    $stmt = $pdo->prepare("
        SELECT b.user_id, u.username, u.avatar, b.best AS score_ms,
               (SELECT r2.id FROM game_runs r2 WHERE r2.user_id = b.user_id AND r2.game_id = ? AND r2.mode = ?
                AND r2.status = 'finished' AND r2.score_ms = b.best ORDER BY r2.id LIMIT 1) AS run_id
        FROM (SELECT user_id, $aggregate(score_ms) AS best FROM game_runs
              WHERE game_id = ? AND mode = ? AND status = 'finished' GROUP BY user_id) b
        JOIN users u ON u.id = b.user_id
        WHERE u.is_banned = 0
        ORDER BY b.best $order, run_id ASC
        LIMIT " . max(1, min(100, $limit)));
    $stmt->execute([$game['id'], $mode, $game['id'], $mode]);
    return array_map(static fn($row) => [
        'user_id' => (int)$row['user_id'], 'username' => (string)$row['username'], 'avatar' => $row['avatar'],
        'score_ms' => (int)$row['score_ms'], 'run_id' => (int)$row['run_id'],
    ], $stmt->fetchAll());
}

/** Player's best and rank on a board, or null without a finished run. */
function hh_game_player_rank(PDO $pdo, array $game, string $mode, int $userId): ?array {
    $desc = ($game['leaderboard']['order'] ?? 'asc') === 'desc';
    $stmt = $pdo->prepare('SELECT ' . ($desc ? 'MAX' : 'MIN') . "(score_ms) FROM game_runs WHERE user_id = ? AND game_id = ? AND mode = ? AND status = 'finished'");
    $stmt->execute([$userId, $game['id'], $mode]);
    $best = $stmt->fetchColumn();
    if ($best === null || $best === false) return null;
    $stmt = $pdo->prepare("
        SELECT COUNT(*) FROM (SELECT r.user_id, " . ($desc ? 'MAX' : 'MIN') . "(r.score_ms) AS best FROM game_runs r
            JOIN users u ON u.id = r.user_id AND u.is_banned = 0
            WHERE r.game_id = ? AND r.mode = ? AND r.status = 'finished' GROUP BY r.user_id) b
        WHERE b.best " . ($desc ? '>' : '<') . " ?");
    $stmt->execute([$game['id'], $mode, (int)$best]);
    return ['rank' => (int)$stmt->fetchColumn() + 1, 'score_ms' => (int)$best];
}
