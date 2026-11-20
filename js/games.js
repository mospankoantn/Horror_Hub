document.addEventListener('DOMContentLoaded', () => {
  const nodes = {
    selection: document.getElementById('game-selection'),
    textQuest: document.getElementById('text-quest-container'),
    maze: document.getElementById('maze-game-container'),
    story: document.getElementById('game-story'),
    choices: document.getElementById('game-choices'),
    questFear: document.getElementById('questFear'),
    questInventory: document.getElementById('questInventory'),
    canvas: document.getElementById('mazeCanvas'),
    timer: document.getElementById('mazeTimer'),
    battery: document.getElementById('mazeBattery'),
    distance: document.getElementById('mazeDistance'),
    result: document.getElementById('maze-result'),
    resultTitle: document.getElementById('maze-result-title'),
    resultText: document.getElementById('maze-result-text')
  };

  if (!nodes.selection || !nodes.textQuest || !nodes.maze || !nodes.canvas) return;

  const ctx = nodes.canvas.getContext('2d');
  const TILE = 40;
  const COLS = 15;
  const ROWS = 10;
  const DIFFICULTY = {
    normal: { enemySpeed: 1.05, batteryDrain: 0.0008, torchRadius: 3.25, label: 'Нормально' },
    hard: { enemySpeed: 1.35, batteryDrain: 0.00125, torchRadius: 2.75, label: 'Важко' }
  };

  let selectedDifficulty = 'normal';
  let soundEnabled = true;
  let audioCtx = null;
  let masterGain = null;
  let droneOscillator = null;
  let droneGain = null;
  let heartbeatTimer = 0;
  let heartbeatSpeed = 700;
  let finishTyping = null;

  let typingTimer = 0;
  let isTyping = false;
  let questState = createQuestState();

  let mazeState = null;
  let animationFrame = 0;
  let keyboardBound = false;
  let keys = {};
  let lastFrameTime = 0;

  const scenes = {
    start: {
      text: "Під дошками старого кінотеатру є підвал, якого немає на плані будівлі.\n\nТи спускаєшся туди з ліхтарем. За спиною самі собою замикаються двері.",
      choices: [
        { text: "Посвітити на шафу з реквізитом", next: "props" },
        { text: "Підійти до аварійного щитка", next: "panel" },
        { text: "Покликати когось у темряві", next: "call", fear: 1 }
      ]
    },
    props: {
      text: "У шафі лежать маски, зламаний мегафон і маленький ключ на червоній нитці. Ключ теплий, ніби його щойно тримали.",
      choices: [
        { text: "Взяти ключ", next: "take_key", addItem: "ключ" },
        { text: "Увімкнути мегафон", next: "megaphone", fear: 2 },
        { text: "Повернутися до сходів", next: "stairs" }
      ]
    },
    take_key: {
      text: "Ключ ховається в долоні. Десь за стіною коротко скрипить стілець, хоча тут немає кімнат.",
      choices: [
        { text: "Перевірити щиток", next: "panel" },
        { text: "Йти на звук", next: "backstage", fear: 1 }
      ]
    },
    megaphone: {
      text: "Мегафон хрипить твоїм же голосом, але на кілька секунд раніше. Він шепоче: «Не відкривай третю шафку».",
      choices: [
        { text: "Послухатися і відійти", next: "panel" },
        { text: "Відкрити третю шафку", next: "bad_locker", fear: 2 }
      ]
    },
    bad_locker: {
      text: "За дверцятами не темрява, а чужий коридор. Він тягнеться прямо всередину шафи. Ти робиш крок і втрачаєш підлогу.",
      ending: "ВИ ЗНИКЛИ В ДЕКОРАЦІЇ.",
      bad: true
    },
    panel: {
      text: "Щиток іскрить. На дверцятах подряпано: «Світло любить ціну». Поруч висить перегорілий запобіжник.",
      choices: [
        { text: "Поставити ключ у гніздо запобіжника", next: "lights", requireItem: "ключ", removeItem: "ключ", addItem: "запобіжник" },
        { text: "Смикнути дроти голими руками", next: "shock", fear: 2 },
        { text: "Оглянути підвал далі", next: "backstage" }
      ]
    },
    lights: {
      text: "Ключ плавиться і стає мідним запобіжником. Лампи блимають. Тепер видно двері з написом «Службовий вихід».",
      choices: [
        { text: "Йти до службового виходу", next: "exit_door" },
        { text: "Спершу зазирнути за сцену", next: "backstage" }
      ]
    },
    shock: {
      text: "Струм пробігає по руках. Ліхтар гасне на три довгі удари серця. Коли світло повертається, на підлозі лежить твоя свіжа тінь.",
      choices: [
        { text: "Відійти від щитка", next: "backstage" },
        { text: "Наступити на тінь", next: "shadow", fear: 2 }
      ]
    },
    call: {
      text: "Відповідь приходить одразу: «Я тут». Голос лунає з твого рюкзака. Замок на блискавці повільно повзе сам.",
      choices: [
        { text: "Різко відкинути рюкзак", next: "props" },
        { text: "Відкрити рюкзак", next: "bad_bag", fear: 2 }
      ]
    },
    bad_bag: {
      text: "У рюкзаку лежить записка твоїм почерком: «Я вже відкривав». Папір починає дихати.",
      ending: "ТЕМРЯВА ВИВЧИЛА ВАШ ПОЧЕРК.",
      bad: true
    },
    backstage: {
      text: "За сценою стоять ряди крісел, накритих пилом. Одне крісло чисте. На ньому лежить квиток на сьогоднішній сеанс.",
      choices: [
        { text: "Взяти квиток", next: "ticket", addItem: "квиток" },
        { text: "Не чіпати крісло", next: "exit_door" },
        { text: "Сісти на чисте крісло", next: "bad_seat", fear: 3 }
      ]
    },
    ticket: {
      text: "Квиток холодний і мокрий. На звороті написано: «Вихід відкриється після останнього кадру».",
      choices: [
        { text: "Підійти до службового виходу", next: "exit_door" },
        { text: "Повернутися до щитка", next: "panel" }
      ]
    },
    bad_seat: {
      text: "Спинка крісла клацає, як капкан. Екран у темряві спалахує білим. У титрах уже є твоє ім'я.",
      ending: "СЕАНС ПОЧАВСЯ БЕЗ ВАС.",
      bad: true
    },
    stairs: {
      text: "Сходи ведуть нагору, але кожна сходинка стає нижчою. Підвал не хоче відпускати тебе без обміну.",
      choices: [
        { text: "Повернутися до шафи", next: "props" },
        { text: "Бігти нагору", next: "bad_stairs", fear: 2 }
      ]
    },
    bad_stairs: {
      text: "Ти біжиш довго. Коли зупиняєшся, сходи все ще під тобою. Над головою висить табличка: «-1 поверх».",
      ending: "ВИ ЗАСТРЯГЛИ МІЖ ПОВЕРХАМИ.",
      bad: true
    },
    exit_door: {
      text: "Службові двері зачинені кодовим замком. Сканер підсвічує вузьку щілину для квитка.",
      choices: [
        { text: "Вставити квиток", next: "good_exit", requireItem: "квиток" },
        { text: "Виламати двері плечем", next: "bad_door", fear: 2 },
        { text: "Пошукати інший шлях", next: "backstage" }
      ]
    },
    shadow: {
      text: "Тінь прилипає до підошви. Тепер вона рухається першою, а ти повторюєш за нею.",
      ending: "ВАШЕ ТІЛО ВТРАТИЛО ПРАВО ГОЛОСУ.",
      bad: true
    },
    bad_door: {
      text: "Двері піддаються надто легко. За ними цегляна стіна, тепла від чиїхось долонь.",
      ending: "ВИХІД БУВ НАМАЛЬОВАНИЙ.",
      bad: true
    },
    good_exit: {
      text: "Сканер ковтає квиток. Двері відчиняються у провулок за кінотеатром. На афіші біля виходу твоя історія вже перекреслена червоним.",
      ending: "ВИ ВИБРАЛИСЯ.",
      good: true
    }
  };

  document.getElementById('select-text-quest')?.addEventListener('click', () => {
    initAudio();
    showTextQuest();
  });

  document.getElementById('select-maze-game')?.addEventListener('click', () => {
    initAudio();
    showMaze();
  });

  document.querySelectorAll('.difficulty-btn').forEach((button) => {
    button.addEventListener('click', () => {
      selectedDifficulty = button.dataset.difficulty || 'normal';
      document.querySelectorAll('.difficulty-btn').forEach((item) => {
        item.classList.toggle('is-active', item === button);
        item.setAttribute('aria-pressed', String(item === button));
      });
    });
  });

  document.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;

    const action = actionButton.dataset.action;
    if (action === 'menu') showGameSelection();
    if (action === 'restart-quest') startTextQuest();
    if (action === 'restart-maze') startMazeGame();
    if (action === 'sound') toggleSound();
    if (action === 'skip-text') finishTyping?.();
    if (action === 'pause-maze') setMazePaused(!mazeState?.paused);
  });

  bindMobileControls();
  updateSoundButtons();
  drawMazePreview();
  window.addEventListener('blur', () => {
    keys = {};
    if (mazeState && !mazeState.won && !mazeState.lost) setMazePaused(true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      keys = {};
      if (mazeState && !mazeState.won && !mazeState.lost) setMazePaused(true);
      stopDrone();
    }
  });

  window.showGameSelection = showGameSelection;

  function showGameSelection() {
    nodes.selection.hidden = false;
    nodes.textQuest.hidden = true;
    nodes.maze.hidden = true;
    stopTextTyping();
    stopMazeGame();
    stopDrone();
    stopHeartbeat();
    document.getElementById('select-text-quest')?.focus({ preventScroll: true });
  }

  function showTextQuest() {
    nodes.selection.hidden = true;
    nodes.textQuest.hidden = false;
    nodes.maze.hidden = true;
    stopMazeGame();
    startDrone();
    startTextQuest();
  }

  function showMaze() {
    nodes.selection.hidden = true;
    nodes.textQuest.hidden = true;
    nodes.maze.hidden = false;
    stopTextTyping();
    startDrone();
    startMazeGame();
  }

  function createQuestState() {
    return { fear: 0, inventory: new Set(), scene: 'start' };
  }

  function startTextQuest() {
    stopTextTyping();
    startDrone();
    questState = createQuestState();
    renderQuestHud();
    displayScene('start');
  }

  function displayScene(sceneId) {
    if (isTyping) return;

    const scene = scenes[sceneId];
    if (!scene) return;

    questState.scene = sceneId;
    nodes.choices.replaceChildren();
    nodes.story.textContent = '';
    renderQuestHud();
    typeText(scene.text, () => renderSceneChoices(scene));
  }

  function renderSceneChoices(scene) {
    if (scene.ending) {
      const ending = document.createElement('p');
      ending.className = scene.good ? 'quest-ending is-good' : 'quest-ending is-bad';
      ending.textContent = scene.ending;
      nodes.choices.appendChild(ending);

      const restart = document.createElement('button');
      restart.type = 'button';
      restart.textContent = '> Спробувати інший шлях';
      restart.addEventListener('click', startTextQuest);
      nodes.choices.appendChild(restart);

      if (scene.bad) playJumpscare();
      if (scene.good) playChime();
      return;
    }

    (scene.choices || []).forEach((choice) => {
      const hasRequiredItem = !choice.requireItem || questState.inventory.has(choice.requireItem);
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = hasRequiredItem ? `> ${choice.text}` : `> ${choice.text} [потрібно: ${choice.requireItem}]`;
      button.disabled = !hasRequiredItem;
      button.addEventListener('click', () => chooseQuestOption(choice));
      nodes.choices.appendChild(button);
    });
  }

  function chooseQuestOption(choice) {
    if (choice.fear) questState.fear += choice.fear;
    if (choice.addItem) questState.inventory.add(choice.addItem);
    if (choice.removeItem) questState.inventory.delete(choice.removeItem);

    if (questState.fear >= 7 && !choice.ignoreFear) {
      displayFearEnding();
      return;
    }

    displayScene(choice.next);
  }

  function displayFearEnding() {
    renderQuestHud();
    nodes.choices.replaceChildren();
    nodes.story.textContent = '';
    typeText('Страх стає густим, як вода. Ліхтар у руці більше не світить назовні. Він світить у тебе.', () => {
      const ending = document.createElement('p');
      ending.className = 'quest-ending is-bad';
      ending.textContent = 'ВИ НЕ ВИТРИМАЛИ ТИШУ.';
      nodes.choices.appendChild(ending);

      const restart = document.createElement('button');
      restart.type = 'button';
      restart.textContent = '> Почати знову';
      restart.addEventListener('click', startTextQuest);
      nodes.choices.appendChild(restart);
      playJumpscare();
    });
  }

  function renderQuestHud() {
    nodes.questFear.textContent = `Страх: ${questState.fear}`;
    const items = [...questState.inventory];
    nodes.questInventory.textContent = `Інвентар: ${items.length ? items.join(', ') : 'порожньо'}`;
  }

  function typeText(text, done) {
    stopTextTyping();
    isTyping = true;
    let index = 0;
    const skipButton = document.querySelector('[data-action="skip-text"]');
    if (skipButton) skipButton.disabled = false;
    finishTyping = () => {
      stopTextTyping();
      nodes.story.textContent = text;
      if (typeof done === 'function') done();
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finishTyping();
      return;
    }

    const tick = () => {
      nodes.story.textContent = text.slice(0, index);
      index += 1;

      if (index <= text.length) {
        typingTimer = window.setTimeout(tick, 18);
        return;
      }

      finishTyping?.();
    };

    tick();
  }

  function stopTextTyping() {
    window.clearTimeout(typingTimer);
    typingTimer = 0;
    isTyping = false;
    finishTyping = null;
    const skipButton = document.querySelector('[data-action="skip-text"]');
    if (skipButton) skipButton.disabled = true;
  }

  function startMazeGame() {
    const settings = DIFFICULTY[selectedDifficulty] || DIFFICULTY.normal;
    stopMazeGame();
    startDrone();
    hideMazeResult();
    keys = {};

    const maze = generateMaze();
    const startCell = { col: 1, row: 1 };
    const exitCell = { col: COLS - 2, row: ROWS - 3 };
    const enemyCell = { col: COLS - 2, row: 1 };

    mazeState = {
      maze,
      settings,
      activeMs: 0,
      paused: false,
      elapsed: 0,
      battery: 100,
      won: false,
      lost: false,
      player: cellCenter(startCell.col, startCell.row, 10),
      enemy: cellCenter(enemyCell.col, enemyCell.row, 12),
      exit: cellCenter(exitCell.col, exitCell.row, 12),
      path: [],
      waypoint: null
    };

    bindKeyboard();
    updatePauseButton();
    updateMazeHud();
    drawMaze();
    lastFrameTime = performance.now();
    animationFrame = requestAnimationFrame(loopMaze);
  }

  function stopMazeGame() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    mazeState = null;
    stopHeartbeat();
    unbindKeyboard();
  }

  function loopMaze(timestamp) {
    if (!mazeState || mazeState.won || mazeState.lost) return;

    const deltaMs = Math.min(timestamp - lastFrameTime, 40);
    lastFrameTime = timestamp;
    if (mazeState.paused) {
      animationFrame = requestAnimationFrame(loopMaze);
      return;
    }
    mazeState.activeMs += deltaMs;

    updatePlayer(deltaMs);
    updateEnemy(deltaMs);
    updateBattery(deltaMs);
    updateMazeHud();
    drawMaze();
    checkMazeOutcome();

    if (mazeState && !mazeState.won && !mazeState.lost) {
      animationFrame = requestAnimationFrame(loopMaze);
    }
  }

  function generateMaze() {
    const maze = Array.from({ length: ROWS }, () => Array(COLS).fill(1));
    const endRow = ROWS - 3;
    const endCol = COLS - 2;

    carve(1, 1);
    maze[1][1] = 0;
    maze[endRow][endCol] = 0;

    // Додаємо кілька петель, щоб лабіринт не був вузькою трубою.
    for (let i = 0; i < 12; i += 1) {
      const col = randomOdd(1, COLS - 2);
      const row = randomOdd(1, ROWS - 3);
      const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const [dx, dy] = neighbors[Math.floor(Math.random() * neighbors.length)];
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

  function updatePlayer(deltaMs) {
    const speed = 3.4 * (deltaMs / 16.67);
    let dx = 0;
    let dy = 0;

    if (keys.ArrowUp || keys.KeyW || keys.w || keys.W) dy -= speed;
    if (keys.ArrowDown || keys.KeyS || keys.s || keys.S) dy += speed;
    if (keys.ArrowLeft || keys.KeyA || keys.a || keys.A) dx -= speed;
    if (keys.ArrowRight || keys.KeyD || keys.d || keys.D) dx += speed;

    if (dx !== 0 && dy !== 0) {
      dx *= 0.707;
      dy *= 0.707;
    }

    moveCircle(mazeState.player, dx, dy, 10);
  }

  function updateEnemy(deltaMs) {
    const enemy = mazeState.enemy;
    const player = mazeState.player;
    const distance = getDistance(enemy, player);

    if (distance < TILE * 4.2) {
      playHeartbeat(Math.max(180, distance * 2.4));
    } else {
      stopHeartbeat();
    }

    // Finish each corridor segment before choosing the next turn.
    if (!mazeState.waypoint || getDistance(enemy, mazeState.waypoint) < 0.1) {
      const path = findPath(pointToCell(enemy), pointToCell(player));
      const nextCell = path[1];
      mazeState.waypoint = nextCell ? cellCenter(nextCell.col, nextCell.row, enemy.radius) : null;
    }
    const target = mazeState.waypoint || player;
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const length = Math.hypot(dx, dy) || 1;
    const speed = Math.min(length, mazeState.settings.enemySpeed * (deltaMs / 16.67));

    moveCircle(enemy, (dx / length) * speed, (dy / length) * speed, enemy.radius);
  }

  function updateBattery(deltaMs) {
    mazeState.battery = Math.max(0, mazeState.battery - mazeState.settings.batteryDrain * deltaMs);
  }

  function updateMazeHud() {
    if (!mazeState) return;

    mazeState.elapsed = Math.floor(mazeState.activeMs / 1000);
    const minutes = String(Math.floor(mazeState.elapsed / 60)).padStart(2, '0');
    const seconds = String(mazeState.elapsed % 60).padStart(2, '0');
    const distance = Math.max(0, Math.round(getDistance(mazeState.player, mazeState.enemy) / TILE));

    nodes.timer.textContent = `${minutes}:${seconds}`;
    nodes.battery.textContent = `Ліхтар: ${Math.round(mazeState.battery)}%`;
    nodes.distance.textContent = `Відстань: ${distance}`;
  }

  function checkMazeOutcome() {
    const player = mazeState.player;

    if (getDistance(player, mazeState.exit) < 18) {
      mazeState.won = true;
      playChime();
      showMazeResult('Ви вибралися', `Час: ${nodes.timer.textContent}. Ліхтар: ${Math.round(mazeState.battery)}%.`);
      return;
    }

    if (getDistance(player, mazeState.enemy) < 20) {
      mazeState.lost = true;
      playJumpscare();
      showMazeResult('Вас наздогнали', 'Темрява була швидшою цього разу.');
      return;
    }

    if (mazeState.battery <= 0) {
      mazeState.lost = true;
      playJumpscare();
      showMazeResult('Ліхтар згас', 'Останній промінь потонув у коридорі.');
    }
  }

  function showMazeResult(title, text) {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    stopHeartbeat();
    stopDrone();
    unbindKeyboard();
    nodes.resultTitle.textContent = title;
    nodes.resultText.textContent = text;
    nodes.result.hidden = false;
    nodes.result.querySelector('button')?.focus({ preventScroll: true });
  }

  function hideMazeResult() {
    nodes.result.hidden = true;
    nodes.resultTitle.textContent = '';
    nodes.resultText.textContent = '';
  }

  function drawMaze() {
    if (!mazeState) return;

    ctx.clearRect(0, 0, nodes.canvas.width, nodes.canvas.height);
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, nodes.canvas.width, nodes.canvas.height);

    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const x = col * TILE;
        const y = row * TILE;

        if (mazeState.maze[row][col] === 1) {
          const shade = ((row + col) % 2 === 0) ? '#202020' : '#181818';
          ctx.fillStyle = shade;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = 'rgba(80, 0, 0, 0.22)';
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.018)';
          ctx.fillRect(x, y, TILE, TILE);
        }
      }
    }

    drawExit();
    drawEnemy();
    drawPlayer();
    drawDarkness();
  }

  function drawExit() {
    const { x, y } = mazeState.exit;
    ctx.save();
    ctx.shadowColor = '#79ff8a';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#4ee66a';
    ctx.fillRect(x - 13, y - 13, 26, 26);
    ctx.fillStyle = '#071007';
    ctx.fillRect(x - 7, y - 7, 14, 14);
    ctx.restore();
  }

  function drawPlayer() {
    const { x, y } = mazeState.player;
    ctx.save();
    ctx.shadowColor = '#f03030';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#ff3333';
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEnemy() {
    const { x, y } = mazeState.enemy;
    ctx.save();
    ctx.shadowColor = '#9b65ff';
    ctx.shadowBlur = 18;
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
    const { x, y } = mazeState.player;
    const flicker = Math.sin(performance.now() / 85) * 5 + Math.random() * 4;
    const batteryFactor = 0.55 + mazeState.battery / 220;
    const radius = TILE * mazeState.settings.torchRadius * batteryFactor + flicker;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, nodes.canvas.width, nodes.canvas.height);
    ctx.moveTo(x + Math.max(radius, TILE * 1.15), y);
    ctx.arc(x, y, Math.max(radius, TILE * 1.15), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.965)';
    ctx.fill('evenodd');

    const gradient = ctx.createRadialGradient(x, y, radius * 0.36, x, y, radius);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.7, 'rgba(0,0,0,0.42)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
  }

  function moveCircle(entity, dx, dy, radius) {
    if (!isWall(entity.x + dx, entity.y, radius)) entity.x += dx;
    if (!isWall(entity.x, entity.y + dy, radius)) entity.y += dy;
  }

  function isWall(x, y, radius = 0) {
    const points = [
      [x - radius, y - radius],
      [x + radius, y - radius],
      [x - radius, y + radius],
      [x + radius, y + radius],
      [x, y]
    ];

    return points.some(([px, py]) => {
      const col = Math.floor(px / TILE);
      const row = Math.floor(py / TILE);
      return col < 0 || col >= COLS || row < 0 || row >= ROWS || mazeState.maze[row][col] === 1;
    });
  }

  function findPath(start, goal) {
    const queue = [start];
    const cameFrom = new Map();
    const startKey = cellKey(start);
    cameFrom.set(startKey, null);

    while (queue.length > 0) {
      const current = queue.shift();
      if (current.col === goal.col && current.row === goal.row) break;

      getOpenNeighbors(current).forEach((neighbor) => {
        const key = cellKey(neighbor);
        if (cameFrom.has(key)) return;
        cameFrom.set(key, current);
        queue.push(neighbor);
      });
    }

    const goalKey = cellKey(goal);
    if (!cameFrom.has(goalKey)) return [];

    const path = [];
    let current = goal;
    while (current) {
      path.unshift(current);
      current = cameFrom.get(cellKey(current));
    }

    return path;
  }

  function getOpenNeighbors(cell) {
    return [
      { col: cell.col + 1, row: cell.row },
      { col: cell.col - 1, row: cell.row },
      { col: cell.col, row: cell.row + 1 },
      { col: cell.col, row: cell.row - 1 }
    ].filter((neighbor) => (
      neighbor.col >= 0
      && neighbor.col < COLS
      && neighbor.row >= 0
      && neighbor.row < ROWS
      && mazeState.maze[neighbor.row][neighbor.col] === 0
    ));
  }

  function bindKeyboard() {
    if (keyboardBound) return;
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp);
    keyboardBound = true;
  }

  function unbindKeyboard() {
    if (!keyboardBound) return;
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    keyboardBound = false;
    keys = {};
  }

  function handleKeyDown(event) {
    if (event.code === 'Escape') {
      event.preventDefault();
      setMazePaused(!mazeState?.paused);
      return;
    }
    if (event.target.closest('input, textarea, select, [contenteditable="true"]') || mazeState?.paused) return;
    keys[event.code] = true;
    keys[event.key] = true;

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(event.code)) {
      event.preventDefault();
    }
  }

  function handleKeyUp(event) {
    keys[event.code] = false;
    keys[event.key] = false;
  }

  function bindMobileControls() {
    document.querySelectorAll('.d-btn').forEach((button) => {
      const key = button.dataset.key;
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        keys[key] = true;
        button.setPointerCapture?.(event.pointerId);
      });
      button.addEventListener('pointerup', () => {
        keys[key] = false;
      });
      button.addEventListener('pointercancel', () => {
        keys[key] = false;
      });
      button.addEventListener('pointerleave', () => {
        keys[key] = false;
      });
    });
  }

  function initAudio() {
    if (!soundEnabled) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) { soundEnabled = false; updateSoundButtons(); return; }
    try {
      if (!audioCtx) {
        audioCtx = new Audio();
        masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(0.55, audioCtx.currentTime);
        masterGain.connect(audioCtx.destination);
      }
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    } catch {
      soundEnabled = false;
      updateSoundButtons();
    }
  }

  function startDrone() {
    if (!soundEnabled) return;
    initAudio();
    stopDrone();
    if (!audioCtx || !masterGain) return;

    droneOscillator = audioCtx.createOscillator();
    droneGain = audioCtx.createGain();
    droneOscillator.type = 'sine';
    droneOscillator.frequency.setValueAtTime(42, audioCtx.currentTime);
    droneGain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    droneOscillator.connect(droneGain);
    droneGain.connect(masterGain);
    droneOscillator.start();
  }

  function stopDrone() {
    if (droneOscillator) {
      try {
        droneOscillator.stop();
      } catch (error) {
        // Oscillator may already be stopped.
      }
      droneOscillator.disconnect();
      droneOscillator = null;
    }

    if (droneGain) {
      droneGain.disconnect();
      droneGain = null;
    }
  }

  function playHeartbeat(speed = 700) {
    heartbeatSpeed = speed;
    if (!soundEnabled || !audioCtx || !masterGain || heartbeatTimer) return;

    const pulse = () => {
      if (!soundEnabled || !mazeState || mazeState.paused || mazeState.won || mazeState.lost) {
        stopHeartbeat();
        return;
      }

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(34, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(18, audioCtx.currentTime + 0.11);
      gain.gain.setValueAtTime(0, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.42, audioCtx.currentTime + 0.035);
      gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.2);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      heartbeatTimer = window.setTimeout(pulse, heartbeatSpeed);
    };

    pulse();
  }

  function stopHeartbeat() {
    window.clearTimeout(heartbeatTimer);
    heartbeatTimer = 0;
  }

  function playJumpscare() {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx || !masterGain) return;

    const bufferSize = audioCtx.sampleRate * 0.7;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noise = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    noise.buffer = buffer;
    gain.gain.setValueAtTime(0.58, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.55);
    noise.connect(gain);
    gain.connect(masterGain);
    noise.start();
    noise.onended = () => { noise.disconnect(); gain.disconnect(); };
  }

  function playChime() {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx || !masterGain) return;

    [392, 523.25, 659.25].forEach((frequency, index) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const start = audioCtx.currentTime + index * 0.08;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.16, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.42);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(start);
      osc.stop(start + 0.45);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    });
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    if (!soundEnabled) {
      stopDrone();
      stopHeartbeat();
    } else {
      initAudio();
      if (!nodes.selection.hidden || mazeState?.paused || mazeState?.won || mazeState?.lost) {
        stopDrone();
      } else {
        startDrone();
      }
    }

    updateSoundButtons();
  }

  function updateSoundButtons() {
    document.querySelectorAll('[data-action="sound"]').forEach((button) => {
      button.checked = soundEnabled;
    });
  }

  function pointToCell(point) {
    return {
      col: Math.max(0, Math.min(COLS - 1, Math.floor(point.x / TILE))),
      row: Math.max(0, Math.min(ROWS - 1, Math.floor(point.y / TILE)))
    };
  }

  function cellCenter(col, row, radius = 0) {
    return {
      x: col * TILE + TILE / 2,
      y: row * TILE + TILE / 2,
      radius
    };
  }

  function cellKey(cell) {
    return `${cell.col}:${cell.row}`;
  }

  function getDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function shuffle(items) {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function setMazePaused(paused) {
    if (!mazeState || mazeState.won || mazeState.lost) return;
    mazeState.paused = paused;
    keys = {};
    lastFrameTime = performance.now();
    if (paused) {
      stopHeartbeat();
      stopDrone();
    } else {
      initAudio();
      startDrone();
    }
    nodes.maze.classList.toggle('is-paused', paused);
    updatePauseButton();
  }

  function updatePauseButton() {
    const button = document.querySelector('[data-action="pause-maze"]');
    if (!button) return;
    const paused = Boolean(mazeState?.paused);
    button.textContent = paused ? '▶' : 'Ⅱ';
    button.title = paused ? 'Продовжити' : 'Пауза';
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', String(paused));
    nodes.maze.classList.toggle('is-paused', paused);
  }

  function randomOdd(min, max) {
    const values = [];
    for (let value = min; value <= max; value += 1) {
      if (value % 2 === 1) values.push(value);
    }
    return values[Math.floor(Math.random() * values.length)];
  }

  function drawMazePreview() {
    const canvas = document.getElementById('mazePreview');
    const preview = canvas?.getContext('2d');
    if (!preview) return;
    const maze = generateMaze();
    const tileWidth = canvas.width / COLS;
    const tileHeight = canvas.height / ROWS;
    preview.fillStyle = '#080a0c';
    preview.fillRect(0, 0, canvas.width, canvas.height);
    maze.forEach((row, y) => row.forEach((wall, x) => {
      if (!wall) return;
      preview.fillStyle = (x + y) % 2 ? '#354044' : '#263135';
      preview.fillRect(x * tileWidth + 1, y * tileHeight + 1, tileWidth - 2, tileHeight - 2);
    }));
    preview.fillStyle = '#f16f6c';
    preview.beginPath();
    preview.arc(tileWidth * 1.5, tileHeight * 1.5, 7, 0, Math.PI * 2);
    preview.fill();
    preview.fillStyle = '#79cba4';
    preview.fillRect(tileWidth * 13.5 - 7, tileHeight * 7.5 - 7, 14, 14);
  }
});
