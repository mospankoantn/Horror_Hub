// «Темний лабіринт» — engine "maze" for the game room (js/game-room/core.js).
(() => {
  const TILE = 40;
  const COLS = 15;
  const ROWS = 10;
  const MODES = {
    normal: { enemySpeed: 1.05, batteryDrain: 0.0008, torchRadius: 3.25, batteries: 3 },
    hard: { enemySpeed: 1.35, batteryDrain: 0.00125, torchRadius: 2.75, batteries: 2 },
    nightmare: { enemySpeed: 1.6, batteryDrain: 0.0016, torchRadius: 2.35, batteries: 2 }
  };
  const PLAYER_SPEED = 3.4;
  const SPRINT = { speed: 1.6, drain: 2, noiseMs: 2000, enemyBoost: 1.25 };
  const BATTERY_CHARGE = 35;
  const START = { col: 1, row: 1 };
  const EXIT = { col: COLS - 2, row: ROWS - 3 };
  const ENEMY = { col: COLS - 2, row: 1 };

  window.GameRoom.register('maze', { create, preview: drawPreview });

  function create(api) {
    const settings = MODES[api.mode] || MODES.normal;
    const ui = buildUi(api);
    const ctx = ui.canvas.getContext('2d');
    let state = null;
    let frame = 0;
    let lastFrame = 0;
    let keys = {};
    let drag = null;
    let sprintTouch = false;
    let toastTimer = 0;

    api.setPausable(true);
    api.expose({
      generateMaze,
      findPath: (start, goal) => findPath(state.maze, start, goal),
      updateEnemy,
      updateBattery,
      collectBatteries,
      startMazeGame: restart,
      get state() { return state; },
      mute() { api.sound.setEnabled(false); }
    });

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInput);
    bindTouch();

    return { start: restart, restart, setPaused, destroy };

    function restart() {
      cancelAnimationFrame(frame);
      clearInput();
      const maze = generateMaze();
      state = {
        maze,
        activeMs: 0,
        paused: false,
        battery: 100,
        won: false,
        lost: false,
        noiseUntil: 0,
        sprinting: false,
        player: cellCenter(START.col, START.row, 10),
        enemy: cellCenter(ENEMY.col, ENEMY.row, 12),
        exit: cellCenter(EXIT.col, EXIT.row, 12),
        batteries: placeBatteries(maze, settings.batteries),
        waypoint: null
      };
      api.sound.drone(true);
      updateHud();
      draw();
      lastFrame = performance.now();
      frame = requestAnimationFrame(loop);
    }

    function setPaused(paused) {
      if (!state || state.won || state.lost) return;
      state.paused = paused;
      clearInput();
      lastFrame = performance.now();
      ui.root.classList.toggle('is-paused', paused);
    }

    function destroy() {
      cancelAnimationFrame(frame);
      window.clearTimeout(toastTimer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInput);
      state = null;
    }

    function loop(timestamp) {
      if (!state || state.won || state.lost) return;
      const delta = Math.min(timestamp - lastFrame, 40);
      lastFrame = timestamp;
      if (!state.paused) {
        state.activeMs += delta;
        updatePlayer(delta);
        updateEnemy(delta);
        updateBattery(delta);
        collectBatteries();
        updateHud();
        draw();
        checkOutcome();
      }
      if (state && !state.won && !state.lost) frame = requestAnimationFrame(loop);
    }

    /* ---------- Simulation ---------- */

    function updatePlayer(delta) {
      let dx = 0;
      let dy = 0;
      if (keys.ArrowUp || keys.KeyW) dy -= 1;
      if (keys.ArrowDown || keys.KeyS) dy += 1;
      if (keys.ArrowLeft || keys.KeyA) dx -= 1;
      if (keys.ArrowRight || keys.KeyD) dx += 1;
      if (drag?.active) {
        dx += drag.x;
        dy += drag.y;
      }
      const length = Math.hypot(dx, dy);
      const moving = length > 0.01;
      state.sprinting = moving && Boolean(keys.ShiftLeft || keys.ShiftRight || sprintTouch);
      if (!moving) return;
      if (state.sprinting) state.noiseUntil = state.activeMs + SPRINT.noiseMs;
      const speed = PLAYER_SPEED * (state.sprinting ? SPRINT.speed : 1) * (delta / 16.67);
      moveCircle(state.player, (dx / length) * speed, (dy / length) * speed, 10);
    }

    function updateEnemy(delta) {
      const { enemy, player } = state;
      const distance = getDistance(enemy, player);
      if (distance < TILE * 4.2) api.sound.heartbeat(Math.max(180, distance * 2.4));
      else api.sound.stopHeartbeat();

      // Finish each corridor segment before choosing the next turn.
      if (!state.waypoint || getDistance(enemy, state.waypoint) < 0.1) {
        const next = findPath(state.maze, pointToCell(enemy), pointToCell(player))[1];
        state.waypoint = next ? cellCenter(next.col, next.row, enemy.radius) : null;
      }
      const target = state.waypoint || player;
      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const length = Math.hypot(dx, dy) || 1;
      const boost = state.activeMs < state.noiseUntil ? SPRINT.enemyBoost : 1;
      const speed = Math.min(length, settings.enemySpeed * boost * (delta / 16.67));
      moveCircle(enemy, (dx / length) * speed, (dy / length) * speed, enemy.radius);
    }

    function updateBattery(delta) {
      const drain = settings.batteryDrain * (state.sprinting ? SPRINT.drain : 1);
      state.battery = Math.max(0, state.battery - drain * delta);
    }

    function collectBatteries() {
      state.batteries = state.batteries.filter((battery) => {
        if (getDistance(state.player, battery) >= 18) return true;
        state.battery = Math.min(100, state.battery + BATTERY_CHARGE);
        api.sound.pickup();
        toast(`Батарейка: +${BATTERY_CHARGE}% заряду`);
        return false;
      });
    }

    function checkOutcome() {
      if (getDistance(state.player, state.exit) < 18) {
        state.won = true;
        end(true, 'Ви вибралися', `Ліхтар: ${Math.round(state.battery)}%.`);
      } else if (getDistance(state.player, state.enemy) < 20) {
        state.lost = true;
        end(false, 'Вас наздогнали', 'Темрява була швидшою цього разу.');
      } else if (state.battery <= 0) {
        state.lost = true;
        end(false, 'Ліхтар згас', 'Останній промінь потонув у коридорі.');
      }
    }

    function end(won, title, text) {
      cancelAnimationFrame(frame);
      clearInput();
      draw();
      api.finish({ won, scoreMs: Math.round(state.activeMs), title, text });
    }

    function moveCircle(entity, dx, dy, radius) {
      if (!isWall(entity.x + dx, entity.y, radius)) entity.x += dx;
      if (!isWall(entity.x, entity.y + dy, radius)) entity.y += dy;
    }

    function isWall(x, y, radius = 0) {
      return [[x - radius, y - radius], [x + radius, y - radius], [x - radius, y + radius], [x + radius, y + radius], [x, y]]
        .some(([px, py]) => {
          const col = Math.floor(px / TILE);
          const row = Math.floor(py / TILE);
          return col < 0 || col >= COLS || row < 0 || row >= ROWS || state.maze[row][col] === 1;
        });
    }

    /* ---------- HUD and drawing ---------- */

    function updateHud() {
      ui.timer.textContent = window.GameRoom.formatTime(state.activeMs);
      const charge = Math.round(state.battery);
      ui.battery.textContent = `${charge}%`;
      ui.batteryFill.style.width = `${charge}%`;
      ui.batteryMeter.setAttribute('aria-valuenow', String(charge));
      ui.batteryMeter.classList.toggle('is-low', charge <= 25);
      const cells = Math.max(0, Math.round(getDistance(state.player, state.enemy) / TILE));
      ui.distance.textContent = `${cells <= 3 ? 'поруч' : cells <= 6 ? 'близько' : 'далеко'} · ${cells}`;
      ui.distanceItem.classList.toggle('is-danger', cells <= 3);
      ui.noise.hidden = state.activeMs >= state.noiseUntil;
    }

    function toast(text) {
      ui.toast.textContent = text;
      ui.toast.hidden = false;
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => { ui.toast.hidden = true; }, 1600);
    }

    function draw() {
      if (!state) return;
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height);
      for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          const x = col * TILE;
          const y = row * TILE;
          if (state.maze[row][col] === 1) {
            ctx.fillStyle = (row + col) % 2 === 0 ? '#202020' : '#181818';
            ctx.fillRect(x, y, TILE, TILE);
            ctx.strokeStyle = 'rgba(80, 0, 0, 0.22)';
            ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
          } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.018)';
            ctx.fillRect(x, y, TILE, TILE);
          }
        }
      }
      drawExit();
      state.batteries.forEach(drawBattery);
      drawEnemy();
      drawPlayer();
      drawDarkness();
    }

    function drawExit() {
      const { x, y } = state.exit;
      ctx.save();
      ctx.shadowColor = '#79ff8a';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#4ee66a';
      ctx.fillRect(x - 13, y - 13, 26, 26);
      ctx.fillStyle = '#071007';
      ctx.fillRect(x - 7, y - 7, 14, 14);
      ctx.restore();
    }

    function drawBattery({ x, y }) {
      const pulse = 0.75 + Math.sin(performance.now() / 260) * 0.25;
      ctx.save();
      ctx.shadowColor = '#ffd75a';
      ctx.shadowBlur = 12 * pulse;
      ctx.fillStyle = '#e8c547';
      ctx.fillRect(x - 6, y - 9, 12, 18);
      ctx.fillStyle = '#3a3010';
      ctx.fillRect(x - 3, y - 12, 6, 3);
      ctx.fillRect(x - 4, y - 5, 8, 2);
      ctx.restore();
    }

    function drawPlayer() {
      const { x, y } = state.player;
      ctx.save();
      ctx.shadowColor = '#f03030';
      ctx.shadowBlur = state.sprinting ? 26 : 16;
      ctx.fillStyle = '#ff3333';
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawEnemy() {
      const { x, y } = state.enemy;
      ctx.save();
      ctx.shadowColor = '#9b65ff';
      ctx.shadowBlur = state.activeMs < state.noiseUntil ? 28 : 18;
      ctx.fillStyle = '#5b2a83';
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f5f0ff';
      ctx.beginPath();
      ctx.arc(x - 4, y - 3, 2, 0, Math.PI * 2);
      ctx.arc(x + 4, y - 3, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawDarkness() {
      const { x, y } = state.player;
      const flicker = Math.sin(performance.now() / 85) * 5 + Math.random() * 4;
      const radius = Math.max(TILE * settings.torchRadius * (0.55 + state.battery / 220) + flicker, TILE * 1.15);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, ui.canvas.width, ui.canvas.height);
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.965)';
      ctx.fill('evenodd');
      const gradient = ctx.createRadialGradient(x, y, radius * 0.36, x, y, radius);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.42)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0.9)');
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.restore();
    }

    /* ---------- Input ---------- */

    const MOVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft', 'ShiftRight'];

    function onKeyDown(event) {
      if (!state || state.paused || state.won || state.lost) return;
      if (event.target.closest?.('input, textarea, select, [contenteditable="true"], .player__dialog')) return;
      if (!MOVE_KEYS.includes(event.code)) return;
      keys[event.code] = true;
      event.preventDefault();
    }

    function onKeyUp(event) {
      keys[event.code] = false;
    }

    function clearInput() {
      keys = {};
      sprintTouch = false;
      if (drag) drag.active = false;
    }

    function bindTouch() {
      ui.touch.querySelectorAll('[data-key]').forEach((button) => {
        const key = button.dataset.key;
        const release = () => { keys[key] = false; };
        button.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          if (!state || state.paused) return;
          keys[key] = true;
          button.setPointerCapture?.(event.pointerId);
        });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => button.addEventListener(type, release));
      });
      const sprint = ui.touch.querySelector('[data-sprint]');
      sprint?.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        sprintTouch = true;
        sprint.setPointerCapture?.(event.pointerId);
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => sprint?.addEventListener(type, () => { sprintTouch = false; }));

      // Drag on the field to steer: the direction from the touch point is the direction of movement.
      ui.canvas.addEventListener('pointerdown', (event) => {
        if (!state || state.paused) return;
        drag = { active: true, originX: event.clientX, originY: event.clientY, x: 0, y: 0 };
        ui.canvas.setPointerCapture?.(event.pointerId);
      });
      ui.canvas.addEventListener('pointermove', (event) => {
        if (!drag?.active) return;
        const dx = event.clientX - drag.originX;
        const dy = event.clientY - drag.originY;
        const length = Math.hypot(dx, dy);
        if (length < 14) { drag.x = 0; drag.y = 0; return; }
        drag.x = dx / length;
        drag.y = dy / length;
      });
      ['pointerup', 'pointercancel'].forEach((type) => ui.canvas.addEventListener(type, () => { if (drag) drag.active = false; }));
    }
  }

  /* ---------- DOM ---------- */

  function buildUi(api) {
    const item = (label, valueId, extraClass = '') => {
      const wrap = document.createElement('div');
      wrap.className = 'hud-item' + extraClass;
      const name = document.createElement('span');
      name.className = 'hud-item__label';
      name.textContent = label;
      const value = document.createElement('span');
      value.className = 'hud-item__value';
      value.id = valueId;
      wrap.append(name, value);
      return { wrap, value };
    };
    const timer = item('Час', 'mazeTimer');
    const battery = item('Ліхтар', 'mazeBattery', ' hud-item--meter');
    const meter = document.createElement('span');
    meter.className = 'meter';
    meter.setAttribute('role', 'meter');
    meter.setAttribute('aria-label', 'Заряд ліхтаря');
    meter.setAttribute('aria-valuemin', '0');
    meter.setAttribute('aria-valuemax', '100');
    const fill = document.createElement('span');
    fill.className = 'meter__fill';
    meter.appendChild(fill);
    battery.wrap.insertBefore(meter, battery.value);
    const distance = item('Переслідувач', 'mazeDistance');
    const noise = document.createElement('div');
    noise.className = 'hud-item hud-item--alert';
    noise.textContent = 'Шум! Переслідувач прискорився';
    noise.hidden = true;
    const toast = document.createElement('div');
    toast.className = 'hud-item hud-item--toast';
    toast.setAttribute('role', 'status');
    toast.hidden = true;
    api.hud.replaceChildren(timer.wrap, battery.wrap, distance.wrap, noise, toast);

    const root = document.createElement('div');
    root.className = 'maze-stage';
    const canvas = document.createElement('canvas');
    canvas.id = 'mazeCanvas';
    canvas.width = COLS * TILE;
    canvas.height = ROWS * TILE;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Лабіринт: червона точка — ви, фіолетова — переслідувач, зелений квадрат — вихід');
    root.appendChild(canvas);
    api.stage.replaceChildren(root);

    const pad = document.createElement('div');
    pad.className = 'dpad';
    pad.setAttribute('aria-label', 'Керування');
    [['btn-up', 'ArrowUp', 'Вгору', 'M12 5l7 9H5z'], ['btn-left', 'ArrowLeft', 'Ліворуч', 'M5 12l9-7v14z'],
      ['btn-down', 'ArrowDown', 'Вниз', 'M12 19l7-9H5z'], ['btn-right', 'ArrowRight', 'Праворуч', 'M19 12l-9-7v14z']]
      .forEach(([id, key, label, path]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dpad__btn';
        button.id = id;
        button.dataset.key = key;
        button.setAttribute('aria-label', label);
        button.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${path}"/></svg>`;
        pad.appendChild(button);
      });
    const sprint = document.createElement('button');
    sprint.type = 'button';
    sprint.className = 'sprint-btn';
    sprint.dataset.sprint = '';
    sprint.textContent = 'Ривок';
    api.touch.replaceChildren(pad, sprint);

    return {
      root, canvas, touch: api.touch, timer: timer.value, battery: battery.value, batteryMeter: meter, batteryFill: fill,
      distance: distance.value, distanceItem: distance.wrap, noise, toast
    };
  }

  /* ---------- Maze ---------- */

  function generateMaze() {
    const maze = Array.from({ length: ROWS }, () => Array(COLS).fill(1));
    carve(1, 1);
    maze[START.row][START.col] = 0;
    maze[EXIT.row][EXIT.col] = 0;

    // A few loops, so the maze is not one narrow pipe.
    for (let i = 0; i < 12; i += 1) {
      const col = randomOdd(1, COLS - 2);
      const row = randomOdd(1, ROWS - 3);
      const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)];
      const nextCol = col + dx * 2;
      const nextRow = row + dy * 2;
      if (nextCol > 0 && nextCol < COLS - 1 && nextRow > 0 && nextRow < ROWS - 2 && maze[nextRow][nextCol] === 0) {
        maze[row + dy][col + dx] = 0;
      }
    }
    return maze;

    function carve(col, row) {
      maze[row][col] = 0;
      shuffle([[0, -2], [0, 2], [-2, 0], [2, 0]]).forEach(([dx, dy]) => {
        const nextCol = col + dx;
        const nextRow = row + dy;
        if (nextCol <= 0 || nextCol >= COLS - 1 || nextRow <= 0 || nextRow >= ROWS - 2) return;
        if (maze[nextRow][nextCol] === 0) return;
        maze[row + dy / 2][col + dx / 2] = 0;
        carve(nextCol, nextRow);
      });
    }
  }

  function placeBatteries(maze, count) {
    const reserved = [START, EXIT, ENEMY].map(cellKey);
    const candidates = [];
    maze.forEach((row, y) => row.forEach((cell, x) => {
      if (cell !== 0 || reserved.includes(cellKey({ col: x, row: y }))) return;
      const steps = findPath(maze, START, { col: x, row: y }).length - 1;
      if (steps >= 4) candidates.push({ col: x, row: y });
    }));
    return shuffle(candidates).slice(0, count).map((cell) => cellCenter(cell.col, cell.row, 8));
  }

  function findPath(maze, start, goal) {
    const queue = [start];
    const cameFrom = new Map([[cellKey(start), null]]);
    while (queue.length) {
      const current = queue.shift();
      if (current.col === goal.col && current.row === goal.row) break;
      [{ col: current.col + 1, row: current.row }, { col: current.col - 1, row: current.row },
        { col: current.col, row: current.row + 1 }, { col: current.col, row: current.row - 1 }]
        .filter((next) => next.col >= 0 && next.col < COLS && next.row >= 0 && next.row < ROWS && maze[next.row][next.col] === 0)
        .forEach((next) => {
          const key = cellKey(next);
          if (cameFrom.has(key)) return;
          cameFrom.set(key, current);
          queue.push(next);
        });
    }
    if (!cameFrom.has(cellKey(goal))) return [];
    const path = [];
    for (let current = goal; current; current = cameFrom.get(cellKey(current))) path.unshift(current);
    return path;
  }

  function drawPreview(canvas) {
    const preview = canvas.getContext('2d');
    if (!preview) return;
    const maze = generateMaze();
    const w = canvas.width / COLS;
    const h = canvas.height / ROWS;
    preview.fillStyle = '#080a0c';
    preview.fillRect(0, 0, canvas.width, canvas.height);
    maze.forEach((row, y) => row.forEach((wall, x) => {
      if (!wall) return;
      preview.fillStyle = (x + y) % 2 ? '#354044' : '#263135';
      preview.fillRect(x * w + 1, y * h + 1, w - 2, h - 2);
    }));
    const glow = preview.createRadialGradient(w * 1.5, h * 1.5, 4, w * 1.5, h * 1.5, w * 3.2);
    glow.addColorStop(0, 'rgba(255, 214, 140, 0.35)');
    glow.addColorStop(1, 'rgba(255, 214, 140, 0)');
    preview.fillStyle = glow;
    preview.fillRect(0, 0, canvas.width, canvas.height);
    preview.fillStyle = '#f16f6c';
    preview.beginPath();
    preview.arc(w * 1.5, h * 1.5, 7, 0, Math.PI * 2);
    preview.fill();
    preview.fillStyle = '#79cba4';
    preview.fillRect(w * (EXIT.col + 0.5) - 7, h * (EXIT.row + 0.5) - 7, 14, 14);
  }

  /* ---------- Helpers ---------- */

  function pointToCell(point) {
    return {
      col: Math.max(0, Math.min(COLS - 1, Math.floor(point.x / TILE))),
      row: Math.max(0, Math.min(ROWS - 1, Math.floor(point.y / TILE)))
    };
  }

  function cellCenter(col, row, radius = 0) {
    return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2, radius };
  }

  function cellKey(cell) {
    return `${cell.col}:${cell.row}`;
  }

  function getDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function randomOdd(min, max) {
    const values = [];
    for (let value = min; value <= max; value += 1) if (value % 2 === 1) values.push(value);
    return values[Math.floor(Math.random() * values.length)];
  }
})();
