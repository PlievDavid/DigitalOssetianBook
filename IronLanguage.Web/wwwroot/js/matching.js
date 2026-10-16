(() => {
  const root = document.getElementById("matching-app");
  if (!root) return;
  const $ = id => document.getElementById(id);
  const status = $("matching-status");
  const list = $("matching-list");
  const play = $("matching-play");
  const leftColumn = $("matching-left");
  const rightColumn = $("matching-right");
  const result = $("matching-result");
  const summaryBox = $("matching-summary");
  const wordsBox = $("matching-words");
  let session = null;
  let selectedLeft = null;
  let busy = false;
  let generation = 0;
  const board = $("matching-board"), svg = $("matching-threads");
  const connections = new Map();
  let drag = null, suppressClick = false;
  function cancelDrag() {
    if (!drag) return;
    const previous = drag; drag = null;
    if (previous.button.hasPointerCapture(previous.pointerId)) previous.button.releasePointerCapture(previous.pointerId);
    drawThreads();
  }
  function resetThreads() { cancelDrag(); connections.clear(); svg.replaceChildren(); }
  function drawThreads() {
    svg.replaceChildren();
    if (!session || play.hidden) return;
    const bounds = board.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    const point = (column, index, side) => {
      const rect = column.querySelector(`[data-index="${index}"]`).getBoundingClientRect();
      return { x: rect[side] - bounds.left, y: rect.top + rect.height / 2 - bounds.top };
    };
    function connect(left, end, kind) {
      const start = point(leftColumn, left, 'right');
      const bend = Math.max(20, Math.abs(end.x - start.x) * .45);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.setAttribute('d', `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`);
      line.setAttribute('class', 'game-thread ' + kind); svg.append(line);
    }
    for (const [left, right] of connections) connect(left, point(rightColumn, right, 'left'), 'game-thread-matched');
    if (drag?.moved) connect(drag.index, { x: drag.x - bounds.left, y: drag.y - bounds.top }, 'game-thread-active');
  }
  function attachDrag(b, index) {
    b.addEventListener('pointerdown', event => {
      if (busy || !session || session.finished || b.disabled || !event.isPrimary || event.button !== 0) return;
      suppressClick = false;
      drag = { index, button: b, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false };
      b.setPointerCapture(event.pointerId);
    });
    b.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.x = event.clientX; drag.y = event.clientY;
      if (!drag.moved && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 6) {
        drag.moved = true; selectedLeft = index; renderBoard();
      }
      drawThreads();
    });
    b.addEventListener('pointerup', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const moved = drag.moved;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.game-translation');
      cancelDrag(); if (!moved) return;
      suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
      if (target && rightColumn.contains(target) && !target.disabled) check(index, Number(target.dataset.index));
      else { result.textContent = 'Нитка не соединена. Выберите пару справа.'; renderBoard(); }
    });
    b.addEventListener('pointercancel', cancelDrag);
    b.addEventListener('lostpointercapture', cancelDrag);
  }
  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || busy || !session) return;
    cancelDrag(); selectedLeft = null; renderBoard(); result.textContent = 'Выбор отменён.';
  });
  new ResizeObserver(drawThreads).observe(board);



  const button = (label, action, className = "button secondary") => {
    const b = document.createElement("button"); b.type = "button"; b.className = className;
    b.textContent = label; b.addEventListener("click", action); return b;
  };

  async function load() {
    status.textContent = "Загрузка…";
    try {
      const items = await AdamApi("/matching");
      list.replaceChildren();
      for (const item of items) {
        const card = document.createElement("article"); card.className = "exercise-entry";
        const copy = document.createElement("div"); copy.className = "exercise-entry-copy";
        const eyebrow = document.createElement("span"); eyebrow.className = "eyebrow";
        eyebrow.textContent = "СООТНЕСЕНИЕ";
        const title = document.createElement("h2"); title.textContent = item.title;
        const description = document.createElement("p");
        description.textContent = "Соотнесите слова с их парами. Порядок вариантов перемешивается.";
        copy.append(eyebrow, title, description, button("Начать →", () => start(item.id), "button primary"));
        const art = document.createElement("span"); art.className = "exercise-entry-icon";
        art.setAttribute("aria-hidden", "true"); art.append($("matching-app").querySelector(".section-symbol svg").cloneNode(true));
        card.append(art, copy); list.append(card);
      }
      status.textContent = items.length ? "Выберите задание." : "Пока нет опубликованных заданий.";
    } catch (error) { status.textContent = error.message; }
  }

  async function start(id) {
    try {
      const next = await AdamApi(`/matching/${id}/sessions`, { method: "POST" });
      resetThreads();
      selectedLeft = null;
      generation++;
      busy = false;
      session = next;
      sessionStorage.setItem("adam.matching.session", session.sessionId);
      list.hidden = true; play.hidden = false;
      render();
      status.textContent = "";
    } catch (error) { status.textContent = error.message; }
  }

  function render() {
    $("matching-title").textContent = session.title;
    updateCounters();
    result.textContent = "";
    summaryBox.hidden = !session.finished;
    if (session.finished) renderSummary();
    leftColumn.replaceChildren(...session.left.map(tile => tileElement(tile, "left")));
    rightColumn.replaceChildren(...session.right.map(tile => tileElement(tile, "right")));
    renderWords(); renderBoard();
  }

  function updateCounters() {
    $("matching-counters").textContent = `Найдено: ${session.matched} из ${session.total}`;
  }

  function tileElement(tile, side) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `word-tile matching-tile matching-tile--${side}` + (side === "left" ? " game-word" : " game-translation") + (tile.matched ? " is-matched matched" : "");
    b.textContent = tile.text;
    b.dataset.index = String(tile.index);
    b.disabled = tile.matched || session.finished;
    b.setAttribute("aria-describedby", "matching-instructions");
    b.addEventListener("click", () => { if (!suppressClick) select(side, tile.index, b); });
    if (side === "left") attachDrag(b, tile.index);
    return b;
  }

  function select(side, index, element) {
    if (busy || !session || session.finished || element.disabled) return;
    if (side === "left") {
      leftColumn.querySelectorAll(".is-selected").forEach(node => node.classList.remove("is-selected"));
      selectedLeft = index;
      element.classList.add("is-selected");
      renderBoard();
      result.textContent = "";
      return;
    }
    if (selectedLeft === null) {
      result.textContent = "Сначала выберите слово слева.";
      return;
    }
    check(selectedLeft, index);
  }

  async function check(leftIndex, rightIndex) {
    if (busy || !session || session.finished) return;
    busy = true; renderBoard();
    const gen = generation;
    const sid = session.sessionId;
    try {
      const response = await AdamApi(`/matching/sessions/${sid}/check`, {
        method: "POST",
        body: JSON.stringify({ leftIndex, rightIndex })
      });
      // Ответ относится к другой сессии — не применяем к текущей доске.
      if (gen !== generation || !session || session.sessionId !== sid) return;
      const leftTile = session.left.find(t => t.index === leftIndex);
      const rightTile = session.right.find(t => t.index === rightIndex);
      if (response.correct) {
        leftTile.matched = true; rightTile.matched = true;
        connections.set(leftIndex, rightIndex);
        session.matched = response.matched;
        session.finished = response.finished;
        result.textContent = "Верно!";
        selectedLeft = null;
        leftColumn.querySelectorAll(".is-selected").forEach(node => node.classList.remove("is-selected"));
      } else {
        result.textContent = "Не подходит. Попробуйте другую пару.";
        leftColumn.querySelectorAll(".is-selected").forEach(node => node.classList.remove("is-wrong"));
        rightColumn.querySelectorAll(`[data-index="${rightIndex}"]`).forEach(node => node.classList.add("is-wrong"));
        setTimeout(() => {
          if (gen !== generation) return;
          leftColumn.querySelectorAll(".is-wrong").forEach(node => node.classList.remove("is-wrong"));
          rightColumn.querySelectorAll(".is-wrong").forEach(node => node.classList.remove("is-wrong"));
        }, 600);
        selectedLeft = null;
        leftColumn.querySelectorAll(".is-selected").forEach(node => node.classList.remove("is-selected"));
      }
      updateCounters();
      renderBoard();
      if (session.finished) { summaryBox.hidden = false; renderSummary(); }
    } catch (error) {
      if (gen !== generation || !session || session.sessionId !== sid) return;
      result.textContent = error.message;
      if (error.status === 404) {
        sessionStorage.removeItem("adam.matching.session");
        back();
      }
    } finally {
      // Завершение старого запроса не должно снимать блокировку новой сессии.
      if (gen === generation) {
        busy = false; renderBoard();
        const focus = selectedLeft === null ? leftColumn.querySelector("button:enabled") : leftColumn.querySelector('[data-index="' + selectedLeft + '"]');
        (focus || summaryBox.querySelector("button") || $("matching-back-link")).focus({ preventScroll: true });
      }
    }
  }

  function renderBoard() {
    for (const [column, tiles, side] of [[leftColumn, session.left, "left"], [rightColumn, session.right, "right"]]) {
      for (const tile of tiles) {
        const node = column.querySelector('[data-index="' + tile.index + '"]');
        node.disabled = busy || tile.matched || session.finished;
        node.classList.toggle("matched", tile.matched);
        node.classList.toggle("is-matched", tile.matched);
        node.classList.toggle("selected", side === "left" && selectedLeft === tile.index);
        node.classList.toggle("is-selected", side === "left" && selectedLeft === tile.index);
        if (side === "left") node.setAttribute("aria-pressed", String(selectedLeft === tile.index));
      }
    }
    board.setAttribute("aria-busy", String(busy)); drawThreads();
  }

  function renderSummary() {
    summaryBox.replaceChildren();
    const text = document.createElement("p");
    text.textContent = `Все пары найдены: ${session.total} из ${session.total}.`;
    summaryBox.append(text,
      button("Пройти заново", () => start(session.materialId), "button primary"),
      button("К списку", back, "button secondary"));
  }

  function renderWords() {
    wordsBox.replaceChildren();
    if (!session.words || !session.words.length) return;
    const heading = document.createElement("h2");
    heading.textContent = "Связанные слова";
    wordsBox.append(heading);
    for (const word of session.words) {
      const card = document.createElement("article"); card.className = "exercise-entry";
      const copy = document.createElement("div"); copy.className = "exercise-entry-copy";
      const title = document.createElement("h3"); title.textContent = word.ossetian;
      const translation = document.createElement("p"); translation.textContent = word.russian;
      copy.append(title, translation);
      if (AdamAuthenticated) {
        const save = button("В мой словарь", async () => {
          try {
            await AdamApi(`/vocabulary/${word.id}`, { method: "POST" });
            save.textContent = "Сохранено"; save.disabled = true;
          } catch (error) { status.textContent = error.message; }
        }, "book-text-button");
        copy.append(save);
      }
      card.append(copy); wordsBox.append(card);
    }
  }

  function back() {
    resetThreads();
    generation++;
    busy = false;
    play.hidden = true; list.hidden = false;
    session = null; selectedLeft = null;
    load();
  }

  $("matching-back-link").addEventListener("click", event => { event.preventDefault(); back(); });
  load();
})();
