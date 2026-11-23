(window.AdamExercisePlayers ??= {}).translation = function (root, embedded) {
  const kind = root.dataset.kind;
  const lessonUrl = root.dataset.startUrl;
  const inLesson = Boolean(embedded || lessonUrl);
  const audioFlow = kind === "audio";
  const $ = id => root.querySelector("#" + id);
  const status = $("exercise-status");
  const list = $("exercise-list");
  const play = $("exercise-play");
  const picked = $("exercise-picked");
  const tiles = $("exercise-tiles");
  const tileBank = $("exercise-tile-bank");
  const tilesBlock = $("exercise-tiles-block");
  const stepsBlock = $("exercise-steps");
  const slots = $("exercise-step-slots");
  const options = $("exercise-options");
  const progress = $("exercise-progress");
  const hint = $("exercise-hint");
  const eyebrow = $("exercise-eyebrow");
  const result = $("exercise-result");
  const audio = $("exercise-audio");
  const actionsBar = $("exercise-actions");
  const submit = $("exercise-submit");
  const clear = $("exercise-clear");
  let card, attemptId, indices = [], submitted = false, checking = false, pendingDraft = Promise.resolve();

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
        const copy = document.createElement("div"); copy.className = "exercise-entry-copy";
        const title = document.createElement("h2"); title.textContent = item.russianPrompt;
        const description = document.createElement("p");
        description.textContent = kind === "audio"
          ? "Прослушайте запись и выберите слово из трёх вариантов на каждом шаге."
          : "Соберите фразу из предложенных слов.";
        copy.append(title, description, button("Начать", () => start(item.id), "button primary"));
        cardEl.append(copy); list.append(cardEl);
      }
      status.textContent = exercises.length ? "Выберите задание." : "Пока нет проверенных материалов для этого раздела.";
    } catch (error) { status.textContent = error.message; }
  }
  async function start(id) {
    try {
      const data = embedded ? await embedded.load() : lessonUrl ? await AdamApi(lessonUrl.replace(/^\/api\/v1/, "")) : await AdamApi(`/exercises/${id}/attempts`, { method: "POST" });
      card = data.card; attemptId = data.attemptId; submitted = false;
      AdamAvatar.setEmotion($("exercise-avatar"), "Thinking");
      const draft = data.draftIndices || [];
      indices = audioFlow ? (draft.every((value, position) => value === position) ? [...draft] : []) : [...draft];
      list.hidden = true; play.hidden = false; result.textContent = ""; result.classList.remove("exercise-feedback", "is-correct", "is-incorrect"); status.textContent = ""; clear.hidden = false;
      actionsBar.hidden = false;
      eyebrow.hidden = !audioFlow; if (audioFlow) eyebrow.textContent = "ПЕРЕВОД";
      $("exercise-prompt").textContent = card.russianPrompt;
      tilesBlock.hidden = audioFlow; stepsBlock.hidden = !audioFlow;
      hint.hidden = true;
      submit.hidden = audioFlow; submit.textContent = "Проверить ответ";
      audio.hidden = !audioFlow; $("exercise-audio-error").hidden = true;
      if (audioFlow && card.audioPath) { audio.src = card.audioPath; audio.load(); if (!embedded) audio.play().catch(() => {}); }
      else if (audioFlow) { audio.hidden = true; $("exercise-audio-error").hidden = false; }
      render();
      if (data.completed && data.result) showAnswer(data.result);
      if (audioFlow && indices.length === card.tokens.length && indices.length && audio.readyState >= 2 && !audio.error) submitAnswer();
    } catch (error) { status.textContent = lessonUrl ? "Не удалось загрузить задание. Обновите страницу или вернитесь к содержанию курса." : error.message; }
  }
  function renderTiles() {
    picked.replaceChildren(); tiles.replaceChildren();
    indices.forEach((index, position) => picked.append(button(card.tokens[index], () => { if (!submitted && !checking) { indices.splice(position, 1); renderTiles(); saveDraft(); } }, "word-tile selected")));
    card.tokens.forEach((word, index) => { if (!indices.includes(index)) tiles.append(button(word, () => { if (!submitted && !checking) { indices.push(index); renderTiles(); saveDraft(); } }, "word-tile")); });
    tileBank.hidden = submitted;
    submit.disabled = indices.length < (embedded ? 1 : 2) || submitted || checking;
    clear.disabled = !indices.length || submitted || checking;
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
        choice.disabled = submitted || checking || !ready;
        options.append(choice);
      });
    }
    clear.disabled = !indices.length || submitted || checking;
  }
  function pick(word, step) {
    if (submitted || checking || step !== indices.length) return;
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
    if (!AdamAuthenticated && !inLesson) return;
    const current = [...indices], id = attemptId;
    const draftUrl = embedded ? null : AdamAuthenticated ? `/attempts/${id}/draft` : lessonUrl.replace(/\/exercise(?=\?|$)/, "/draft").replace(/^\/api\/v1/, "");
    pendingDraft = pendingDraft.catch(() => {}).then(() => embedded ? embedded.saveDraft(current) : AdamApi(draftUrl, { method: "PUT", body: JSON.stringify({ tokenIndices: current }) }))
      .catch(error => { status.textContent = `Не удалось сохранить выбранные слова: ${error.message}`; });
  }
  async function submitAnswer() {
    if (submitted || checking) return;
    if (audioFlow && audio.error) { $("exercise-audio-error").hidden = false; return; }
    checking = true;
    render();
    try {
      await pendingDraft;
      const answer = embedded ? await embedded.answer(indices) : await AdamApi(`/attempts/${attemptId}/answer`, { method: "POST", body: JSON.stringify({ tokenIndices: indices }) });
      showAnswer(answer);
      if (!audioFlow) {
        if (matchMedia("(prefers-reduced-motion: no-preference)").matches)
          result.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
        result.focus();
      }
    } catch (error) {
      result.classList.remove("exercise-feedback", "is-correct", "is-incorrect");
      result.textContent = error.message;
      if (audioFlow && indices.length === card.tokens.length) {
        submit.hidden = false; submit.disabled = false; submit.textContent = "Отправить ответ";
      }
    } finally {
      checking = false;
      if (!submitted) render();
    }
  }
  function showAnswer(answer) {
      submitted = true;
      AdamAvatar.setEmotion($("exercise-avatar"), answer.correct ? "Happy" : "Supportive");
      submit.hidden = true; submit.disabled = true;
      actionsBar.hidden = true;
      hint.hidden = true; clear.hidden = true;
      render();
      result.classList.add("exercise-feedback", answer.correct ? "is-correct" : "is-incorrect");
      result.textContent = answer.correct
        ? `Верно! ${answer.explanation || ""}`.trim()
        : `Пока неверно. Правильный ответ: ${answer.expectedAnswer}. ${answer.explanation || ""}`.trim();
      if (answer.correct && embedded?.replay) {
        const actions = document.createElement("div");
        actions.className = "exercise-actions";
        actions.append(button("Собрать заново", embedded.replay, "button secondary"));
        result.append(actions);
      }
      if (!inLesson) result.append(button(audioFlow ? "К аудиопазлам" : "К заданиям «Собери фразу»", back));
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
  }
  submit.addEventListener("click", submitAnswer);
  function back() { audio.pause(); play.hidden = true; list.hidden = false; load(); }
  $("exercise-back").addEventListener("click", event => { event.preventDefault(); back(); });
  clear.addEventListener("click", () => {
    if (submitted || checking) return;
    indices = []; hint.hidden = true;
    render(); saveDraft();
  });
  if (inLesson) start(); else load();
  return () => audio.pause();
};
window.AdamExercisePlayers.audio = window.AdamExercisePlayers.translation;
(() => {
  const root = document.getElementById("exercise-app");
  if (root) window.AdamExercisePlayers.translation(root);
})();
