(() => {
  'use strict';
  const fonts = { onest: 'Onest, sans-serif', golos: '"Golos Text", sans-serif', serif: 'Georgia, "Golos Text", serif' };
  const sizes = ['16px', '18px', '22px', '28px'];
  let loading;
  function load() {
    if (!loading) loading = new Promise((resolve, reject) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/vendor/quill/quill.core.css'; document.head.append(css);
      const script = document.createElement('script'); script.src = '/vendor/quill/quill.js';
      script.onload = () => {
        const size = window.Quill.import('attributors/style/size'); size.whitelist = sizes; window.Quill.register(size, true);
        const font = window.Quill.import('formats/font'); font.whitelist = Object.keys(fonts); window.Quill.register(font, true); resolve();
      };
      script.onerror = () => reject(new Error('Не удалось загрузить редактор текста. Обновите страницу.')); document.head.append(script);
    });
    return loading;
  }
  function render(block) {
    const result = document.createElement('div'); result.className = 'cr-text';
    if (!block.richText?.ops) { result.textContent = block.text || ''; return result; }
    block.richText.ops.forEach((op, index) => {
      if (typeof op.insert !== 'string') return;
      const span = document.createElement('span'), a = op.attributes || {};
      span.textContent = index === block.richText.ops.length - 1 ? op.insert.replace(/\n$/, '') : op.insert;
      if (a.bold) span.style.fontWeight = '700'; if (a.italic) span.style.fontStyle = 'italic';
      span.style.textDecoration = [a.underline && 'underline', a.strike && 'line-through'].filter(Boolean).join(' ');
      if (fonts[a.font]) span.style.fontFamily = fonts[a.font]; if (sizes.includes(a.size)) span.style.fontSize = a.size;
      if (/^#[\da-f]{6}$/i.test(a.color || '')) span.style.color = a.color;
      if (/^#[\da-f]{6}$/i.test(a.background || '')) span.style.backgroundColor = a.background;
      result.append(span);
    });
    return result;
  }
  function editor(block, onChange) {
    const wrap = document.createElement('div'); wrap.className = 'cr-editor';
    const label = document.createElement('p'); label.className = 'cr-label'; label.textContent = 'Текст объяснения';
    const hint = document.createElement('p'); hint.className = 'cs-help'; hint.textContent = 'Выделите текст, чтобы изменить оформление. Alt+F10 — перейти к инструментам.';
    const surface = document.createElement('div'); wrap.append(label, surface, hint);
    const quill = new window.Quill(surface, { formats: ['bold', 'italic', 'underline', 'strike', 'font', 'size', 'color', 'background'], modules: { toolbar: false, history: { userOnly: true } } });
    quill.root.setAttribute('role', 'textbox'); quill.root.setAttribute('aria-label', 'Текст объяснения'); quill.root.setAttribute('aria-multiline', 'true');
    if (block.richText) quill.setContents(block.richText, 'silent'); else quill.setText(block.text || '', 'silent');
    quill.history.clear();
    quill.on('text-change', () => onChange(quill.getText().replace(/\n$/, ''), quill.getContents()));
    let range;
    const toolbar = document.createElement('div'); toolbar.className = 'cr-toolbar'; toolbar.hidden = true; toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', 'Оформление выделенного текста'); wrap.append(toolbar);
    function apply(name, value) { if (!range?.length) return; quill.formatText(range.index, range.length, name, value, 'user'); quill.setSelection(range, 'silent'); sync(); }
    const buttons = [];
    for (const [name, text, title] of [['bold', 'Ж', 'Жирный'], ['italic', 'К', 'Курсив'], ['underline', 'Ч', 'Подчёркнутый'], ['strike', 'З', 'Зачёркнутый']]) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.setAttribute('aria-label', title); b.title = title; b.dataset.format = name;
      b.addEventListener('mousedown', e => e.preventDefault()); b.addEventListener('click', () => apply(name, !quill.getFormat(range)[name])); toolbar.append(b); buttons.push(b);
    }
    const selects = [];
    function select(name, label, values) {
      const el = document.createElement('select'); el.setAttribute('aria-label', label); el.title = label; el.dataset.format = name;
      values.forEach(([value, text]) => { const o = document.createElement('option'); o.value = value; o.textContent = text; el.append(o); });
      el.addEventListener('change', () => apply(name, el.value || false)); toolbar.append(el); selects.push(el);
    }
    select('font', 'Шрифт', [['', 'Основной'], ['onest', 'Onest'], ['golos', 'Golos Text'], ['serif', 'С засечками']]);
    select('size', 'Размер текста', [['', 'Обычный'], ...sizes.map(v => [v, v.replace('px', ' px')])]);
    select('color', 'Цвет текста', [['', 'Цвет текста'], ['#173f32', 'Зелёный'], ['#123b73', 'Синий'], ['#a52727', 'Красный'], ['#653d82', 'Фиолетовый']]);
    select('background', 'Цвет выделения', [['', 'Без фона'], ['#fff0b3', 'Жёлтый фон'], ['#dcebdc', 'Зелёный фон'], ['#dceafb', 'Голубой фон']]);
    const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = 'Сбросить'; clear.addEventListener('mousedown', e => e.preventDefault());
    clear.addEventListener('click', () => { if (range?.length) { quill.removeFormat(range.index, range.length, 'user'); quill.setSelection(range, 'silent'); sync(); } }); toolbar.append(clear);
    function sync() {
      if (!range?.length) return;
      const format = quill.getFormat(range); buttons.forEach(b => b.setAttribute('aria-pressed', String(!!format[b.dataset.format])));
      selects.forEach(s => s.value = typeof format[s.dataset.format] === 'string' ? format[s.dataset.format] : '');
    }
    quill.on('selection-change', value => {
      if (value?.length) { range = value; toolbar.hidden = false; const bounds = quill.getBounds(value); toolbar.style.top = (surface.offsetTop + bounds.bottom + 10) + 'px'; sync(); }
      else if (!toolbar.contains(document.activeElement)) toolbar.hidden = true;
    });
    wrap.addEventListener('keydown', e => {
      if (e.altKey && e.key === 'F10' && range?.length) { e.preventDefault(); toolbar.hidden = false; toolbar.querySelector('button').focus(); }
      if (e.key === 'Escape' && !toolbar.hidden) { e.preventDefault(); toolbar.hidden = true; quill.focus(); }
    });
    return wrap;
  }
  window.AdamCourseRichText = { load, render, editor };
})();
