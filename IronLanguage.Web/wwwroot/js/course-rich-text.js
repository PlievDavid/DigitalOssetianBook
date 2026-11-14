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
    let paragraph = document.createElement('div');
    const alignments = ['center', 'right', 'justify'];
    block.richText.ops.forEach(op => {
      if (typeof op.insert !== 'string') return;
      const lines = op.insert.split('\n');
      lines.forEach((line, index) => {
        if (index > 0) {
          const { align, indent } = op.attributes || {};
          if (alignments.includes(align)) paragraph.style.textAlign = align;
          if ([1, 2, 3].includes(indent)) paragraph.style.paddingInlineStart = [0, 1.5, 3, 4.5][indent] + 'em';
          if (!paragraph.hasChildNodes()) paragraph.append(document.createElement('br'));
          result.append(paragraph);
          paragraph = document.createElement('div');
        }
        if (!line) return;
        const a = op.attributes || {}, span = document.createElement(a.strike ? 's' : 'span');
        span.textContent = line;
        if (a.bold) span.style.fontWeight = '700'; if (a.italic) span.style.fontStyle = 'italic';
        if (a.underline) span.style.textDecoration = 'underline';
        if (fonts[a.font]) span.style.fontFamily = fonts[a.font]; if (sizes.includes(a.size)) span.style.fontSize = a.size;
        if (/^#[\da-f]{6}$/i.test(a.color || '')) span.style.color = a.color;
        if (/^#[\da-f]{6}$/i.test(a.background || '')) span.style.backgroundColor = a.background;
        paragraph.append(span);
      });
    });
    if (paragraph.hasChildNodes()) result.append(paragraph);
    return result;
  }
  function editor(block, onChange, name = 'Текст объяснения', { showHint = true } = {}) {
    const wrap = document.createElement('div'); wrap.className = 'cr-editor';
    const label = document.createElement('p'); label.className = 'cr-label'; label.textContent = name;
    const surface = document.createElement('div'); wrap.append(label, surface);
    if (showHint) {
      const hint = document.createElement('p');
      hint.className = 'cs-help';
      hint.textContent = 'Выделите текст, чтобы изменить оформление. Alt+F10 — перейти к инструментам.';
      wrap.append(hint);
    }
    const quill = new window.Quill(surface, { formats: ['bold', 'italic', 'underline', 'strike', 'font', 'size', 'color', 'background', 'align', 'indent'], modules: { toolbar: false, history: { userOnly: true } } });
    quill.root.setAttribute('role', 'textbox'); quill.root.setAttribute('aria-label', name); quill.root.setAttribute('aria-multiline', 'true');
    quill.root.setAttribute('aria-keyshortcuts', 'Alt+F10');
    if (block.richText) quill.setContents(block.richText, 'silent'); else quill.setText(block.text || '', 'silent');
    quill.history.clear();
    quill.on('text-change', () => onChange(quill.getText().replace(/\n$/, ''), quill.getContents()));
    let range;
    const toolbar = document.createElement('div'); toolbar.className = 'cr-toolbar'; toolbar.hidden = true; toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', 'Оформление выделенного текста'); wrap.append(toolbar);
    function apply(name, value) {
      if (!range) return;
      if (name === 'align' || name === 'indent') quill.formatLine(range.index, range.length, name, value, 'user');
      else if (range.length) quill.formatText(range.index, range.length, name, value, 'user');
      else quill.format(name, value, 'user');
      quill.setSelection(range, 'silent');
      sync();
    }
    const buttons = [];
    for (const [name, text, title] of [['bold', 'Ж', 'Жирный'], ['italic', 'К', 'Курсив'], ['underline', 'Ч', 'Подчёркнутый'], ['strike', 'З', 'Зачёркнутый']]) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.setAttribute('aria-label', title); b.title = title; b.dataset.format = name;
      b.addEventListener('mousedown', e => e.preventDefault()); b.addEventListener('click', () => apply(name, !quill.getFormat(range)[name])); toolbar.append(b); buttons.push(b);
    }
    const selects = [];
    function select(name, label, values) {
      const el = document.createElement('select'); el.setAttribute('aria-label', label); el.title = label; el.dataset.format = name;
      values.forEach(([value, text]) => { const o = document.createElement('option'); o.value = value; o.textContent = text; el.append(o); });
      el.addEventListener('change', () => apply(name, el.value ? (name === 'indent' ? Number(el.value) : el.value) : false)); toolbar.append(el); selects.push(el);
    }
    select('font', 'Шрифт', [['', 'Основной'], ['onest', 'Onest'], ['golos', 'Golos Text'], ['serif', 'С засечками']]);
    select('align', 'Выравнивание абзаца', [['', 'По левому краю'], ['center', 'По центру'], ['right', 'По правому краю'], ['justify', 'По ширине']]);
    select('indent', 'Отступ абзаца', [['', 'Без отступа'], ['1', 'Малый отступ'], ['2', 'Средний отступ'], ['3', 'Большой отступ']]);
    select('size', 'Размер текста', [['', 'Обычный'], ...sizes.map(v => [v, v.replace('px', ' px')])]);
    select('color', 'Цвет текста', [['', 'Цвет текста'], ['#173f32', 'Зелёный'], ['#123b73', 'Синий'], ['#a52727', 'Красный'], ['#653d82', 'Фиолетовый']]);
    select('background', 'Цвет выделения', [['', 'Без фона'], ['#fff0b3', 'Жёлтый фон'], ['#dcebdc', 'Зелёный фон'], ['#dceafb', 'Голубой фон']]);
    const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = 'Сбросить'; clear.addEventListener('mousedown', e => e.preventDefault());
    clear.addEventListener('click', () => { if (range?.length) { quill.removeFormat(range.index, range.length, 'user'); quill.setSelection(range, 'silent'); sync(); } }); toolbar.append(clear);
    function sync() {
      if (!range) return;
      const format = quill.getFormat(range); buttons.forEach(b => b.setAttribute('aria-pressed', String(!!format[b.dataset.format])));
      selects.forEach(s => { const value = format[s.dataset.format]; s.value = ['string', 'number'].includes(typeof value) ? String(value) : ''; });
    }
    quill.on('selection-change', value => {
      if (value) {
        range = value;
        toolbar.hidden = !value.length;
        const bounds = quill.getBounds(value);
        toolbar.style.top = (surface.offsetTop + (bounds?.bottom ?? 0) + 10) + 'px';
        sync();
      }
      else if (!toolbar.contains(document.activeElement)) toolbar.hidden = true;
    });
    wrap.addEventListener('keydown', e => {
      if (e.altKey && e.key === 'F10' && range) { e.preventDefault(); toolbar.hidden = false; toolbar.querySelector('button').focus(); }
      if (e.key === 'Escape' && !toolbar.hidden) { e.preventDefault(); toolbar.hidden = true; quill.focus(); }
    });
    return wrap;
  }
  window.AdamCourseRichText = { load, render, editor };
})();
