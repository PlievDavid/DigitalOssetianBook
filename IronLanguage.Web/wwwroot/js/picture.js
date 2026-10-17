(() => {
  const root = document.getElementById("picture-app");
  if (!root) return;
  const $ = id => document.getElementById(id);
  const status = $("picture-status");
  const list = $("picture-list");
  const play = $("picture-play");
  const result = $("picture-result");
  const wordsBox = $("picture-words");
  const answerWord = $("picture-answer-word");
  const image = $("picture-image");
  const imageError = $("picture-image-error");
  let session = null;
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

  function setPlayImage(path, title) {
    image.hidden = false;
    imageError.hidden = true;
    image.alt = path ? `Картинка к заданию «${title}»` : "";
    image.src = path || "";
    if (!path) { image.hidden = true; imageError.hidden = false; }
  }

  image.addEventListener("error", () => {
    if (play.hidden) return;
    image.hidden = true;
    imageError.hidden = false;
  });
  image.addEventListener("load", () => {
    image.hidden = false;
    imageError.hidden = true;
  });

  async function load() {
    status.textContent = "Загрузка…";
    try {
      const items = await AdamApi("/pictures");
      list.replaceChildren();
      for (const item of items) {
        const card = document.createElement("article"); card.className = "exercise-entry";
        const copy = document.createElement("div"); copy.className = "exercise-entry-copy";
        const eyebrow = document.createElement("span"); eyebrow.className = "eyebrow";
        eyebrow.textContent = "КАРТИНКА И СЛОВО";
        const title = document.createElement("h2"); title.textContent = item.title;
        const description = document.createElement("p");
        description.textContent = "Посмотрите на картинку и ответьте на один вопрос.";
        copy.append(eyebrow, title, description, button("Начать →", () => start(item.id), "button primary"));
        const art = document.createElement("span"); art.className = "exercise-entry-icon";
        art.setAttribute("aria-hidden", "true"); art.append(root.querySelector(".section-symbol svg").cloneNode(true));
        card.append(art, copy); list.append(card);
      }
      status.textContent = items.length ? "Выберите задание." : "Пока нет опубликованных заданий.";
    } catch (error) { status.textContent = error.message; }
  }

  async function start(id) {
    try {
      const next = await AdamApi(`/pictures/${id}/sessions`, { method: "POST" });
      generation++;
      busy = false;
      session = next;
      sessionStorage.setItem("adam.picture.session", session.sessionId);
      list.hidden = true; play.hidden = false;
      render();
      status.textContent = "";
    } catch (error) { status.textContent = error.message; }
  }

  function render() {
    $("picture-title").textContent = session.title;
    result.textContent = "";
    result.className = "exercise-feedback";
    result.hidden = true;
    answerWord.hidden = true;
    answerWord.textContent = "";
    wordsBox.replaceChildren();
    setPlayImage(session.picturePath, session.title);
    const optionsBox = $("picture-options");
    const freeForm = $("picture-free-form");
    optionsBox.replaceChildren();
    optionsBox.hidden = false;
    freeForm.hidden = true;
    $("picture-answer").value = "";
    $("picture-answer").disabled = false;
    $("picture-submit").disabled = false;
    if (session.answered) {
      showResult(session.correct, session.correctWord, null);
      return;
    }
    if (session.mode === "choice") {
      $("picture-instructions").textContent = "Выберите слово, которое подходит к картинке.";
      freeForm.hidden = true;
      (session.options || []).forEach((text, index) => {
        const choice = button(text, () => submitChoice(index), "word-tile picture-option");
        choice.disabled = busy;
        optionsBox.append(choice);
      });
    } else {
      $("picture-instructions").textContent = "Введите осетинское слово, которое изображено на картинке.";
      optionsBox.hidden = true;
      freeForm.hidden = false;
      $("picture-answer").focus({ preventScroll: true });
    }
  }

  async function submitChoice(optionIndex) {
    if (busy || !session || session.answered) return;
    await check({ optionIndex }, optionIndex);
  }

  async function submitFree(event) {
    event.preventDefault();
    if (busy || !session || session.answered) return;
    const answer = $("picture-answer").value.trim();
    if (!answer) {
      result.hidden = false;
      result.className = "exercise-feedback is-incorrect";
      result.textContent = "Введите слово.";
      return;
    }
    await check({ answer }, null);
  }

  async function check(payload, selectedIndex) {
    busy = true;
    const gen = generation;
    const sid = session.sessionId;
    for (const node of $("picture-options").children) node.disabled = true;
    $("picture-submit").disabled = true;
    try {
      const response = await AdamApi(`/pictures/sessions/${sid}/check`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (gen !== generation || !session || session.sessionId !== sid) return;
      session.answered = true;
      session.correct = response.correct;
      session.correctWord = response.correctWord;
      showResult(response.correct, response.correctWord, selectedIndex);
    } catch (error) {
      if (gen !== generation || !session || session.sessionId !== sid) return;
      result.hidden = false;
      result.className = "exercise-feedback is-incorrect";
      result.textContent = error.message;
      for (const node of $("picture-options").children) node.disabled = false;
      $("picture-submit").disabled = false;
    } finally {
      if (gen === generation) {
        busy = false;
        const focusTarget = result.hidden === false ? (result.querySelector("button") || result) : $("picture-back-link");
        focusTarget.focus?.({ preventScroll: true });
      }
    }
  }

  function markOptions(correctWord, selectedIndex) {
    const nodes = $("picture-options").children;
    if (!session.options || !nodes.length) return;
    const correctKey = norm(correctWord);
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

  function showResult(correct, correctWord, selectedIndex) {
    markOptions(correctWord, selectedIndex);
    for (const node of $("picture-options").children) node.disabled = true;
    $("picture-submit").disabled = true;
    $("picture-answer").disabled = true;

    result.hidden = false;
    result.className = correct ? "exercise-feedback is-correct" : "exercise-feedback is-incorrect";
    const message = document.createElement("span");
    message.textContent = correct ? "Верно!" : `Пока неверно. Правильное слово: «${correctWord}».`;
    const actions = document.createElement("div");
    actions.className = "picture-result-actions";
    actions.append(
      button("Пройти заново", () => start(session.materialId), "button primary"),
      button("К списку", back, "button secondary")
    );
    result.replaceChildren(message, actions);

    if (session.mode === "free" || !correct) {
      answerWord.hidden = false;
      answerWord.textContent = correctWord;
    }

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
    $("picture-answer").disabled = false;
    answerWord.hidden = true;
    answerWord.textContent = "";
    load();
  }

  $("picture-free-form").addEventListener("submit", submitFree);
  $("picture-back-link").addEventListener("click", event => { event.preventDefault(); back(); });
  load();
})();
