(() => {
  const root = document.getElementById("game-app"); if (!root) return;
  const board = document.getElementById("game-board"), status = document.getElementById("game-status");
  let chosen = null, matched = new Set(), words = [], translations = [];
  const shuffle = items => [...items].sort(() => Math.random() - .5);
  const pairsLabel = count => count % 10 === 1 && count % 100 !== 11 ? 'пару' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'пары' : 'пар';
  async function load() {
    try {
      const all = await (AdamAuthenticated ? AdamApi('/vocabulary') : AdamApi('/words').then(items => items.map(x => ({ ...x, wordId: x.id }))));
      words = shuffle(all).filter((x, i, a) => a.findIndex(y => y.russian.toLocaleLowerCase() === x.russian.toLocaleLowerCase()) === i).slice(0, 5);
      translations = shuffle(words);
      if (words.length < 2) { status.textContent = (AdamAuthenticated ? "Игра откроется, когда в вашем словаре появятся два слова с разными переводами." : "Для игры нужны хотя бы два опубликованных слова с разными переводами."); board.replaceChildren(); document.getElementById('game-restart').hidden = true; document.getElementById('game-find-words').hidden = false; return; }
      document.getElementById('game-restart').hidden = false; document.getElementById('game-find-words').hidden = true;
      status.textContent = `Найдите ${words.length} ${pairsLabel(words.length)}.`; matched = new Set(); chosen = null; render();
    } catch (error) { status.textContent = error.message; }
  }
  function render() {
    board.replaceChildren();
    const left = document.createElement("div"), right = document.createElement("div");
    for (const word of words) {
      const b = document.createElement("button"); b.className = "word-tile"; b.textContent = word.ossetian; b.disabled = matched.has(word.wordId);
      if (chosen === word.wordId) b.classList.add("selected");
      b.onclick = () => { chosen = word.wordId; render(); }; left.append(b);
    }
    for (const word of translations) {
      const b = document.createElement("button"); b.className = "word-tile"; b.textContent = word.russian; b.disabled = matched.has(word.wordId);
      b.onclick = async () => {
        if (!chosen) { status.textContent = "Сначала выберите осетинское слово."; return; }
        try {
          const result = await AdamApi(`${AdamAuthenticated ? "/vocabulary" : "/words"}/${chosen}/review`, { method: "POST", body: JSON.stringify({ translation: word.russian }) });
          if (result.correct) { matched.add(chosen); status.textContent = "Верная пара!"; } else status.textContent = `Пока неверно. Перевод: ${result.expected}`;
          chosen = null; render(); if (matched.size === words.length) status.textContent = "Все пары найдены!";
        } catch (error) { status.textContent = error.message; }
      }; right.append(b);
    }
    board.append(left, right);
  }
  document.getElementById("game-restart").onclick = load; load();
})();
