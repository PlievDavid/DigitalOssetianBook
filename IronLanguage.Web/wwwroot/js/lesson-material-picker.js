(() => {
  const root = document.getElementById('curriculum-editor');
  const dialog = document.getElementById('card-picker');
  if (!root || !dialog) return;
  const byId = id => document.getElementById(id);
  const tabs = [...dialog.querySelectorAll('[data-picker-tab]')];
  const status = byId('picker-status'), search = byId('picker-search'), kind = byId('picker-kind'), list = byId('picker-materials');
  const labels = { audio: 'Аудиопазл', translation: 'Перевод фразы', dialogue: 'Диалог' };
  let choices = JSON.parse(byId('curriculum-choices').textContent), opener = null;
  function render() {
    let used = [];
    try { const structure = JSON.parse(byId('curriculum-structure').value); if (Array.isArray(structure)) used = structure.map(item => String(item.materialId)); } catch { /* The editor reports invalid structure. */ }
    const query = search.value.trim().toLocaleLowerCase('ru');
    const available = choices.filter(item => labels[item.kind] && !used.includes(String(item.id)) && (kind.value === 'all' || kind.value === item.kind) && item.title.toLocaleLowerCase('ru').includes(query));
    list.replaceChildren();
    if (!available.length) { const empty = document.createElement('p'); empty.textContent = 'Подходящих опубликованных заданий нет.'; list.append(empty); return; }
    available.forEach(item => {
      const row = document.createElement('div'); row.className = 'lesson-picker-material'; row.dataset.materialId = item.id;
      const text = document.createElement('div'), title = document.createElement('strong'), type = document.createElement('small');
      title.textContent = item.title; type.textContent = labels[item.kind]; text.append(title, type);
      const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Добавить'; button.setAttribute('aria-label', `Добавить «${item.title}»`);
      button.addEventListener('click', () => { root.dispatchEvent(new CustomEvent('curriculum:add-material', { detail: item.id })); dialog.close(); });
      row.append(text, button); list.append(row);
    });
  }
  function select(mode) {
    if (!tabs.some(tab => tab.dataset.pickerTab === mode)) mode = 'theory';
    tabs.forEach(tab => { const selected = tab.dataset.pickerTab === mode; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; byId(`picker-${tab.dataset.pickerTab}`).hidden = !selected; });
    if (mode === 'ready') render();
  }
  async function refresh() {
    try {
      const response = await fetch('/editor/curriculum/lesson/choices', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error();
      choices = await response.json(); status.textContent = ''; render();
      root.dispatchEvent(new CustomEvent('curriculum:choices-refreshed', { detail: choices }));
    } catch { status.textContent = 'Не удалось обновить список. Проверьте подключение и попробуйте открыть окно снова.'; }
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab.dataset.pickerTab));
    tab.addEventListener('keydown', event => {
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault(); select(tabs[next].dataset.pickerTab); tabs[next].focus();
    });
  });
  dialog.querySelectorAll('[data-picker-theory]').forEach(button => button.addEventListener('click', () => { root.dispatchEvent(new CustomEvent('curriculum:add-theory', { detail: button.dataset.pickerTheory })); dialog.close(); }));
  byId('card-picker-close').addEventListener('click', () => dialog.close());
  dialog.querySelectorAll('[form="curriculum-form"]').forEach(button => button.addEventListener('click', event => {
    const form = button.form;
    if (form.checkValidity()) return;
    event.preventDefault();
    opener = null;
    dialog.close();
    form.reportValidity();
  }));
  dialog.addEventListener('close', () => { if (opener && opener.isConnected) opener.focus(); });
  search.addEventListener('input', render); kind.addEventListener('change', render);
  window.addEventListener('focus', () => { if (dialog.open) refresh(); });
  window.AdamLessonPicker = {
    open(mode = 'theory') { opener = document.activeElement; select(mode); if (!dialog.open) dialog.showModal(); refresh(); },
    close() { if (dialog.open) dialog.close(); },
    setChoices(value) { choices = value; render(); }
  };
})();
