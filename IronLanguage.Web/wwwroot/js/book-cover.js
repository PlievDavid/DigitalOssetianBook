(() => {
  const presets = [
    { background: '#E6EDDC', textColor: '#173F31', accent: '#7D9568', font: 'onest', pattern: 'none' },
    { background: '#F6E8CC', textColor: '#503820', accent: '#B88C43', font: 'onest', pattern: 'lines' },
    { background: '#25394B', textColor: '#FCFAF1', accent: '#B2C8CA', font: 'onest', pattern: 'arches' },
    { background: '#914832', textColor: '#FFF8ED', accent: '#E8C094', font: 'onest', pattern: 'dots' },
    { background: '#EAE4EF', textColor: '#42364C', accent: '#9A86AB', font: 'onest', pattern: 'lines' },
    { background: '#DCEAE8', textColor: '#184B45', accent: '#7CA69E', font: 'onest', pattern: 'arches' }
  ];
  const fonts = { onest: 'Onest, sans-serif', golos: '"Golos Text", sans-serif', serif: 'Georgia, "Times New Roman", serif' };
  const color = value => typeof value === 'string' && value.length === 7 && /^#[\da-f]{6}$/i.test(value);
  function forTitle(title) {
    let hash = 0;
    for (let index = 0; index < title.length; index++) hash = (Math.imul(hash, 31) + title.charCodeAt(index)) >>> 0;
    return { ...presets[hash % presets.length] };
  }
  function normalize(design, title) {
    const fallback = forTitle(title);
    if (!design || !color(design.background) || !color(design.textColor) || !color(design.accent)
      || !Object.hasOwn(fonts, design.font) || !['none', 'lines', 'dots', 'arches'].includes(design.pattern)) return fallback;
    return { background: design.background, textColor: design.textColor, accent: design.accent, font: design.font, pattern: design.pattern };
  }
  function contrast(background, textColor) {
    if (!color(background) || !color(textColor)) return 0;
    const luminance = value => {
      const channels = [1, 3, 5].map(offset => parseInt(value.slice(offset, offset + 2), 16) / 255)
        .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    const first = luminance(background), second = luminance(textColor);
    return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
  }
  function mount(target, item) {
    const title = item.title || 'Название';
    const design = normalize(item.coverDesign, title);
    target.classList.add('book-cover');
    target.setAttribute('aria-hidden', 'true');
    target.dataset.pattern = design.pattern;
    target.style.setProperty('--cover-background', design.background);
    target.style.setProperty('--cover-text', design.textColor);
    target.style.setProperty('--cover-accent', design.accent);
    target.style.setProperty('--cover-font', fonts[design.font]);
    target.classList.toggle('book-cover-long-title', title.length > 30);
    const author = document.createElement('span'); author.className = 'book-cover-author'; author.textContent = item.authors || 'Автор';
    const heading = document.createElement('span'); heading.className = 'book-cover-title'; heading.textContent = title;
    const mark = document.createElement('span'); mark.className = 'book-cover-mark'; mark.textContent = 'Адам';
    target.replaceChildren(author, heading, mark);
    return target;
  }
  function create(item) { return mount(document.createElement('span'), item); }
  window.AdamBookCover = Object.freeze({ create, mount, forTitle, normalize, contrast, presets });
  document.querySelectorAll('[data-book-cover]').forEach(target => {
    let design;
    try { design = JSON.parse(target.dataset.coverDesign || 'null'); } catch { design = null; }
    mount(target, { title: target.dataset.coverTitle, authors: target.dataset.coverAuthors, coverDesign: design });
  });
})();
