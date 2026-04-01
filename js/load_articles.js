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
    const grid = document.getElementById('articlesGrid');
    if (!grid) return;
  
    // DOM Елементи керування
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    const limitSelect = document.getElementById('limitSelect');
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');
  
    // Змінні стану
    let allArticles = [];      // Всі завантажені статті з JSON (початковий порядок - найстаріші перші)
    let filteredArticles = []; // Статті після фільтрації та сортування
    let currentPage = 1;
    let itemsPerPage = 10;
    let currentSort = 'newest';
    let searchQuery = '';
  
    // 1. ЗАВАНТАЖУЄМО ДАНІ
    fetch('articles_data.json')
      .then(res => {
        if (!res.ok) throw new Error('Помилка завантаження файлу JSON');
        return res.json();
      })
      .then(data => {
        allArticles = data; // Оригінальний масив
        updateView();       // Одразу відмальовуємо
      })
      .catch(error => {
        console.error('Помилка load_articles.js:', error);
        grid.innerHTML = '<p style="color:red; text-align:center; grid-column: 1/-1;">Не вдалося завантажити статті.</p>';
      });
  
    // 2. СЛУХАЧІ ПОДІЙ (Фільтри, сортування, кнопки)
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase();
      currentPage = 1; // При пошуку скидаємо на першу сторінку
      updateView();
    });
  
    sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      currentPage = 1;
      updateView();
    });
  
    limitSelect.addEventListener('change', (e) => {
      itemsPerPage = parseInt(e.target.value);
      currentPage = 1;
      updateView();
    });
  
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        updateView();
        window.scrollTo({ top: grid.offsetTop - 100, behavior: 'smooth' }); // Скрол вгору
      }
    });
  
    nextBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(filteredArticles.length / itemsPerPage);
      if (currentPage < totalPages) {
        currentPage++;
        updateView();
        window.scrollTo({ top: grid.offsetTop - 100, behavior: 'smooth' }); // Скрол вгору
      }
    });
  
    // 3. ГОЛОВНА ФУНКЦІЯ ОНОВЛЕННЯ ДАНИХ
    function updateView() {
      // Крок А: Пошук
      let tempArticles = allArticles.filter(article => {
        const titleMatch = article.title.toLowerCase().includes(searchQuery);
        const textMatch = article.previewText.toLowerCase().includes(searchQuery);
        return titleMatch || textMatch;
      });
  
      // Крок Б: Сортування
      // У JSON нові статті знаходяться ВНИЗУ масиву. 
      // Тому "newest" = reverse() (перевернути масив). "oldest" = залишити як є.
      if (currentSort === 'newest') {
        tempArticles.reverse();
      }
  
      filteredArticles = tempArticles;
  
      // Крок В: Пагінація
      const totalPages = Math.ceil(filteredArticles.length / itemsPerPage) || 1;
      if (currentPage > totalPages) currentPage = totalPages;
  
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      
      // Вирізаємо шматок масиву для поточної сторінки
      const pageItems = filteredArticles.slice(startIndex, endIndex);
  
      // Оновлюємо UI (кнопки і текст)
      pageInfo.textContent = `Сторінка ${currentPage} з ${totalPages}`;
      prevBtn.disabled = currentPage === 1;
      nextBtn.disabled = currentPage === totalPages;
  
      // Крок Г: Рендеримо HTML
      renderGrid(pageItems);
    }
  
    // 4. ФУНКЦІЯ ВІДМАЛЬОВУВАННЯ СІТКИ
    function renderGrid(items) {
      grid.innerHTML = '';
      
      if (items.length === 0) {
        grid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center; padding: 3rem 0;">За вашим запитом нічого не знайдено.</p>';
        return;
      }
  
      items.forEach((data, index) => {
        // Реклама кожні 6 статей НА ПОТОЧНІЙ сторінці
        if (index > 0 && index % 6 === 0) {
          grid.appendChild(createAdCard());
        }
        grid.appendChild(createArticleCard(data));
      });
    }
  
    // 5. ДОПОМІЖНІ ФУНКЦІЇ СТВОРЕННЯ ЕЛЕМЕНТІВ
    function createArticleCard(data) {
      const article = document.createElement('article');
      article.className = 'article';
  
      const imgWrap = document.createElement('div');
      imgWrap.className = 'img-wrap';
  
      const img = document.createElement('img');
      img.src = data.imageUrl || 'images/article-fallback.jpg';
      img.alt = `Прев'ю: ${data.title}`;
      img.loading = 'lazy';
  
      imgWrap.appendChild(img);
  
      const content = document.createElement('div');
      content.className = 'article-content';
  
      const h2 = document.createElement('h2');
      h2.textContent = data.title;
  
      const p = document.createElement('p');
      p.textContent = data.previewText;
  
      const a = document.createElement('a');
      const urlObj = new URL(data.url);
      const path = urlObj.pathname.substring(1); 
      a.href = `article.html?id=${path}`;
      a.className = 'read-more';
      a.textContent = 'Читати Далі →';
  
      content.append(h2, p, a);
      article.append(imgWrap, content);
  
      return article;
    }
  
    function createAdCard() {
      const card = document.createElement('div');
      card.className = 'ad-card';
      const p = document.createElement('p');
      p.textContent = 'Рекламний простір 300×250';
      card.appendChild(p);
      return card;
    }
});