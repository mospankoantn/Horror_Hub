<?php
header('Content-Type: application/json; charset=utf-8');

function respond(array $payload): void {
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function post_value(string $key): string {
    return trim((string)($_POST[$key] ?? ''));
}

function escape_html(string $value): string {
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['status' => 'error', 'message' => 'Неприпустимий метод запиту.']);
}

if (!empty($_POST['bot-check'])) {
    respond(['status' => 'error', 'message' => 'Помилка перевірки на бота.']);
}

$name = post_value('name');
$email = post_value('email');
$message = post_value('message');

if ($name === '' || $email === '' || $message === '') {
    respond(['status' => 'error', 'message' => 'Будь ласка, заповніть всі обов\'язкові поля.']);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(['status' => 'error', 'message' => 'Будь ласка, введіть дійсну адресу email.']);
}

$telegramSent = false;
$telegramError = '';
$botToken = getenv('HORROR_HUB_TELEGRAM_BOT_TOKEN') ?: '';
$chatId = getenv('HORROR_HUB_TELEGRAM_CHAT_ID') ?: '';

if ($botToken !== '' && $chatId !== '' && function_exists('curl_init')) {
    $telegramMessage = "Нове повідомлення з Horror Hub!\n\n";
    $telegramMessage .= "Ім'я: " . escape_html($name) . "\n";
    $telegramMessage .= "Email: " . escape_html($email) . "\n";
    $telegramMessage .= "Повідомлення:\n" . escape_html($message);

    $payload = [
        'chat_id' => $chatId,
        'text' => $telegramMessage,
        'parse_mode' => 'HTML'
    ];

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, "https://api.telegram.org/bot{$botToken}/sendMessage");
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($payload));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 8);

    $serverOutput = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    $telegramSent = $httpCode === 200;
    if (!$telegramSent) {
        $telegramError = $curlError ?: (string)$serverOutput;
    }
}

$dir = __DIR__ . '/messages';
if (!is_dir($dir)) {
    mkdir($dir, 0755, true);
}

$safeMessageForLog = str_replace(["\r\n", "\r"], "\n", $message);
$timestamp = date('Y-m-d H:i:s');
$logData = "Час: {$timestamp}\nІм'я: {$name}\nEmail: {$email}\nПовідомлення:\n{$safeMessageForLog}\n--------------------\n\n";
file_put_contents($dir . '/contact_messages.log', $logData, FILE_APPEND | LOCK_EX);

if ($telegramError !== '') {
    error_log('Telegram API Error: ' . $telegramError);
}

respond([
    'status' => 'success',
    'message' => $telegramSent
        ? 'Дякуємо! Ваше повідомлення успішно надіслано. Ми скоро зв\'яжемося з вами.'
        : 'Дякуємо! Повідомлення збережено. Telegram-сповіщення можна увімкнути через змінні середовища.'
]);
?>
