(() => {
  const motion = matchMedia("(prefers-reduced-motion: no-preference)");
  function reveal(element, duration = 160, distance = 4) {
    if (!element?.animate || !motion.matches) return;
    element.animate(
      [{ opacity: 0.6, transform: `translateY(${distance}px)` }, { opacity: 1, transform: "none" }],
      { duration, easing: "ease-out" }
    );
  }

  function catalog(status, message, retry) {
    status.replaceChildren();
    if (!message) return;
    const action = document.createElement(retry ? "button" : "a");
    action.className = "button secondary";
    if (retry) {
      action.type = "button";
      action.addEventListener("click", retry);
      action.textContent = "Повторить загрузку";
    } else {
      action.href = "/exercises";
      action.textContent = "Все задания";
    }
    const actions = document.createElement("div");
    actions.className = "exercise-catalog-actions";
    actions.append(action);
    if (retry) {
      status.append(message, actions);
      return;
    }

    const empty = document.createElement("div");
    empty.className = "exercise-empty";
    const illustration = document.createElement("span");
    illustration.className = "exercise-empty-icon";
    illustration.append(materialIcon("inbox"));
    const text = document.createElement("p");
    text.textContent = message;
    empty.append(illustration, text, actions);
    status.append(empty);
  }

  function materialIcon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(svg.namespaceURI, "use");
    use.setAttribute("href", `/images/material-icons/navigation-rounded.svg#${name}`);
    svg.append(use);
    return svg;
  }

  function card(item, title, start, subtitle) {
    const entry = document.createElement("article");
    entry.className = "exercise-entry exercise-choice";
    const copy = document.createElement("div");
    copy.className = "exercise-entry-copy";
    if (subtitle) {
      const eyebrow = document.createElement("span");
      eyebrow.className = "eyebrow";
      eyebrow.textContent = subtitle;
      copy.append(eyebrow);
    }
    const heading = document.createElement("h2");
    const open = document.createElement("button");
    open.className = "exercise-card-open";
    open.type = "button";
    open.textContent = title;
    open.addEventListener("click", start);
    heading.append(open);

    const meta = document.createElement("p");
    meta.className = "exercise-card-meta";
    const author = item.author?.trim();
    meta.textContent = author ? `Автор: ${author}` : "Автор не указан";
    const copyControl = document.createElement("div");
    copyControl.className = "exercise-copy-control";
    const feedback = document.createElement("span");
    feedback.className = "exercise-copy-feedback";
    feedback.setAttribute("role", "status");

    const copyNumber = document.createElement("button");
    copyNumber.className = "exercise-copy-number";
    copyNumber.type = "button";
    copyNumber.title = "Скопировать номер";
    copyNumber.setAttribute("aria-label", `Скопировать номер задания «${title}»`);
    copyNumber.append(materialIcon("content_copy"));
    let dismissFeedback;
    copyNumber.addEventListener("click", async () => {
      clearTimeout(dismissFeedback);
      feedback.textContent = "";
      try {
        await navigator.clipboard.writeText(item.id);
        feedback.textContent = "Скопировано";
      } catch {
        feedback.textContent = "Не удалось скопировать";
      }
      dismissFeedback = setTimeout(() => { feedback.textContent = ""; }, 2000);
    });
    copy.append(heading, meta);
    copyControl.append(copyNumber, feedback);
    entry.append(copy, copyControl);
    return entry;
  }

  window.AdamExerciseUx = { reveal, catalog, card };
})();
