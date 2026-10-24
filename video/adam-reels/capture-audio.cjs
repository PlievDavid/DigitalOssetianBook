const {chromium}=require('../../node_modules/playwright');
const fs=require('node:fs');const path=require('node:path');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{
const p=await b.newPage({viewport:{width:900,height:1100},deviceScaleFactor:3,reducedMotion:'reduce'});
let card;p.on('response',async r=>{if(r.url().endsWith('/attempts')&&r.ok())card=(await r.json()).card});
await p.goto('http://127.0.0.1:58440/audio-puzzles');await p.locator('#exercise-list button').first().click();await p.waitForFunction(()=>document.querySelector('#exercise-audio')?.readyState>=2);await p.locator('#exercise-audio').evaluate(a=>{a.pause();a.muted=true});
const meta=[];
for(let step=0;step<2;step++){
 const options=p.locator('#exercise-options button');const current=[];
 await p.mouse.move(1,1);await p.evaluate(()=>document.activeElement?.blur());
 for(let i=0;i<await options.count();i++){await options.nth(i).screenshot({path:path.join(__dirname,`public/audio-choice-${step}-${i}.png`)});current.push(await options.nth(i).innerText())}
 const correct=current.indexOf(card.tokens[step]);await options.nth(correct).click();
 await p.locator('#exercise-step-slots > *').nth(step).screenshot({path:path.join(__dirname,`public/audio-selected-${step}.png`)});
 meta.push({options:current,correct,token:card.tokens[step]});
}
fs.writeFileSync(path.join(__dirname,'public/audio-choices.json'),JSON.stringify(meta,null,2));console.log('Captured real choices and selected tokens',meta.map(x=>({token:x.token,correct:x.correct})));
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
