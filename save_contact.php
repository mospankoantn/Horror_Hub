<?php
header('Content-Type: application/json'); // Встановлюємо тип відповіді JSON

$response = ['status' => 'error', 'message' => 'Невідома помилка.'];

if ($_SERVER["REQUEST_METHOD"] == "POST") {

    // Перевірка поля-пастки (honeypot) для захисту від ботів
    if (!empty($_POST['bot-check'])) {
        $response['message'] = 'Помилка перевірки на бота.';
        echo json_encode($response);
        exit;
    }

    $name = isset($_POST['name']) ? trim($_POST['name']) : '';
    $email = isset($_POST['email']) ? trim($_POST['email']) : '';
    $message = isset($_POST['message']) ? trim($_POST['message']) : '';

    if (empty($name) || empty($email) || empty($message)) {
        $response['message'] = 'Будь ласка, заповніть всі обов\'язкові поля.';
    } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $response['message'] = 'Будь ласка, введіть дійсну адресу email.';
    } else {
        
        // ==========================================
        // НАЛАШТУВАННЯ TELEGRAM
        // ==========================================
        $botToken = "8529537352:AAGXjThE3KDQ8VeF8445co-XukOGTPxlAVg"; // Наприклад: "1234567890:ABCDefGhIjKlMnOpQrStUvWxYz"
        $chatId   = "5089342158";   // Наприклад: "123456789"
        
        // Формуємо красиве повідомлення для Telegram (використовуємо HTML теги)
        $telegramMessage = "🚨 <b>Нове повідомлення з Horror Hub!</b>\n\n";
        $telegramMessage .= "👤 <b>Ім'я:</b> " . htmlspecialchars($name) . "\n";
        $telegramMessage .= "📧 <b>Email:</b> " . htmlspecialchars($email) . "\n";
        $telegramMessage .= "💬 <b>Повідомлення:</b>\n" . htmlspecialchars($message);

        // Дані для відправки
        $data = [
            'chat_id' => $chatId,
            'text' => $telegramMessage,
            'parse_mode' => 'HTML'
        ];

        // Відправляємо запит до Telegram API
        $url = "https://api.telegram.org/bot" . $botToken . "/sendMessage";
        
        // Використовуємо cURL для надійності (стандарт для більшості хостингів)
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($data));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        $server_output = curl_exec($ch);
        $httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        // ==========================================
        // РЕЗЕРВНЕ ЗБЕРЕЖЕННЯ У ФАЙЛ (як і раніше)
        // ==========================================
        $dir = __DIR__ . '/messages';
        if (!file_exists($dir)) {
            mkdir($dir, 0777, true);
        }
        $file = $dir . '/contact_messages.log'; 
        $timestamp = date("Y-m-d H:i:s"); 
        $logData = "Час: $timestamp\nІм'я: $name\nEmail: $email\nПовідомлення:\n$message\n--------------------\n\n";
        file_put_contents($file, $logData, FILE_APPEND | LOCK_EX);

        // Перевіряємо, чи успішно відправлено в Telegram
        if ($httpcode == 200) {
            $response['status'] = 'success';
            $response['message'] = 'Дякуємо! Ваше повідомлення успішно надіслано. Ми скоро зв\'яжемося з вами.';
        } else {
            // Якщо Telegram API видав помилку, але у файл записалось
            $response['status'] = 'success'; 
            $response['message'] = 'Дякуємо! Повідомлення надіслано (резервний канал).';
            error_log("Telegram API Error: " . $server_output);
        }
    }
} else {
    $response['message'] = 'Неприпустимий метод запиту.';
}

echo json_encode($response);
?>