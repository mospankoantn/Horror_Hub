<?php
require_once __DIR__ . '/includes/bootstrap.php';
hh_method('POST');
hh_check_csrf();
if (hh_input($_POST, 'website') !== '') hh_json(['status' => 'success', 'message' => 'Повідомлення прийнято.']);
$name = hh_input($_POST, 'name');
$email = hh_input($_POST, 'email');
$message = hh_input($_POST, 'message');
if ($name === '' || hh_length($name) > 100 || preg_match('/[\r\n]/', $name) || strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL) || hh_length($message) < 1 || hh_length($message) > 3000) {
    hh_json(['status' => 'error', 'message' => 'Перевірте ім’я, email і повідомлення (до 3000 символів).'], 422);
}
hh_rate_limit('contact', 5, 600);
$directory = __DIR__ . '/messages';
if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) throw new RuntimeException('Cannot create message storage');
$entry = json_encode(['date' => gmdate('c'), 'name' => $name, 'email' => $email, 'message' => $message], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . PHP_EOL;
if (file_put_contents($directory . '/contact_messages.jsonl', $entry, FILE_APPEND | LOCK_EX) !== strlen($entry)) throw new RuntimeException('Cannot save contact message');

$token = getenv('HORROR_HUB_TELEGRAM_BOT_TOKEN') ?: '';
$chatId = getenv('HORROR_HUB_TELEGRAM_CHAT_ID') ?: '';
if ($token !== '' && $chatId !== '' && function_exists('curl_init')) {
    $curl = curl_init('https://api.telegram.org/bot' . $token . '/sendMessage');
    curl_setopt_array($curl, [
        CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query(['chat_id' => $chatId, 'text' => "Horror Hub\n$name <$email>\n\n$message"]),
        CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_TIMEOUT => 8
    ]);
    $result = curl_exec($curl);
    $ok = curl_getinfo($curl, CURLINFO_HTTP_CODE) === 200 && !empty(json_decode((string)$result, true)['ok']);
    curl_close($curl);
    if (!$ok) error_log('Horror Hub: Telegram notification failed; message retained locally');
}
hh_json(['status' => 'success', 'message' => 'Дякуємо! Повідомлення прийнято.']);
