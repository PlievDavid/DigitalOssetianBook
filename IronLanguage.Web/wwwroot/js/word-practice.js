(() => {
  const root = document.getElementById('spaced-review'); if (!root) return;
  const el = id => document.getElementById(id);
  const status = el('review-status');
  const settings = el('review-settings');
  const settingsForm = el('review-settings-form');
  let session = null, busy = false, summary = null;
  const setText = (id, text) => { el(id).textContent = text; };
  const post = (path, body) => AdamApi(`/word-review/${path}`, { method: 'POST', body: JSON.stringify(body) });
  function lock(value) {
    busy = value; root.setAttribute('aria-busy', String(value));
    root.querySelectorAll('button,input').forEach(control => {
      if (value) { control.dataset.wasDisabled = String(control.disabled); control.disabled = true; }
      else { control.disabled = control.dataset.wasDisabled === 'true'; delete control.dataset.wasDisabled; }
    });
  }
  async function work(action) {
    if (busy) return;
    status.textContent = ''; lock(true);
    try { await action(); }
    catch (error) { status.textContent = error.message; }
    finally { lock(false); configureMode(); }
  }
  function configureMode() {
    if (!summary) return;
    const mode = root.querySelector('input[name=mode]:checked').value;
    const count = mode === 'due' ? summary.due : mode === 'new' ? summary.new : summary.due + summary.new;
    el('review-begin').disabled = busy || !count;
    el('review-add-words').hidden = !!count;
    el('review-start-note').hidden = count > 0;
    setText('review-start-note', mode === 'due' ? 'Пока нет слов для повторения. Открой новые карточки или выбери другое занятие.' : 'Открой карточки из любой темы или сохрани слово при чтении.');
  }
  async function counts() {
    const data = await AdamApi('/word-review/summary');
    summary = data;
    const plural = new Intl.PluralRules('ru');
    const words = n => `${n} ${{ one: 'слово', few: 'слова', many: 'слов', other: 'слов' }[plural.select(n)]}`;
    setText('review-count-due', words(data.due));
    setText('review-count-new', words(data.new));
    setText('review-count-mixed', words(data.due + data.new));
  }
  function showStart() {
    root.dataset.view = 'start';
    el('review-start').hidden = false; el('review-study').hidden = true; el('review-finish').hidden = true;
    el('review-resume').hidden = !session?.card;
  }
  function render() {
    el('review-start').hidden = true;
    const card = session.card;
    root.dataset.view = card ? 'study' : 'finish';
    el('review-study').hidden = !card; el('review-finish').hidden = !!card;
    if (!card) {
      setText('review-total-correct', session.correct);
      setText('review-total-errors', session.errors);
      setText('review-total-skipped', session.skipped);
      if (!session.total) status.textContent = 'Для этого режима пока нет карточек. Сохраните новые слова или дождитесь времени повторения.';
      el('review-finish-title').focus();
      return;
    }
    setText('review-step', `${session.index + 1} из ${session.total}`);
    el('review-progress-bar').max = session.total; el('review-progress-bar').value = session.index;
    const flash = card.kind === 'cards', pairs = card.kind === 'pairs', done = !!session.result;
    el('review-study').dataset.kind = card.kind;
    el('review-flashcard').hidden = !flash; el('review-check-form').hidden = flash || pairs;el('review-pairs').hidden = !pairs;
    if(pairs) AdamReviewPairs.render(card,done,`${session.id}:${session.index}`);
    const flip = el('review-flip');
    const sameCard = flip.dataset.key === `${session.id}:${session.index}`;
    flip.dataset.key = `${session.id}:${session.index}`;
    // Replacing the card must not animate the previous answer back into view.
    if (!sameCard) {
      flip.querySelector('.review-flip-inner').style.transition = 'none';
      flip.classList.remove('is-flipped');
      void flip.offsetWidth;
      flip.querySelector('.review-flip-inner').style.transition = '';
    }
    const direction = card.direction.toLocaleLowerCase('ru');
    setText('review-direction', direction); setText('review-prompt', AdamWordText(card.prompt));
    setText('review-translation', AdamWordText(card.translation)); setText('review-original', session.revealed ? AdamWordText(card.prompt) : '');
    flip.classList.toggle('is-flipped', session.revealed);
    flip.setAttribute('aria-expanded', String(session.revealed));
    flip.setAttribute('aria-label', session.revealed ? `Перевод: ${card.translation}` : `${card.prompt}. Перевернуть карточку`);
    flip.querySelector('.review-front').setAttribute('aria-hidden', String(session.revealed));
    flip.querySelector('.review-back').setAttribute('aria-hidden', String(!session.revealed));
    // Keep the front button focusable, but a second click cannot reveal or award again.
    el('review-rating').hidden = !flash || !session.revealed || done;
    el('review-reveal').hidden = !flash || session.revealed || done;
    el('review-next').hidden = !done; el('review-skip').hidden = done;
    el('review-check').hidden = flash || pairs || done;
    el('review-pairs-check').hidden = !pairs || done;
    const correction = done && !flash && !pairs && !session.result.correct ? `Правильный ответ: ${AdamWordText(session.result.expected)}` : '';
    setText('review-feedback', done && !flash ? (pairs ? 'Пары проверены.' : correction || 'Ответ правильный.') : '');
    if (!flash && !pairs) {
      setText('review-test-direction', direction); setText('review-test-prompt', AdamWordText(card.prompt));
      setText('review-choice-days', card.kind === 'choice' ? 'Выберите перевод' : 'Введите перевод');
      const options = el('review-options'); options.querySelectorAll('label').forEach(x => x.remove());
      options.hidden = card.kind !== 'choice'; el('review-input-wrap').hidden = card.kind !== 'input';
      el('review-letter').hidden = direction !== 'русский → осетинский';
      el('review-letter').disabled = done;
      const inputField = el('review-input');
      inputField.required = card.kind === 'input' && !done;
      inputField.disabled = done;
      inputField.setAttribute('aria-invalid', String(!!correction));
      const testKey = `${session.id}:${session.index}:${card.kind}`;
      if (inputField.dataset.key !== testKey) inputField.value = '';
      if (session.result?.answer != null) inputField.value = session.result.answer;
      inputField.dataset.key = testKey;
      el('review-input-wrap').dataset.outcome = done ? (correction ? 'incorrect' : 'correct') : '';
      setText('review-input-mark', done ? (correction ? '×' : '✓') : '');
      setText('review-input-answer', correction);
      el('review-input-answer').tabIndex = correction ? 0 : -1;
      card.options.forEach((text, index) => {
        const label = document.createElement('label'), input = document.createElement('input'), span = document.createElement('span'), mark = document.createElement('span');
        input.type = 'radio'; input.name = 'choice'; input.value = text; input.required = true; input.disabled = done;
        input.id = `review-option-${index}`; span.textContent = AdamWordText(text);
        mark.className = 'review-option-mark'; mark.setAttribute('aria-hidden', 'true');
        if (done) {
          input.checked = text === session.result.answer;
          if (text === (session.result.correct ? session.result.answer ?? session.result.expected : session.result.expected)) {
            label.dataset.outcome = 'correct'; mark.textContent = '✓';
          } else if (input.checked) {
            label.dataset.outcome = 'incorrect'; mark.textContent = '×';
          }
        }
        label.append(input, span, mark); options.append(label);
      });
      el('review-check').disabled = card.kind === 'choice';
    }
  }
  async function command(action, extra = {}) {
    if (!session?.card) return;
    const selfAssessment = action === 'answer' && session.card.kind === 'cards', submittedIndex=session.index,submittedWord=session.card.wordId;
    const response = await post(`sessions/${session.id}`, { index: submittedIndex, action, ...extra });
    const animate=action==='reveal' && !session.revealed && response.revealed && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const inner=el('review-flip').querySelector('.review-flip-inner'),controls=root.querySelector('.review-card-controls');
    let outgoing=null,incoming=null;
    try {
      if(animate){controls.classList.add('is-animating');outgoing=inner.animate([{transform:'rotateY(0deg)'},{transform:'rotateY(-90deg)'}],{duration:140,easing:'cubic-bezier(.45,0,.8,.5)',fill:'forwards'});await outgoing.finished;}
      session=response;
      if(selfAssessment && session.index===submittedIndex && session.card?.wordId===submittedWord && session.result)session=await post(`sessions/${session.id}`,{index:session.index,action:'next'});
      lock(false);render();lock(true);
      if(animate){incoming=inner.animate([{transform:'rotateY(90deg)'},{transform:'rotateY(0deg)'}],{duration:170,easing:'cubic-bezier(.2,.5,.4,1)',fill:'forwards'});outgoing.cancel();await incoming.finished;}
    } finally {outgoing?.cancel();incoming?.cancel();controls.classList.remove('is-animating');}
    // lock(false) restores pre-request controls; render after unlocking applies the new state.
    if (action === 'reveal') setTimeout(() => el('review-known').focus(),0);
    if (action === 'answer' && !selfAssessment) setTimeout(() => el('review-next').focus({ preventScroll: true }), 0);
    if ((['next','skip'].includes(action) || selfAssessment) && session.card) setTimeout(() => {
      if (session.card.kind === 'input') el('review-input').focus();
      else if (session.card.kind === 'cards') el('review-flip').focus();
      else if (session.card.kind === 'pairs') AdamReviewPairs.focus();
      else root.querySelector('input[name=choice]')?.focus();
    }, 0);
    if (!session.card) await counts();
  }
  el('review-begin').onclick = () => work(async () => {
    session = await post('sessions', { mode: root.querySelector('input[name=mode]:checked').value });
    if (!session.total) { showStart(); status.textContent='Для этого режима сейчас нет слов. Выберите другой режим или добавьте новые.'; return; }
    lock(false); render(); lock(true);
  });
  el('review-resume').onclick = () => render();
  el('review-exit').onclick = () => work(() => command('finish'));
  el('review-again').onclick = () => work(async () => { showStart(); await counts(); });
  el('review-flip').onclick = () => { if (!session.revealed) work(() => command('reveal')); };
  el('review-reveal').onclick = () => work(() => command('reveal'));
  root.querySelectorAll('input[name=mode]').forEach(x => x.addEventListener('change', configureMode));
  el('review-known').onclick = () => work(() => command('answer', { known: true }));
  el('review-unknown').onclick = () => work(() => command('answer', { known: false }));
  el('review-next').onclick = () => work(() => command('next'));
  el('review-skip').onclick = () => work(() => command('skip'));
  el('review-check-form').onsubmit = event => {
    event.preventDefault();
    const answer = session.card.kind === 'choice' ? root.querySelector('input[name=choice]:checked')?.value : el('review-input').value;
    if (answer?.trim()) work(() => command('answer', { answer }));
  };
  el('review-options').addEventListener('change', () => { el('review-check').disabled = busy || !root.querySelector('input[name=choice]:checked'); });
  el('review-pairs-check').onclick=()=>work(()=>command('answer',{pairIndices:AdamReviewPairs.indices()}));
  el('review-letter').onclick = () => {
    const input = el('review-input'); input.setRangeText('ӕ', input.selectionStart, input.selectionEnd, 'end'); input.focus();
  };
  el('review-settings-open').onclick = () => work(async () => {
    const value = await AdamApi('/word-review/settings');
    settingsForm.elements.directInput.checked = value.directInput; setText('review-settings-error', '');
    settings.showModal();
  });
  el('review-settings-close').onclick = () => settings.close();
  settings.addEventListener('close', () => el('review-settings-open').focus());
  settingsForm.onsubmit = event => {
    event.preventDefault();
    work(async () => {
      try {
        await AdamApi('/word-review/settings', { method: 'PUT', body: JSON.stringify({ format: 'auto', directInput: settingsForm.elements.directInput.checked }) });
        settings.close();
      } catch (error) { setText('review-settings-error', error.message); }
    });
  };
  work(async () => { await counts(); session = await AdamApi('/word-review/session'); showStart(); });
})();
