(window.AdamExercisePlayers ??= {}).translation = function (root, embedded) {
  const ux = window.AdamExerciseUx;
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
  let card, attemptId, indices = [], submitted = false, checking = false, generation = 0, pendingDraft = Promise.resolve();

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
        list.append(window.AdamExerciseUx.card(item, item.russianPrompt, () => start(item.id)));
      }
      window.AdamExerciseUx.catalog(status, exercises.length ? "" : "Пока нет проверенных материалов для этого раздела.");
    } catch (error) {
      console.error(error);
      window.AdamExerciseUx.catalog(status, "Не удалось загрузить задания.", load);
    }
  }
  async function start(id) {
    const request = ++generation;
    checking = false;
    try {
      const data = embedded ? await embedded.load() : lessonUrl ? await AdamApi(lessonUrl.replace(/^\/api\/v1/, "")) : await AdamApi(`/exercises/${id}/attempts`, { method: "POST" });
      if (request !== generation || !root.isConnected) return;
      card = data.card; attemptId = data.attemptId; submitted = false;
      AdamAvatar.setEmotion($("exercise-avatar"), "Thinking");
      const draft = data.draftIndices || [];
      indices = audioFlow ? (draft.every((value, position) => value === position) ? [...draft] : []) : [...draft];
      list.hidden = true; play.hidden = false; result.textContent = ""; result.classList.remove("exercise-feedback", "is-correct", "is-incorrect"); status.textContent = ""; clear.hidden = false;
      picked.classList.remove("is-correct", "show-correct-transition");
      actionsBar.hidden = false;
      play.removeAttribute("aria-busy");
      eyebrow.hidden = !audioFlow; if (audioFlow) eyebrow.textContent = "ПЕРЕВОД";
      $("exercise-prompt").textContent = card.russianPrompt;
      tilesBlock.hidden = audioFlow; stepsBlock.hidden = !audioFlow;
      hint.hidden = true;
      submit.hidden = audioFlow; submit.textContent = "Проверить ответ";
      audio.hidden = !audioFlow; $("exercise-audio-error").hidden = true;
      if (audioFlow && card.audioPath) { audio.src = card.audioPath; audio.load(); if (!embedded) audio.play().catch(() => {}); }
      else if (audioFlow) { audio.hidden = true; $("exercise-audio-error").hidden = false; }
      render();
      if (!inLesson) {
        const prompt = $("exercise-prompt");
        prompt.tabIndex = -1;
        prompt.focus();
      }
      if (data.completed && data.result) showAnswer(data.result);
      if (audioFlow && indices.length === card.tokens.length && indices.length && audio.readyState >= 2 && !audio.error) submitAnswer();
    } catch (error) { if (request !== generation || !root.isConnected) return; status.textContent = lessonUrl ? "Не удалось загрузить задание. Обновите страницу или вернитесь к содержанию курса." : error.message; }
  }
  function renderTiles() {
    picked.replaceChildren(); tiles.replaceChildren();
    const tile = (index, position) => {
      const selected = position !== undefined;
      const control = button(card.tokens[index], event => moveTile(index, position, event.detail === 0),
        selected ? "word-tile selected" : "word-tile");
      control.dataset.tokenIndex = index;
      control.disabled = submitted || checking;
      return control;
    };
    indices.forEach((index, position) => picked.append(tile(index, position)));
    card.tokens.forEach((_, index) => { if (!indices.includes(index)) tiles.append(tile(index)); });
    tileBank.hidden = submitted;
    submit.disabled = indices.length < (embedded ? 1 : 2) || submitted || checking;
    clear.disabled = !indices.length || submitted || checking;
  }
  function moveTile(index, position, keyboard) {
    if (submitted || checking) return;
    const selected = position !== undefined;
    const source = selected ? picked : tiles;
    const oldPosition = [...source.children].findIndex(tile => Number(tile.dataset.tokenIndex) === index);
    if (selected) indices.splice(position, 1);
    else indices.push(index);
    renderTiles();
    ux.reveal((selected ? tiles : picked).querySelector(`[data-token-index="${index}"]`));
    if (keyboard) {
      const next = source.children[Math.min(oldPosition, source.children.length - 1)] ||
        (submit.disabled ? picked.lastElementChild : submit);
      next?.focus({ preventScroll: true });
    }
    saveDraft();
  }
  function renderSteps() {
    slots.replaceChildren();
    indices.forEach(index => {
      const slot = document.createElement("span"); slot.className = "word-tile selected"; slot.textContent = card.tokens[index]; slots.append(slot);
    });
    const step = indices.length;
    progress.hidden = submitted;
    progress.textContent = step < card.tokens.length ? `Слово ${step + 1} из ${card.tokens.length}` : "Фраза собрана.";
    $("exercise-options-label").hidden = step >= card.tokens.length;
    options.replaceChildren();
    const ready = !audio.error && audio.readyState >= 2;
    if (step < card.tokens.length) {
      const choices = card.steps && card.steps[step] ? card.steps[step] : [card.tokens[step]];
      choices.forEach(word => {
        const choice = button(word, event => pick(word, step, event.detail === 0), "word-tile");
        choice.disabled = submitted || checking || !ready;
        options.append(choice);
      });
    }
    clear.disabled = !indices.length || submitted || checking;
  }
  function pick(word, step, keyboard) {
    if (submitted || checking || step !== indices.length) return;
    if (norm(word) === norm(card.tokens[step])) {
      hint.hidden = true;
      indices.push(step);
      renderSteps();
      ux.reveal(slots.lastElementChild);
      if (keyboard) options.querySelector("button:enabled")?.focus({ preventScroll: true });
      saveDraft();
      if (indices.length === card.tokens.length) submitAnswer();
      return;
    }
    hint.hidden = false;
    const choice = Array.from(options.children).find(element => element.textContent === word && !element.disabled);
    if (choice) {
      choice.disabled = true;
      choice.classList.add("is-wrong");
      ux.reveal(choice, 120, 0);
      if (keyboard) options.querySelector("button:enabled")?.focus({ preventScroll: true });
    }
  }
  $("exercise-audio-retry").addEventListener("click", () => {
    if (card?.audioPath) audio.load();
  });
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
    const current = [...indices], id = attemptId, request = generation;
    const draftUrl = embedded ? null : AdamAuthenticated ? `/attempts/${id}/draft` : lessonUrl.replace(/\/exercise(?=\?|$)/, "/draft").replace(/^\/api\/v1/, "");
    pendingDraft = pendingDraft.catch(() => {}).then(() => embedded ? embedded.saveDraft(current) : AdamApi(draftUrl, { method: "PUT", body: JSON.stringify({ tokenIndices: current }) }))
      .catch(() => {
        if (request === generation && root.isConnected) status.textContent = "Не удалось сохранить выбранные слова.";
      });
  }
  async function submitAnswer() {
    if (submitted || checking) return;
    if (audioFlow && audio.error) { $("exercise-audio-error").hidden = false; return; }
    const request = generation, id = attemptId, selection = [...indices];
    const current = () => request === generation && root.isConnected;
    checking = true;
    result.textContent = "Проверяем…";
    play.setAttribute("aria-busy", "true");
    render();
    try {
      await pendingDraft;
      if (!current()) return;
      const answer = embedded ? await embedded.answer(selection) : await AdamApi(`/attempts/${id}/answer`, { method: "POST", body: JSON.stringify({ tokenIndices: selection }) });
      if (!current()) return;
      showAnswer(answer, true);
      if (!audioFlow && answer.correct) ux.reveal(result, 180, 0);
      else if (!inLesson) ux.reveal(result);
      result.focus({ preventScroll: inLesson });
    } catch (error) {
      if (!current()) return;
      result.classList.remove("exercise-feedback", "is-correct", "is-incorrect");
      result.textContent = "Не удалось проверить ответ. Попробуйте ещё раз.";
      if (audioFlow && indices.length === card.tokens.length) {
        submit.hidden = false; submit.disabled = false; submit.textContent = "Отправить ответ";
      }
    } finally {
      if (current()) {
        checking = false;
        play.removeAttribute("aria-busy");
        if (!submitted) {
          render();
          submit.focus({ preventScroll: true });
        }
      }
    }
  }
  function showAnswer(answer, justSubmitted = false) {
      submitted = true;
      if (audioFlow || !answer.correct) AdamAvatar.setEmotion($("exercise-avatar"), answer.correct ? "Happy" : "Supportive");
      if (!audioFlow && answer.correct) {
        picked.classList.toggle("show-correct-transition", justSubmitted);
        picked.classList.add("is-correct");
      }
      submit.hidden = true; submit.disabled = true;
      actionsBar.hidden = true;
      hint.hidden = true; clear.hidden = true;
      render();
      result.classList.add("exercise-feedback", answer.correct ? "is-correct" : "is-incorrect");
      result.textContent = answer.correct
        ? `${audioFlow ? "Верно!" : "Отлично! Фраза собрана верно."} ${answer.explanation || ""}`.trim()
        : `Пока неверно. Правильный ответ: ${answer.expectedAnswer}. ${answer.explanation || ""}`.trim();
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
  function back() { generation++; card = null; audio.pause(); play.hidden = true; list.hidden = false; load(); }
  $("exercise-back").addEventListener("click", event => { event.preventDefault(); back(); });
  clear.addEventListener("click", () => {
    if (submitted || checking) return;
    indices = []; hint.hidden = true;
    render(); saveDraft();
  });
  if (inLesson) start(); else load();
  return () => { generation++; card = null; audio.pause(); };
};
window.AdamExercisePlayers.audio = window.AdamExercisePlayers.translation;
(() => {
  const root = document.getElementById("exercise-app");
  if (root) window.AdamExercisePlayers.translation(root);
})();
