document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('articlesGrid');
  if (!grid) return;

  const dataSource = grid.dataset.source || 'articles_data.json';
  const sectionFilter = grid.dataset.section || '';

  const controls = {
    search: document.getElementById('searchInput'),
    sort: document.getElementById('sortSelect'),
    limit: document.getElementById('limitSelect'),
    genre: document.getElementById('genreSelect'),
    developer: document.getElementById('devSelect'),
    prev: document.getElementById('prevPage'),
    next: document.getElementById('nextPage'),
    pageInfo: document.getElementById('pageInfo'),
    resultsInfo: document.getElementById('resultsInfo')
  };

  const requiredControls = Object.entries(controls)
    .filter(([key]) => key !== 'resultsInfo')
    .filter(([, element]) => !element)
    .map(([key]) => key);

  if (requiredControls.length > 0) {
    console.error(`load_articles.js: missing controls: ${requiredControls.join(', ')}`);
    return;
  }

  const state = {
    allArticles: [],
    filteredArticles: [],
    currentPage: 1,
    itemsPerPage: Number.parseInt(controls.limit.value, 10) || 10,
    currentSort: controls.sort.value || 'newest',
    searchQuery: '',
    selectedGenre: '',
    selectedDeveloper: ''
  };

  grid.setAttribute('aria-live', 'polite');

  loadArticles();
  bindEvents();

  async function loadArticles() {
    setLoading(true);

    try {
      const response = await fetch(`${dataSource}?t=${Date.now()}`, {
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const articles = await response.json();
      if (!Array.isArray(articles)) {
        throw new Error(`${dataSource} має містити масив статей`);
      }

      state.allArticles = articles
        .filter(isValidArticle)
        .filter((article) => !sectionFilter || article.section === sectionFilter);
      populateFilters();
      updateView();
    } catch (error) {
      console.error('Помилка load_articles.js:', error);
      showEmptyState(`Не вдалося завантажити статті. Перевірте ${dataSource} або сервер.`);
      updatePagination(1);
    } finally {
      setLoading(false);
    }
  }

  function bindEvents() {
    let searchTimer = 0;

    controls.search.addEventListener('input', (event) => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        state.searchQuery = normalize(event.target.value);
        state.currentPage = 1;
        updateView();
      }, 180);
    });

    controls.sort.addEventListener('change', (event) => {
      state.currentSort = event.target.value;
      state.currentPage = 1;
      updateView();
    });

    controls.genre.addEventListener('change', (event) => {
      state.selectedGenre = event.target.value;
      state.currentPage = 1;
      updateView();
    });

    controls.developer.addEventListener('change', (event) => {
      state.selectedDeveloper = event.target.value;
      state.currentPage = 1;
      updateView();
    });

    controls.limit.addEventListener('change', (event) => {
      state.itemsPerPage = Number.parseInt(event.target.value, 10) || 10;
      state.currentPage = 1;
      updateView();
    });

    controls.prev.addEventListener('click', () => {
      if (state.currentPage <= 1) return;
      state.currentPage -= 1;
      updateView();
      scrollToGrid();
    });

    controls.next.addEventListener('click', () => {
      const totalPages = getTotalPages();
      if (state.currentPage >= totalPages) return;
      state.currentPage += 1;
      updateView();
      scrollToGrid();
    });
  }

  function populateFilters() {
    const genres = uniqueSortedValues(state.allArticles.map((article) => article.genre));
    const developers = uniqueSortedValues(state.allArticles.map((article) => article.developer));

    replaceOptions(controls.genre, 'Всі жанри', genres);
    replaceOptions(controls.developer, 'Всі розробники', developers);
  }

  function updateView() {
    const query = state.searchQuery;

    const filtered = state.allArticles.filter((article) => {
      const searchableText = normalize([
        article.title,
        article.previewText,
        article.genre,
        article.developer,
        article.release_date
      ].join(' '));

      const genre = (article.genre || '').trim();
      const developer = (article.developer || '').trim();

      return searchableText.includes(query)
        && (!state.selectedGenre || genre === state.selectedGenre)
        && (!state.selectedDeveloper || developer === state.selectedDeveloper);
    });

    state.filteredArticles = sortArticles(filtered);

    const totalPages = getTotalPages();
    if (state.currentPage > totalPages) state.currentPage = totalPages;

    const startIndex = (state.currentPage - 1) * state.itemsPerPage;
    const pageItems = state.filteredArticles.slice(startIndex, startIndex + state.itemsPerPage);

    updatePagination(totalPages);
    renderGrid(pageItems);
  }

  function renderGrid(items) {
    if (items.length === 0) {
      showEmptyState('За вашим запитом нічого не знайдено.');
      return;
    }

    const fragment = document.createDocumentFragment();

    items.forEach((article, index) => {
      if (index > 0 && index % 6 === 0) {
        fragment.appendChild(createAdCard());
      }

      fragment.appendChild(createArticleCard(article));
    });

    grid.replaceChildren(fragment);
  }

  function createArticleCard(data) {
    const article = document.createElement('article');
    article.className = 'article';

    const imgWrap = document.createElement('div');
    imgWrap.className = 'img-wrap';

    const img = document.createElement('img');
    img.src = getImageUrl(data.imageUrl);
    img.alt = `Прев'ю: ${data.title}`;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      img.src = 'images/placeholder.jpg';
    }, { once: true });
    imgWrap.appendChild(img);

    const content = document.createElement('div');
    content.className = 'article-content';

    const title = document.createElement('h2');
    title.textContent = data.title;

    const meta = document.createElement('small');
    meta.className = 'article-meta-list';
    meta.textContent = getMetaText(data);

    const preview = document.createElement('p');
    preview.textContent = data.previewText || "Опис скоро з'явиться.";

    const link = document.createElement('a');
    link.href = `article.html?id=${encodeURIComponent(getArticleId(data))}`;
    link.className = 'read-more';
    link.textContent = 'Читати далі';

    content.append(title, meta, preview, link);
    article.append(imgWrap, content);

    return article;
  }

  function createAdCard() {
    const card = document.createElement('aside');
    card.className = 'ad-card';
    card.setAttribute('aria-label', 'Рекламний блок');

    const text = document.createElement('p');
    text.textContent = 'Рекламний простір 300x250';
    card.appendChild(text);

    return card;
  }

  function sortArticles(articles) {
    const sorted = [...articles];

    switch (state.currentSort) {
      case 'newest':
        return sorted.reverse();
      case 'release_desc':
        return sorted.sort((a, b) => extractYear(b.release_date) - extractYear(a.release_date));
      case 'release_asc':
        return sorted.sort((a, b) => extractYear(a.release_date) - extractYear(b.release_date));
      case 'oldest':
      default:
        return sorted;
    }
  }

  function updatePagination(totalPages) {
    const total = state.filteredArticles.length;
    controls.pageInfo.textContent = `Сторінка ${state.currentPage} з ${totalPages}`;
    controls.prev.disabled = state.currentPage === 1;
    controls.next.disabled = state.currentPage === totalPages;

    if (controls.resultsInfo) {
      controls.resultsInfo.textContent = total === 1
        ? 'Знайдено 1 матеріал'
        : `Знайдено ${total} матеріалів`;
    }
  }

  function getTotalPages() {
    return Math.max(1, Math.ceil(state.filteredArticles.length / state.itemsPerPage));
  }

  function showEmptyState(message) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = message;
    grid.replaceChildren(empty);
  }

  function setLoading(isLoading) {
    grid.classList.toggle('is-loading', isLoading);
  }

  function scrollToGrid() {
    window.scrollTo({ top: Math.max(grid.offsetTop - 100, 0), behavior: 'smooth' });
  }

  function replaceOptions(select, firstLabel, values) {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(new Option(firstLabel, ''));

    values.forEach((value) => {
      fragment.appendChild(new Option(value, value));
    });

    select.replaceChildren(fragment);
  }

  function uniqueSortedValues(values) {
    return [...new Set(values.map((value) => (value || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'uk', { sensitivity: 'base' }));
  }

  function normalize(value) {
    return String(value || '').toLocaleLowerCase('uk').trim();
  }

  function extractYear(value) {
    const match = String(value || '').match(/\d{4}/);
    return match ? Number.parseInt(match[0], 10) : 0;
  }

  function isValidArticle(article) {
    return article
      && typeof article === 'object'
      && article.title
      && (article.url || article.localId || article.contentHtml || article.contentPath)
      && article.previewText;
  }

  function getMetaText(article) {
    const parts = [article.sectionLabel, article.genre, article.release_date, article.developer]
      .map((value) => (value || '').trim())
      .filter(Boolean);

    return parts.length > 0 ? parts.join(' | ') : 'Стаття';
  }

  function getImageUrl(value) {
    const imageUrl = String(value || '').trim();
    return imageUrl || 'images/placeholder.jpg';
  }

  function getArticleId(article) {
    if (article.localId) {
      return article.localId;
    }

    const url = article.url;
    try {
      const parsedUrl = new URL(url, window.location.href);
      return parsedUrl.pathname.replace(/^\/+/, '') || String(url);
    } catch (error) {
      return String(url || '').replace(/^https?:\/\/telegra\.ph\//i, '').replace(/^\/+/, '');
    }
  }
});
