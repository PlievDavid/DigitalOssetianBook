// The same thread interaction and palette as the existing matching game, inside a review snapshot.
(() => {
  const root=document.getElementById('review-pairs');if(!root)return;
  const board=document.getElementById('review-pairs-board'),check=document.getElementById('review-pairs-check'),status=document.getElementById('review-pairs-status');
  const ns='http://www.w3.org/2000/svg';let key='',card=null,done=false,chosen=null,links=new Map(),left=[],right=[],svg=null,threads=null,drag=null,suppress=false;
  const color=i=>`var(--game-thread-${i},#286aab)`;
  function draw(){
    if(!svg || root.hidden)return;threads.replaceChildren();const bounds=board.getBoundingClientRect();svg.setAttribute('viewBox',`0 0 ${bounds.width} ${bounds.height}`);
    function connect(index,target,active=false){const a=left[index].getBoundingClientRect(),b=typeof target==='number'?right[target].getBoundingClientRect():target;
      const x=a.right-bounds.left,y=a.top+a.height/2-bounds.top,endX=typeof target==='number'?b.left-bounds.left:b.x-bounds.left,endY=typeof target==='number'?b.top+b.height/2-bounds.top:b.y-bounds.top;
      const bend=Math.max(18,Math.abs(endX-x)*.45),path=document.createElementNS(ns,'path');path.setAttribute('d',`M ${x} ${y} C ${x+bend} ${y}, ${endX-bend} ${endY}, ${endX} ${endY}`);
      const correct=card.pairs[index].correct;path.setAttribute('class',`game-thread ${active||!done?'game-thread-active':correct?'game-thread-matched':'game-thread-wrong'}`);path.style.stroke=done&&correct===false?'var(--theme-error)':color(index);path.dataset.pairIndex=index;threads.append(path);
    }
    links.forEach((target,index)=>connect(index,target));if(drag?.moved)connect(drag.index,{x:drag.x,y:drag.y},true);
  }
  function animateMatches() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const tileFrames = [
      { transform: 'scale(1)' },
      { transform: 'scale(1.025)', offset: .45 },
      { transform: 'scale(1)' }
    ];
    threads.querySelectorAll('.game-thread-matched').forEach((thread, order) => {
      const index = Number(thread.dataset.pairIndex);
      const delay = order * 55;
      const sweep = thread.cloneNode();
      sweep.setAttribute('class', 'review-pair-sweep');
      sweep.setAttribute('pathLength', '1');
      sweep.style.removeProperty('stroke');
      svg.append(sweep);
      const motion = sweep.animate([
        { strokeDashoffset: '.22', opacity: 0 },
        { strokeDashoffset: '0', opacity: 1, offset: .18 },
        { strokeDashoffset: '-.78', opacity: 1, offset: .82 },
        { strokeDashoffset: '-1', opacity: 0 }
      ], { duration: 410, delay, fill: 'backwards' });
      motion.finished.then(() => sweep.remove(), () => sweep.remove());
      left[index].animate(tileFrames, { duration: 230, delay, easing: 'ease-in-out' });
      right[links.get(index)].animate(tileFrames, { duration: 230, delay: delay + 170, easing: 'ease-in-out' });
    });
  }
  function update(){
    left.forEach((button,index)=>{button.classList.toggle('selected',chosen===index);button.setAttribute('aria-pressed',String(chosen===index));});
    check.disabled=done||links.size!==card.pairs.length;draw();
  }
  function select(index){if(done)return;chosen=chosen===index?null:index;status.textContent=chosen===null?'Выбор отменён.':'Теперь выберите перевод справа.';update();}
  function connect(target){
    if(done)return;if(chosen===null){status.textContent='Сначала выберите слово слева.';return;}
    for(const[index,value]of links)if(value===target)links.delete(index);
    links.set(chosen,target);chosen=null;status.textContent=links.size===card.pairs.length?'Все связи выбраны. Проверьте пары.':'Соедините следующую пару.';update();
  }
  function cancel(){if(drag?.button.hasPointerCapture(drag.pointerId))drag.button.releasePointerCapture(drag.pointerId);drag=null;draw();}
  function tile(value,index,side){
    const button=document.createElement('button');button.type='button';button.className=`word-tile ${side==='left'?'game-word':'game-translation'}`;button.textContent=AdamWordText(value);button.dataset[side]=index;
    button.setAttribute('aria-describedby','review-pairs-instructions');button.disabled=done;
    button.onclick=()=>{if(!suppress)(side==='left'?select(index):connect(index));};
    if(side==='left'){
      button.style.setProperty('--thread-color',color(index));
      button.onpointerdown=event=>{if(done||button.disabled||!event.isPrimary||event.button!==0)return;drag={index,button,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,moved:false};button.setPointerCapture(event.pointerId);};
      button.onpointermove=event=>{if(!drag||event.pointerId!==drag.pointerId)return;drag.x=event.clientX;drag.y=event.clientY;if(!drag.moved&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>6){drag.moved=true;chosen=index;update();}draw();};
      button.onpointerup=event=>{if(!drag||event.pointerId!==drag.pointerId)return;const moved=drag.moved,target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-right]');cancel();if(!moved)return;suppress=true;setTimeout(()=>suppress=false,0);if(target)connect(Number(target.dataset.right));};
      button.onpointercancel=button.onlostpointercapture=()=>{drag=null;draw();};
    }
    return button;
  }
  window.AdamReviewPairs={
    render(value,finished,nextKey){
      const justChecked = key === nextKey && !done && finished;
      if(key!==nextKey){key=nextKey;links=new Map();chosen=null;}
      card=value;done=finished;if(value.pairIndices)value.pairIndices.forEach((target,index)=>links.set(index,target));
      board.replaceChildren();left=[];right=[];svg=document.createElementNS(ns,'svg');svg.setAttribute('class','game-threads');svg.setAttribute('aria-hidden','true');
      threads = document.createElementNS(ns, 'g');
      svg.append(threads);
      const a=document.createElement('div'),b=document.createElement('div');a.className='game-column game-column-left';b.className='game-column game-column-right';
      a.setAttribute('role','group');a.setAttribute('aria-label',value.direction.startsWith('Русский')?'Русские слова':'Осетинские слова');b.setAttribute('role','group');b.setAttribute('aria-label','Переводы');
      value.pairs.forEach((pair,index)=>{const button=tile(pair.prompt,index,'left');if(done){button.classList.toggle('matched',pair.correct===true);button.classList.toggle('is-wrong',pair.correct===false);}left.push(button);a.append(button);});
      value.options.forEach((option,index)=>{const button=tile(option,index,'right');if(done){const source=[...links].find(([,target])=>target===index)?.[0];if(source!==undefined){button.style.setProperty('--thread-color',color(source));button.classList.toggle('matched',value.pairs[source].correct===true);button.classList.toggle('is-wrong',value.pairs[source].correct===false);}}right.push(button);b.append(button);});
      board.append(svg,a,b);status.textContent='';check.hidden=done;update();
      const drawing = svg;
      requestAnimationFrame(() => {
        if (drawing !== svg || root.hidden) return;
        draw();
        if (justChecked) animateMatches();
      });
      if(done&&!value.pairs.every(x=>x.correct)){const corrections=document.createElement('span');corrections.textContent=value.pairs.filter(x=>!x.correct).map(x=>`${AdamWordText(x.prompt)} — ${AdamWordText(x.expected)}`).join('; ');status.append(corrections);}
    },
    indices(){return card?.pairs.map((_,index)=>links.get(index)??-1)??[];},
    focus(){left.find(x=>!x.disabled)?.focus();}
  };
  root.addEventListener('keydown',event=>{if(event.key==='Escape'){cancel();chosen=null;update();status.textContent='Выбор отменён.';}});
  new ResizeObserver(draw).observe(board);
})();
