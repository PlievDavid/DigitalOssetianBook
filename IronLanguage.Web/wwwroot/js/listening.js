(window.AdamExercisePlayers ??= {}).listening = function (root, embedded) {
  const $ = id => root.querySelector("#" + id);
  const ux = window.AdamExerciseUx;
  const lessonPath = root.dataset.lessonPath;
  const status = $("listening-status");
  const list = $("listening-list");
  const play = $("listening-play");
  const question = $("listening-question");
  const audio = $("listening-audio");
  const audioError = $("listening-audio-error");
  const options = $("listening-options");
  const result = $("listening-result");
  const transcriptBlock = $("listening-transcript-block");
  const transcript = $("listening-transcript");
  const explanation = $("listening-explanation");
  let attemptId, card, chosenIndex = null, answer = null, checking = false, submitted = false, audioReady = false, generation = 0;

  const button = (label, action, className = "button secondary") => {
    const b = document.createElement("button"); b.type = "button"; b.className = className; b.textContent = label;
    b.addEventListener("click", action); return b;
  };

  async function load() {
    status.textContent = "Загрузка…";
    list.replaceChildren();
    try {
      const exercises = await AdamApi("/listening");
      list.replaceChildren();
      list.hidden = exercises.length === 0;
      for (const [index, item] of exercises.entries()) {
        const entry = document.createElement("article"); entry.className = "exercise-entry listening-entry";
        const copy = document.createElement("div"); copy.className = "exercise-entry-copy";
        const title = document.createElement("h2"); title.textContent = item.question;
        copy.append(title, window.AdamExerciseUx.cardMeta(item, index), button("Начать", () => start(item.id), "button primary"));
        entry.append(copy); list.append(entry);
      }
      window.AdamExerciseUx.catalog(status, exercises.length ? "" : "Пока нет опубликованных заданий на аудирование.");
    } catch (error) {
      console.error(error);
      window.AdamExerciseUx.catalog(status, "Не удалось загрузить задания.", load);
    }
  }

  async function start(id) {
    if (checking) return;
    checking = true;
    const request = ++generation;
    try {
      const data = embedded ? await embedded.load() : lessonPath ? await AdamApi(lessonPath) :
        await AdamApi(`/listening/${id}/attempts`, { method: "POST" });
      if (request !== generation || !root.isConnected) return;
      card = data.card; attemptId = data.attemptId;
      chosenIndex = null; answer = null; submitted = false; audioReady = false;
      question.textContent = card.question;
      list.hidden = true; play.hidden = false;
      status.textContent = ""; result.textContent = ""; result.className = "";
      transcriptBlock.hidden = true; transcript.textContent = ""; explanation.hidden = true; explanation.textContent = "";
      audioError.hidden = true;
      audio.pause(); audio.hidden = false;
      if (card.audioPath) {
        audio.src = card.audioPath; audio.load();
        if (!embedded && !lessonPath) audio.play().catch(() => {});
      } else {
        audio.removeAttribute("src"); audio.hidden = true;
        audioError.hidden = false;
        audioReady = false;
      }
      if (data.result) showAnswer(data.result);
      renderOptions();
    } catch (error) { status.textContent = error.message; }
    finally {
      if (request === generation && root.isConnected) { checking = false; renderOptions(); }
    }
  }

  // Keep options disabled until the recording can actually be played.
  function renderOptions() {
    options.replaceChildren();
    if (!card) return;
    card.options.forEach((text, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "listening-option";
      option.disabled = !audioReady || checking || submitted;
      const number = document.createElement("span"); number.className = "listening-option-number"; number.textContent = index + 1;
      const label = document.createElement("span"); label.textContent = text;
      option.append(number, label);
      if (checking && !submitted && index === chosenIndex) option.classList.add("is-pending");
      if (answer) {
        if (index === answer.correctOption) option.classList.add("is-correct");
        else if (index === chosenIndex) option.classList.add("is-wrong");
      }
      option.addEventListener("click", () => submitAnswer(index, text));
      options.append(option);
    });
  }

  async function submitAnswer(index, text) {
    if (!card || submitted || checking || !audioReady) return;
    const request = generation;
    const current = () => request === generation && root.isConnected;
    checking = true; chosenIndex = index;
    result.textContent = "Проверяем…";
    renderOptions();
    try {
      const saved = embedded ? await embedded.answer([index]) : await AdamApi(`/listening/attempts/${attemptId}/answer`, { method: "POST", body: JSON.stringify({ optionIndex: index }) });
      if (!current()) return;
      showAnswer(saved);
      renderOptions();
      ux.reveal(options.querySelector(".is-correct"));
      ux.reveal(result);
      result.focus();
    } catch (error) {
      if (!current()) return;
      chosenIndex = null;
      result.className = "";
      result.textContent = "Не удалось проверить ответ. Выберите вариант ещё раз.";
    } finally {
      if (current()) {
        checking = false;
        if (!submitted) {
          renderOptions();
          options.children[index]?.focus({ preventScroll: true });
        }
      }
    }
  }

  function showAnswer(saved) {
    answer = saved;
    submitted = true;
    result.className = answer.correct ? "exercise-feedback is-correct" : "exercise-feedback is-incorrect";
    result.textContent = answer.correct ? "Верно!" : `Неверно. Правильный ответ: ${answer.correctAnswer}.`;
    if (answer.transcript && answer.transcript.trim()) {
      transcript.textContent = answer.transcript;
      transcriptBlock.hidden = false;
    }
    if (answer.explanation && answer.explanation.trim()) {
      explanation.textContent = answer.explanation;
      explanation.hidden = false;
    }
  }

  function back() {
    generation++;
    audio.pause(); audio.removeAttribute("src"); audio.load(); audioReady = false;
    play.hidden = true; list.hidden = false; card = null; attemptId = null;
    chosenIndex = null; answer = null; submitted = false; checking = false;
    result.textContent = ""; result.className = "";
    transcriptBlock.hidden = true; transcript.textContent = ""; explanation.hidden = true; explanation.textContent = "";
    options.replaceChildren();
    load();
  }

  $("listening-audio-retry").addEventListener("click", () => {
    if (card?.audioPath) audio.load();
  });
  audio.addEventListener("canplay", () => {
    if (!card) return;
    audioReady = true; audioError.hidden = true;
    renderOptions();
  });
  audio.addEventListener("canplaythrough", () => {
    if (!card) return;
    audioReady = true; audioError.hidden = true;
    renderOptions();
  });
  audio.addEventListener("error", () => {
    if (!card) return;
    audioReady = false; audioError.hidden = false;
    renderOptions();
  });
  // «emptied» приходит и при смене src в start(), поэтому состояние сбрасываем только вне задания.
  audio.addEventListener("emptied", () => {
    if (card) return;
    audioReady = false;
    renderOptions();
  });
  $("listening-back")?.addEventListener("click", event => { event.preventDefault(); back(); });
  if (embedded || lessonPath) start();
  else load();
  return () => { generation++; card = null; audio.pause(); };
};
(() => {
  const root = document.getElementById("listening-app");
  if (root) window.AdamExercisePlayers.listening(root);
})();
