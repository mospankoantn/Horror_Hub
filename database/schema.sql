CREATE DATABASE IF NOT EXISTS horror_hub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE horror_hub;

CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(40) NOT NULL UNIQUE,
    email VARCHAR(254) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    avatar TEXT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    is_banned TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS comments (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    article_id VARCHAR(512) NOT NULL,
    comment_text TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_article_created (article_id(191), created_at),
    KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Ігрова кімната: забіги для таблиці лідерів і прогрес (знайдені фінали квестів).
-- api_games.php створює ці таблиці сам, якщо їх ще немає.
CREATE TABLE IF NOT EXISTS game_runs (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_progress (
    user_id INT UNSIGNED NOT NULL,
    game_id VARCHAR(40) NOT NULL,
    data TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, game_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
