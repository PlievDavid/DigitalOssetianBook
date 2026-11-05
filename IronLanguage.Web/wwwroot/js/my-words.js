(() => {
  const list = document.getElementById('my-words-list');
  if (!list) return;
  const $ = id => document.getElementById(id);
  const text = window.AdamWordText;
  const stateLabels = { new: 'Изучаю', learning: 'Изучаю', mastered: 'Выучено' };
  let sequence = 0, pendingRemoval = null, requestAbort = null;
  const make = (tag, className, value) => {
    const node = document.createElement(tag); if (className) node.className = className;
    if (value !== undefined) node.textContent = value; return node;
  };
  function link(label, href, className) { const a = make('a',className,label);a.href=href;return a; }
  function message(value) { $('words-status').textContent = value; }
  function empty(title, description, action, href) {
    const box = make('div','words-empty');box.append(make('h2','',title),make('p','',description));
    if (action) box.append(link(action,href,'button secondary'));return box;
  }
  function renderTabs(counts, active) {
    const tabs = $('words-counts'), focused=tabs.contains(document.activeElement);tabs.replaceChildren();
    for (const [key,label,count] of [['all','Все',counts.total],['learning','Изучаю',counts.learning],['mastered','Выучено',counts.mastered]]) {
      const params = new URLSearchParams(location.search);params.set('status',key);params.delete('page');
      const a=link('',`${location.pathname}?${params}`,'words-tab');a.append(make('span','',label),make('span','words-tab-count',count));
      if(key===active) {a.classList.add('is-current');a.setAttribute('aria-current','page');}tabs.append(a);
    }
    const current=tabs.querySelector('.is-current');
    if(current && current.offsetLeft+current.offsetWidth>tabs.offsetLeft+tabs.clientWidth)tabs.scrollLeft=current.offsetLeft+current.offsetWidth-tabs.offsetLeft-tabs.clientWidth+8;
    if(focused)current?.focus({preventScroll:true});
  }
  function wordRow(word) {
    const row=make('article','words-row');row.dataset.wordId=word.wordId;
    const copy=make('div','words-row-copy');copy.append(make('strong','',text(word.ossetian)));
    const translation=make('span','words-row-translation',text(word.russian));
    const state=make('span','words-row-status',stateLabels[word.status]);state.dataset.status=word.status;
    const remove=make('button','words-delete');remove.type='button';remove.title='Удалить из словаря';remove.setAttribute('aria-label',`Удалить «${text(word.ossetian)}» из словаря`);
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('aria-hidden','true');
    const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7');svg.append(path);remove.append(svg);
    if(word.example || word.dictionaryNote || word.audioPath) {
      const show=make('button','words-word-button',text(word.ossetian));show.type='button';show.setAttribute('aria-label',`Пример и произношение: ${text(word.ossetian)}`);show.setAttribute('aria-expanded','false');
      show.onclick=()=>{const expanded=row.querySelector('.words-row-extra');expanded.hidden=!expanded.hidden;show.setAttribute('aria-expanded',String(!expanded.hidden));};copy.replaceChildren(show);
    }
    remove.onclick=()=>{pendingRemoval=word;$('words-remove-copy').textContent=`«${text(word.ossetian)}» — ${text(word.russian)}.`;$('words-remove-dialog').showModal();};
    row.append(copy,translation,state,remove);
    if(word.example || word.dictionaryNote || word.audioPath) {
      const extra=make('div','words-row-extra');extra.hidden=true;
      if(word.example) extra.append(make('p','',word.example));if(word.dictionaryNote)extra.append(make('p','words-secondary',word.dictionaryNote));
      if(word.audioPath) {const audio=make('audio');audio.controls=true;audio.preload='none';audio.src=word.audioPath;audio.setAttribute('aria-label',`Произношение: ${text(word.ossetian)}`);extra.append(audio);}row.append(extra);
    }
    return row;
  }
  function pagination(data) {
    const target=$('words-pagination');target.replaceChildren();if(data.pages<=1)return;
    const pageLink=(n,label)=>{const q=new URLSearchParams(location.search);q.set('page',n);return link(label,`${location.pathname}?${q}`,'words-page-link');};
    if(data.page>1)target.append(pageLink(data.page-1,'← Назад'));
    const indicator=make('span','words-page-indicator',`${data.page} / ${data.pages}`);indicator.setAttribute('aria-label',`Страница ${data.page} из ${data.pages}`);target.append(indicator);
    if(data.page<data.pages)target.append(pageLink(data.page+1,'Далее →'));
  }
  async function loadWords() {
    const request=++sequence, params=new URLSearchParams(location.search), form=$('words-search');
    if(params.get('status')==='new'){params.set('status','learning');history.replaceState(null,'',`${location.pathname}?${params}`);}
    requestAbort?.abort();requestAbort=new AbortController();const signal=requestAbort.signal;
    const state=params.get('status')||'all';form.elements.search.value=params.get('search')||'';form.elements.status.value=state;form.elements.sort.value=params.get('sort')||'due';
    const option=[...document.querySelectorAll('[data-sort]')].find(x=>x.dataset.sort===form.elements.sort.value);
    $('words-sort-label').textContent=option?.textContent || 'Пора повторить';
    document.querySelectorAll('[data-sort]').forEach(x=>x.setAttribute('aria-checked',String(x.dataset.sort===form.elements.sort.value)));
    const results=$('words-results');results.setAttribute('aria-busy','true');message('');
    try {
      const [counts,data]=await Promise.all([AdamApi('/word-review/summary',{signal}),AdamApi(`/word-review/words?${params}`,{signal})]);
      if(request!==sequence)return;
      renderTabs(counts,state);
      results.replaceChildren(...data.items.map(wordRow));
      document.querySelector('.words-table-head').hidden=!data.items.length;
      if(!data.items.length) {
        const searched=!!params.get('search');
        results.append(empty(searched?'Ничего не найдено':state==='mastered'?'Выученные слова появятся здесь':state==='new'?'Новых слов пока нет':state==='learning'?'Здесь будут слова в изучении':'Ваш словарь пока пуст',
          searched?'Попробуйте другое написание или перевод.':state==='mastered'?'Повторяйте слова или отмечайте знакомые кнопкой «Знаю».':'Выберите интересную тему — добавьте несколько слов для первого занятия.',
          searched?'Сбросить поиск':'Выбрать тему',searched?`${location.pathname}?status=${state}`:'/vocabulary/available'));
      }
      pagination(data);
      if(params.has('page') && Number(params.get('page'))!==data.page){params.set('page',data.page);history.replaceState(null,'',`${location.pathname}?${params}`);}
    } catch(error) {
      if(request!==sequence || error.name==='AbortError')return;
      results.replaceChildren(empty('Не удалось загрузить слова',error.message,'Попробовать снова',location.href));
    } finally {if(request===sequence)results.setAttribute('aria-busy','false');}
  }
  const navigate=async(href,scroll=false)=>{const url=new URL(href,location.href);if(url.href!==location.href)history.pushState(null,'',`${url.pathname}${url.search}`);await loadWords();if(scroll)list.scrollIntoView({block:'start'});};
  list.addEventListener('click',event=>{
    if(event.defaultPrevented || event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;
    const anchor=event.target.closest('.words-tab,.words-page-link,.words-empty a');if(!anchor)return;
    const url=new URL(anchor.href);if(url.origin!==location.origin || url.pathname!==location.pathname)return;
    event.preventDefault();navigate(anchor.href,anchor.matches('.words-page-link'));
  });
  window.addEventListener('popstate',()=>loadWords());
  $('words-search').onsubmit=event=>{event.preventDefault();const q=new URLSearchParams();for(const[key,value]of new FormData(event.currentTarget))if(String(value).trim())q.set(key,String(value).trim());navigate(`${location.pathname}?${q}`);};
  const sortMenu=$('words-sort-menu'),sortTrigger=sortMenu.querySelector('summary');
  sortMenu.addEventListener('toggle',()=>sortTrigger.setAttribute('aria-expanded',String(sortMenu.open)));
  sortMenu.querySelectorAll('[data-sort]').forEach(button=>button.onclick=()=>{formSort(button.dataset.sort);});
  function formSort(value){$('words-search').elements.sort.value=value;sortMenu.open=false;sortTrigger.focus();$('words-search').requestSubmit();}
  sortMenu.addEventListener('keydown',event=>{
    const buttons=[...sortMenu.querySelectorAll('[data-sort]')],index=buttons.indexOf(document.activeElement);
    if(event.key==='Escape'){sortMenu.open=false;sortTrigger.focus();event.preventDefault();}
    else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {event.preventDefault();sortMenu.open=true;const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowDown'?(index+1)%buttons.length:(index<0?buttons.length-1:(index-1+buttons.length)%buttons.length);buttons[next].focus();}
  });
  document.addEventListener('click',event=>{if(!sortMenu.contains(event.target))sortMenu.open=false;});
  $('words-remove-dialog').addEventListener('close',async()=>{
    if($('words-remove-dialog').returnValue!=='confirm'||!pendingRemoval)return;
    const word=pendingRemoval;pendingRemoval=null;
    try {await AdamApi(`/vocabulary/${word.wordId}`,{method:'DELETE'});await loadWords();message('Слово удалено из словаря.');$('words-search').elements.search.focus();}
    catch(error){message(error.message);}
  });
  document.addEventListener('click',event=>{document.querySelectorAll('.words-menu[open]').forEach(x=>{if(!x.contains(event.target))x.open=false;});});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelectorAll('.words-menu[open]').forEach(x=>{x.open=false;x.querySelector('summary').focus();});});
  loadWords();
})();
