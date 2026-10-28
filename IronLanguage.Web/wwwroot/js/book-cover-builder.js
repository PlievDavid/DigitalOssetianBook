(() => {
  const builder = document.getElementById('book-cover-builder');
  if (!builder) return;
  const element = id => document.getElementById(id);
  const fields = { background: element('CoverBackground'), textColor: element('CoverTextColor'), accent: element('CoverAccent'),
    font: element('CoverFont'), pattern: element('CoverPattern'), patternArea: element('CoverPatternArea') };
  const presetNames = ['Шалфей', 'Песок', 'Тёмно-синий', 'Терракота', 'Сирень', 'Мята'];
  const preview = element('cover-constructor-preview'), status = element('cover-constructor-status');
  function refresh() {
    const design = Object.fromEntries(Object.entries(fields).map(([name, input]) => [name, input.value]));
    AdamBookCover.mount(preview, { title: element('Russian').value, authors: element('Authors').value, coverDesign: design });
    const contrast = AdamBookCover.contrast(design.background, design.textColor);
    const valid = contrast >= 4.5;
    status.classList.toggle('is-error', !valid);
    status.textContent = valid ? 'Название хорошо читается на этом фоне.' : 'Низкий контраст. Измените цвет названия или фона — нужно не менее 4,5:1.';
    fields.background.setAttribute('aria-invalid', String(!valid));
    fields.textColor.setAttribute('aria-invalid', String(!valid));
    element('cover-presets').querySelectorAll('button').forEach((button, index) => {
      const preset = AdamBookCover.presets[index];
      button.setAttribute('aria-pressed', String(['background', 'textColor', 'accent'].every(name => design[name].toUpperCase() === preset[name].toUpperCase())));
    });
  }
  AdamBookCover.presets.forEach((preset, index) => {
    const button = document.createElement('button'); button.type = 'button';
    button.setAttribute('aria-label', 'Палитра: ' + presetNames[index]); button.title = presetNames[index];
    button.style.setProperty('--preset-background', preset.background);
    button.onclick = () => {
      for (const name of ['background', 'textColor', 'accent']) fields[name].value = preset[name];
      refresh();
    };
    element('cover-presets').append(button);
  });
  Object.values(fields).forEach(input => { input.addEventListener('input', refresh); input.addEventListener('change', refresh); });
  element('Russian').addEventListener('input', refresh);
  element('Authors').addEventListener('input', refresh);
  refresh();
})();
