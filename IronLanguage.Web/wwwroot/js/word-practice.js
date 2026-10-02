(() => {
  const root = document.getElementById('word-practice-app');
  if (!root || !document.getElementById('review-form')) return;
  const status = document.getElementById('practice-status');
  const panel = document.getElementById('review-panel');
  const wordEl = document.getElementById('review-word');
  const result = document.getElementById('review-result');
  const answer = document.getElementById('review-answer');
  let words = [], index = 0;
  const showWord = () => {
    const word = words[index % words.length];
    wordEl.textContent = word.ossetian;
    answer.value = '';
    result.replaceChildren();
    answer.focus();
  };
  AdamApi('/vocabulary').then(saved => {
    words = saved;
    if (!saved.length) { status.textContent = 'Сначала сохраните хотя бы одно слово в личный список.'; return; }
    panel.hidden = false; status.textContent = ''; showWord();
  }).catch(error => { status.textContent = error.message; });
  document.getElementById('review-form').addEventListener('submit', async event => {
    event.preventDefault();
    const word = words[index % words.length];
    try {
      const outcome = await AdamApi(`/vocabulary/${word.wordId}/review`, { method: 'POST', body: JSON.stringify({ translation: answer.value }) });
      result.textContent = outcome.correct ? 'Верно!' : `Пока неверно. Перевод: ${outcome.expected}.`;
      const next = document.createElement('button'); next.type = 'button'; next.className = 'button secondary';
      next.textContent = words.length > 1 ? 'Следующее слово' : 'Повторить';
      next.onclick = () => { index++; showWord(); };
      result.append(next);
    } catch (error) { result.textContent = error.message; }
  });
})();
