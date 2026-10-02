(() => {
  const words = document.querySelectorAll('.lesson-word');
  if (!words.length) return;
  const status = document.getElementById('lesson-word-status');
  const key = text => text.toLocaleLowerCase('ru').replaceAll('æ', 'ӕ').replace(/\u0301/g, '');
  const slug = window.location.pathname.split('/').filter(Boolean).pop();
  AdamApi(`/lessons/${encodeURIComponent(slug)}/words`).then(available => {
    const byName = new Map(available.map(word => [key(word.ossetian), word]));
    for (const row of words) {
      const button = row.querySelector('button');
      const word = byName.get(key(row.dataset.ossetian));
      if (!word?.senseId) { button.hidden = true; continue; }
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await AdamApi(`/vocabulary/dictionary/${word.senseId}`, { method: 'POST' });
          button.textContent = 'Сохранено';
          status.textContent = `${word.ossetian} добавлено в личный словарь.`;
        } catch (error) {
          button.disabled = false;
          status.textContent = error.message;
        }
      });
    }
  }).catch(error => { status.textContent = error.message; });
})();
