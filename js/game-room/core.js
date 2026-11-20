// Game room core (game.html): game catalog from data/games.json, hash routing (#play/<id>?mode=...),
// a shared player (toolbar, HUD, overlays), sound, local records and the leaderboard API (api_games.php).
// A game registers an engine: GameRoom.register('maze', { create(api), preview(canvas) }) — see README.
(() => {
  const engines = {};
  const loading = {};
  const GameRoom = {
    register(engine, definition) { engines[engine] = definition; },
    debug: {}
  };
  window.GameRoom = GameRoom;

  const ICONS = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    restart: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    soundOn: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    soundOff: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
    fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>'
  };
  const icon = (name) => `<svg aria-hidden="true" viewBox="0 0 24 24">${ICONS[name]}</svg>`;

  document.addEventListener('DOMContentLoaded', init);

  const state = { games: [], byId: {}, auth: null, current: null, fromCatalog: false, board: null };
  let els = {};

  async function init() {
    els = {
      grid: document.getElementById('gameGrid'),
      filters: document.getElementById('gameFilters'),
      player: document.getElementById('player'),
      title: document.getElementById('playerTitle'),
      hud: document.getElementById('playerHud'),
      stage: document.getElementById('playerStage'),
      touch: document.getElementById('playerTouch'),
      overlay: document.getElementById('playerOverlay'),
      tabs: document.getElementById('leaderboardTabs'),
      list: document.getElementById('leaderboardList'),
      note: document.getElementById('leaderboardNote')
    };
    if (!els.grid || !els.player) return;
    setupToolbar();

    try {
      const response = await fetch('data/games.json', { cache: 'no-cache', headers: { Accept: 'application/json' } });
      const manifest = await response.json();
      state.games = (manifest.games || []).filter((game) => /^[a-z0-9-]{1,40}$/.test(game.id || '') && /^[a-z0-9-]+$/.test(game.engine || ''));
      state.games.forEach((game) => { state.byId[game.id] = game; });
    } catch (error) {
      console.error('Ігрова кімната:', error);
      els.grid.replaceChildren(message('Не вдалося завантажити список ігор. Оновіть сторінку.'));
      return;
    }

    state.auth = await (window.HorrorHub?.status().catch(() => null) ?? null);
    renderCatalog();
    renderBoardTabs();
    syncProgress();

    window.addEventListener('hashchange', route);
    window.addEventListener('blur', autoPause);
    document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
    document.addEventListener('keydown', handleKey);
    route();
  }

  /* ---------- Catalog ---------- */

  function renderCatalog() {
    const fragment = document.createDocumentFragment();
    state.games.forEach((game) => fragment.appendChild(createCard(game)));
    els.grid.replaceChildren(fragment);
    renderFilters();
  }

  function createCard(game) {
    const card = document.createElement('article');
    card.className = 'game-card';
    card.dataset.game = game.id;
    card.dataset.kind = game.kind || '';

    const media = document.createElement('div');
    media.className = 'game-card__media';
    if (game.preview) {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 300;
      canvas.className = 'game-card__preview';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `Прев'ю: ${game.title}`);
      media.appendChild(canvas);
      loadEngine(game).then((engine) => engine.preview?.(canvas)).catch(() => {});
    } else if (game.cover) {
      const img = document.createElement('img');
      img.src = game.cover;
      img.alt = game.coverAlt || '';
      img.loading = 'lazy';
      media.appendChild(img);
    }

    const body = document.createElement('div');
    body.className = 'game-card__body';
    const meta = document.createElement('p');
    meta.className = 'game-card__meta';
    meta.textContent = [game.kind, game.duration].filter(Boolean).join(' · ');
    const title = document.createElement('h3');
    title.className = 'game-card__title';
    title.textContent = game.title;
    const text = document.createElement('p');
    text.className = 'game-card__text';
    text.textContent = game.tagline || '';
    body.append(meta, title, text);

    const modes = game.modes || [];
    let mode = local(game.id).get('mode');
    if (!modes.some((item) => item.id === mode)) mode = modes[0]?.id || '';
    const stat = document.createElement('p');
    stat.className = 'game-card__stat';
    const actions = document.createElement('div');
    actions.className = 'game-card__actions';
    const play = document.createElement('a');
    play.className = 'btn btn--primary';
    play.dataset.play = game.id;
    play.textContent = 'Грати';
    play.addEventListener('click', () => { state.fromCatalog = true; });

    if (modes.length) {
      const group = document.createElement('div');
      group.className = 'game-card__modes';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', 'Складність');
      modes.forEach((item) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.textContent = item.label;
        chip.dataset.mode = item.id;
        chip.addEventListener('click', () => {
          mode = item.id;
          local(game.id).set('mode', mode);
          update();
        });
        group.appendChild(chip);
      });
      body.appendChild(group);
    }
    body.append(stat, actions);
    actions.appendChild(play);

    let resume = null;
    if (game.engine === 'quest') {
      const save = local(game.id).get('save');
      if (save && save.scene) {
        resume = document.createElement('a');
        resume.className = 'btn';
        resume.href = `#play/${game.id}?resume=1`;
        resume.textContent = 'Продовжити';
        resume.addEventListener('click', () => { state.fromCatalog = true; });
        actions.appendChild(resume);
      }
    }

    function update() {
      play.href = `#play/${game.id}` + (mode ? `?mode=${encodeURIComponent(mode)}` : '');
      body.querySelectorAll('[data-mode]').forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.mode === mode)));
      stat.replaceChildren();
      if (game.leaderboard) {
        const best = local(game.id).get(`best:${mode || 'default'}`);
        const label = modes.find((item) => item.id === mode)?.label;
        stat.textContent = best ? `Ваш рекорд${label ? ` («${label}»)` : ''}: ${formatTime(best)}` : 'Рекорду ще немає — встановіть перший.';
      } else if (game.progress?.type === 'endings') {
        const found = (local(game.id).get('endings') || []).length;
        const total = local(game.id).get('endingsTotal');
        stat.textContent = total ? `Знайдено фіналів: ${found} з ${total}` : (found ? `Знайдено фіналів: ${found}` : 'Фінали ще не знайдено.');
      }
    }
    update();
    card.append(media, body);
    card.refresh = update;
    return card;
  }

  function refreshCards() {
    els.grid.querySelectorAll('.game-card').forEach((card) => {
      const game = state.byId[card.dataset.game];
      if (!game) return;
      card.replaceWith(createCard(game));
    });
    applyFilter(state.filter || '');
  }

  // Kind filters appear once the room has enough games to need them.
  function renderFilters() {
    if (!els.filters) return;
    const kinds = [...new Set(state.games.map((game) => game.kind).filter(Boolean))];
    if (state.games.length <= 4 || kinds.length < 2) {
      els.filters.replaceChildren();
      return;
    }
    const chips = ['', ...kinds].map((kind) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = kind || 'Усі';
      chip.setAttribute('aria-pressed', String(kind === (state.filter || '')));
      chip.addEventListener('click', () => {
        state.filter = kind;
        els.filters.querySelectorAll('.chip').forEach((other) => other.setAttribute('aria-pressed', String(other === chip)));
        applyFilter(kind);
      });
      return chip;
    });
    els.filters.replaceChildren(...chips);
  }

  function applyFilter(kind) {
    els.grid.querySelectorAll('.game-card').forEach((card) => { card.hidden = Boolean(kind) && card.dataset.kind !== kind; });
  }

  /* ---------- Leaderboard ---------- */

  function renderBoardTabs() {
    if (!els.tabs) return;
    const boards = [];
    state.games.filter((game) => game.leaderboard).forEach((game) => {
      const modes = game.modes?.length ? game.modes : [{ id: 'default', label: '' }];
      modes.forEach((mode) => boards.push({ game, mode: mode.id, label: [game.title, mode.label].filter(Boolean).join(' · ') }));
    });
    const section = document.getElementById('leaderboard');
    if (!boards.length) {
      if (section) section.hidden = true;
      return;
    }
    const tabs = boards.map((board, index) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'chip';
      tab.textContent = board.label;
      tab.setAttribute('aria-pressed', String(index === 0));
      tab.addEventListener('click', () => {
        els.tabs.querySelectorAll('.chip').forEach((other) => other.setAttribute('aria-pressed', String(other === tab)));
        loadBoard(board);
      });
      return tab;
    });
    els.tabs.replaceChildren(...tabs);
    loadBoard(boards[0]);
  }

  async function loadBoard(board) {
    state.board = board;
    els.list.setAttribute('aria-busy', 'true');
    try {
      const data = await window.HorrorHub.request(`api_games.php?action=top&game=${encodeURIComponent(board.game.id)}&mode=${encodeURIComponent(board.mode)}`);
      if (state.board !== board) return;
      const rows = (data.entries || []).map((entry) => {
        const item = document.createElement('li');
        item.className = 'leaderboard__row' + (entry.me ? ' is-me' : '');
        const rank = document.createElement('span');
        rank.className = 'leaderboard__rank';
        rank.textContent = String(entry.rank);
        const avatar = document.createElement('img');
        avatar.className = 'leaderboard__avatar';
        avatar.src = safeUrl(entry.avatar) || 'images/default_avatar.png';
        avatar.alt = '';
        avatar.loading = 'lazy';
        avatar.addEventListener('error', () => { avatar.src = 'images/default_avatar.png'; }, { once: true });
        const name = document.createElement('span');
        name.className = 'leaderboard__name';
        name.textContent = entry.username + (entry.me ? ' (ви)' : '');
        const score = document.createElement('span');
        score.className = 'leaderboard__score';
        score.textContent = formatTime(entry.score_ms);
        item.append(rank, avatar, name, score);
        return item;
      });
      els.list.replaceChildren(...(rows.length ? rows : [emptyRow('Поки нікого немає. Станьте першим!')]));
      if (!data.logged_in) {
        setNote('Таблиця для зареєстрованих гравців. ', 'Увійдіть', ', щоб ваші результати потрапили сюди.');
      } else if (data.me) {
        setNote(`Ваш найкращий час: ${formatTime(data.me.score_ms)}, місце ${data.me.rank}.`);
      } else {
        setNote('Пройдіть цей режим, щоб потрапити до таблиці.');
      }
    } catch (error) {
      els.list.replaceChildren(emptyRow('Таблиця лідерів тимчасово недоступна.'));
      setNote('');
    } finally {
      els.list.setAttribute('aria-busy', 'false');
    }
  }

  function setNote(before, linkText = '', after = '') {
    if (!els.note) return;
    els.note.replaceChildren(document.createTextNode(before));
    if (linkText) {
      const link = document.createElement('a');
      link.href = 'login.html';
      link.className = 'inline-link';
      link.textContent = linkText;
      els.note.append(link, document.createTextNode(after));
    }
  }

  function emptyRow(text) {
    const item = document.createElement('li');
    item.className = 'leaderboard__empty';
    item.textContent = text;
    return item;
  }

  /* ---------- Progress sync (found quest endings) ---------- */

  async function syncProgress() {
    if (!state.auth?.logged_in) return;
    const games = state.games.filter((game) => game.progress?.type === 'endings');
    await Promise.all(games.map(async (game) => {
      try {
        const store = local(game.id);
        const mine = store.get('endings') || [];
        const data = await window.HorrorHub.request(`api_games.php?action=progress&game=${encodeURIComponent(game.id)}`);
        let endings = data.endings || [];
        if (mine.some((id) => !endings.includes(id))) {
          const saved = await window.HorrorHub.post('api_games.php', new URLSearchParams({ action: 'progress', game: game.id, endings: JSON.stringify(mine) }));
          endings = saved.endings || endings;
        }
        store.set('endings', [...new Set([...mine, ...endings])]);
        store.set('endingsTotal', data.total);
      } catch (error) { /* offline or no database: local progress stays */ }
    }));
    refreshCards();
  }

  /* ---------- Routing and the player ---------- */

  function parseHash() {
    const match = window.location.hash.match(/^#play\/([a-z0-9-]{1,40})(?:\?(.*))?$/);
    if (!match) return null;
    return { id: match[1], params: new URLSearchParams(match[2] || '') };
  }

  async function route() {
    const target = parseHash();
    const game = target && state.byId[target.id];
    if (!game) {
      closeGame();
      return;
    }
    if (state.current?.game === game && state.current.paramsKey === target.params.toString()) return;
    closeGame();
    await openGame(game, target.params);
  }

  async function openGame(game, params) {
    let engine;
    try {
      engine = await loadEngine(game);
    } catch (error) {
      console.error(error);
      els.grid.prepend(message(`Не вдалося завантажити гру «${game.title}».`));
      return;
    }
    const modes = game.modes || [];
    const mode = modes.some((item) => item.id === params.get('mode')) ? params.get('mode') : (modes[0]?.id || 'default');
    if (modes.length) local(game.id).set('mode', mode);

    document.body.classList.add('is-playing');
    els.player.hidden = false;
    els.title.textContent = game.title + (modes.length ? ` · ${modes.find((item) => item.id === mode)?.label}` : '');
    els.hud.replaceChildren();
    els.stage.replaceChildren();
    els.touch.replaceChildren();
    hideOverlay();

    const current = { game, mode, params, paramsKey: params.toString(), pausable: false, paused: false, run: null, finished: false };
    state.current = current;
    current.api = createApi(current);
    current.instance = engine.create(current.api);
    updateToolbar();
    window.scrollTo({ top: 0 });
    els.player.focus({ preventScroll: true });
    startRun(current);
    await current.instance.start?.();
  }

  function closeGame() {
    const current = state.current;
    if (!current) return;
    current.instance?.destroy?.();
    audio.stopAll();
    state.current = null;
    hideOverlay();
    els.player.hidden = true;
    document.body.classList.remove('is-playing');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    refreshCards();
    if (state.board) loadBoard(state.board);
  }

  function goToCatalog(scrollTo) {
    if (state.fromCatalog && parseHash()) {
      state.fromCatalog = false;
      window.history.back();
    } else {
      window.history.pushState('', document.title, window.location.pathname + window.location.search);
      route();
    }
    if (scrollTo) window.setTimeout(() => document.getElementById(scrollTo)?.scrollIntoView({ behavior: 'smooth' }), 80);
  }

  function restartGame() {
    const current = state.current;
    if (!current) return;
    hideOverlay();
    current.paused = false;
    current.finished = false;
    startRun(current);
    current.instance.restart?.();
    updateToolbar();
  }

  function setPaused(paused) {
    const current = state.current;
    if (!current || !current.pausable || current.finished || current.paused === paused) return;
    current.paused = paused;
    current.instance.setPaused?.(paused);
    if (paused) {
      audio.stopHeartbeat();
      audio.drone(false);
      showOverlay({ title: 'Пауза', text: 'Гра зупинена. Переслідувач теж чекає.', buttons: [{ label: 'Продовжити', primary: true, action: () => setPaused(false) }, { label: 'До ігор', action: () => goToCatalog() }] });
    } else {
      hideOverlay();
      audio.drone(true);
    }
    updateToolbar();
  }

  function autoPause() {
    if (state.current?.pausable && !state.current.finished) setPaused(true);
  }

  function setupToolbar() {
    els.player.querySelectorAll('[data-icon]').forEach((button) => {
      button.insertAdjacentHTML('afterbegin', icon(button.dataset.icon));
    });
    els.player.addEventListener('click', (event) => {
      const button = event.target.closest('[data-player]');
      if (!button) return;
      const action = button.dataset.player;
      if (action === 'menu') goToCatalog();
      if (action === 'restart') restartGame();
      if (action === 'pause') setPaused(!state.current?.paused);
      if (action === 'sound') { audio.setEnabled(!audio.enabled); updateToolbar(); }
      if (action === 'fullscreen') toggleFullscreen();
      if (action === 'help') showHelp();
    });
    document.addEventListener('fullscreenchange', updateToolbar);
  }

  function updateToolbar() {
    const current = state.current;
    const pause = els.player.querySelector('[data-player="pause"]');
    if (pause) {
      pause.hidden = !current?.pausable;
      const paused = Boolean(current?.paused);
      pause.setAttribute('aria-pressed', String(paused));
      pause.querySelector('svg')?.remove();
      pause.insertAdjacentHTML('afterbegin', icon(paused ? 'play' : 'pause'));
      pause.querySelector('span').textContent = paused ? 'Продовжити' : 'Пауза';
    }
    const sound = els.player.querySelector('[data-player="sound"]');
    if (sound) {
      sound.setAttribute('aria-pressed', String(audio.enabled));
      sound.querySelector('svg')?.remove();
      sound.insertAdjacentHTML('afterbegin', icon(audio.enabled ? 'soundOn' : 'soundOff'));
      sound.querySelector('span').textContent = audio.enabled ? 'Звук' : 'Без звуку';
    }
    const full = els.player.querySelector('[data-player="fullscreen"]');
    if (full) {
      full.hidden = !document.fullscreenEnabled;
      full.querySelector('span').textContent = document.fullscreenElement ? 'Звичайний екран' : 'На весь екран';
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else els.player.requestFullscreen?.().catch(() => {});
  }

  function showHelp() {
    const current = state.current;
    if (!current) return;
    const wasPaused = current.paused;
    if (current.pausable && !current.finished && !wasPaused) {
      current.paused = true;
      current.instance.setPaused?.(true);
      audio.stopHeartbeat();
      audio.drone(false);
      updateToolbar();
    }
    showOverlay({
      title: 'Як грати',
      lines: current.game.controls || [],
      buttons: [{ label: 'Зрозуміло', primary: true, action: () => {
        hideOverlay();
        if (current.pausable && !current.finished && !wasPaused) setPaused(false);
      } }]
    });
  }

  function handleKey(event) {
    if (!state.current) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === 'Escape' || ((event.key === 'p' || event.key === 'P' || event.key === 'з' || event.key === 'З') && state.current.pausable)) {
      if (!els.overlay.hidden && state.current.paused) { event.preventDefault(); setPaused(false); return; }
      if (state.current.pausable && !state.current.finished) { event.preventDefault(); setPaused(true); }
    }
  }

  function showOverlay({ title, text = '', lines = [], buttons = [], tone = '' }) {
    const box = document.createElement('div');
    box.className = 'player__dialog' + (tone ? ` is-${tone}` : '');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'false');
    box.setAttribute('aria-labelledby', 'playerDialogTitle');
    const heading = document.createElement('h3');
    heading.id = 'playerDialogTitle';
    heading.textContent = title;
    box.appendChild(heading);
    if (text) {
      const p = document.createElement('p');
      p.textContent = text;
      box.appendChild(p);
    }
    if (lines.length) {
      const list = document.createElement('ul');
      lines.forEach((line) => {
        const item = document.createElement('li');
        if (line instanceof Node) item.appendChild(line);
        else item.textContent = line;
        list.appendChild(item);
      });
      box.appendChild(list);
    }
    const actions = document.createElement('div');
    actions.className = 'player__dialog-actions';
    buttons.forEach((spec) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = spec.primary ? 'btn btn--primary' : 'btn';
      button.textContent = spec.label;
      button.addEventListener('click', spec.action);
      actions.appendChild(button);
    });
    box.appendChild(actions);
    els.overlay.replaceChildren(box);
    els.overlay.hidden = false;
    actions.querySelector('button')?.focus({ preventScroll: true });
  }

  function hideOverlay() {
    els.overlay.hidden = true;
    els.overlay.replaceChildren();
  }

  /* ---------- API given to a game ---------- */

  function createApi(current) {
    const { game, mode } = current;
    const store = local(game.id);
    return {
      game, mode, params: current.params,
      stage: els.stage, hud: els.hud, touch: els.touch,
      sound: audio,
      local: store,
      isPaused: () => current.paused,
      setPausable(value) { current.pausable = Boolean(value); updateToolbar(); },
      async loadData() {
        if (!/^data\/games\/[a-z0-9/_-]+\.json$/.test(game.data || '')) throw new Error('Немає даних гри');
        const response = await fetch(game.data, { cache: 'no-cache', headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      },
      expose(internals) { GameRoom.debug[game.engine] = internals; },
      finish: (result) => finishGame(current, result),
      exit: () => goToCatalog(),
      recordEnding: (id, total) => recordEnding(game, id, total),
      endings: () => store.get('endings') || []
    };
  }

  async function finishGame(current, { won, scoreMs, title, text }) {
    if (state.current !== current || current.finished) return;
    current.finished = true;
    audio.stopHeartbeat();
    audio.drone(false);
    if (won) audio.chime(); else audio.jumpscare();
    updateToolbar();

    const lines = [];
    const buttons = [{ label: 'Ще раз', primary: true, action: restartGame }];
    const board = current.game.leaderboard;
    if (won && board && Number.isFinite(scoreMs)) {
      const store = local(current.game.id);
      const key = `best:${current.mode}`;
      const previous = store.get(key);
      const better = !previous || (board.order === 'desc' ? scoreMs > previous : scoreMs < previous);
      if (better) store.set(key, scoreMs);
      lines.push(`Час: ${formatTime(scoreMs)}`);
      lines.push(better && previous ? `Новий особистий рекорд! Попередній: ${formatTime(previous)}` : `Особистий рекорд: ${formatTime(better ? scoreMs : previous)}`);
      if (state.auth?.logged_in) {
        const result = await submitRun(current, scoreMs);
        if (result?.rank) lines.push(`Місце в таблиці лідерів: ${result.rank}`);
        else if (result?.error) lines.push(result.error);
      } else {
        const hint = document.createElement('span');
        const link = document.createElement('a');
        link.href = 'login.html';
        link.className = 'inline-link';
        link.textContent = 'Увійдіть';
        hint.append(link, document.createTextNode(', щоб потрапити до таблиці лідерів.'));
        lines.push(hint);
      }
      buttons.push({ label: 'Таблиця лідерів', action: () => goToCatalog('leaderboard') });
    } else {
      buttons.push({ label: 'До ігор', action: () => goToCatalog() });
    }
    if (state.current !== current) return;
    showOverlay({ title, text, lines, buttons, tone: won ? 'good' : 'bad' });
  }

  function startRun(current) {
    current.run = null;
    if (!current.game.leaderboard || !state.auth?.logged_in) return;
    current.run = window.HorrorHub.post('api_games.php', new URLSearchParams({ action: 'start', game: current.game.id, mode: current.mode }))
      .then((data) => data.token)
      .catch(() => null);
  }

  async function submitRun(current, scoreMs) {
    const token = await current.run;
    current.run = null;
    if (!token) return { error: 'Результат не вдалося записати до таблиці лідерів.' };
    try {
      return await window.HorrorHub.post('api_games.php', new URLSearchParams({ action: 'finish', token, score_ms: String(Math.round(scoreMs)) }));
    } catch (error) {
      return { error: error.message };
    }
  }

  async function recordEnding(game, id, total) {
    const store = local(game.id);
    const found = store.get('endings') || [];
    const isNew = !found.includes(id);
    let endings = isNew ? [...found, id] : found;
    store.set('endings', endings);
    if (total) store.set('endingsTotal', total);
    if (state.auth?.logged_in && isNew) {
      try {
        const data = await window.HorrorHub.post('api_games.php', new URLSearchParams({ action: 'progress', game: game.id, endings: JSON.stringify(endings) }));
        endings = [...new Set([...endings, ...(data.endings || [])])];
        store.set('endings', endings);
      } catch (error) { /* kept locally, synced on the next visit */ }
    }
    return { endings, isNew, total };
  }

  /* ---------- Services ---------- */

  function loadEngine(game) {
    if (engines[game.engine]) return Promise.resolve(engines[game.engine]);
    if (!/^js\/game-room\/games\/[a-z0-9-]+\.js$/.test(game.script || '')) return Promise.reject(new Error('Некоректний скрипт гри'));
    loading[game.script] ||= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = game.script + '?v=20261120-room';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Не завантажився ${game.script}`));
      document.head.appendChild(script);
    });
    return loading[game.script].then(() => {
      if (!engines[game.engine]) throw new Error(`Скрипт не зареєстрував рушій «${game.engine}»`);
      return engines[game.engine];
    });
  }

  function local(gameId) {
    const prefix = `hh-game:${gameId}:`;
    return {
      get(key) {
        try { return JSON.parse(localStorage.getItem(prefix + key)); } catch (error) { return null; }
      },
      set(key, value) {
        try { localStorage.setItem(prefix + key, JSON.stringify(value)); } catch (error) { /* storage blocked */ }
      },
      remove(key) {
        try { localStorage.removeItem(prefix + key); } catch (error) { /* storage blocked */ }
      }
    };
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.round(Number(ms) / 100));
    const minutes = Math.floor(total / 600);
    const seconds = Math.floor((total % 600) / 10);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${total % 10}`;
  }
  GameRoom.formatTime = formatTime;

  function safeUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch (error) { return ''; }
  }

  function message(text) {
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = text;
    return p;
  }

  // Web Audio: a low drone, heartbeat near danger, a noise burst for jumpscares and a chime for wins.
  const audio = (() => {
    let enabled = (() => { try { return localStorage.getItem('hh-sound') !== 'off'; } catch (error) { return true; } })();
    let ctx = null;
    let master = null;
    let droneOsc = null;
    let droneGain = null;
    let droneWanted = false;
    let heartbeatTimer = 0;
    let heartbeatSpeed = 700;

    function init() {
      if (!enabled) return false;
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return false;
      try {
        if (!ctx) {
          ctx = new Audio();
          master = ctx.createGain();
          master.gain.setValueAtTime(0.55, ctx.currentTime);
          master.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        return true;
      } catch (error) {
        return false;
      }
    }

    function stopDrone() {
      if (droneOsc) {
        try { droneOsc.stop(); } catch (error) { /* already stopped */ }
        droneOsc.disconnect();
        droneOsc = null;
      }
      if (droneGain) {
        droneGain.disconnect();
        droneGain = null;
      }
    }

    function drone(on) {
      droneWanted = on;
      stopDrone();
      if (!on || !init()) return;
      droneOsc = ctx.createOscillator();
      droneGain = ctx.createGain();
      droneOsc.type = 'sine';
      droneOsc.frequency.setValueAtTime(42, ctx.currentTime);
      droneGain.gain.setValueAtTime(0.08, ctx.currentTime);
      droneOsc.connect(droneGain);
      droneGain.connect(master);
      droneOsc.start();
    }

    function heartbeat(speed = 700) {
      heartbeatSpeed = speed;
      if (!enabled || heartbeatTimer || !init()) return;
      const pulse = () => {
        if (!enabled || !ctx) { stopHeartbeat(); return; }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(34, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(18, ctx.currentTime + 0.11);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.42, ctx.currentTime + 0.035);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.18);
        osc.connect(gain);
        gain.connect(master);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
        heartbeatTimer = window.setTimeout(pulse, heartbeatSpeed);
      };
      pulse();
    }

    function stopHeartbeat() {
      window.clearTimeout(heartbeatTimer);
      heartbeatTimer = 0;
    }

    function jumpscare() {
      if (!init()) return;
      const size = ctx.sampleRate * 0.7;
      const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < size; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
      const noise = ctx.createBufferSource();
      const gain = ctx.createGain();
      noise.buffer = buffer;
      gain.gain.setValueAtTime(0.58, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.55);
      noise.connect(gain);
      gain.connect(master);
      noise.start();
      noise.onended = () => { noise.disconnect(); gain.disconnect(); };
    }

    function tones(frequencies, step = 0.08, volume = 0.16) {
      if (!init()) return;
      frequencies.forEach((frequency, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + index * step;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(volume, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.01, start + 0.42);
        osc.connect(gain);
        gain.connect(master);
        osc.start(start);
        osc.stop(start + 0.45);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });
    }

    return {
      get enabled() { return enabled; },
      setEnabled(value) {
        enabled = value;
        try { localStorage.setItem('hh-sound', value ? 'on' : 'off'); } catch (error) { /* storage blocked */ }
        if (!value) { stopDrone(); stopHeartbeat(); } else if (droneWanted) drone(true);
      },
      init, drone, heartbeat, stopHeartbeat, jumpscare,
      chime: () => tones([392, 523.25, 659.25]),
      pickup: () => tones([659.25, 880], 0.06, 0.1),
      stopAll() { droneWanted = false; stopDrone(); stopHeartbeat(); }
    };
  })();
})();
