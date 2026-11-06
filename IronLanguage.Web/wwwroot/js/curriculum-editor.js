(() => {
  const root = document.getElementById("curriculum-editor");
  if (!root) return;
  const $ = id => document.getElementById(id);
  const course = root.dataset.kind === "course";
  const hidden = $("curriculum-structure"), status = $("curriculum-status"), cards = $("curriculum-cards"), panel = $("curriculum-editor-panel"), canvas = $("curriculum-canvas"), choice = $("curriculum-choice");
  let choices = JSON.parse($("curriculum-choices").textContent), items, selected = 0;
  try { items = JSON.parse(hidden.value); if (!Array.isArray(items)) throw new Error(); }
  catch { items = []; status.textContent = "Структура повреждена. Добавьте карточки заново."; }
  const form = $("curriculum-form");
  const formState = () => JSON.stringify([...new FormData(form)].filter(([name]) => name !== "StructureJson")) + JSON.stringify(items);
  const initialState = formState(); let submitting = false;
  form.addEventListener("submit", () => { submitting = true; });
  window.addEventListener("beforeunload", event => { if (!submitting && formState() !== initialState) { event.preventDefault(); event.returnValue = ""; } });
  if (course) {
    const picker = $("course-picker"), search = $("course-picker-search"), pickerList = $("course-picker-list"), pickerStatus = $("course-picker-status"), opener = $("curriculum-open-picker");
    const picked = new Set();
    function courseOptions() {
      pickerList.replaceChildren();
      const query = search.value.trim().toLocaleLowerCase("ru");
      const available = choices.filter(entry => !items.includes(entry.id) && entry.title.toLocaleLowerCase("ru").includes(query));
      for (const entry of available) {
        const label = document.createElement("label"), input = document.createElement("input"), text = document.createElement("span");
        label.className = "course-picker-item"; input.type = "checkbox"; input.checked = picked.has(entry.id);
        input.addEventListener("change", () => { if (input.checked) picked.add(entry.id); else picked.delete(entry.id); });
        text.textContent = entry.title + (entry.published === false ? " · Черновик" : ""); label.append(input, text); pickerList.append(label);
      }
      if (!available.length) { const empty = document.createElement("p"); empty.textContent = query ? "Уроки не найдены." : "Нет уроков для добавления."; pickerList.append(empty); }
    }
    async function refreshCourses() {
      try { const response = await fetch("/editor/curriculum/course/choices", { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("Не удалось обновить список. Проверьте вход в аккаунт редактора.");
        choices = await response.json(); courseOptions(); courseRender(); pickerStatus.textContent = "Список обновлён.";
      } catch (error) { pickerStatus.textContent = error.message; }
    }
    function courseRender(focusIndex = -1, focusAction = "") {
      hidden.value = JSON.stringify(items); cards.replaceChildren();
      if (!items.length) { const empty = document.createElement("p"); empty.textContent = "Уроки ещё не добавлены."; cards.append(empty); return; }
      const list = document.createElement("ol"); list.className = "course-lesson-list";
      items.forEach((id, index) => {
        const row = document.createElement("li"), name = document.createElement("strong"), actions = document.createElement("div");
        const entry = choices.find(entry => entry.id === id);
        name.textContent = entry?.title || "Урок недоступен";
        const info = document.createElement("div"); info.className = "course-lesson-info"; info.append(name);
        if (entry?.published === false) { const badge = document.createElement("small"); badge.className = "curriculum-draft"; badge.textContent = "Черновик"; info.append(badge); }
        row.append(info);
        actions.className = "curriculum-actions";
        for (const [label, action, delta] of [["↑ Выше", "up", -1], ["↓ Ниже", "down", 1], ["Убрать из курса", "remove", 0]]) {
          const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.dataset.action = action;
          b.setAttribute("aria-label", `${label}: ${name.textContent}`); b.disabled = action === "up" && index === 0 || action === "down" && index === items.length - 1;
          b.addEventListener("click", () => { if (action === "remove") { items.splice(index, 1); courseRender(Math.min(index, items.length - 1), "up"); status.textContent = "Урок удалён из курса."; }
            else { [items[index], items[index + delta]] = [items[index + delta], items[index]]; courseRender(index + delta, action); status.textContent = `Урок перемещён на позицию ${index + delta + 1}.`; } });
          actions.append(b);
        }
        const open = document.createElement("a"); open.href = `/editor/curriculum/lesson/${id}/edit`; open.target = "_blank"; open.rel = "noopener"; open.textContent = "Открыть ↗"; open.setAttribute("aria-label", `Открыть урок «${name.textContent}» в новой вкладке`); actions.prepend(open);
        row.append(actions); list.append(row);
      });
      cards.append(list);
      if (focusIndex >= 0) { const row = list.children[focusIndex]; (row?.querySelector(`[data-action="${focusAction}"]:not(:disabled)`) || row?.querySelector("button:not(:disabled)"))?.focus(); }
    }
    opener.addEventListener("click", () => { picked.clear(); search.value = ""; pickerStatus.textContent = ""; courseOptions(); picker.showModal(); search.focus(); refreshCourses(); });
    search.addEventListener("input", courseOptions);
    $("course-picker-close").addEventListener("click", () => picker.close());
    $("course-picker-cancel").addEventListener("click", () => picker.close());
    picker.addEventListener("close", () => opener.focus());
    $("curriculum-add-lesson").addEventListener("click", () => {
      const added = choices.filter(entry => picked.has(entry.id) && !items.includes(entry.id)).map(entry => entry.id);
      if (!added.length) { pickerStatus.textContent = "Выберите уроки из списка."; return; }
      if (items.length + added.length > 100) { pickerStatus.textContent = "В курсе не более 100 уроков."; return; }
      items.push(...added); courseRender(); status.textContent = `Добавлено уроков: ${added.length}.`; picker.close();
    });
    $("curriculum-refresh").addEventListener("click", refreshCourses);
    $("curriculum-form").addEventListener("submit", () => { hidden.value = JSON.stringify(items); });
    courseRender(); return;
  }
  const labels = { text: "Текст", rule: "Правило", example: "Пример", comparison: "Сравнение", audio: "Аудиопазл", translation: "Перевод фразы", dialogue: "Диалог", lesson: "Урок" };
  const iconPaths = { audio: "M4 14v-3a8 8 0 0 1 16 0v3 M4 12h3v8H4z M17 12h3v8h-3z", translation: "M4 6h12v9H9l-4 3v-3H4z M16 9h4v11l-4-3h-4", dialogue: "M4 4h16v12H9l-5 4z M8 8h8 M8 12h5", text: "M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5", rule: "M5 5h14v14H5z M8 9h8 M8 13h8 M8 17h5", example: "M5 5h14v14H5z M8 9h8 M8 13h5", comparison: "M4 5h16v14H4z M12 5v14 M7 9h2 M15 9h2" };
  function icon(name) { const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"), path = document.createElementNS("http://www.w3.org/2000/svg", "path"); svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", "22"); svg.setAttribute("height", "22"); svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "1.5"); svg.setAttribute("aria-hidden", "true"); path.setAttribute("d", iconPaths[name] || iconPaths.text); svg.append(path); return svg; }
  const el = (tag, text, className) => { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; };
  const button = (text, action, className) => { const b = el("button", text, className); b.type = "button"; b.addEventListener("click", action); return b; };
  const title = item => course ? (choices.find(c => c.id === item)?.title || "Урок недоступен") : item.kind === "theory" ? (item.title || "Новая теория") : (choices.find(c => c.id === item.materialId)?.title || item.title || "Задание недоступно");
  const type = item => course ? "Урок" : item.kind === "theory" ? "Теория" : labels[item.kind] || "Задание";
  function preview() {
    canvas.replaceChildren(); $("curriculum-preview-position").textContent = items.length ? `Карточка ${selected + 1} из ${items.length}` : "";
    const item = items[selected]; if (!item) return;
    const theory = item.kind === "theory";
    const article = el("article", null, theory ? `theory-card theory-card--${item.template}` : "theory-card");
    article.append(el("p", theory ? labels[item.template] || "Теория" : type(item), "eyebrow"), el("h3", theory ? item.title || "Заголовок карточки" : title(item)));
    if (theory) {
      const content = el("div", null, "theory-content");
      content.append(el("div", item.body || "Текст карточки появится здесь", `theory-copy${item.body ? "" : " theory-placeholder"}`));
      if (item.template === "example" || item.template === "comparison") content.append(el("div", item.secondary || (item.template === "comparison" ? "Текст второй колонки" : "Пояснение к примеру"), `theory-secondary theory-copy${item.secondary ? "" : " theory-placeholder"}`));
      article.append(content);
    } else article.append(el("p", "Задание будет открыто в уроке с сохранёнными условиями."));
    canvas.append(article);
    if (items.length > 1) {
      const footer = el("div", null, "theory-preview-navigation");
      const prev = button("← Предыдущая", () => { selected--; render("preview"); }, "curriculum-preview-next"); prev.disabled = selected === 0;
      const next = button("Следующая →", () => { selected++; render("preview"); }, "curriculum-preview-next"); next.disabled = selected === items.length - 1;
      footer.append(prev, next); canvas.append(footer);
    }
  }  function list() {
    cards.replaceChildren(); items.forEach((item, index) => {
      const b = button(null, () => { selected = index; render("list"); }, `curriculum-card-choice${index === selected ? " is-selected" : ""}`);
      b.setAttribute("aria-pressed", String(index === selected)); const symbol = el("span", null, "curriculum-card-icon"); symbol.append(icon(item.kind === "theory" ? item.template : item.kind));
      const text = el("span", null, "curriculum-card-label"); text.append(el("strong", `${index + 1}. ${title(item)}`), el("small", item.kind === "theory" ? (item.body || type(item)) : type(item))); b.append(symbol, text); cards.append(b);
    });
  }
  function sync() { hidden.value = JSON.stringify(items); list(); preview(); }
  function field(parent, label, value, max, update, multiline = false) {
    const wrapper = el("label", label, "curriculum-field"); const input = el(multiline ? "textarea" : "input"); input.value = value || ""; input.setAttribute("aria-label", label); input.dataset.ossetian = ""; input.maxLength = max; if (multiline) input.rows = 5;
    input.addEventListener("input", () => { update(input.value); sync(); }); wrapper.append(input); parent.append(wrapper);
  }
  function render(focus = "") {
    root.classList.toggle("has-cards", items.length > 0);
    $("lesson-first-card").hidden = items.length > 0;
    panel.replaceChildren(); list(); preview(); hidden.value = JSON.stringify(items);
    const item = items[selected]; if (!item) { if (focus) root.querySelector("[data-first-template]").focus(); return; }
    const article = el("article", null, "curriculum-edit-card"); const heading = el("h2", type(item)); heading.tabIndex = -1; article.append(heading);
    if (!course && item.kind === "theory") {
      const templates = el("div", null, "curriculum-templates"); templates.setAttribute("aria-label", "Шаблон карточки");
      for (const name of ["text", "rule", "example", "comparison"]) {
        const b = button(null, () => { item.template = name; render("template"); }, `curriculum-template${item.template === name ? " is-selected" : ""}`); b.setAttribute("aria-pressed", String(item.template === name)); b.append(el("span", labels[name])); templates.append(b);
      }
      article.append(templates);
      field(article, "Заголовок", item.title, 200, value => { item.title = value; });
      field(article, item.template === "comparison" ? "Левая колонка" : "Основной текст", item.body, 5000, value => { item.body = value; }, true);
      if (item.template === "example" || item.template === "comparison") field(article, item.template === "example" ? "Пояснение / проверенный перевод" : "Правая колонка", item.secondary, 5000, value => { item.secondary = value; }, true);
    } else article.append(el("p", title(item)));
    const actions = el("div", null, "curriculum-actions");
    const move = delta => { [items[selected], items[selected + delta]] = [items[selected + delta], items[selected]]; selected += delta; render("heading"); };
    const up = button("↑ Выше", () => move(-1)); up.disabled = selected === 0; up.setAttribute("aria-label", `Поднять карточку ${selected + 1}`);
    const down = button("↓ Ниже", () => move(1)); down.disabled = selected === items.length - 1; down.setAttribute("aria-label", `Опустить карточку ${selected + 1}`);
    actions.append(up, down, button("Удалить", () => { items.splice(selected, 1); selected = Math.max(0, Math.min(selected, items.length - 1)); render("heading"); })); article.append(actions); panel.append(article); if (focus === "heading") heading.focus(); else if (focus === "list") cards.children[selected]?.focus(); else if (focus === "template") panel.querySelector(".curriculum-template.is-selected")?.focus(); else if (focus === "preview") canvas.querySelector(".curriculum-preview-next")?.focus();
  }
  function addTheory(template) {
    if (items.length >= 50) { status.textContent = "В уроке не более 50 карточек."; return; }
    items.push({ kind: "theory", template, title: "", body: "", secondary: "" }); selected = items.length - 1;
    root.querySelector(".lesson-description-settings").open = false;
    window.AdamLessonPicker.close(); render(); panel.querySelector("input")?.focus();
  }
  root.querySelectorAll("[data-first-template]").forEach(b => b.addEventListener("click", () => addTheory(b.dataset.firstTemplate)));
  $("curriculum-open-card-picker").addEventListener("click", () => window.AdamLessonPicker.open("theory"));
  $("lesson-first-practice").addEventListener("click", () => window.AdamLessonPicker.open("ready"));
  root.addEventListener("curriculum:add-theory", e => addTheory(e.detail));
  root.addEventListener("curriculum:choices-refreshed", e => { choices = e.detail; list(); preview(); });
  root.addEventListener("curriculum:add-material", e => {
    const entry = choices.find(c => c.id === e.detail);
    if (!entry || items.some(item => item.materialId === entry.id) || items.length >= 50) return;
    items.push({ kind: entry.kind, materialId: entry.id, title: entry.title }); selected = items.length - 1;
    window.AdamLessonPicker.close(); render("heading");
  });
  $("curriculum-form").addEventListener("submit", () => { hidden.value = JSON.stringify(items); }); render();
})();