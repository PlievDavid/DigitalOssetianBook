(() => {
  const root = document.getElementById("exercise-app");
  if (!root) return;
  const kind = root.dataset.kind;
  const $ = id => document.getElementById(id);
  const status = $("exercise-status");
  const list = $("exercise-list");
  const play = $("exercise-play");
  const picked = $("exercise-picked");
  const tiles = $("exercise-tiles");
  const result = $("exercise-result");
  const audio = $("exercise-audio");
  let card, attemptId, indices = [], submitted = false, pendingDraft = Promise.resolve();

  const button = (label, action, className = "button secondary") => {
    const b = document.createElement("button"); b.type = "button"; b.className = className; b.textContent = label; b.addEventListener("click", action); return b;
  };
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
        const eyebrow = document.createElement("span"); eyebrow.className = "eyebrow";
        eyebrow.textContent = kind === "audio" ? "АУДИРОВАНИЕ" : "ПЕРЕВОД";
        const title = document.createElement("h2"); title.textContent = kind === "audio" ? "Приветствие" : item.russianPrompt;
        const description = document.createElement("p"); description.textContent = kind === "audio" ? "Прослушайте запись и восстановите услышанную фразу." : "Соберите фразу из предложенных слов.";
        copy.append(eyebrow, title, description, button("Начать упражнение →", () => start(item.id), "button primary"));
        cardEl.append(copy); list.append(cardEl);
      }
      status.textContent = exercises.length ? "Выберите задание." : "Пока нет проверенных материалов для этого раздела.";
    } catch (error) { status.textContent = error.message; }
  }
  async function start(id) {
    try {
      const data = await AdamApi(`/exercises/${id}/attempts`, { method: "POST" });
      card = data.card; attemptId = data.attemptId; indices = data.draftIndices || []; submitted = false;
      list.hidden = true; play.hidden = false; result.textContent = ""; status.textContent = "";
      $("exercise-prompt").textContent = kind === "audio" ? "Соберите услышанную фразу" : card.russianPrompt;
      audio.hidden = kind !== "audio"; $("exercise-audio-error").hidden = true;
      if (kind === "audio") { audio.src = card.audioPath; audio.load(); audio.play().catch(() => {}); }
      render();
    } catch (error) { status.textContent = error.message; }
  }
  function render() {
    picked.replaceChildren(); tiles.replaceChildren();
    indices.forEach((index, position) => picked.append(button(card.tokens[index], () => { if (!submitted) { indices.splice(position, 1); render(); saveDraft(); } }, "word-tile selected")));
    card.tokens.forEach((word, index) => { if (!indices.includes(index)) tiles.append(button(word, () => { if (!submitted) { indices.push(index); render(); saveDraft(); } }, "word-tile")); });
    $("exercise-submit").disabled = indices.length < 2 || submitted || (kind === "audio" && (audio.error || audio.readyState < 2));
    $("exercise-clear").disabled = !indices.length || submitted;
  }
  audio.addEventListener("error", () => { $("exercise-audio-error").hidden = false; $("exercise-submit").disabled = true; });
  audio.addEventListener("canplay", () => { $("exercise-audio-error").hidden = true; render(); });
  function saveDraft() {
    if (!AdamAuthenticated) return;
    const current = [...indices], id = attemptId;
    pendingDraft = pendingDraft.catch(() => {}).then(() => AdamApi(`/attempts/${id}/draft`, { method: "PUT", body: JSON.stringify({ tokenIndices: current }) }))
      .catch(error => { status.textContent = `Не удалось сохранить выбранные слова: ${error.message}`; });
  }
  $("exercise-submit").addEventListener("click", async () => {
    if (submitted) return;
    try {
      await pendingDraft;
      const answer = await AdamApi(`/attempts/${attemptId}/answer`, { method: "POST", body: JSON.stringify({ tokenIndices: indices }) });
      submitted = true; render();
      result.className = answer.correct ? "exercise-feedback is-correct" : "exercise-feedback is-incorrect";
      result.textContent = `${answer.correct ? "Верно!" : "Пока неверно."} Правильный ответ: ${answer.expectedAnswer}. ${answer.explanation || ""}`;
      result.append(button("К заданиям", back));
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
    } catch (error) { result.textContent = error.message; }
  });
  function back() { audio.pause(); play.hidden = true; list.hidden = false; load(); }
  $("exercise-back").addEventListener("click", event => { event.preventDefault(); back(); });
  $("exercise-clear").addEventListener("click", () => { if (!submitted) { indices = []; render(); saveDraft(); } });
  load();
})();
