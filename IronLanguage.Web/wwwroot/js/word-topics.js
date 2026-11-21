(() => {
  const el = id => document.getElementById(id);
  const status = el('words-status');
  const art = ['family', 'home', 'nature', 'weather', 'table', 'garden', 'pets', 'wildlife', 'person', 'clothing'];
  const signedIn = window.AdamAuthenticated;
  const reveal = el('topic-reveal');
  const known = el('topic-known');
  const unknown = el('topic-unknown');
  const next = el('topic-next');
  let topic, cards = [], position = 0, busy = false;

  function showCard(focus = false) {
    const card = cards[position];
    el('topic-detail').hidden = !card;
    el('topic-complete').hidden = !!card;
    if (!card) {
      el('topic-complete-title').textContent = cards.length ? 'Тема пройдена!' : 'Все слова темы уже в словаре';
      el('topic-complete-copy').textContent = signedIn ? 'Продолжай с другой темой или открой занятие.' : 'Войди, чтобы сохранить слова и свой прогресс.';
      if (focus) el('topic-complete-title').focus();
      return;
    }
    el('topic-position').textContent = `${position + 1} из ${cards.length}`;
    el('topic-progress').max = cards.length;
    el('topic-progress').value = position;
    el('topic-prompt').textContent = AdamWordText(card.ossetian);
    el('topic-translation').textContent = '';
    reveal.hidden = false;
    known.hidden = unknown.hidden = next.hidden = true;
    if (focus) el('topic-prompt').focus();
  }

  reveal.onclick = () => {
    el('topic-translation').textContent = AdamWordText(cards[position].russian);
    reveal.hidden = true;
    known.hidden = unknown.hidden = !signedIn;
    next.hidden = signedIn;
    (signedIn ? unknown : next).focus();
  };

  async function rate(isKnown) {
    if (busy) return;
    busy = known.disabled = unknown.disabled = true;
    status.textContent = '';
    try {
      const card = cards[position];
      await AdamApi(`/word-review/topics/${topic.id}/words/${card.senseId}/rating`, {
        method: 'POST', body: JSON.stringify({ known: isKnown })
      });
      position++;
      showCard(true);
    } catch (error) {
      status.textContent = error.message;
    } finally {
      busy = known.disabled = unknown.disabled = false;
    }
  }
  known.onclick = () => rate(true);
  unknown.onclick = () => rate(false);
  next.onclick = () => { position++; showCard(true); };

  function tile(item) {
    const link = document.createElement('a');
    link.className = 'words-topic-card';
    link.href = `/vocabulary/available?topic=${item.id}`;
    const image = document.createElement('img');
    image.className = 'words-topic-art';
    image.alt = '';
    image.width = image.height = 96;
    image.src = `/images/crosswords/${art[item.id - 1]}-v1.webp`;
    image.onerror = () => { image.hidden = true; };
    const title = document.createElement('strong');
    title.textContent = item.title;
    const action = document.createElement('span');
    action.className = 'words-topic-action';
    action.textContent = item.words.every(word => word.saved) ? 'Пройдено' : 'Карточки →';
    link.append(image, title, action);
    return link;
  }

  async function load() {
    const data = await AdamApi('/word-review/topics');
    const selected = new URLSearchParams(location.search).get('topic');
    topic = data.find(item => String(item.id) === selected);
    if (!topic) {
      el('words-topics').replaceChildren(...data.map(tile));
      if (!data.length) status.textContent = 'Темы ещё готовятся.';
      return;
    }
    cards = topic.words.filter(word => !word.saved);
    el('topics-back').href = '/vocabulary/available';
    el('topics-back').textContent = '← Все темы';
    el('topics-title').textContent = topic.title;
    el('topics-subtitle').hidden = true;
    el('topic-login-note').hidden = signedIn;
    el('topic-login').href = `/account/login?returnUrl=${encodeURIComponent(location.pathname + location.search)}`;
    showCard();
  }
  load().catch(error => { status.textContent = error.message; });
})();
