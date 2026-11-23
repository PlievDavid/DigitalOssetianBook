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

  window.AdamExerciseUx = { reveal, catalog };
})();
