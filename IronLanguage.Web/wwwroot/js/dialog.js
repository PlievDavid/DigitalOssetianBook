(() => {
  const root = document.getElementById("dialog-app");
  if (!root) return;
  const $ = id => document.getElementById(id);
  const status = $("dialog-status");
  const list = $("dialog-list");
  const play = $("dialog-play");
  const feed = $("dialog-feed");
  const hintBox = $("dialog-hint");
  const result = $("dialog-result");
  const summaryBox = $("dialog-summary");
  const composer = $("dialog-composer");
  const optionsBox = $("dialog-options");
  const input = $("dialog-input");
  const sendButton = $("dialog-send");
  const skipButton = $("dialog-skip");
  const wordPopup = $("dialog-word-popup");
  let session = null;
  let busy = false;
  let lastValue = "";
  let meanings = new Map();

  const dialectLabel = dialect => dialect === "Dval" ? "Дигорский" : "Иронский";
  const button = (label, action, className = "button secondary") => {
    const b = document.createElement("button"); b.type = "button"; b.className = className;
    b.textContent = label; b.addEventListener("click", action); return b;
  };

  async function load() {
    status.textContent = "Загрузка…";
    try {
      const [dialogs, history] = await Promise.all([AdamApi("/dialogs"), AdamApi("/dialogs/sessions/history")]);
      list.replaceChildren();
      for (const item of dialogs) {
        const card = document.createElement("article"); card.className = "exercise-entry";
        const copy = document.createElement("div"); copy.className = "exercise-entry-copy";
        const eyebrow = document.createElement("span"); eyebrow.className = "eyebrow";
        eyebrow.textContent = `ДИАЛОГ · ${dialectLabel(item.dialect).toUpperCase()} · УРОВЕНЬ ${item.level}`;
        const title = document.createElement("h2"); title.textContent = item.title;
        const description = document.createElement("p");
        description.textContent = "Отвечайте на реплики собеседника: выбирайте готовый ответ или пишите своим текстом.";
        copy.append(eyebrow, title, description, button("Начать диалог →", () => start(item.id), "button primary"));
        card.append(copy); list.append(card);
      }
      renderHistory(history);
      status.textContent = dialogs.length ? "Выберите диалог." : "Пока нет опубликованных диалогов.";
    } catch (error) { status.textContent = error.message; }
  }

  function renderHistory(history) {
    const block = $("dialog-history");
    block.replaceChildren();
    if (!history.length) {
      const empty = document.createElement("p"); empty.className = "field-help";
      empty.textContent = "Пройденных диалогов пока нет.";
      block.append(empty); return;
    }
    for (const item of history) {
      const row = document.createElement("div"); row.className = "dialog-history-row";
      const date = new Date(item.completedAt);
      const when = document.createElement("span"); when.textContent = date.toLocaleDateString("ru-RU");
      const title = document.createElement("strong"); title.textContent = item.title;
      const counters = document.createElement("span"); counters.className = "field-help";
      counters.textContent = `ходов ${item.turns} · ошибок ${item.errors} · подсказок ${item.hints}`;
      row.append(when, title, counters); block.append(row);
    }
  }

  async function start(id) {
    try {
      session = await AdamApi(`/dialogs/${id}/sessions`, { method: "POST" });
      list.hidden = true; $("dialog-history-block").hidden = true; play.hidden = false;
      $("dialog-title").textContent = session.title;
      feed.replaceChildren(); result.textContent = ""; summaryBox.hidden = true;
      closeWord();
      meanings.clear();
      rememberDictionary(session);
      renderLines(session.lines, null, true);
      renderTurn();
      updateCounters();
      status.textContent = "";
    } catch (error) { status.textContent = error.message; }
  }

  function rememberDictionary(source) {
    for (const meaning of (source && source.dictionary) || []) meanings.set(meaning.id, meaning);
  }

  function closeWord() {
    if (!wordPopup) return;
    wordPopup.hidden = true; wordPopup.replaceChildren();
    feed.querySelectorAll(".dialog-current").forEach(node => node.classList.remove("dialog-current"));
  }

  function showWord(word, span) {
    if (!wordPopup) return;
    feed.querySelectorAll(".dialog-current").forEach(node => node.classList.remove("dialog-current"));
    if (span) span.classList.add("dialog-current");
    wordPopup.replaceChildren();
    const header = document.createElement("div"); header.className = "reader-popup-header";
    const heading = document.createElement("strong"); heading.textContent = word.text;
    const close = document.createElement("button"); close.type = "button"; close.textContent = "×";
    close.setAttribute("aria-label", "Закрыть перевод");
    close.addEventListener("click", closeWord);
    header.append(heading, close); wordPopup.append(header);
    const entries = (word.matches || []).map(match => ({ match, meaning: meanings.get(match.senseId) }))
      .filter(entry => entry.meaning);
    for (const { match, meaning } of entries) {
      const entry = document.createElement("div"); entry.className = "reader-meaning";
      const title = document.createElement("strong");
      title.textContent = `${match.approximate ? "Возможно: " : ""}${meaning.ossetian} — ${meaning.russianHeadword}`;
      entry.append(title);
      if (meaning.note) { const note = document.createElement("p"); note.textContent = meaning.note; entry.append(note); }
      const save = button("В мой словарь", async () => {
        try {
          await AdamApi(`/vocabulary/dictionary/${meaning.id}`, { method: "POST" });
          save.textContent = "Сохранено"; save.disabled = true;
        } catch (error) { status.textContent = error.message; }
      }, "book-text-button");
      entry.append(save);
      wordPopup.append(entry);
    }
    if (!entries.length) {
      const missing = document.createElement("p");
      missing.textContent = "Перевод пока не найден в словаре.";
      wordPopup.append(missing);
    }
    wordPopup.hidden = false; wordPopup.scrollTop = 0;
  }

  function appendWords(bubble, line) {
    let cursor = 0;
    for (const word of line.words || []) {
      bubble.append(document.createTextNode(line.text.slice(cursor, word.position)));
      const span = document.createElement("span"); span.className = "dialog-word";
      span.dataset.word = word.text; span.dataset.position = String(word.position);
      span.textContent = word.text;
      span.tabIndex = 0;
      span.setAttribute("role", "button");
      span.setAttribute("aria-label", `Перевод слова ${word.text}`);
      span.addEventListener("click", () => showWord(word, span));
      span.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); showWord(word, span); }
      });
      bubble.append(span);
      cursor = word.position + word.text.length;
    }
    bubble.append(document.createTextNode(line.text.slice(cursor)));
  }

  function lineElement(line, correct) {
    const row = document.createElement("div");
    row.className = `dialog-line dialog-line--${line.side}` + (correct === true ? " is-right" : correct === false ? " is-wrong" : "");
    const bubble = document.createElement("div"); bubble.className = "dialog-bubble";
    if (line.side === "npc") {
      const avatar = document.createElement("span"); avatar.className = "dialog-avatar";
      avatar.style.background = line.color;
      avatar.textContent = (line.name || "?").trim().charAt(0).toUpperCase();
      const name = document.createElement("strong"); name.className = "dialog-name"; name.textContent = line.name;
      bubble.append(name);
      appendWords(bubble, line);
      row.append(avatar, bubble);
    } else {
      appendWords(bubble, line);
      row.append(bubble);
    }
    return row;
  }

  function renderLines(lines, correct, all) {
    const items = lines || [];
    const answerIndex = items.findIndex(line => line.side === "student");
    const markedIndex = answerIndex >= 0 ? answerIndex : items.length - 1;
    items.forEach((line, index) => {
      feed.append(lineElement(line, all ? null : index === markedIndex ? correct : null));
    });
    feed.scrollTop = feed.scrollHeight;
  }

  function updateCounters() {
    const c = session.counters;
    $("dialog-counters").textContent = `Попытки: ${c.attempts} · Ошибки: ${c.errors} · Подсказки: ${c.hints}`;
  }

  function renderTurn() {
    hintBox.hidden = true;
    if (!session || session.finished) { composer.hidden = true; renderSummary(); return; }
    const turn = session.turn;
    if (!turn) { composer.hidden = true; return; }
    composer.hidden = false;
    summaryBox.hidden = true;
    const isChoice = turn.kind === "choice";
    optionsBox.hidden = !isChoice;
    input.hidden = isChoice;
    sendButton.hidden = isChoice;
    skipButton.hidden = !turn.skippable;
    if (isChoice) {
      const shuffled = turn.options.map((text, index) => ({ text, index }))
        .sort(() => Math.random() - 0.5);
      optionsBox.replaceChildren(...shuffled.map(entry => {
        const b = button(entry.text, () => send(entry.text), "dialog-option");
        b.dataset.index = String(entry.index);
        return b;
      }));
    } else {
      input.value = ""; input.focus();
    }
    setBusy(false);
  }

  function renderSummary() {
    composer.hidden = true; hintBox.hidden = true;
    const s = session.summary;
    summaryBox.hidden = false;
    summaryBox.replaceChildren();
    const text = document.createElement("p");
    text.textContent = s
      ? `Диалог пройден. Ходов: ${s.turns}, ошибок: ${s.errors}, подсказок: ${s.hints}.`
      : "Диалог уже завершён.";
    summaryBox.append(text,
      button("Пройти заново", () => start(session.dialogueId), "button primary"),
      button("К списку", back, "button secondary"));
  }

  function setBusy(value) {
    busy = value;
    sendButton.disabled = value;
    skipButton.disabled = value;
    input.disabled = value;
    optionsBox.querySelectorAll("button").forEach(b => { b.disabled = value; });
  }

  function commonPrefix(a, b) {
    let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return i;
  }
  function commonSuffix(a, b, from) {
    let i = 0; while (i < from && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
    return i;
  }

  function showHint(hint) {
    hintBox.hidden = false;
    hintBox.replaceChildren();
    const turn = session.turn;
    if (turn.kind === "choice") {
      const target = optionsBox.querySelector(`[data-index="${hint.correctIndex}"]`);
      if (target) target.classList.add("is-hint");
      const label = document.createElement("span");
      label.textContent = hint.stage >= 2 && hint.expected
        ? `Подсказка: верный ответ — ${hint.expected}.`
        : "Подсказка: верная кнопка выделена.";
      hintBox.append(label);
      return;
    }
    if (hint.stage === 1) {
      const label = document.createElement("span");
      label.textContent = `Подсказка: ответ начинается с «${hint.prefix}».`;
      hintBox.append(label);
      return;
    }
    const label = document.createElement("span");
    label.textContent = "Подсказка: правильный ответ — ";
    hintBox.append(label);
    const expected = hint.expected || "";
    const value = lastValue || "";
    const prefix = commonPrefix(expected, value);
    const suffix = commonSuffix(expected, value, expected.length - prefix);
    if (value && prefix + suffix < expected.length) {
      hintBox.append(document.createTextNode(expected.slice(0, prefix)));
      const mark = document.createElement("strong"); mark.className = "dialog-hint-diff";
      mark.textContent = expected.slice(prefix, expected.length - suffix);
      hintBox.append(mark, document.createTextNode(expected.slice(expected.length - suffix)));
    } else {
      const strong = document.createElement("strong"); strong.textContent = expected;
      hintBox.append(strong);
    }
  }

  async function send(value, skip = false) {
    if (busy || !session || session.finished || !session.turn) return;
    setBusy(true);
    result.textContent = "";
    try {
      const response = await AdamApi(`/dialogs/sessions/${session.sessionId}/answer`, {
        method: "POST",
        body: JSON.stringify({ turnId: session.turn.line, value, skip })
      });
      lastValue = skip ? "" : (value || "").trim();
      session.lines = session.lines.concat(response.lines);
      session.turn = response.turn;
      session.finished = response.finished;
      session.summary = response.summary;
      session.counters = response.counters;
      closeWord();
      rememberDictionary(response);
      renderLines(response.lines, response.correct, false);
      updateCounters();
      if (response.finished) renderSummary(); else renderTurn();
      if (response.correct) hintBox.hidden = true;
      else if (response.hint) showHint(response.hint);
    } catch (error) {
      result.textContent = error.message;
      setBusy(false);
      if (!isChoice()) input.focus();
    }
  }

  const isChoice = () => session && session.turn && session.turn.kind === "choice";

  function back() {
    closeWord();
    play.hidden = true; list.hidden = false; $("dialog-history-block").hidden = false;
    session = null; load();
  }

  sendButton.addEventListener("click", () => send(input.value));
  skipButton.addEventListener("click", () => send(null, true));
  input.addEventListener("keydown", event => { if (event.key === "Enter") send(input.value); });
  $("dialog-back-link").addEventListener("click", event => { event.preventDefault(); back(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeWord(); });
  load();
})();
