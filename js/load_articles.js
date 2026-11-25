// Catalog pages (markup: scripts/apply-layout.php): search from the header, facet chips,
// sort, list/cards view and pagination over one or more JSON catalogs.
document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('articlesGrid');
  if (!grid) return;

  const PER_PAGE = 12;
  const KINDS = {
    articles: ['games', 'Гра'], horror_games: ['games', 'Гра'], horror_movies: ['movies', 'Кіно'],
    reviews: ['reviews', 'Огляд'], internet_horror: ['internet', 'Інтернет'],
    horror_art: ['culture', 'Мистецтво'], horror_literature: ['culture', 'Література']
  };
  const KIND_FACET = { games: 'Ігри', movies: 'Кіно', internet: 'Інтернет-хоррор', culture: 'Культура', reviews: 'Огляди' };
  const DECADES = ['до 1980', '1980-ті', '1990-ті', '2000-ні', '2010+'];
  // Too general to filter by: almost every entry is "horror".
  const GENERIC = new Set(['horror', 'хоррор', 'хорор', 'жахи', 'жах', 'різні автори', 'різні режисери']);

  const els = {
    catalog: document.getElementById('catalog'),
    search: document.getElementById('searchInput'),
    sort: document.getElementById('sortSelect'),
    facets: document.getElementById('facetGroups'),
    filtersToggle: document.querySelector('.filters-toggle'),
    filtersSummary: document.getElementById('filtersSummary'),
    prev: document.getElementById('prevPage'),
    next: document.getElementById('nextPage'),
    pageInfo: document.getElementById('pageInfo'),
    resultsInfo: document.getElementById('resultsInfo'),
    viewButtons: Array.from(document.querySelectorAll('[data-view]'))
  };

  const params = new URLSearchParams(window.location.search);
  const state = {
    all: [],
    filtered: [],
    page: 1,
    sort: els.sort?.value || 'newest',
    query: normalize(params.get('q') || ''),
    picked: { kind: params.get('kind') || '', decade: params.get('decade') || '', genre: params.get('genre') || '', dev: params.get('dev') || '' },
    view: readView(),
    staticPages: {}
  };
  if (els.search && params.get('q')) els.search.value = params.get('q');

  const sources = String(grid.dataset.sources || grid.dataset.source || 'articles_data.json')
    .split(',').map((part) => part.trim()).filter(Boolean)
    .map((part) => {
      const [path, pattern] = part.split('#');
      return { path, match: pattern ? new RegExp(pattern, 'iu') : null };
    });

  bindEvents();
  applyView();
  load();

  async function load() {
    setLoading(true);
    try {
      const [lists] = await Promise.all([Promise.all(sources.map(fetchSource)), loadStaticPages()]);
      const seen = new Set();
      state.all = [];
      lists.forEach((list, index) => {
        list.map(normalizeArticle).filter(isValidArticle).forEach((article) => {
          const { match } = sources[index];
          if (match && !match.test(article.genre)) return;
          const id = getArticleId(article);
          if (seen.has(id)) return;
          seen.add(id);
          state.all.push({ ...article, id, order: state.all.length });
        });
      });
      renderFacets();
      update();
    } catch (error) {
      console.error('Помилка load_articles.js:', error);
      const message = document.createElement('p');
      message.className = 'empty-state';
      message.textContent = 'Не вдалося завантажити матеріали. ';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn';
      retry.textContent = 'Повторити';
      retry.addEventListener('click', load);
      message.appendChild(retry);
      grid.replaceChildren(message);
      if (els.resultsInfo) els.resultsInfo.textContent = 'Помилка завантаження';
    } finally {
      setLoading(false);
    }
  }

  async function fetchSource({ path }) {
    const response = await fetch(path, { cache: 'no-cache', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error(`${path} має містити масив статей`);
    return data;
  }

  // data/pages.json is written by scripts/build-site.php: article id -> static page and reading time.
  async function loadStaticPages() {
    try {
      const response = await fetch('data/pages.json', { cache: 'no-cache', headers: { Accept: 'application/json' } });
      const pages = response.ok ? (await response.json())?.pages : null;
      state.staticPages = pages && typeof pages === 'object' ? pages : {};
    } catch (error) {
      state.staticPages = {};
    }
  }

  function bindEvents() {
    let timer = 0;
    els.search?.addEventListener('input', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        state.query = normalize(els.search.value);
        state.page = 1;
        update();
      }, 180);
    });
    els.search?.closest('form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      state.query = normalize(els.search.value);
      state.page = 1;
      update();
      grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    els.sort?.addEventListener('change', () => {
      state.sort = els.sort.value;
      state.page = 1;
      update();
    });
    els.viewButtons.forEach((button) => button.addEventListener('click', () => {
      state.view = button.dataset.view === 'cards' ? 'cards' : 'list';
      try { localStorage.setItem('hh-view', state.view); } catch (error) { /* storage blocked */ }
      applyView();
    }));
    els.filtersToggle?.addEventListener('click', () => {
      const open = !els.catalog?.classList.contains('filters-open');
      els.catalog?.classList.toggle('filters-open', open);
      els.filtersToggle.setAttribute('aria-expanded', String(open));
    });
    els.prev?.addEventListener('click', () => goTo(state.page - 1));
    els.next?.addEventListener('click', () => goTo(state.page + 1));
  }

  function goTo(page) {
    const total = totalPages();
    if (page < 1 || page > total) return;
    state.page = page;
    update();
    window.scrollTo({ top: Math.max(grid.getBoundingClientRect().top + window.scrollY - 140, 0), behavior: 'smooth' });
  }

  function update() {
    const { query, picked } = state;
    const filtered = state.all.filter((article) => {
      const text = normalize([article.title, article.previewText, article.genre, article.developer, article.release_date, article.kindLabel].join(' '));
      return (!query || text.includes(query))
        && (!picked.kind || article.kind === picked.kind)
        && (!picked.decade || decadeOf(article.release_date) === picked.decade)
        && (!picked.genre || tokens(article.genre).some((token) => same(token, picked.genre)))
        && (!picked.dev || tokens(article.developer).some((token) => same(token, picked.dev)));
    });
    state.filtered = sortArticles(filtered);
    const total = totalPages();
    if (state.page > total) state.page = total;
    const start = (state.page - 1) * PER_PAGE;
    renderEntries(state.filtered.slice(start, start + PER_PAGE));
    updateStatus(total);
  }

  function sortArticles(list) {
    const sorted = [...list];
    switch (state.sort) {
      case 'oldest': return sorted.sort((a, b) => a.order - b.order);
      case 'release_desc': return sorted.sort((a, b) => compareYears(a, b, -1));
      case 'release_asc': return sorted.sort((a, b) => compareYears(a, b, 1));
      default: return sorted.sort((a, b) => b.order - a.order);
    }
  }

  function renderEntries(items) {
    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'За вашим запитом нічого не знайдено. ';
      if (hasFilters()) {
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'btn';
        reset.textContent = 'Скинути фільтри';
        reset.addEventListener('click', resetFilters);
        empty.appendChild(reset);
      }
      grid.replaceChildren(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    items.forEach((article) => fragment.appendChild(createEntry(article)));
    grid.replaceChildren(fragment);
  }

  function createEntry(data) {
    const entry = document.createElement('article');
    entry.className = `entry entry--${data.kind}`;
    const href = getArticleHref(data);

    if (data.imageUrl) {
      const media = document.createElement('div');
      media.className = 'entry__media';
      const img = document.createElement('img');
      img.src = data.imageUrl;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => { img.src = 'images/placeholder.jpg'; }, { once: true });
      media.appendChild(img);
      entry.appendChild(media);
    } else {
      const initial = document.createElement('span');
      initial.className = 'entry__initial';
      initial.setAttribute('aria-hidden', 'true');
      initial.textContent = data.title.replace(/^[«"'(\s]+/, '').charAt(0).toUpperCase();
      entry.appendChild(initial);
    }

    const body = document.createElement('div');
    body.className = 'entry__body';
    const meta = document.createElement('p');
    meta.className = 'entry__meta';
    meta.textContent = [data.kindLabel, data.release_date, data.developer, data.stub ? 'Готується' : ''].filter(Boolean).join(' · ');
    const title = document.createElement('h2');
    title.className = 'entry__title';
    const link = document.createElement('a');
    link.href = href;
    link.textContent = data.title;
    title.appendChild(link);
    const preview = document.createElement('p');
    preview.className = 'entry__preview';
    preview.textContent = data.previewText || 'Опис скоро з’явиться.';
    body.append(meta, title, preview);
    entry.appendChild(body);

    const minutes = Number(state.staticPages?.[data.id]?.minutes);
    if (minutes > 0) {
      const time = document.createElement('span');
      time.className = 'entry__time';
      time.textContent = `${minutes} хв`;
      entry.appendChild(time);
    }
    return entry;
  }

  function renderFacets() {
    if (!els.facets) return;
    const groups = [];
    if (grid.dataset.kindFacet) {
      groups.push(['kind', 'Розділ', countBy(state.all, (a) => [a.kind]).filter(([key]) => KIND_FACET[key]).map(([key, count]) => [key, KIND_FACET[key], count])]);
    }
    const decadeCounts = new Map(countBy(state.all, (a) => [decadeOf(a.release_date)].filter(Boolean)));
    groups.push(['decade', 'Десятиліття', DECADES.filter((d) => decadeCounts.has(d)).map((d) => [d, d, decadeCounts.get(d)])]);
    groups.push(['genre', 'Піджанр', topTokens('genre')]);
    groups.push(['dev', grid.dataset.devTitle || 'Автори й студії', topTokens('developer')]);

    const fragment = document.createDocumentFragment();
    groups.forEach(([key, title, options]) => {
      if (options.length < 2 && !state.picked[key]) return;
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'facet';
      const legend = document.createElement('legend');
      legend.className = 'facet__title';
      legend.textContent = title;
      const chips = document.createElement('div');
      chips.className = 'facet__chips';
      options.forEach(([value, label, count]) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.dataset.facet = key;
        chip.dataset.value = value;
        chip.setAttribute('aria-pressed', String(same(state.picked[key], value)));
        chip.append(document.createTextNode(label));
        const badge = document.createElement('span');
        badge.className = 'chip__count';
        badge.textContent = String(count);
        chip.appendChild(badge);
        chip.addEventListener('click', () => {
          state.picked[key] = same(state.picked[key], value) ? '' : value;
          state.page = 1;
          syncChips();
          update();
        });
        chips.appendChild(chip);
      });
      fieldset.append(legend, chips);
      fragment.appendChild(fieldset);
    });
    els.facets.replaceChildren(fragment);
  }

  function syncChips() {
    els.facets?.querySelectorAll('.chip').forEach((chip) => {
      chip.setAttribute('aria-pressed', String(same(state.picked[chip.dataset.facet], chip.dataset.value)));
    });
  }

  function resetFilters() {
    state.picked = { kind: '', decade: '', genre: '', dev: '' };
    state.query = '';
    if (els.search) els.search.value = '';
    state.page = 1;
    syncChips();
    update();
  }

  function hasFilters() {
    return Boolean(state.query || Object.values(state.picked).some(Boolean));
  }

  function topTokens(field) {
    const counts = new Map();
    const labels = new Map();
    state.all.forEach((article) => {
      new Set(tokens(article[field]).map((token) => token.toLocaleLowerCase('uk')).filter((key) => !GENERIC.has(key))).forEach((key) => {
        counts.set(key, (counts.get(key) || 0) + 1);
      });
      tokens(article[field]).forEach((token) => {
        const key = token.toLocaleLowerCase('uk');
        if (!labels.has(key)) labels.set(key, token);
      });
    });
    return [...counts.entries()]
      .filter(([, count]) => count > 1 || counts.size <= 8)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'uk'))
      .slice(0, 8)
      .map(([key, count]) => {
        const label = labels.get(key);
        return [label, label.charAt(0).toLocaleUpperCase('uk') + label.slice(1), count];
      });
  }

  function countBy(list, keysOf) {
    const counts = new Map();
    list.forEach((item) => keysOf(item).forEach((key) => counts.set(key, (counts.get(key) || 0) + 1)));
    return [...counts.entries()];
  }

  function updateStatus(total) {
    const count = state.filtered.length;
    if (els.resultsInfo) els.resultsInfo.textContent = `Знайдено ${count} ${plural(count, 'матеріал', 'матеріали', 'матеріалів')}`;
    if (els.pageInfo) els.pageInfo.textContent = `Сторінка ${state.page} з ${total}`;
    if (els.prev) els.prev.disabled = state.page <= 1;
    if (els.next) els.next.disabled = state.page >= total;
    const active = Object.values(state.picked).filter(Boolean).length + (state.query ? 1 : 0);
    if (els.filtersSummary) els.filtersSummary.textContent = active ? `${active} активн${active === 1 ? 'ий' : 'і'} · ${count}` : `${count}`;
  }

  function applyView() {
    const cards = state.view === 'cards';
    grid.classList.toggle('is-cards', cards);
    grid.classList.toggle('is-list', !cards);
    els.viewButtons.forEach((button) => button.setAttribute('aria-pressed', String((button.dataset.view === 'cards') === cards)));
  }

  function setLoading(loading) {
    grid.classList.toggle('is-loading', loading);
    grid.setAttribute('aria-busy', String(loading));
    [els.sort, els.prev, els.next].forEach((control) => { if (control) control.disabled = loading; });
    if (!loading) updateStatus(totalPages());
  }

  function totalPages() {
    return Math.max(1, Math.ceil(state.filtered.length / PER_PAGE));
  }

  function readView() {
    try { return localStorage.getItem('hh-view') === 'cards' ? 'cards' : 'list'; } catch (error) { return 'list'; }
  }

  function normalizeArticle(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const article = {};
    ['title', 'url', 'localId', 'previewText', 'imageUrl', 'section', 'genre', 'developer', 'release_date'].forEach((key) => {
      article[key] = typeof raw[key] === 'string' ? raw[key].trim() : '';
    });
    article.stub = raw.stub === true;
    if (!article.localId && typeof raw.local_id === 'string') article.localId = raw.local_id.trim();
    article.imageUrl = safeImage(article.imageUrl);
    const [kind, kindLabel] = KINDS[article.section] || ['games', 'Стаття'];
    article.kind = kind;
    article.kindLabel = kindLabel;
    return article;
  }

  function isValidArticle(article) {
    return Boolean(article && article.title && getArticleId(article));
  }

  function safeImage(value) {
    if (!value) return '';
    try {
      const url = new URL(value, window.location.href);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
    } catch (error) { return ''; }
  }

  function getArticleHref(article) {
    const path = state.staticPages?.[article.id]?.path;
    if (typeof path === 'string' && /^statti\/[a-z0-9-]+\.html$/.test(path)) return path;
    return 'article.html?id=' + encodeURIComponent(article.id);
  }

  function getArticleId(article) {
    if (/^[a-z0-9_]+:[a-z0-9_-]{1,150}$/i.test(article.localId)) return article.localId;
    try {
      const url = new URL(article.url, window.location.href);
      if (url.protocol === 'local:' && /^[a-z0-9_]+$/i.test(url.hostname)) return url.hostname + ':' + url.pathname.replace(/^\/+/, '');
      if (!['http:', 'https:'].includes(url.protocol) || !['telegra.ph', 'www.telegra.ph'].includes(url.hostname) || url.username || url.password) return '';
      return url.pathname.replace(/^\/+/, '');
    } catch (error) {
      return '';
    }
  }

  function decadeOf(value) {
    const match = String(value || '').match(/\b(19|20)\d{2}\b/);
    if (!match) return '';
    const year = Number(match[0]);
    return year < 1980 ? 'до 1980' : year < 1990 ? '1980-ті' : year < 2000 ? '1990-ті' : year < 2010 ? '2000-ні' : '2010+';
  }

  function compareYears(a, b, direction) {
    const first = Number((String(a.release_date).match(/\d{4}/) || [0])[0]);
    const second = Number((String(b.release_date).match(/\d{4}/) || [0])[0]);
    if (!first) return second ? 1 : 0;
    if (!second) return -1;
    return (first - second) * direction;
  }

  function tokens(value) {
    return String(value || '').split(/\s*(?:[,;/&]|\sта\s|\sі\s)\s*/u).map((part) => part.trim()).filter((part) => part.length > 1);
  }

  function same(a, b) {
    return Boolean(a) && Boolean(b) && String(a).toLocaleLowerCase('uk') === String(b).toLocaleLowerCase('uk');
  }

  function normalize(value) {
    return String(value || '').toLocaleLowerCase('uk').trim();
  }

  function plural(count, one, few, many) {
    const last = count % 10, teen = count % 100 >= 11 && count % 100 <= 14;
    return !teen && last === 1 ? one : !teen && last >= 2 && last <= 4 ? few : many;
  }
});
