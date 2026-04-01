/**
 * load_articles.js
 * ─────────────────────────────────────────────────────────────────
 * Завантажує статті з articles_data.json і рендерить їх у .articles-grid
 *
 * Що тут відбувається:
 * 1. DOMContentLoaded — чекаємо, поки HTML повністю завантажиться
 * 2. fetch() — запитуємо JSON-файл зі статтями
 * 3. Перебираємо масив статей і будуємо картки через createElement()
 * 4. Кожні AD_EVERY статей вставляємо рекламну картку .ad-card
 *
 * ЯК ЗМІНИТИ інтервал реклами:
 *   Змінити константу AD_EVERY (наприклад, 4 замість 6)
 *
 * ЯК ДОДАТИ реальну рекламу:
 *   Замінити вміст функції createAdCard() на ваш код AdSense
 */

document.addEventListener('DOMContentLoaded', () => {

  // Знаходимо контейнер сітки на сторінці
  const grid = document.querySelector('.articles-grid');

  // Якщо контейнера нема — цей скрипт підключений не на тій сторінці
  if (!grid) {
    console.warn('load_articles.js: елемент .articles-grid не знайдено');
    return;
  }

  // Кожні скільки статей вставляти рекламу
  const AD_EVERY = 6;

  // ── Завантаження даних ──────────────────────────────────────────
  fetch('articles_data.json')
    .then(response => {
      // Якщо сервер повернув помилку (404, 500 тощо) — кидаємо виняток
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: не вдалося завантажити статті`);
      }
      return response.json();
    })

    .then(articles => {
      // Очищаємо "Завантаження..." і починаємо рендер
      grid.innerHTML = '';

      if (articles.length === 0) {
        grid.innerHTML = '<p class="empty-msg">Статей поки немає.</p>';
        return;
      }

      // Перебираємо кожну статтю
      articles.forEach((data, index) => {

        // Кожні AD_EVERY статей (перед 7-ю, 13-ю, 19-ю тощо) — рекламна картка
        // Умова: index > 0, щоб не ставити рекламу самою першою
        if (index > 0 && index % AD_EVERY === 0) {
          grid.appendChild(createAdCard(index));
        }

        // Будуємо картку статті
        grid.appendChild(createArticleCard(data));
      });
    })

    .catch(error => {
      console.error('load_articles.js:', error);
      grid.innerHTML = `
        <p style="color: var(--text-muted); grid-column: 1/-1; text-align: center; padding: 3rem 0;">
          Не вдалося завантажити статті. Спробуйте оновити сторінку.
        </p>`;
    });


  // ── Функція: побудова картки статті ────────────────────────────
  /**
   * createArticleCard(data)
   * Приймає об'єкт { url, imageUrl, title, previewText }
   * Повертає готовий DOM-елемент <article>
   */
  function createArticleCard(data) {
    // <article class="article">
    const article = document.createElement('article');
    article.className = 'article';

    // Обгортка для зображення — потрібна для overflow:hidden + scale при hover
    const imgWrap = document.createElement('div');
    imgWrap.className = 'img-wrap';

    // Зображення
    const img = document.createElement('img');
    // Якщо imageUrl відсутній — використовуємо резервне зображення
    img.src    = data.imageUrl || 'images/article-fallback.jpg';
    img.alt    = `Прев'ю статті: ${data.title}`;
    img.loading = 'lazy'; // Ліниве завантаження — важливо для швидкості сайту

    imgWrap.appendChild(img);

    // Блок контенту
    const content = document.createElement('div');
    content.className = 'article-content';

    // Заголовок
    const h2 = document.createElement('h2');
    h2.textContent = data.title;

    // Анонс
    const p = document.createElement('p');
    p.textContent = data.previewText;

    // Посилання "Читати далі"
    const a = document.createElement('a');
    
    // Витягуємо "Zarodzhennya-kompyuternih-igor-11-04" з URL
    const urlObj = new URL(data.url);
    const path = urlObj.pathname.substring(1); 
    
    // Ведемо на наш шаблон, передаючи шлях
    a.href      = `article.html?id=${path}`;
    a.className = 'read-more';
    a.textContent = 'Читати Далі →';
    // a.target = '_blank'; // Можна прибрати, щоб стаття відкривалась у цій же вкладці

    content.append(h2, p, a);

    // Збираємо картку
    article.append(imgWrap, content);

    return article;
  }


  // ── Функція: рекламна картка в сітці ───────────────────────────
  /**
   * createAdCard(index)
   * Повертає DOM-елемент .ad-card для вставки між статтями
   *
   * ЩОБ ПІДКЛЮЧИТИ РЕАЛЬНУ РЕКЛАМУ:
   * Замініть вміст цієї функції на щось на кшталт:
   *
   *   const card = document.createElement('div');
   *   card.className = 'ad-card';
   *   card.innerHTML = `
   *     <ins class="adsbygoogle"
   *          style="display:block"
   *          data-ad-client="ca-pub-XXXXXXXXXX"
   *          data-ad-slot="XXXXXXXXXX"
   *          data-ad-format="auto"
   *          data-full-width-responsive="true"></ins>
   *   `;
   *   (adsbygoogle = window.adsbygoogle || []).push({});
   *   return card;
   */
  function createAdCard(index) {
    const card = document.createElement('div');
    card.className = 'ad-card';

    const p = document.createElement('p');
    p.textContent = 'Рекламний простір 300×250';

    card.appendChild(p);
    return card;
  }

});