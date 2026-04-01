document.addEventListener('DOMContentLoaded', () => {
    // --- ЗВУКОВА СИСТЕМА ---
    let audioCtx;
    let heartbeatInterval;
    let droneOscillator;

    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    function startDrone() {
        if (!audioCtx) return;
        if (droneOscillator) droneOscillator.stop();
        droneOscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        droneOscillator.type = 'sine';
        droneOscillator.frequency.setValueAtTime(40, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        droneOscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        droneOscillator.start();
    }

    function stopDrone() {
        if (droneOscillator) {
            droneOscillator.stop();
            droneOscillator = null;
        }
    }

    function playHeartbeat(speed = 1000) {
        if (!audioCtx) return;
        clearInterval(heartbeatInterval);
        
        heartbeatInterval = setInterval(() => {
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            osc.frequency.setValueAtTime(30, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.1);
            
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 0.05);
            gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.15);
            
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.2);
        }, speed);
    }

    function stopHeartbeat() {
        clearInterval(heartbeatInterval);
    }

    function playJumpscare() {
        if (!audioCtx) return;
        const bufferSize = audioCtx.sampleRate * 2; 
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1; 
        }
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5); 
        noise.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        noise.start();
    }


    // --- UI ЛОГІКА ---
    const gameSelectionDiv = document.getElementById('game-selection');
    const textQuestContainer = document.getElementById('text-quest-container');
    const mazeGameContainer = document.getElementById('maze-game-container');

    window.showGameSelection = function() {
        gameSelectionDiv.style.display = 'block';
        textQuestContainer.style.display = 'none';
        mazeGameContainer.style.display = 'none';
        stopMazeGame();
        stopDrone();
        stopHeartbeat();
    }

    document.getElementById('select-text-quest').onclick = () => {
        initAudio();
        gameSelectionDiv.style.display = 'none';
        textQuestContainer.style.display = 'flex';
        startTextQuest();
    };

    document.getElementById('select-maze-game').onclick = () => {
        initAudio();
        gameSelectionDiv.style.display = 'none';
        mazeGameContainer.style.display = 'flex';
        startMazeGame();
    };

    // --- ГРА 1: СТРАШНИЙ КВЕСТ ---
    const storyElement = document.getElementById('game-story');
    const choicesElement = document.getElementById('game-choices');
    let isTyping = false;

    const textQuestGameData = {
        start: { story: "Ти прокидаєшся в темній, сирій кімнаті. Повітря пахне іржею та гниллю. Ти не пам'ятаєш, як сюди потрапив.\n\nЩо робитимеш?", choices: [{ text: "Оглянути стіл зі свічкою", nextScene: "examine_table" }, { text: "Навпомацки йти до дверей", nextScene: "try_door" }] },
        examine_table: { story: "На столі лежить іржавий ключ та клаптик паперу, написаний чиєюсь кров'ю.", choices: [{ text: "Взяти ключ", nextScene: "take_key" }, { text: "Прочитати записку", nextScene: "read_note" }] },
        read_note: { story: "Напис гласить: 'ВІН ЧУЄ ТВІЙ СТРАХ. НЕ ДИХАЙ.' Раптом свічка згасає.", choices: [{ text: "Затамувати подих", nextScene: "hold_breath" }, { text: "Почати панікувати", nextScene: "scream" }] },
        take_key: { hasKey: true, story: "Ти береш ключ. Він неприродно холодний. Ззаду лунає важкий крок.", choices: [{ text: "Бігти до дверей", nextScene: "try_door" }, { text: "Повернутися", nextScene: "turn_around" }] },
        turn_around: { story: "Ти обертаєшся. У темряві на тебе дивляться два порожніх білих ока. Воно кидається на тебе.", choices: [] }, 
        scream: { story: "Ти кричиш. Темрява оживає і заповзає тобі до рота. Ти задихаєшся.", choices: [] }, 
        hold_breath: { story: "Ти не дихаєш. Щось велике проходить повз тебе, обдаючи трупним холодом. Воно йде геть.", choices: [{ text: "Обережно підійти до дверей", nextScene: "try_door" }] },
        try_door: { story: "Ти біля масивних залізних дверей. Вони замкнені.", choices: [{ text: "Оглянути стіл", nextScene: "examine_table" }, { text: "Відкрити іржавим ключем", nextScene: "open_door", requireKey: true }] },
        open_door: { story: "Ключ зі скрипом повертається. Ти вивалюєшся у довгий коридор. Свобода... але чи надовго?", choices: [] } 
    };

    let textQuestState = { hasKey: false };

    function typeWriter(text, i, fnCallback) {
        if (i < text.length) {
            storyElement.innerHTML += text.charAt(i);
            setTimeout(() => typeWriter(text, i + 1, fnCallback), 25); 
        } else if (typeof fnCallback == 'function') {
            fnCallback();
        }
    }

    function displayScene(sceneId) {
        if (isTyping) return; 
        const scene = textQuestGameData[sceneId];
        
        choicesElement.innerHTML = '';
        storyElement.innerHTML = '';
        isTyping = true;

        if (scene.hasKey) textQuestState.hasKey = true;

        typeWriter(scene.story, 0, () => {
            isTyping = false;
            
            if (scene.choices && scene.choices.length > 0) {
                scene.choices.forEach(choice => {
                    if (choice.requireKey && !textQuestState.hasKey) return; 
                    const btn = document.createElement('button');
                    btn.textContent = `> ${choice.text}`;
                    btn.onclick = () => displayScene(choice.nextScene);
                    choicesElement.appendChild(btn);
                });
            } else {
                const endMsg = document.createElement('p');
                endMsg.textContent = sceneId === 'open_door' ? "ВИ ВИЖИЛИ." : "ВИ ПОМЕРЛИ.";
                endMsg.style.color = sceneId === 'open_door' ? "#00ff00" : "#ff0000";
                endMsg.style.fontSize = "2rem";
                endMsg.style.marginTop = "1rem";
                choicesElement.appendChild(endMsg);
                if(sceneId !== 'open_door') playJumpscare();
            }
        });
    }

    function startTextQuest() {
        textQuestState = { hasKey: false };
        startDrone();
        displayScene('start');
    }


    // --- ГРА 2: ТЕМНИЙ ЛАБІРИНТ (CANVAS) ---
    const canvas = document.getElementById('mazeCanvas');
    const ctx = canvas.getContext('2d');
    let mazeLoop, player, enemy, maze, exit;
    let isPlaying = false;
    let keys = {}; // Об'єкт для відстеження натиснутих клавіш
    
    const TILE = 40;
    const COLS = 15;
    const ROWS = 10;

    function generateMaze() {
        let m = Array(ROWS).fill().map(() => Array(COLS).fill(1));
        function carve(x, y) {
            const dirs = [[0,-2],[0,2],[-2,0],[2,0]].sort(()=>Math.random()-0.5);
            m[y][x] = 0;
            for(let [dx,dy] of dirs) {
                let nx=x+dx, ny=y+dy;
                if(nx>0 && nx<COLS-1 && ny>0 && ny<ROWS-1 && m[ny][nx]===1) {
                    m[y+dy/2][x+dx/2] = 0;
                    carve(nx,ny);
                }
            }
        }
        carve(1, 1);
        m[1][1] = 0; m[ROWS-2][COLS-2] = 0; 
        return m;
    }

    function isWall(x, y) {
        let col = Math.floor(x/TILE), row = Math.floor(y/TILE);
        if(col<0||col>=COLS||row<0||row>=ROWS) return true;
        return maze[row][col] === 1;
    }

    function updateEnemy() {
        if (!enemy || !player) return;
        let dx = player.x - enemy.x;
        let dy = player.y - enemy.y;
        let dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist < TILE * 4) playHeartbeat(dist * 2.5 + 50);
        else stopHeartbeat();

        if (dist < TILE/2) {
            playJumpscare();
            alert("ВОНА ВАС ЗЛОВИЛА.");
            showGameSelection();
            return;
        }

        let step = 1.0; // Трохи сповільнив монстра для балансу
        let moveX = (dx / dist) * step;
        let moveY = (dy / dist) * step;

        if (!isWall(enemy.x + moveX, enemy.y)) enemy.x += moveX;
        if (!isWall(enemy.x, enemy.y + moveY)) enemy.y += moveY;
    }

    function draw() {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#333';
        for(let y=0; y<ROWS; y++) {
            for(let x=0; x<COLS; x++) {
                if(maze[y][x]) ctx.fillRect(x*TILE, y*TILE, TILE, TILE);
            }
        }

        ctx.fillStyle = '#0f0';
        ctx.fillRect(exit.x - 10, exit.y - 10, 20, 20);

        ctx.fillStyle = 'purple';
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, 12, 0, Math.PI*2);
        ctx.fill();

        // Тепер гравець 100% червоний (без CSS змінних)
        ctx.fillStyle = '#ff3333';
        ctx.beginPath();
        ctx.arc(player.x, player.y, 10, 0, Math.PI*2);
        ctx.fill();

        // ── ТУМАН ТЕМРЯВИ ─────────────────────────────────────────────
        // Правильний підхід: малюємо чорне тло лише ЗОВНІ кола видимості.
        // Техніка evenodd: path = прямокутник (весь canvas) + коло (дірка всередині).
        // Правило "парна-непарна": область між прямокутником і колом — зафарбована;
        // все всередині кола — прозоре. Лабіринт під ним залишається видимим.
        ctx.save();

        let flicker = Math.random() * 10 - 5; // Мерехтіння ліхтарика ±5px
        let radius = TILE * 3.2 + flicker;    // Радіус видимості (3.2 клітинки)

        // Крок 1: Суцільна темрява зовні кола (evenodd = "заповни між rect і arc")
        ctx.beginPath();
        ctx.rect(0, 0, canvas.width, canvas.height); // Зовнішній прямокутник
        ctx.arc(player.x, player.y, radius, 0, Math.PI * 2); // Внутрішнє коло — "дірка"
        ctx.fillStyle = 'rgba(0, 0, 0, 0.96)';
        ctx.fill('evenodd'); // Заповнює rect мінус arc = темрява навкруги

        // Крок 2: М'який градієнт на краю видимості (ефект "вмираючого ліхтарика")
        let edgeGrad = ctx.createRadialGradient(
            player.x, player.y, radius * 0.55, // Від 55% радіуса — починається затемнення
            player.x, player.y, radius          // До краю — напівтемрява
        );
        edgeGrad.addColorStop(0, 'rgba(0,0,0,0)');    // Центр: прозорий
        edgeGrad.addColorStop(1, 'rgba(0,0,0,0.75)'); // Край: напівтемрява

        ctx.beginPath();
        ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = edgeGrad;
        ctx.fill(); // Малюємо тільки всередині кола

        ctx.restore();
    }

    function movePlayer(dx, dy) {
        if (!isWall(player.x + dx, player.y) && !isWall(player.x + dx, player.y - 8) && !isWall(player.x + dx, player.y + 8)) player.x += dx;
        if (!isWall(player.x, player.y + dy) && !isWall(player.x - 8, player.y + dy) && !isWall(player.x + 8, player.y + dy)) player.y += dy;
    }

    function loop() {
        if(!isPlaying) return; 

        // Обробка плавного руху на основі натиснутих клавіш
        let s = 3.5; // Швидкість (менша, бо тепер кадрів 60 на секунду)
        if (keys['ArrowUp'] || keys['KeyW']) movePlayer(0, -s);
        if (keys['ArrowDown'] || keys['KeyS']) movePlayer(0, s);
        if (keys['ArrowLeft'] || keys['KeyA']) movePlayer(-s, 0);
        if (keys['ArrowRight'] || keys['KeyD']) movePlayer(s, 0);
        
        updateEnemy();
        draw();
        
        let distToExit = Math.sqrt((player.x-exit.x)**2 + (player.y-exit.y)**2);
        if(distToExit < 20) {
            alert("ВИ ВРЯТУВАЛИСЯ... ЦЬОГО РАЗУ.");
            showGameSelection();
            return;
        }

        mazeLoop = requestAnimationFrame(loop);
    }

    // Обробники клавіатури (e.code працює незалежно від мови розкладки)
    function handleKeyDown(e) {
        keys[e.code] = true;
        keys[e.key] = true;

        // Блокуємо скрол сторінки при грі стрілочками або WASD
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(e.code)) {
            e.preventDefault();
        }
    }

    function handleKeyUp(e) {
        keys[e.code] = false;
        keys[e.key] = false;
    }

    function startMazeGame() {
        startDrone();
        maze = generateMaze();
        player = { x: TILE*1.5, y: TILE*1.5 }; // Гравець зліва зверху
        enemy = { x: TILE*(COLS-2.5), y: TILE*1.5 }; // Ворог справа зверху
        exit = { x: TILE*(COLS-1.5), y: TILE*(ROWS-1.5) };

        keys = {}; 
        window.addEventListener('keydown', handleKeyDown, { passive: false });
        window.addEventListener('keyup', handleKeyUp);

        // Керування з екрану (для мобільних)
        const startMove = (key) => { keys[key] = true; };
        const stopMove = (key) => { keys[key] = false; };

        document.getElementById('btn-up').onpointerdown = () => startMove('ArrowUp');
        document.getElementById('btn-down').onpointerdown = () => startMove('ArrowDown');
        document.getElementById('btn-left').onpointerdown = () => startMove('ArrowLeft');
        document.getElementById('btn-right').onpointerdown = () => startMove('ArrowRight');
        
        document.querySelectorAll('.d-btn').forEach(btn => {
            btn.onpointerup = () => keys = {};
            btn.onpointerleave = () => keys = {};
        });

        isPlaying = true;
        mazeLoop = requestAnimationFrame(loop);
    }

    function stopMazeGame() {
        isPlaying = false;
        if(mazeLoop) {
            cancelAnimationFrame(mazeLoop);
        }
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    }
});