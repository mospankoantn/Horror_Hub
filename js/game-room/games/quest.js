// Text quest engine "quest" for the game room. A quest is data only: data/games/quests/<id>.json
// (format: data/games/quests/README.md). Any number of quests can share this engine.
(() => {
  window.GameRoom.register('quest', { create });

  function create(api) {
    const ui = buildUi(api);
    let quest = null;
    let state = null;
    let typing = null;
    let destroyed = false;

    api.setPausable(false);
    document.addEventListener('keydown', onKey);

    return { start, restart, destroy };

    async function start() {
      try {
        quest = await api.loadData();
      } catch (error) {
        ui.story.textContent = 'Не вдалося завантажити квест. Оновіть сторінку.';
        return;
      }
      if (destroyed) return;
      const save = api.local.get('save');
      if (api.params.get('resume') && save && quest.scenes[save.scene] && !quest.scenes[save.scene].ending) {
        state = { scene: save.scene, fear: Number(save.fear) || 0, inventory: new Set(save.inventory || []) };
        api.sound.drone(true);
        show(save.scene);
      } else {
        restart();
      }
    }

    function restart() {
      if (!quest) return;
      api.local.remove('save');
      state = { scene: quest.start, fear: 0, inventory: new Set() };
      api.sound.drone(true);
      show(quest.start);
    }

    function destroy() {
      destroyed = true;
      stopTyping();
      document.removeEventListener('keydown', onKey);
    }

    function endingIds() {
      return Object.keys(quest.scenes).filter((id) => quest.scenes[id].ending);
    }

    function show(sceneId) {
      const scene = quest.scenes[sceneId];
      if (!scene) return;
      state.scene = sceneId;
      ui.choices.replaceChildren();
      renderHud();
      if (scene.ending) api.local.remove('save');
      else api.local.set('save', { scene: sceneId, fear: state.fear, inventory: [...state.inventory] });
      type(scene.text, () => (scene.ending ? renderEnding(sceneId, scene) : renderChoices(scene)));
    }

    function renderChoices(scene) {
      (scene.choices || []).forEach((choice, index) => {
        const allowed = !choice.requireItem || state.inventory.has(choice.requireItem);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'quest__choice';
        button.disabled = !allowed;
        const key = document.createElement('kbd');
        key.textContent = String(index + 1);
        key.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = choice.text;
        button.append(key, label);
        if (!allowed) {
          const need = document.createElement('small');
          need.textContent = `потрібно: ${choice.requireItem}`;
          button.appendChild(need);
        }
        button.addEventListener('click', () => choose(choice));
        ui.choices.appendChild(button);
      });
      ui.choices.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    }

    function choose(choice) {
      if (typing) return;
      if (choice.fear) state.fear += choice.fear;
      if (choice.addItem) state.inventory.add(choice.addItem);
      if (choice.removeItem) state.inventory.delete(choice.removeItem);
      const limit = quest.fear?.limit;
      if (limit && state.fear >= limit && !choice.ignoreFear && quest.scenes[quest.fear.scene]) {
        show(quest.fear.scene);
        return;
      }
      show(choice.next);
    }

    async function renderEnding(sceneId, scene) {
      api.sound.drone(false);
      if (scene.good) api.sound.chime(); else api.sound.jumpscare();
      const ending = document.createElement('p');
      ending.className = scene.good ? 'quest-ending is-good' : 'quest-ending is-bad';
      ending.textContent = scene.ending;
      ui.choices.appendChild(ending);

      const ids = endingIds();
      const result = await api.recordEnding(sceneId, ids.length);
      if (destroyed) return;
      renderHud();
      const note = document.createElement('p');
      note.className = 'quest__found';
      note.textContent = `${result.isNew ? 'Новий фінал!' : 'Цей фінал ви вже бачили.'} Знайдено ${result.endings.length} з ${ids.length}.`;

      const list = document.createElement('ul');
      list.className = 'quest__endings';
      list.setAttribute('aria-label', 'Фінали квесту');
      ids.forEach((id) => {
        const item = document.createElement('li');
        const found = result.endings.includes(id);
        item.className = found ? (quest.scenes[id].good ? 'is-good' : 'is-found') : 'is-hidden';
        item.textContent = found ? quest.scenes[id].ending : '???';
        if (id === sceneId) item.setAttribute('aria-current', 'true');
        list.appendChild(item);
      });

      const actions = document.createElement('div');
      actions.className = 'quest__actions';
      const again = document.createElement('button');
      again.type = 'button';
      again.className = 'btn btn--primary';
      again.textContent = 'Спробувати інший шлях';
      again.addEventListener('click', restart);
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'btn';
      back.textContent = 'До ігор';
      back.addEventListener('click', () => api.exit());
      actions.append(again, back);
      ui.choices.append(note, list, actions);
      again.focus({ preventScroll: true });
    }

    function renderHud() {
      const limit = quest.fear?.limit || 0;
      ui.fearValue.textContent = limit ? `${Math.min(state.fear, limit)} / ${limit}` : String(state.fear);
      ui.fearFill.style.width = limit ? `${Math.min(100, (state.fear / limit) * 100)}%` : '0%';
      ui.fearMeter.setAttribute('aria-valuenow', String(state.fear));
      ui.fearMeter.setAttribute('aria-valuemax', String(limit || state.fear));
      ui.fearMeter.classList.toggle('is-low', limit && state.fear >= limit - 2);
      const items = [...state.inventory];
      ui.inventory.replaceChildren(...(items.length
        ? items.map((name) => Object.assign(document.createElement('span'), { className: 'quest__item', textContent: name }))
        : [Object.assign(document.createElement('span'), { className: 'quest__empty', textContent: 'порожньо' })]));
      ui.inventory.dataset.items = items.join(', ');
      const found = api.endings().length;
      ui.endings.textContent = `${found} з ${endingIds().length}`;
    }

    function type(text, done) {
      stopTyping();
      ui.skip.disabled = false;
      const finish = () => {
        stopTyping();
        ui.story.textContent = text;
        done();
      };
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        finish();
        return;
      }
      let index = 0;
      typing = { finish, timer: 0 };
      const tick = () => {
        ui.story.textContent = text.slice(0, index);
        index += 1;
        if (index <= text.length) typing.timer = window.setTimeout(tick, 18);
        else finish();
      };
      tick();
    }

    function stopTyping() {
      if (typing) window.clearTimeout(typing.timer);
      typing = null;
      ui.skip.disabled = true;
    }

    function onKey(event) {
      if (event.target.closest?.('input, textarea, select, [contenteditable="true"], .player__dialog')) return;
      if ((event.key === ' ' || event.key === 'Enter') && typing) {
        event.preventDefault();
        typing.finish();
        return;
      }
      if (/^[1-9]$/.test(event.key) && !typing) {
        const button = ui.choices.querySelectorAll('.quest__choice')[Number(event.key) - 1];
        if (button && !button.disabled) {
          event.preventDefault();
          button.click();
        }
      }
    }

    function skip() {
      typing?.finish();
    }
    ui.skip.addEventListener('click', skip);
  }

  function buildUi(api) {
    const fear = document.createElement('div');
    fear.className = 'hud-item hud-item--meter';
    const fearLabel = Object.assign(document.createElement('span'), { className: 'hud-item__label', textContent: 'Страх' });
    const fearMeter = document.createElement('span');
    fearMeter.className = 'meter meter--fear';
    fearMeter.setAttribute('role', 'meter');
    fearMeter.setAttribute('aria-label', 'Страх');
    fearMeter.setAttribute('aria-valuemin', '0');
    const fearFill = Object.assign(document.createElement('span'), { className: 'meter__fill' });
    fearMeter.appendChild(fearFill);
    const fearValue = Object.assign(document.createElement('span'), { className: 'hud-item__value', id: 'questFear' });
    fear.append(fearLabel, fearMeter, fearValue);

    const bag = document.createElement('div');
    bag.className = 'hud-item';
    const inventory = Object.assign(document.createElement('span'), { className: 'quest__inventory', id: 'questInventory' });
    bag.append(Object.assign(document.createElement('span'), { className: 'hud-item__label', textContent: 'Інвентар' }), inventory);

    const found = document.createElement('div');
    found.className = 'hud-item';
    const endings = Object.assign(document.createElement('span'), { className: 'hud-item__value', id: 'questEndings' });
    found.append(Object.assign(document.createElement('span'), { className: 'hud-item__label', textContent: 'Фінали' }), endings);

    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'btn hud-skip';
    skip.dataset.questSkip = '';
    skip.textContent = 'Показати текст';
    api.hud.replaceChildren(fear, bag, found, skip);

    const root = document.createElement('div');
    root.className = 'quest';
    const story = Object.assign(document.createElement('p'), { className: 'quest__story', id: 'game-story' });
    story.setAttribute('aria-live', 'polite');
    const choices = Object.assign(document.createElement('div'), { className: 'quest__choices', id: 'game-choices' });
    root.append(story, choices);
    api.stage.replaceChildren(root);
    api.touch.replaceChildren();
    return { story, choices, fearMeter, fearFill, fearValue, inventory, endings, skip };
  }
})();
