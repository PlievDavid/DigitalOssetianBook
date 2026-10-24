const {chromium}=require('../../node_modules/playwright');
const fs=require('node:fs');const path=require('node:path');
const root=__dirname, pub=path.join(root,'public');fs.mkdirSync(pub,{recursive:true});
const base=process.env.ADAM_TEST_URL||'http://127.0.0.1:58440';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Local capture only');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage({viewport:{width:900,height:1100},deviceScaleFactor:2,reducedMotion:'reduce'});
const layout={};
async function snap(name,selector){const target=selector?page.locator(selector):page;await page.evaluate(()=>document.fonts.ready);await target.screenshot({path:path.join(pub,name+'.png')});if(selector)layout[name]=await target.boundingBox();}
await page.goto(base,{waitUntil:'networkidle'});await snap('home');
let card;page.on('response',async r=>{if(r.url().endsWith('/attempts')&&r.ok()){const d=await r.json();card=d.card}});
await page.goto(base+'/audio-puzzles');await page.locator('#exercise-list button').first().click();
await page.waitForFunction(()=>{const a=document.querySelector('#exercise-audio');return a?.readyState>=2&&!a.error});
await page.locator('#exercise-audio').evaluate(a=>{a.pause();a.currentTime=0;a.muted=true});
await snap('audio-prompt','#exercise-prompt');await snap('audio0','#exercise-steps');
for(let i=0;i<Math.min(3,card.tokens.length);i++){await page.locator('#exercise-options button').filter({hasText:new RegExp('^'+card.tokens[i]+'$')}).click();await snap('audio'+(i+1),'#exercise-steps');}
layout.audioTokens=card.tokens.slice(0,3);
await page.goto(base+'/games/crosswords');await page.locator('.cw-card').first().click();await page.locator('#cw-play').waitFor({state:'visible'});
await page.addStyleTag({content:'.green-theme .cw-cell.is-selected {background:white;border-color:#bdd0ad}.cw-cell:focus-within {outline:none}.green-theme .cw-cell.is-selected.is-solved {background:#edf3e9;border-color:#b9cdb5}'});
await snap('crossword0','#cw-grid');
await page.locator('.cw-cell-input[data-key="0,4"]').click();
for(const [i,c] of [...'фырт'].entries()){await page.keyboard.insertText(c);await snap('crossword'+(i+1),'#cw-grid');}
await page.locator('#cw-check').click();await page.waitForFunction(()=>document.querySelectorAll('.cw-cell.is-solved').length>=4);await snap('crossword5','#cw-grid');
await snap('crossword-card','#cw-play');
await page.goto(base+'/games/wordle');await page.locator('#wl-input').waitFor({state:'attached'});await page.waitForFunction(()=>!document.querySelector('#wl-input').disabled);
await snap('wordle0','#wl-board');
const data=await page.evaluate(()=>window.AdamApi('/wordle'));layout.wordleDate=data.date||data.day;
const wordData=JSON.parse(fs.readFileSync(path.resolve(root,'../../IronLanguage.Web/Data/wordle/words.json'),'utf8').replace(/^\uFEFF/,''));
const date=layout.wordleDate||new Date().toISOString().slice(0,10);const index=Math.floor((Date.parse(date+'T00:00:00Z')-Date.parse(wordData.startDate+'T00:00:00Z'))/86400000)%wordData.answers.length;
const answer=wordData.answers[index].word;layout.wordleAnswer=answer;
await page.locator('#wl-input').fill(answer);await snap('wordle1','#wl-board');
for(let i=0;i<5;i++)await page.locator('#wl-board > *').nth(i).screenshot({path:path.join(pub,'typed-letter'+i+'.png')});
await page.locator('#wl-input').press('Enter');
await page.locator('#wl-result').waitFor({state:'visible'});await page.locator('#wl-result-close').click();await snap('wordle2','#wl-board');
for(let i=0;i<5;i++){await page.locator('#wl-board > *').nth(i).screenshot({path:path.join(pub,'letter'+i+'.png')})}
await page.goto(base+'/games/crosswords');await page.locator('.cw-card').first().waitFor();await snap('catalog','#cw-levels');
fs.writeFileSync(path.join(pub,'layout.json'),JSON.stringify(layout,null,2));console.log('Captured published guest UI; no account progress written.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
