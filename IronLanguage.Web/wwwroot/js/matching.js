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
        card.append(copy); list.append(card);
      }
      status.textContent = items.length ? "Выберите задание." : "Пока нет опубликованных заданий.";
    } catch (error) { status.textContent = error.message; }
  }

  async function start(id) {
    try {
      session = await AdamApi(`/matching/${id}/sessions`, { method: "POST" });
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
    renderWords();
  }

  function updateCounters() {
    $("matching-counters").textContent = `Найдено: ${session.matched} из ${session.total}`;
  }

  function tileElement(tile, side) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `word-tile matching-tile matching-tile--${side}` + (tile.matched ? " is-matched" : "");
    b.textContent = tile.text;
    b.dataset.index = String(tile.index);
    b.disabled = tile.matched || session.finished;
    b.addEventListener("click", () => select(side, tile.index, b));
    return b;
  }

  function select(side, index, element) {
    if (busy || session.finished) return;
    if (side === "left") {
      leftColumn.querySelectorAll(".is-selected").forEach(node => node.classList.remove("is-selected"));
      selectedLeft = index;
      element.classList.add("is-selected");
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
    busy = true;
    try {
      const response = await AdamApi(`/matching/sessions/${session.sessionId}/check`, {
        method: "POST",
        body: JSON.stringify({ leftIndex, rightIndex })
      });
      const leftTile = session.left.find(t => t.index === leftIndex);
      const rightTile = session.right.find(t => t.index === rightIndex);
      if (response.correct) {
        leftTile.matched = true; rightTile.matched = true;
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
      result.textContent = error.message;
      if (error.status === 404) {
        sessionStorage.removeItem("adam.matching.session");
        back();
      }
    } finally { busy = false; }
  }

  function renderBoard() {
    leftColumn.replaceChildren(...session.left.map(tile => tileElement(tile, "left")));
    rightColumn.replaceChildren(...session.right.map(tile => tileElement(tile, "right")));
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
    play.hidden = true; list.hidden = false;
    session = null; selectedLeft = null;
    load();
  }

  $("matching-back-link").addEventListener("click", event => { event.preventDefault(); back(); });
  load();
})();
