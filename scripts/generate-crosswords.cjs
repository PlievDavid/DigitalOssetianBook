const fs = require('node:fs');
const source = fs.readFileSync('IronLanguage.Web/Data/ossetian-russian-dictionary.csv', 'utf8');
const rows = source.match(/(?:[^\n"]|"(?:[^"]|"")*")+/g).map(s => s.match(/(?:"(?:[^"]|"")*"|[^,]*)(?:,|$)/g).filter(Boolean).map(s => s.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')));
const key = s => s.replace(/[\u0301\uFEFF]/g, '').replace(/æ/g, 'ӕ').trim().toLowerCase();
const themes = [
 ['Семья', 'мать отец брат сын', 4],
 ['Дом', 'дом дверь окно стол стул кровать крыша стена', 5],
 ['Природа', 'лес дерево гора река озеро камень земля', 5],
 ['Погода и небо', 'небо солнце луна звезда дождь снег ветер облако туман', 6],
 ['За столом', 'хлеб сыр молоко мясо соль вода масло яйцо', 6],
 ['В саду', 'яблоко груша слива вишня абрикос орех виноград персик', 6],
 ['Домашние животные', 'собака кошка конь корова овца коза гусь курица петух утка', 6],
 ['Дикие животные', 'волк лиса медведь заяц олень лев ёж мышь', 7],
 ['Человек', 'голова рука нога глаз ухо нос рот зуб сердце язык', 8],
 ['Одежда и дом', 'рубашка шапка платье платок обувь дом дверь окно стул кровать', 8]
];
function layout(words, seed) {
 let state = seed + 1; const rand = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
 const pending = [...words].sort(() => rand() - .5), placed = [], cells = new Map();
 const at = (r,c) => cells.get(`${r},${c}`);
 function valid(word,r,c,down) {
   let crosses=0;
   if(at(r-(down?1:0),c-(down?0:1)) || at(r+(down?word.answer.length:0),c+(down?0:word.answer.length))) return false;
   for(let i=0;i<word.answer.length;i++) {
     const y=r+(down?i:0),x=c+(down?0:i), old=at(y,x);
     if(old) { if(old.letter!==word.answer[i] || old.dirs.includes(down)) return false; crosses++; }
     else if(at(y+(down?0:1),x+(down?1:0)) || at(y-(down?0:1),x-(down?1:0))) return false;
   }
   return crosses>0;
 }
 function put(word,r,c,down) {
   placed.push({...word,row:r,column:c,down});
   [...word.answer].forEach((letter,i)=>{const k=`${r+(down?i:0)},${c+(down?0:i)}`, old=cells.get(k); cells.set(k,{letter,dirs:[...(old?.dirs||[]),down]});});
 }
 put(pending.shift(),0,0,false);
 while(pending.length) {
   let found=false;
   for(let p=0;p<pending.length&&!found;p++) {
     const word=pending[p], candidates=[];
     for(const [k,cell] of cells) for(let i=0;i<word.answer.length;i++) if(word.answer[i]===cell.letter) for(const down of [true,false]) {
       const [y,x]=k.split(',').map(Number),r=y-(down?i:0),c=x-(down?0:i);
       if(valid(word,r,c,down)) {
         const coords=[...cells.keys()].map(k=>k.split(',').map(Number)); coords.push([r,c],[r+(down?word.answer.length-1:0),c+(down?0:word.answer.length-1)]);
         const h=Math.max(...coords.map(a=>a[0]))-Math.min(...coords.map(a=>a[0]))+1,w=Math.max(...coords.map(a=>a[1]))-Math.min(...coords.map(a=>a[1]))+1;
         candidates.push({r,c,down,score:h*w+Math.max(h,w)*4+rand()*10});
       }
     }
     candidates.sort((a,b)=>a.score-b.score);
     if(candidates.length) {const a=candidates[0];put(word,a.r,a.c,a.down);pending.splice(p,1);found=true;}
   }
   if(!found) break;
 }
 const ys=[...cells.keys()].map(k=>+k.split(',')[0]),xs=[...cells.keys()].map(k=>+k.split(',')[1]),y=Math.min(...ys),x=Math.min(...xs);
 return {rows:Math.max(...ys)-y+1,columns:Math.max(...xs)-x+1,words:placed.map(w=>({...w,row:w.row-y,column:w.column-x}))};
}
const levels=themes.map(([title,rus,count],index)=>{
 const words=rus.split(' ').map(clue=>{
   const row=rows.find(r=>key(r[0]?.split(',')[0]||'').replace(/\d+$/,'')===clue);
   if(!row) throw Error(clue);
   return {clue:clue==='орех'?'Орех (грецкий)':clue[0].toUpperCase()+clue.slice(1),answer:key(row[4]),sourceRow:rows.indexOf(row)+1,sourceColumn:4};
 });
 let best;
 for(let seed=0;seed<600;seed++) {
   const result=layout(words,seed);
   if(result.words.length<count) continue;
   // Keep a connected prefix, then renumber in reading order.
   result.words=result.words.slice(0,count);
   const h=Math.max(...result.words.map(w=>w.row+(w.down?w.answer.length:1))),w=Math.max(...result.words.map(w=>w.column+(w.down?1:w.answer.length)));
   result.rows=h;result.columns=w;
   if(!best||h*w<best.rows*best.columns) best=result;
 }
 if(!best) throw Error(`No connected grid: ${title}`);
 const minRow=Math.min(...best.words.map(w=>w.row)),minCol=Math.min(...best.words.map(w=>w.column));best.rows-=minRow;best.columns-=minCol;
 best.words.forEach(w=>{w.row-=minRow;w.column-=minCol;});
 best.words.sort((a,b)=>a.row-b.row||a.column-b.column||Number(a.down)-Number(b.down));
 let number=0,last='';best.words.forEach((w,i)=>{const k=`${w.row},${w.column}`;if(k!==last)number++;last=k;w.number=number;w.id=i+1;});
 return {id:index+1,version:1,title,...best};
});
fs.mkdirSync('IronLanguage.Web/Data/crosswords',{recursive:true});
fs.writeFileSync('IronLanguage.Web/Data/crosswords/levels.json',JSON.stringify(levels,null,2)+'\n');
console.log(levels.map(l=>`${l.id} ${l.title}: ${l.words.length} слов, ${l.rows}×${l.columns}`).join('\n'));
