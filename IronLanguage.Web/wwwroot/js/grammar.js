(() => {
  const root = document.getElementById("grammar-app");
  if (!root) return;
  const $ = id => document.getElementById(id);
  const status = $("grammar-status");
  const list = $("grammar-list");
  const play = $("grammar-play");
  const result = $("grammar-result");
  const wordsBox = $("grammar-words");
  const ruleBox = $("grammar-rule");
  const sentence = $("grammar-sentence");
  const wordPopup = $("grammar-word-popup");
  let session = null;
  let meanings = new Map();
  let busy = false;
  let generation = 0;

  const button = (label, action, className = "button secondary") => {
    const b = document.createElement("button"); b.type = "button"; b.className = className;
    b.textContent = label; b.addEventListener("click", action); return b;
  };

  const norm = value => (value || "")
    .normalize("NFC")
    .replace(/[«»"'`]/g, "")
    .replace(/[æÆ]/g, "ӕ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  async function load() {
    status.textContent = "Загрузка…";
    try {
      const items = await AdamApi("/grammars");
      list.replaceChildren();
      for (const item of items) {
        const card = document.createElement("article"); card.className = "exercise-entry";
        const copy = document.createElement("div"); copy.className = "exercise-entry-copy";
        const eyebrow = document.createElement("span"); eyebrow.className = "eyebrow";
        eyebrow.textContent = "ФОРМА СЛОВА";
        const title = document.createElement("h2"); title.textContent = item.title;
        const description = document.createElement("p");
        description.textContent = "Выберите правильную форму слова в предложении.";
        copy.append(eyebrow, title, description, button("Начать →", () => start(item.id), "button primary"));
        const art = document.createElement("span"); art.className = "exercise-entry-icon";
        art.setAttribute("aria-hidden", "true"); art.append(root.querySelector(".section-symbol svg").cloneNode(true));
        card.append(art, copy); list.append(card);
      }
      status.textContent = items.length ? "Выберите задание." : "Пока нет опубликованных заданий.";
    } catch (error) { status.textContent = error.message; }
  }

  async function start(id) {
    if (busy) return;
    busy = true;
    const gen = ++generation;
    try {
      const next = await AdamApi(`/grammars/${id}/sessions`, { method: "POST" });
      if (gen !== generation) return;
      busy = false;
      session = next;
      meanings.clear();
      rememberDictionary(session);
      sessionStorage.setItem("adam.grammar.session", session.sessionId);
      list.hidden = true; play.hidden = false;
      closeWord();
      render();
      status.textContent = "";
    } catch (error) {
      if (gen === generation) { busy = false; status.textContent = error.message; }
    }
  }

  function rememberDictionary(source) {
    for (const meaning of (source && source.dictionary) || []) meanings.set(meaning.id, meaning);
  }

  function closeWord() {
    if (!wordPopup) return;
    wordPopup.hidden = true;
    wordPopup.replaceChildren();
    sentence.querySelectorAll(".grammar-word-current").forEach(node => node.classList.remove("grammar-word-current"));
  }

  function showWord(word, span) {
    if (!wordPopup) return;
    sentence.querySelectorAll(".grammar-word-current").forEach(node => node.classList.remove("grammar-word-current"));
    if (span) span.classList.add("grammar-word-current");
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
      title.textContent = `${match.approximate ? "Возможно: " : ""}${meaning.ossetian} — ${meaning.russianHeadword || meaning.russian}`;
      entry.append(title);
      if (meaning.note) { const note = document.createElement("p"); note.textContent = meaning.note; entry.append(note); }
      const save = button("В мой словарь", async () => {
        try {
          await AdamApi(`/vocabulary/dictionary/${meaning.id}`, { method: "POST" });
          save.textContent = "Сохранено"; save.disabled = true;
        } catch (error) { status.textContent = error.message; }
      }, "book-text-button");
      if (AdamAuthenticated) entry.append(save);
      wordPopup.append(entry);
    }
    if (!entries.length) {
      const missing = document.createElement("p");
      missing.textContent = "Перевод пока не найден в словаре.";
      wordPopup.append(missing);
    }
    wordPopup.hidden = false; wordPopup.scrollTop = 0;
  }

  function displayPrompt() {
    // После верного ответа (или второго) подставляем форму вместо метки пропуска.
    if (session.answered && session.correctForm && session.blank) {
      const index = session.prompt.indexOf(session.blank);
      if (index >= 0) return session.prompt.slice(0, index) + session.correctForm + session.prompt.slice(index + session.blank.length);
    }
    return session.prompt;
  }

  // Подставленная правильная форма выделяется классом .grammar-inserted (см. grammar.css).
  function insertedRange() {
    if (!session.answered || !session.correctForm || !session.blank) return null;
    const index = session.prompt.indexOf(session.blank);
    return index < 0 ? null : { start: index, end: index + session.correctForm.length };
  }

  function makeWordSpan(word) {
    const span = document.createElement("span"); span.className = "grammar-word";
    span.dataset.word = word.text; span.dataset.position = String(word.position);
    span.textContent = word.text;
    const range = insertedRange();
    if (range && word.position <= range.start && word.position + word.text.length >= range.end) span.classList.add("grammar-inserted");
    span.tabIndex = 0;
    span.setAttribute("role", "button");
    span.setAttribute("aria-label", `Перевод слова ${word.text}`);
    span.addEventListener("click", () => showWord(word, span));
    span.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); showWord(word, span); }
    });
    return span;
  }

  // Добавляет кусок предложения, разрезая его по границам вставленной формы.
  function appendText(base, from, to) {
    const range = insertedRange();
    const start = range ? Math.max(from, range.start) : to;
    const end = range ? Math.min(to, range.end) : from;
    if (start >= end) { if (to > from) sentence.append(document.createTextNode(base.slice(from, to))); return; }
    if (start > from) sentence.append(document.createTextNode(base.slice(from, start)));
    const mark = document.createElement("span");
    mark.className = "grammar-inserted";
    mark.textContent = base.slice(start, end);
    sentence.append(mark);
    if (to > end) sentence.append(document.createTextNode(base.slice(end, to)));
  }

  function renderSentence() {
    closeWord();
    sentence.replaceChildren();
    const base = displayPrompt();
    const words = session.sentence || [];
    if (!words.length) { appendText(base, 0, base.length); return; }
    let cursor = 0;
    for (const word of words) {
      if (word.position < cursor) continue;
      appendText(base, cursor, word.position);
      sentence.append(makeWordSpan(word));
      cursor = word.position + word.text.length;
    }
    appendText(base, cursor, base.length);
  }

  function render() {
    $("grammar-title").textContent = session.title;
    result.textContent = "";
    result.className = "exercise-feedback";
    result.hidden = true;
    wordsBox.replaceChildren();
    ruleBox.hidden = true;
    ruleBox.textContent = "";
    renderSentence();
    const optionsBox = $("grammar-options");
    optionsBox.replaceChildren();
    if (session.answered) {
      $("grammar-instructions").textContent = "Ответ уже принят.";
      showResult(session.correct, session.correctForm, session.rule, null);
      return;
    }
    $("grammar-instructions").textContent = "Выберите форму слова, которая подходит в предложении.";
    (session.options || []).forEach((text, index) => {
      const choice = button(text, () => submitChoice(index), "word-tile grammar-option");
      choice.disabled = busy;
      optionsBox.append(choice);
    });
    if (session.attempts > 0 && session.showRule && session.rule) {
      ruleBox.hidden = false;
      ruleBox.textContent = `Подсказка: ${session.rule}`;
    }
  }

  async function submitChoice(optionIndex) {
    if (busy || !session || session.answered) return;
    await check({ optionIndex }, optionIndex);
  }

  async function check(payload, selectedIndex) {
    busy = true;
    const gen = generation;
    const sid = session.sessionId;
    for (const node of $("grammar-options").children) node.disabled = true;
    try {
      const response = await AdamApi(`/grammars/sessions/${sid}/check`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (gen !== generation || !session || session.sessionId !== sid) return;
      session.correct = response.correct;
      session.attempts = response.attempts;
      session.showRule = response.showRule;
      session.rule = response.rule;
      session.correctForm = response.correctForm;
      // Пустой массив от сервера не должен затирать уже загруженные слова.
      if (Array.isArray(response.words) && response.words.length) session.words = response.words;
      else session.words = session.words || [];
      session.sentence = response.sentence || session.sentence || [];
      rememberDictionary(response);
      if (response.finished) {
        session.answered = true;
        showResult(response.correct, response.correctForm, response.rule, selectedIndex);
        busy = false;
        const focusTarget = result.hidden === false ? (result.querySelector("button") || result) : $("grammar-back-link");
        focusTarget.focus?.({ preventScroll: true });
      } else {
        // Первая ошибка: подсказка, форма скрыта, можно выбрать снова (неверный вариант — disabled).
        session.answered = false;
        renderSentence();
        const nodes = [...$("grammar-options").children];
        nodes.forEach((node, index) => { node.disabled = index === selectedIndex; });
        result.hidden = false;
        result.className = "exercise-feedback is-incorrect";
        result.textContent = "Пока неверно.";
        if (response.showRule && response.rule) {
          ruleBox.hidden = false;
          ruleBox.textContent = `Подсказка: ${response.rule}`;
        }
        markWrongOnce(selectedIndex);
        busy = false;
        const next = nodes.find(node => !node.disabled);
        (next || result).focus?.({ preventScroll: true });
      }
    } catch (error) {
      if (gen !== generation || !session || session.sessionId !== sid) return;
      result.hidden = false;
      result.className = "exercise-feedback is-incorrect";
      result.textContent = error.message;
      for (const node of $("grammar-options").children) node.disabled = false;
      busy = false;
    }
  }

  function markWrongOnce(selectedIndex) {
    const nodes = $("grammar-options").children;
    if (typeof selectedIndex !== "number" || selectedIndex < 0 || selectedIndex >= nodes.length) return;
    const wrong = nodes[selectedIndex];
    wrong.classList.add("is-wrong", "shake");
    wrong.addEventListener("animationend", () => wrong.classList.remove("shake"), { once: true });
  }

  function markOptions(correctForm, selectedIndex) {
    const nodes = $("grammar-options").children;
    if (!session.options || !nodes.length) return;
    const correctKey = norm(correctForm);
    session.options.forEach((text, index) => {
      const node = nodes[index];
      if (!node) return;
      if (norm(text) === correctKey) node.classList.add("is-correct");
    });
    if (typeof selectedIndex === "number" && selectedIndex >= 0 && selectedIndex < nodes.length
      && norm(session.options[selectedIndex]) !== correctKey) {
      const wrong = nodes[selectedIndex];
      wrong.classList.add("is-wrong", "shake");
      wrong.addEventListener("animationend", () => wrong.classList.remove("shake"), { once: true });
    }
  }

  function showResult(correct, correctForm, rule, selectedIndex) {
    markOptions(correctForm, selectedIndex);
    for (const node of $("grammar-options").children) node.disabled = true;

    // Правильная форма вставляется в предложение на место пропуска.
    renderSentence();

    result.hidden = false;
    result.className = correct ? "exercise-feedback is-correct" : "exercise-feedback is-incorrect";
    const message = document.createElement("span");
    message.textContent = correct ? "Верно!" : `Пока неверно. Правильная форма: «${correctForm}».`;
    const actions = document.createElement("div");
    actions.className = "grammar-result-actions";
    actions.append(
      button("Пройти заново", () => start(session.materialId), "button primary"),
      button("К списку", back, "button secondary")
    );
    result.replaceChildren(message, actions);

    ruleBox.hidden = !rule;
    ruleBox.textContent = rule ? `Подсказка: ${rule}` : "";

    renderWords();
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
    generation++;
    busy = false;
    play.hidden = true; list.hidden = false;
    session = null;
    closeWord();
    ruleBox.hidden = true;
    ruleBox.textContent = "";
    sentence.textContent = "";
    $("grammar-options").replaceChildren();
    load();
  }

  $("grammar-back-link").addEventListener("click", event => { event.preventDefault(); back(); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && wordPopup && !wordPopup.hidden) closeWord();
  });
  load();
})();
