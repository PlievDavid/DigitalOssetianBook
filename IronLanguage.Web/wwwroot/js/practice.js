(() => {
  const root = document.getElementById("exercise-app");
  if (!root) return;
  const kind = root.dataset.kind;
  const audioFlow = kind === "audio";
  const $ = id => document.getElementById(id);
  const status = $("exercise-status");
  const list = $("exercise-list");
  const play = $("exercise-play");
  const picked = $("exercise-picked");
  const tiles = $("exercise-tiles");
  const tilesBlock = $("exercise-tiles-block");
  const stepsBlock = $("exercise-steps");
  const slots = $("exercise-step-slots");
  const options = $("exercise-options");
  const progress = $("exercise-progress");
  const hint = $("exercise-hint");
  const eyebrow = $("exercise-eyebrow");
  const result = $("exercise-result");
  const audio = $("exercise-audio");
  const submit = $("exercise-submit");
  const clear = $("exercise-clear");
  let card, attemptId, indices = [], submitted = false, pendingDraft = Promise.resolve();

  const button = (label, action, className = "button secondary") => {
    const b = document.createElement("button"); b.type = "button"; b.className = className; b.textContent = label; b.addEventListener("click", action); return b;
  };
  const norm = value => value.trim().replace(/\s+/g, " ").toUpperCase();
  const render = () => { if (audioFlow) renderSteps(); else renderTiles(); };
  async function load() {
    status.textContent = "Загрузка…";
    try {
      const data = await AdamApi("/catalog");
      const exercises = data.exercises.filter(x => x.kind === kind);
      list.replaceChildren();
      for (const item of exercises) {
        const cardEl = document.createElement("article"); cardEl.className = "exercise-entry";
        if (kind === "audio") {
          const image = document.createElement("img"); image.src = "/images/audio-greeting.png";
          image.alt = "Два собеседника приветствуют друг друга"; cardEl.append(image);
        }
        const copy = document.createElement("div"); copy.className = "exercise-entry-copy";
        const eyebrowEl = document.createElement("span"); eyebrowEl.className = "eyebrow";
        eyebrowEl.textContent = kind === "audio" ? "АУДИРОВАНИЕ" : "ПЕРЕВОД";
        const title = document.createElement("h2"); title.textContent = item.russianPrompt;
        const description = document.createElement("p");
        description.textContent = kind === "audio"
          ? "Прослушайте запись и выберите слово из трёх вариантов на каждом шаге."
          : "Соберите фразу из предложенных слов.";
        copy.append(eyebrowEl, title, description, button("Начать упражнение →", () => start(item.id), "button primary"));
        cardEl.append(copy); list.append(cardEl);
      }
      status.textContent = exercises.length ? "Выберите задание." : "Пока нет проверенных материалов для этого раздела.";
    } catch (error) { status.textContent = error.message; }
  }
  async function start(id) {
    try {
      const data = await AdamApi(`/exercises/${id}/attempts`, { method: "POST" });
      card = data.card; attemptId = data.attemptId; submitted = false;
      const draft = data.draftIndices || [];
      indices = audioFlow ? (draft.every((value, position) => value === position) ? [...draft] : []) : [...draft];
      list.hidden = true; play.hidden = false; result.textContent = ""; result.className = ""; status.textContent = ""; clear.hidden = false;
      eyebrow.hidden = !audioFlow; if (audioFlow) eyebrow.textContent = "ПЕРЕВОД";
      $("exercise-prompt").textContent = card.russianPrompt;
      tilesBlock.hidden = audioFlow; stepsBlock.hidden = !audioFlow;
      hint.hidden = true;
      submit.hidden = audioFlow; submit.textContent = "Проверить ответ";
      audio.hidden = !audioFlow; $("exercise-audio-error").hidden = true;
      if (audioFlow) { audio.src = card.audioPath; audio.load(); audio.play().catch(() => {}); }
      render();
      if (audioFlow && indices.length === card.tokens.length && indices.length && audio.readyState >= 2 && !audio.error) submitAnswer();
    } catch (error) { status.textContent = error.message; }
  }
  function renderTiles() {
    picked.replaceChildren(); tiles.replaceChildren();
    indices.forEach((index, position) => picked.append(button(card.tokens[index], () => { if (!submitted) { indices.splice(position, 1); renderTiles(); saveDraft(); } }, "word-tile selected")));
    card.tokens.forEach((word, index) => { if (!indices.includes(index)) tiles.append(button(word, () => { if (!submitted) { indices.push(index); renderTiles(); saveDraft(); } }, "word-tile")); });
    submit.disabled = indices.length < 2 || submitted;
    clear.disabled = !indices.length || submitted;
  }
  function renderSteps() {
    slots.replaceChildren();
    indices.forEach(index => {
      const slot = document.createElement("span"); slot.className = "word-tile selected"; slot.textContent = card.tokens[index]; slots.append(slot);
    });
    const step = indices.length;
    progress.textContent = step < card.tokens.length ? `Слово ${step + 1} из ${card.tokens.length}` : "Фраза собрана.";
    $("exercise-options-label").hidden = step >= card.tokens.length;
    options.replaceChildren();
    const ready = !audio.error && audio.readyState >= 2;
    if (step < card.tokens.length) {
      const choices = card.steps && card.steps[step] ? card.steps[step] : [card.tokens[step]];
      choices.forEach(word => {
        const choice = button(word, () => pick(word, step), "word-tile");
        choice.disabled = submitted || !ready;
        options.append(choice);
      });
    }
    clear.disabled = !indices.length || submitted;
  }
  function pick(word, step) {
    if (submitted || step !== indices.length) return;
    if (norm(word) === norm(card.tokens[step])) {
      hint.hidden = true;
      indices.push(step);
      renderSteps(); saveDraft();
      if (indices.length === card.tokens.length) submitAnswer();
      return;
    }
    hint.hidden = false;
    const choice = Array.from(options.children).find(element => element.textContent === word && !element.disabled);
    if (choice) {
      choice.disabled = true;
      choice.classList.add("is-wrong", "shake");
      choice.addEventListener("animationend", () => choice.classList.remove("shake"), { once: true });
    }
  }
  audio.addEventListener("error", () => {
    if (!audioFlow || !card) return;
    $("exercise-audio-error").hidden = false;
    renderSteps();
  });
  audio.addEventListener("canplay", () => {
    if (!audioFlow || !card) return;
    $("exercise-audio-error").hidden = true;
    renderSteps();
    if (!submitted && indices.length > 0 && indices.length === card.tokens.length) submitAnswer();
  });
  function saveDraft() {
    if (!AdamAuthenticated) return;
    const current = [...indices], id = attemptId;
    pendingDraft = pendingDraft.catch(() => {}).then(() => AdamApi(`/attempts/${id}/draft`, { method: "PUT", body: JSON.stringify({ tokenIndices: current }) }))
      .catch(error => { status.textContent = `Не удалось сохранить выбранные слова: ${error.message}`; });
  }
  async function submitAnswer() {
    if (submitted) return;
    if (audioFlow && audio.error) { $("exercise-audio-error").hidden = false; return; }
    try {
      await pendingDraft;
      const answer = await AdamApi(`/attempts/${attemptId}/answer`, { method: "POST", body: JSON.stringify({ tokenIndices: indices }) });
      submitted = true;
      submit.hidden = audioFlow; submit.textContent = "Проверить ответ"; submit.disabled = true;
      hint.hidden = true; clear.hidden = true;
      render();
      result.className = answer.correct ? "exercise-feedback is-correct" : "exercise-feedback is-incorrect";
      result.textContent = audioFlow
        ? (answer.correct ? `Верно! ${answer.explanation || ""}`.trim() : `Пока неверно. Правильный ответ: ${answer.expectedAnswer}. ${answer.explanation || ""}`)
        : `${answer.correct ? "Верно!" : "Пока неверно."} Правильный ответ: ${answer.expectedAnswer}. ${answer.explanation || ""}`;
      result.append(button(audioFlow ? "К аудиопазлам" : "К переводу фраз", back));
      const words = $("exercise-words"); words.replaceChildren();
      for (const word of card.words) {
        const el = document.createElement("div"); el.className = "feature-card";
        const title = document.createElement("h3"); title.textContent = `${word.ossetian} — ${word.russian}`;
        el.append(title);
        if (AdamAuthenticated) el.append(button("В мой словарь", async () => {
          try { await AdamApi(`/vocabulary/${word.id}`, { method: "POST" }); status.textContent = "Слово сохранено."; }
          catch (error) { status.textContent = error.message; }
        })); words.append(el);
      }
    } catch (error) {
      result.className = "";
      result.textContent = error.message;
      if (audioFlow && indices.length === card.tokens.length) {
        submit.hidden = false; submit.disabled = false; submit.textContent = "Отправить ответ";
      }
    }
  }
  submit.addEventListener("click", submitAnswer);
  function back() { audio.pause(); play.hidden = true; list.hidden = false; load(); }
  $("exercise-back").addEventListener("click", event => { event.preventDefault(); back(); });
  clear.addEventListener("click", () => {
    if (submitted) return;
    indices = []; hint.hidden = true;
    render(); saveDraft();
  });
  load();
})();
