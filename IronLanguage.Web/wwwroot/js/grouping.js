(() => {
  const root = document.getElementById("grouping-app");
  if (!root) return;
  const $ = id => document.getElementById(id);
  const status = $("grouping-status");
  const list = $("grouping-list");
  const play = $("grouping-play");
  const pool = $("grouping-pool");
  const groupsBox = $("grouping-groups");
  const result = $("grouping-result");
  const summaryBox = $("grouping-summary");
  const wordsBox = $("grouping-words");
  let session = null;
  let selectedWord = null;
  let busy = false;
  let generation = 0;
  let renderedWordsKey = null;
  let drag = null;
  let suppressClick = false;

  const button = (label, action, className = "button secondary") => {
    const b = document.createElement("button");
    b.type = "button"; b.className = className; b.textContent = label;
    b.addEventListener("click", action); return b;
  };

  async function load() {
    status.textContent = "Загрузка…";
    try {
      const items = await AdamApi("/groupings");
      list.replaceChildren();
      for (const item of items) {
        const card = document.createElement("article"); card.className = "exercise-entry";
        const copy = document.createElement("div"); copy.className = "exercise-entry-copy";
        const eyebrow = document.createElement("span"); eyebrow.className = "eyebrow";
        eyebrow.textContent = "ГРУППЫ СЛОВ";
        const title = document.createElement("h2"); title.textContent = item.title;
        const description = document.createElement("p");
        description.textContent = "Разложите слова по группам. Порядок слов перемешивается.";
        copy.append(eyebrow, title, description, button("Начать →", () => start(item.id), "button primary"));
        const art = document.createElement("span"); art.className = "exercise-entry-icon";
        art.setAttribute("aria-hidden", "true");
        const icon = root.querySelector(".section-symbol svg");
        if (icon) art.append(icon.cloneNode(true));
        card.append(art, copy); list.append(card);
      }
      status.textContent = items.length ? "Выберите задание." : "Пока нет опубликованных заданий.";
    } catch (error) { status.textContent = error.message; }
  }

  async function start(id) {
    try {
      const next = await AdamApi(`/groupings/${id}/sessions`, { method: "POST" });
      generation++;
      busy = false;
      selectedWord = null;
      session = next;
      list.hidden = true; play.hidden = false;
      result.textContent = "";
      render();
      status.textContent = "";
    } catch (error) { status.textContent = error.message; }
  }

  function render() {
    if (!session) return;
    $("grouping-title").textContent = session.title;
    $("grouping-counters").textContent = `Разложено: ${session.placed} из ${session.total}`;
    const free = session.tiles.filter(tile => !tile.solved);
    pool.replaceChildren(...free.map(wordTile));
    if (!free.length) {
      const empty = document.createElement("p");
      empty.className = "grouping-empty"; empty.textContent = "Все слова разложены.";
      pool.append(empty);
    }
    groupsBox.replaceChildren(...session.groups.map(groupCard));
    summaryBox.hidden = !session.finished;
    if (session.finished) renderSummary();
    renderWords();
    root.setAttribute("aria-busy", String(busy));
  }

  function wordTile(tile) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "word-tile grouping-tile" + (selectedWord === tile.index ? " is-selected" : "");
    b.textContent = tile.text;
    b.dataset.index = String(tile.index);
    b.disabled = busy || session.finished;
    b.setAttribute("aria-pressed", String(selectedWord === tile.index));
    b.setAttribute("aria-describedby", "grouping-instructions");
    b.addEventListener("click", () => {
      if (suppressClick) return;
      selectWord(tile.index);
    });
    attachDrag(b, tile.index);
    return b;
  }

  function groupCard(groupTitle, groupIndex) {
    const section = document.createElement("section");
    section.className = "grouping-group";
    section.dataset.group = String(groupIndex);

    const head = document.createElement("header");
    head.className = "grouping-group-head";
    const heading = document.createElement("h3"); heading.textContent = groupTitle;
    const place = button("Положить сюда", () => placeSelected(groupIndex), "button secondary grouping-place-button");
    place.disabled = busy || session.finished || selectedWord === null;
    place.setAttribute("aria-label", `Положить выбранное слово в группу «${groupTitle}»`);
    head.append(heading, place);

    const words = document.createElement("ul");
    words.className = "grouping-group-words";
    const placed = session.tiles.filter(tile => tile.solved && tile.group === groupIndex);
    if (placed.length) {
      for (const tile of placed) {
        const item = document.createElement("li");
        const chip = document.createElement("span");
        chip.className = "grouping-placed";
        chip.dataset.word = String(tile.index);
        chip.textContent = tile.text;
        item.append(chip); words.append(item);
      }
    } else {
      const empty = document.createElement("li");
      empty.className = "grouping-empty"; empty.textContent = "Пока пусто";
      words.append(empty);
    }
    section.append(head, words);
    section.addEventListener("click", event => {
      if (event.target.closest("button")) return;
      placeSelected(groupIndex);
    });
    return section;
  }

  function selectWord(index) {
    if (busy || !session || session.finished) return;
    selectedWord = selectedWord === index ? null : index;
    result.textContent = selectedWord === null
      ? ""
      : `Выбрано слово «${session.tiles.find(tile => tile.index === index)?.text ?? ""}». Выберите группу.`;
    updateSelection();
  }

  function updateSelection() {
    if (!session) return;
    for (const tile of pool.querySelectorAll(".grouping-tile")) {
      const selected = Number(tile.dataset.index) === selectedWord;
      tile.classList.toggle("is-selected", selected);
      tile.setAttribute("aria-pressed", String(selected));
    }
    for (const place of groupsBox.querySelectorAll(".grouping-place-button")) {
      place.disabled = busy || session.finished || selectedWord === null;
    }
  }

  function placeSelected(groupIndex) {
    if (busy || !session || session.finished) return;
    if (selectedWord === null) {
      result.textContent = "Сначала выберите слово.";
      return;
    }
    check(selectedWord, groupIndex);
  }

  function attachDrag(element, index) {
    element.addEventListener("pointerdown", event => {
      if (busy || !session || session.finished || element.disabled || !event.isPrimary || event.button !== 0) return;
      suppressClick = false;
      drag = { index, element, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
      element.setPointerCapture(event.pointerId);
    });
    element.addEventListener("pointermove", event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6) {
        drag.moved = true;
        drag.element.classList.add("is-dragging");
        if (selectedWord !== index) { selectedWord = index; updateSelection(); }
      }
      if (drag.moved) highlightTarget(event.clientX, event.clientY);
    });
    element.addEventListener("pointerup", event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const moved = drag.moved;
      const x = event.clientX, y = event.clientY;
      cancelDrag();
      if (!moved) return;
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      const target = document.elementFromPoint(x, y)?.closest(".grouping-group");
      if (target && groupsBox.contains(target)) check(index, Number(target.dataset.group));
      else result.textContent = "Слово не попало в группу. Попробуйте ещё раз.";
    });
    element.addEventListener("pointercancel", cancelDrag);
    element.addEventListener("lostpointercapture", cancelDrag);
  }

  function highlightTarget(x, y) {
    const target = document.elementFromPoint(x, y)?.closest(".grouping-group");
    for (const node of groupsBox.querySelectorAll(".grouping-group")) {
      node.classList.toggle("is-drop-target", node === target);
    }
  }

  function cancelDrag() {
    if (!drag) return;
    const previous = drag;
    drag = null;
    if (previous.element.hasPointerCapture(previous.pointerId))
      previous.element.releasePointerCapture(previous.pointerId);
    previous.element.classList.remove("is-dragging");
    for (const node of groupsBox.querySelectorAll(".grouping-group")) node.classList.remove("is-drop-target");
  }

  root.addEventListener("keydown", event => {
    if (event.key !== "Escape" || busy || !session) return;
    cancelDrag();
    selectedWord = null;
    result.textContent = "Выбор отменён.";
    updateSelection();
  });

  async function check(wordIndex, groupIndex) {
    if (busy || !session || session.finished) return;
    busy = true;
    selectedWord = null;
    render();
    const gen = generation;
    const sid = session.sessionId;
    let flashKind = null;
    try {
      const response = await AdamApi(`/groupings/sessions/${sid}/check`, {
        method: "POST",
        body: JSON.stringify({ wordIndex, groupIndex })
      });
      if (gen !== generation || !session || session.sessionId !== sid) return;
      session.tiles = response.tiles;
      session.placed = response.placed;
      session.total = response.total;
      session.finished = response.finished;
      const word = session.tiles.find(tile => tile.index === wordIndex);
      const groupTitle = session.groups[groupIndex];
      if (response.correct) {
        result.textContent = `Верно! «${word?.text ?? ""}» — ${groupTitle}.`;
        flashKind = "correct";
      } else {
        result.textContent = "Не подходит. Попробуйте другую группу.";
        flashKind = "wrong";
      }
      if (response.finished) {
        result.textContent = `Все слова разложены: ${response.total} из ${response.total}.`;
      }
    } catch (error) {
      if (gen !== generation || !session || session.sessionId !== sid) return;
      result.textContent = error.message;
      if (error.status === 404) { back(); return; }
    } finally {
      if (gen === generation) {
        busy = false;
        render();
        if (flashKind) applyFlash(wordIndex, groupIndex, flashKind);
        const focus = session.finished
          ? summaryBox.querySelector("button")
          : pool.querySelector(`[data-index="${wordIndex}"]`) || pool.querySelector("button:enabled") || $("grouping-back-link");
        focus?.focus({ preventScroll: true });
      }
    }
  }

  function applyFlash(wordIndex, groupIndex, kind) {
    const group = groupsBox.querySelector(`[data-group="${groupIndex}"]`);
    if (kind === "correct") group?.classList.add("is-correct");
    else {
      group?.classList.add("is-wrong");
      pool.querySelector(`[data-index="${wordIndex}"]`)?.classList.add("is-wrong");
    }
    const gen = generation;
    setTimeout(() => {
      if (gen !== generation) return;
      groupsBox.querySelectorAll(".is-wrong, .is-correct").forEach(node => node.classList.remove("is-wrong", "is-correct"));
      pool.querySelectorAll(".is-wrong").forEach(node => node.classList.remove("is-wrong"));
    }, 700);
  }

  function renderSummary() {
    summaryBox.replaceChildren();
    const text = document.createElement("p");
    text.textContent = `Все слова разложены: ${session.total} из ${session.total}.`;
    summaryBox.append(text,
      button("Пройти заново", () => start(session.materialId), "button primary"),
      button("К списку", back, "button secondary"));
  }

  function renderWords() {
    const key = `${session.sessionId}:${(session.words ?? []).map(word => word.id).join(",")}`;
    if (key === renderedWordsKey) return;
    renderedWordsKey = key;
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
    cancelDrag();
    generation++;
    busy = false;
    session = null;
    selectedWord = null;
    renderedWordsKey = null;
    play.hidden = true; list.hidden = false;
    result.textContent = "";
    summaryBox.hidden = true; summaryBox.replaceChildren();
    load();
  }

  $("grouping-back-link").addEventListener("click", event => { event.preventDefault(); back(); });
  load();
})();
