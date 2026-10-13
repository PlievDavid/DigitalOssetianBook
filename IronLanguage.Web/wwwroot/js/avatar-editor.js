(() => {
  const root = document.getElementById("avatar-editor");
  if (!root) return;
  const form = document.getElementById("avatar-form");
  const preview = document.getElementById("avatar-preview-image");
  const status = document.getElementById("avatar-preview-status");
  const fields = [...form.querySelectorAll("[data-avatar-property]")];
  const categories = root.querySelector(".avatar-categories");
  const buttons = [...categories.querySelectorAll("button")];
  const random = document.getElementById("avatar-random");
  const values = () => Object.fromEntries(fields.filter(x => x.checked).map(x => [x.dataset.avatarProperty, x.value]));
  const url = (state, emotion = "Neutral", portrait = false) => "/avatars/render?" + new URLSearchParams({ v: "1", ...state, emotion, portrait });
  function update() {
    const state = values();
    preview.src = url(state);
    root.querySelectorAll("[data-avatar-thumbnail]").forEach(img => {
      const property = img.dataset.avatarThumbnail;
      img.src = url({ ...state, [property]: img.dataset.avatarChoice }, "Neutral", !["Top", "Background"].includes(property));
    });
    root.querySelectorAll("[data-avatar-preview-emotion]").forEach(img => {
      img.src = url({ ...state, Background: "plain" }, img.dataset.avatarPreviewEmotion);
    });
    status.textContent = "Предпросмотр обновлён. Сохраните образ, когда будете готовы.";
  }
  function showSection(id) {
    buttons.forEach(button => {
      const selected = button.dataset.avatarSection === id;
      button.setAttribute("aria-expanded", String(selected));
      document.getElementById("avatar-panel-" + button.dataset.avatarSection).hidden = !selected;
    });
  }
  buttons.forEach(button => button.addEventListener("click", () => showSection(button.dataset.avatarSection)));
  fields.forEach(input => input.addEventListener("change", update));
  preview.addEventListener("error", () => { status.textContent = "Предпросмотр не загрузился. Попробуйте выбрать деталь ещё раз."; });
  random.addEventListener("click", () => {
    const properties = [...new Set(fields.map(x => x.dataset.avatarProperty))];
    properties.forEach(property => {
      const options = fields.filter(x => x.dataset.avatarProperty === property);
      options[Math.floor(Math.random() * options.length)].checked = true;
    });
    update();
  });
  categories.hidden = false;
  random.hidden = false;
  showSection("face");
})();
