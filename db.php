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
        session_start();
    }
} catch(PDOException $e) {
    die("Помилка підключення до бази даних: " . $e->getMessage());
}
?>