(() => {
  const root = document.getElementById('vocabulary-app'); if (!root || !document.getElementById('saved-words')) return;
  const savedEl = document.getElementById('saved-words');
  const availableEl = document.getElementById('available-words');
  const status = document.getElementById('vocabulary-status');
  const row = (word, label, action) => {
    const item = document.createElement('div'); item.className = 'vocabulary-row';
    const copy = document.createElement('div'); copy.className = 'vocabulary-row-copy';
    const original = document.createElement('strong'); original.textContent = word.ossetian;
    const translation = document.createElement('span'); translation.textContent = word.russian;
    copy.append(original, translation);
    if (word.example) { const example = document.createElement('small'); example.textContent = word.example; copy.append(example); }
    if (word.dictionaryNote) { const note = document.createElement('small'); note.textContent = word.dictionaryNote; copy.append(note); }
    const button = document.createElement('button'); button.type = 'button'; button.className = 'vocabulary-row-action'; button.textContent = label;
    button.onclick = async () => { button.disabled = true; try { await action(); await load(); } catch (error) { status.textContent = error.message; button.disabled = false; } };
    item.append(copy, button); return item;
  };
  async function load() {
    const [all, saved] = await Promise.all([AdamApi('/words'), AdamApi('/vocabulary')]);
    const ids = new Set(saved.map(x => x.wordId));
    savedEl.replaceChildren(); availableEl.replaceChildren();
    for (const word of saved) savedEl.append(row(word, 'Убрать', () => AdamApi(`/vocabulary/${word.wordId}`, { method: 'DELETE' })));
    for (const word of all.filter(x => !ids.has(x.id))) availableEl.append(row(word, 'Добавить', () => AdamApi(`/vocabulary/${word.id}`, { method: 'POST' })));
    if (!saved.length) {
      const empty = document.createElement('p'); empty.className = 'vocabulary-empty-line';
      empty.textContent = 'Здесь пока пусто. Добавьте слово из списка ниже или нажмите на него во время чтения.'; savedEl.append(empty);
    }
    if (!availableEl.childElementCount) {
      const empty = document.createElement('p'); empty.className = 'vocabulary-empty-line';
      empty.textContent = 'Новых опубликованных слов пока нет.'; availableEl.append(empty);
    }
    status.textContent = `${saved.length} ${saved.length === 1 ? 'слово' : 'слов'} сохранено`;
  }
  load().catch(error => { status.textContent = error.message; });
})();
