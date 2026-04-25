<?php
// db.php
$host = 'localhost';
$dbname = 'horror_hub';
$username = 'root'; // Зміни на свої дані хостингу
$password = '';     // Зміни на свій пароль БД

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    // Стартуємо сесію для всього сайту
    if (session_status() == PHP_SESSION_NONE) {
        session_set_cookie_params([
            'httponly' => true,
            'samesite' => 'Lax',
            'secure' => !empty($_SERVER['HTTPS'])
        ]);
        session_start();
    }
} catch(PDOException $e) {
    error_log("DB connection error: " . $e->getMessage());
    die("Помилка підключення до бази даних.");
}
?>
