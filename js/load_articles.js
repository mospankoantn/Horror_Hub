/**
 * load_articles.js
 * ─────────────────────────────────────────────────────────────────
 * Завантажує статті з articles_data.json, генерує фільтри і рендерить сітку
 */

document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('articlesGrid');
    if (!grid) return;
  
    // DOM Елементи керування
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    const limitSelect = document.getElementById('limitSelect');
    const genreSelect = document.getElementById('genreSelect');
    const devSelect = document.getElementById('devSelect');
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');
  
    // Змінні стану
    let allArticles = [];      
    let filteredArticles = []; 
    let currentPage = 1;
    let itemsPerPage = 10;
    let currentSort = 'newest';
    let searchQuery = '';
    let selectedGenre = '';
    let selectedDev = '';
  
    // 1. ЗАВАНТАЖУЄМО ДАНІ
    fetch('articles_data.json')
      .then(res => {
        if (!res.ok) throw new Error('Помилка завантаження файлу JSON');
        return res.json();
      })
      .then(data => {
        allArticles = data; 
        populateFilters(); // Генеруємо списки жанрів і розробників
        updateView();       
      })
      .catch(error => {
        console.error('Помилка load_articles.js:', error);
        grid.innerHTML = '<p style="color:red; text-align:center; grid-column: 1/-1;">Не вдалося завантажити статті.</p>';
      });
  
    // 2. ГЕНЕРАЦІЯ СПИСКІВ ДЛЯ ФІЛЬТРІВ
    function populateFilters() {
        const genres = new Set();
        const devs = new Set();

        allArticles.forEach(article => {
            if (article.genre) genres.add(article.genre.trim());
            if (article.developer) devs.add(article.developer.trim());
        });

        // Сортуємо за алфавітом і додаємо в select
        Array.from(genres).sort().forEach(g => {
            if(g !== "") genreSelect.innerHTML += `<option value="${g}">${g}</option>`;
        });
        
        Array.from(devs).sort().forEach(d => {
            if(d !== "") devSelect.innerHTML += `<option value="${d}">${d}</option>`;
        });
    }

    // 3. СЛУХАЧІ ПОДІЙ
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase();
      currentPage = 1; 
      updateView();
    });
  
    sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      currentPage = 1;
      updateView();
    });

    genreSelect.addEventListener('change', (e) => {
      selectedGenre = e.target.value;
      currentPage = 1;
      updateView();
    });

    devSelect.addEventListener('change', (e) => {
      selectedDev = e.target.value;
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
        window.scrollTo({ top: grid.offsetTop - 100, behavior: 'smooth' }); 
      }
    });
  
    nextBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(filteredArticles.length / itemsPerPage);
      if (currentPage < totalPages) {
        currentPage++;
        updateView();
        window.scrollTo({ top: grid.offsetTop - 100, behavior: 'smooth' }); 
      }
    });
  
    // ДОПОМІЖНА ФУНКЦІЯ: Витягує рік з рядка (напр. "2003 рік" -> 2003)
    function extractYear(dateString) {
        if (!dateString) return 0;
        const match = dateString.match(/\d{4}/); // Шукаємо 4 цифри підряд (рік)
        return match ? parseInt(match[0]) : 0;
    }

    // 4. ГОЛОВНА ФУНКЦІЯ ОНОВЛЕННЯ ДАНИХ
    function updateView() {
      // Крок А: Фільтрація (Пошук + Жанр + Розробник)
      let tempArticles = allArticles.filter(article => {
        // Пошук по тексту (назва, опис, жанр, розробник)
        const searchStr = `${article.title} ${article.previewText} ${article.genre || ''} ${article.developer || ''}`.toLowerCase();
        const matchSearch = searchStr.includes(searchQuery);
        
        // Фільтри по випадаючих списках (точний збіг)
        const matchGenre = selectedGenre === '' || (article.genre && article.genre.trim() === selectedGenre);
        const matchDev = selectedDev === '' || (article.developer && article.developer.trim() === selectedDev);

        return matchSearch && matchGenre && matchDev;
      });
  
      // Крок Б: Сортування
      if (currentSort === 'newest') {
          // Оскільки в JSON найновіші в кінці (якщо ти зберігаєш через адмінку), перевертаємо
          tempArticles.reverse();
      } else if (currentSort === 'oldest') {
          // Залишаємо як є
      } else if (currentSort === 'release_desc') {
          // Від найновіших релізів до найстаріших
          tempArticles.sort((a, b) => extractYear(b.release_date) - extractYear(a.release_date));
      } else if (currentSort === 'release_asc') {
          // Від найстаріших релізів до найновіших
          tempArticles.sort((a, b) => extractYear(a.release_date) - extractYear(b.release_date));
      }
  
      filteredArticles = tempArticles;
  
      // Крок В: Пагінація
      const totalPages = Math.ceil(filteredArticles.length / itemsPerPage) || 1;
      if (currentPage > totalPages) currentPage = totalPages;
  
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      
      const pageItems = filteredArticles.slice(startIndex, endIndex);
  
      // Оновлюємо UI кнопок
      pageInfo.textContent = `Сторінка ${currentPage} з ${totalPages}`;
      prevBtn.disabled = currentPage === 1;
      nextBtn.disabled = currentPage === totalPages;
  
      renderGrid(pageItems);
    }
  
    // 5. ФУНКЦІЯ ВІДМАЛЬОВУВАННЯ СІТКИ
    function renderGrid(items) {
      grid.innerHTML = '';
      
      if (items.length === 0) {
        grid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center; padding: 3rem 0;">За вашим запитом монстрів не знайдено.</p>';
        return;
      }
  
      items.forEach((data, index) => {
        if (index > 0 && index % 6 === 0) {
          grid.appendChild(createAdCard());
        }
        grid.appendChild(createArticleCard(data));
      });
    }
  
    // 6. СТВОРЕННЯ КАРТКИ
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

      // Вивід Мета-даних (Жанр, Рік, Розробник)
      const meta = document.createElement('small');
      meta.style.color = 'var(--red-main)';
      meta.style.display = 'block';
      meta.style.marginBottom = '10px';
      meta.style.fontWeight = 'bold';
      meta.style.fontFamily = 'var(--font-headings)';
      
      let metaData = [];
      if (data.genre) metaData.push(data.genre);
      if (data.release_date) metaData.push(data.release_date);
      if (data.developer) metaData.push(data.developer);
      
      meta.textContent = metaData.length > 0 ? metaData.join(' | ') : 'Стаття';
  
      const p = document.createElement('p');
      p.textContent = data.previewText;
  
      const a = document.createElement('a');
      const urlObj = new URL(data.url);
      const path = urlObj.pathname.substring(1); 
      a.href = `article.html?id=${path}`;
      a.className = 'read-more';
      a.textContent = 'Читати Далі →';
  
      content.append(h2, meta, p, a);
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