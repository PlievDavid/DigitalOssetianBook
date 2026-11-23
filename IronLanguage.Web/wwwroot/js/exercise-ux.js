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
    status.textContent = message;
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
    status.append(actions);
  }

  function cardMeta(item, index) {
    const meta = document.createElement("p");
    meta.className = "exercise-card-meta";
    const author = item.author?.trim();
    meta.textContent = `№ ${index + 1} · ${author ? `Автор: ${author}` : "Автор не указан"}`;
    return meta;
  }

  window.AdamExerciseUx = { reveal, catalog, cardMeta };
})();
