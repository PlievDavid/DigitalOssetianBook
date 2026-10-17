(() => {
  const root = document.getElementById('game-app'); if (!root) return;
  const board = document.getElementById('game-board'), status = document.getElementById('game-status');
  const restart = document.getElementById('game-restart'), findWords = document.getElementById('game-find-words');
  const ns = 'http://www.w3.org/2000/svg';
  let chosen = null, matched = new Map(), words = [], translations = [], busy = false;
  let lines, drag = null, wrong = null, wrongTimer, suppressClick = false;
  const leftButtons = new Map(), rightButtons = new Map();
  const shuffle = items => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  const pairsLabel = count => count % 10 === 1 && count % 100 !== 11 ? 'пару' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'пары' : 'пар';
  const threadColor = id => `var(--game-thread-${words.findIndex(word => word.wordId === id) % 10}, #286aab)`;
  function update() {
    board.setAttribute('aria-busy', String(busy)); restart.disabled = busy;
    for (const [id, button] of leftButtons) {
      button.disabled = busy || matched.has(id);
      button.classList.toggle('selected', chosen === id);
      button.classList.toggle('matched', matched.has(id));
      button.setAttribute('aria-pressed', String(chosen === id));
    }
    for (const [id, button] of rightButtons) {
      const source = [...matched].find(([, target]) => target === id)?.[0];
      const done = source !== undefined;
      if (done) button.style.setProperty('--thread-color', threadColor(source));
      else button.style.removeProperty('--thread-color');
      button.disabled = busy || done; button.classList.toggle('matched', done);
    }
    draw();
  }
  function point(button, side) {
    const rect = button.getBoundingClientRect(), bounds = board.getBoundingClientRect();
    return { x: (side === 'left' ? rect.right : rect.left) - bounds.left, y: rect.top + rect.height / 2 - bounds.top };
  }
  function draw() {
    if (!lines) return;
    lines.replaceChildren();
    const bounds = board.getBoundingClientRect();
    lines.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    function connect(id, target, kind) {
      const start = point(leftButtons.get(id), 'left');
      const end = typeof target === 'object' ? target : point(rightButtons.get(target), 'right');
      const bend = Math.max(20, Math.abs(end.x - start.x) * .45);
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`);
      path.style.setProperty('--thread-color', threadColor(id));
      path.setAttribute('class', `game-thread ${kind}`); lines.append(path);
    }
    for (const [id, target] of matched) connect(id, target, 'game-thread-matched');
    if (wrong) connect(wrong.from, wrong.to, 'game-thread-wrong');
    if (drag?.moved) connect(drag.id, { x: drag.x - bounds.left, y: drag.y - bounds.top }, 'game-thread-active');
  }
  function select(id) {
    if (busy || matched.has(id)) return;
    clearTimeout(wrongTimer); wrong = null; chosen = chosen === id ? null : id;
    status.textContent = chosen === null ? 'Выберите осетинское слово.' : 'Теперь выберите перевод справа или протяните к нему нитку.';
    update();
  }
  async function answer(target) {
    if (busy || [...matched.values()].includes(target.wordId)) return;
    if (chosen === null) { status.textContent = 'Сначала выберите осетинское слово.'; return; }
    const id = chosen;
    clearTimeout(wrongTimer); wrong = null; busy = true;
    status.textContent = 'Проверяем пару…'; update();
    try {
      const result = await AdamApi(`${AdamAuthenticated ? '/vocabulary' : '/words'}/${id}/review`, { method: 'POST', body: JSON.stringify({ translation: target.russian }) });
      if (result.correct) {
        matched.set(id, target.wordId);
        status.textContent = matched.size === words.length ? 'Все пары найдены!' : 'Верная пара! Соедините следующие слова.';
      } else {
        wrong = { from: id, to: target.wordId };
        status.textContent = `Пока неверно. Перевод: ${result.expected}`;
        wrongTimer = setTimeout(() => { wrong = null; draw(); }, 1200);
      }
      chosen = null;
    } catch (error) { status.textContent = error.message; }
    finally {
      busy = false; update();
      // Restore keyboard focus after the request disabled the answer buttons.
      const next = chosen !== null ? leftButtons.get(chosen) : [...leftButtons.values()].find(button => !button.disabled);
      (next || restart).focus({ preventScroll: true });
    }
  }
  function cancelDrag() {
    if (!drag) return;
    const previous = drag; drag = null;
    if (previous.button.hasPointerCapture(previous.pointerId)) previous.button.releasePointerCapture(previous.pointerId);
    draw();
  }
  function render() {
    board.replaceChildren(); leftButtons.clear(); rightButtons.clear();
    lines = document.createElementNS(ns, 'svg');
    lines.setAttribute('class', 'game-threads'); lines.setAttribute('aria-hidden', 'true');
    const left = document.createElement('div'), right = document.createElement('div');
    left.className = 'game-column game-column-left'; right.className = 'game-column game-column-right';
    left.setAttribute('role', 'group'); left.setAttribute('aria-label', 'Осетинские слова');
    right.setAttribute('role', 'group'); right.setAttribute('aria-label', 'Русские переводы');
    for (const word of words) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'word-tile game-word'; button.textContent = word.ossetian;
      button.style.setProperty('--thread-color', threadColor(word.wordId));
      button.setAttribute('aria-describedby', 'game-instructions'); leftButtons.set(word.wordId, button);
      button.onclick = () => { if (!suppressClick) select(word.wordId); };
      button.onpointerdown = event => {
        if (busy || matched.has(word.wordId) || !event.isPrimary || event.button !== 0) return;
        suppressClick = false;
        drag = { id: word.wordId, button, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false };
        button.setPointerCapture(event.pointerId);
      };
      button.onpointermove = event => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        drag.x = event.clientX; drag.y = event.clientY;
        if (!drag.moved && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 6) {
          drag.moved = true; chosen = drag.id; wrong = null; update();
        }
        draw();
      };
      button.onpointerup = event => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const moved = drag.moved;
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.game-translation');
        cancelDrag(); if (!moved) return;
        // The click following pointerup must not select the starting word again.
        suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
        const word = translations.find(item => rightButtons.get(item.wordId) === target);
        if (word && !target.disabled) answer(word);
        else { status.textContent = 'Нитка не соединена. Выберите перевод справа или протяните её ещё раз.'; update(); }
      };
      button.onpointercancel = button.onlostpointercapture = () => { cancelDrag(); };
      left.append(button);
    }
    for (const word of translations) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'word-tile game-translation'; button.textContent = word.russian;
      button.onclick = () => answer(word); rightButtons.set(word.wordId, button); right.append(button);
    }
    board.append(lines, left, right); update();
  }
  async function load() {
    if (busy) return;
    cancelDrag(); clearTimeout(wrongTimer); wrong = null;
    busy = true; chosen = null; matched.clear(); update(); status.textContent = 'Загружаем слова…';
    try {
      const all = await (AdamAuthenticated ? AdamApi('/vocabulary') : AdamApi('/words').then(items => items.map(x => ({ ...x, wordId: x.id }))));
      words = shuffle(all).filter((x, i, a) => a.findIndex(y => y.russian.toLocaleLowerCase() === x.russian.toLocaleLowerCase()) === i).slice(0, 5);
      translations = shuffle(words);
      const empty = words.length < 2;
      restart.hidden = empty; findWords.hidden = !empty;
      if (empty) {
        status.textContent = AdamAuthenticated ? 'Игра откроется, когда в вашем словаре появятся два слова с разными переводами.' : 'Для игры нужны хотя бы два опубликованных слова с разными переводами.';
        board.replaceChildren(); lines = null; leftButtons.clear(); rightButtons.clear();
      } else { status.textContent = `Соедините ${words.length} ${pairsLabel(words.length)} нитками.`; render(); }
    } catch (error) {
      board.replaceChildren(); leftButtons.clear(); rightButtons.clear(); lines = null;
      words = []; translations = []; findWords.hidden = true;
      restart.hidden = false; status.textContent = error.message;
    }
    finally { busy = false; update(); }
  }
  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || busy) return;
    cancelDrag(); chosen = null; wrong = null; update(); status.textContent = 'Выбор отменён. Выберите осетинское слово.';
  });
  new ResizeObserver(draw).observe(board);
  restart.onclick = load; load();
})();
