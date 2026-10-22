(() => {
  const root = document.getElementById("listening-app");
  if (!root) return;
  const $ = id => document.getElementById(id);
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
  let attemptId, card, chosenIndex = null, answer = null, checking = false, submitted = false, audioReady = false;

  const button = (label, action, className = "button secondary") => {
    const b = document.createElement("button"); b.type = "button"; b.className = className; b.textContent = label;
    b.addEventListener("click", action); return b;
  };

  async function load() {
    status.textContent = "Загрузка…";
    try {
      const exercises = await AdamApi("/listening");
      list.replaceChildren();
      list.hidden = exercises.length === 0;
      for (const item of exercises) {
        const entry = document.createElement("article"); entry.className = "exercise-entry listening-entry";
        const copy = document.createElement("div"); copy.className = "exercise-entry-copy";
        const eyebrow = document.createElement("span"); eyebrow.className = "eyebrow"; eyebrow.textContent = "АУДИРОВАНИЕ";
        const title = document.createElement("h2"); title.textContent = item.question;
        const description = document.createElement("p"); description.textContent = "Прослушайте текст и ответьте на вопрос.";
        copy.append(eyebrow, title, description, button("Начать задание →", () => start(item.id), "button primary"));
        entry.append(copy); list.append(entry);
      }
      status.textContent = exercises.length ? "Выберите задание." : "Пока нет опубликованных заданий на аудирование.";
    } catch (error) { status.textContent = error.message; }
  }

  async function start(id) {
    if (checking) return;
    checking = true;
    try {
      const data = await AdamApi(`/listening/${id}/attempts`, { method: "POST" });
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
        audio.play().catch(() => {});
      } else {
        audio.removeAttribute("src"); audio.hidden = true;
        audioError.hidden = false;
      }
      renderOptions();
    } catch (error) { status.textContent = error.message; }
    finally {
      checking = false;
      if (card && !play.hidden) renderOptions();
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
    checking = true; chosenIndex = index;
    renderOptions();
    try {
      answer = await AdamApi(`/listening/attempts/${attemptId}/answer`, { method: "POST", body: JSON.stringify({ optionIndex: index }) });
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
      renderOptions();
    } catch (error) {
      chosenIndex = null;
      result.className = "";
      result.textContent = error.message;
    } finally {
      checking = false;
      if (!submitted) renderOptions();
    }
  }

  function back() {
    audio.pause(); audio.removeAttribute("src"); audio.load(); audioReady = false;
    play.hidden = true; list.hidden = false; card = null; attemptId = null;
    load();
  }

  audio.addEventListener("canplay", () => {
    if (!card) return;
    audioReady = true; audioError.hidden = true;
    renderOptions();
  });
  audio.addEventListener("error", () => {
    if (!card) return;
    audioReady = false; audioError.hidden = false;
    renderOptions();
  });
  audio.addEventListener("emptied", () => { audioReady = false; });
  $("listening-back").addEventListener("click", event => { event.preventDefault(); back(); });
  load();
})();
