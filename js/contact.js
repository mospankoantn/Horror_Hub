/**
 * contact.js
 * ─────────────────────────────────────────────────────────────────
 * Обробляє відправку контактної форми двома способами:
 *
 *  СПОСІБ A (за замовчуванням) — Formspree:
 *    Безкоштовний сервіс, не потребує PHP або сервера взагалі.
 *    Реєстрація: https://formspree.io → Create Form → отримати endpoint.
 *    Замінити значення FORMSPREE_URL нижче.
 *
 *  СПОСІБ B — власний PHP (save_contact.php):
 *    Раскоментувати рядок з PHP_URL і закоментувати FORMSPREE_URL.
 *    Потребує запущеного PHP-сервера (XAMPP, php -S localhost тощо).
 *
 * ЯК ПРАЦЮЄ:
 *  1. Перехоплюємо submit форми (event.preventDefault())
 *  2. Перевіряємо honeypot-поле (захист від ботів)
 *  3. Відправляємо дані через fetch() (AJAX — без перезавантаження)
 *  4. Показуємо результат у #statusMessage
 */

// ── Налаштування ──────────────────────────────────────────────────

// СПОСІБ A: Formspree (рекомендовано, не потребує сервера)
// const FORM_ENDPOINT = 'https://formspree.io/f/YOUR_FORM_ID';

// СПОСІБ B: власний PHP (розкоментуйте цей рядок і закоментуйте рядок вище)
const FORM_ENDPOINT = 'save_contact.php';

// ── Знаходимо елементи на сторінці ───────────────────────────────
const form          = document.getElementById('contactForm');
const statusMessage = document.getElementById('statusMessage');
const submitButton  = document.getElementById('submitButton');

// Якщо форми немає на поточній сторінці — виходимо тихо
if (!form) {
  console.warn('contact.js: форму #contactForm не знайдено');
  // Тут немає return, бо це верхній рівень модуля — просто не чіпляємо listener
} else {

  form.addEventListener('submit', handleSubmit);
}

// ── Головна функція-обробник ──────────────────────────────────────
async function handleSubmit(event) {
  // Зупиняємо стандартну відправку форми (яка б перезавантажила сторінку)
  event.preventDefault();

  // 1. Перевірка honeypot: якщо бот заповнив приховане поле — тихо виходимо
  const honeypot = document.getElementById('bot-check');
  if (honeypot && honeypot.value !== '') {
    console.log('Honeypot спрацював: ймовірний бот');
    return;
  }

  // 2. Скидаємо попередній статус
  resetStatus();

  // 3. Блокуємо кнопку поки йде запит (щоб не відправили двічі)
  setLoading(true);

  try {
    // 4. Відправляємо дані форми на endpoint
    const response = await fetch(FORM_ENDPOINT, {
      method: 'POST',
      body: new FormData(form),
      // Formspree потребує цього заголовка для JSON-відповіді
      headers: { 'Accept': 'application/json' }
    });

    if (response.ok) {
      // Успіх
      showStatus('success', '✓ Дякуємо! Ваше повідомлення отримано.');
      form.reset();
    } else {
      // Сервер відповів з помилкою (наприклад, невірний endpoint)
      const data = await response.json().catch(() => ({}));
      const msg  = data.message || data.error || `Помилка сервера (${response.status})`;
      showStatus('error', `✗ ${msg}`);
    }

  } catch (err) {
    // Помилка мережі або FORM_ENDPOINT не налаштований
    console.error('contact.js fetch error:', err);

    // Зрозуміле повідомлення якщо FORM_ENDPOINT не змінений
    if (FORM_ENDPOINT.includes('YOUR_FORM_ID')) {
      showStatus('error',
        '⚙️ Форму ще не налаштовано. ' +
        'Зареєструйтесь на formspree.io та вставте свій ID у contact.js'
      );
    } else {
      showStatus('error',
        '✗ Не вдалося надіслати. Перевірте підключення до інтернету.'
      );
    }
  } finally {
    // 5. Розблоковуємо кнопку в будь-якому випадку (успіх або помилка)
    setLoading(false);
  }
}

// ── Допоміжні функції ─────────────────────────────────────────────

/**
 * Вмикає/вимикає стан завантаження на кнопці
 * @param {boolean} isLoading
 */
function setLoading(isLoading) {
  if (!submitButton) return;
  submitButton.disabled    = isLoading;
  submitButton.textContent = isLoading ? 'Надсилання...' : 'Надіслати';
}

/**
 * Показує статус-повідомлення
 * @param {'success'|'error'} type
 * @param {string} text
 */
function showStatus(type, text) {
  if (!statusMessage) return;
  statusMessage.textContent = text;
  statusMessage.className   = type;  // клас 'success' або 'error' зі style.css
  statusMessage.style.display = 'block';

  // Автоматично прибираємо успішне повідомлення через 6 секунд
  if (type === 'success') {
    setTimeout(resetStatus, 6000);
  }
}

/**
 * Скидає і ховає статус-повідомлення
 */
function resetStatus() {
  if (!statusMessage) return;
  statusMessage.textContent  = '';
  statusMessage.className    = '';
  statusMessage.style.display = 'none';
}