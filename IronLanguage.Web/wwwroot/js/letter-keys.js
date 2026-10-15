(() => {
  const LETTERS = [["\u04D5", "Вставить букву ӕ"], ["\u04D4", "Вставить букву Ӕ"]];
  const caretMemory = new WeakMap();

  const caretOf = (field) => {
    let live = null;
    try { live = { start: field.selectionStart, end: field.selectionEnd }; } catch { /* selection unsupported */ }
    if (document.activeElement === field && live && live.start !== null) return live;
    const stored = caretMemory.get(field);
    if (stored) return stored;
    return { start: field.value.length, end: field.value.length };
  };

  const insert = (field, letter) => {
    if (field.disabled) return;
    const { start, end } = caretOf(field);
    const nextLength = field.value.length - (end - start) + letter.length;
    if (field.maxLength >= 0 && nextLength > field.maxLength) return;
    field.focus();
    if (typeof field.setRangeText === "function") field.setRangeText(letter, start, end, "end");
    else {
      field.value = field.value.slice(0, start) + letter + field.value.slice(end);
      if (typeof field.setSelectionRange === "function") field.setSelectionRange(start + letter.length, start + letter.length);
    }
    field.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const syncState = (field, wrapper) => {
    wrapper.hidden = field.hidden;
    wrapper.querySelectorAll("button").forEach(button => { button.disabled = field.disabled; });
  };

  const attach = (field) => {
    if (field.dataset.letterKeys === "done") return;
    field.dataset.letterKeys = "done";
    field.addEventListener("focusout", () => {
      try { caretMemory.set(field, { start: field.selectionStart ?? 0, end: field.selectionEnd ?? 0 }); } catch { /* selection unsupported */ }
    });
    field.addEventListener("focusin", () => caretMemory.delete(field));
    const wrapper = document.createElement("div");
    wrapper.className = "letter-field";
    const keys = document.createElement("span");
    keys.className = "letter-keys";
    for (const [letter, label] of LETTERS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "letter-key";
      button.textContent = letter;
      button.setAttribute("aria-label", label);
      button.addEventListener("mousedown", event => event.preventDefault());
      button.addEventListener("click", event => { event.preventDefault(); insert(field, letter); });
      keys.append(button);
    }
    field.before(wrapper);
    wrapper.append(field, keys);
    syncState(field, wrapper);
  };

  const scan = (root) => {
    if (!(root instanceof Element)) return;
    if (root.matches("[data-ossetian]")) attach(root);
    root.querySelectorAll("[data-ossetian]").forEach(attach);
  };

  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "childList") {
        record.addedNodes.forEach(scan);
        continue;
      }
      const field = record.target;
      if (field instanceof Element && field.matches("[data-ossetian]") && field.parentElement?.classList.contains("letter-field"))
        syncState(field, field.parentElement);
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "disabled"]
  });
  scan(document.documentElement);
})();
