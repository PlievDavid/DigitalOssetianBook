const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const base=process.env.ADAM_TEST_URL||'http://127.0.0.1:60731';
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname));assert(process.env.ADAM_REVIEW_COOKIE,'Run through WordReviewChecks --database --browser');
const fixture=JSON.parse(process.env.ADAM_REVIEW_WORDS||'[]');
const vocabulary=JSON.parse(fs.readFileSync(path.resolve('IronLanguage.Web/Data/wordle/words.json'),'utf8')).answers;
const normalize=value=>value.normalize('NFD').replace(/\u0301/g,'').replace(/æ/g,'ӕ').replace(/Æ/g,'Ӕ').normalize('NFC').toLowerCase();
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),out=path.resolve('.run-local/repetition-qa');fs.mkdirSync(out,{recursive:true});const errors=[];
 try{
  const context=await browser.newContext();await context.addCookies([{name:'Adam.Auth',value:process.env.ADAM_REVIEW_COOKIE,url:base,httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const idle=()=>page.waitForFunction(()=>document.getElementById('spaced-review')?.getAttribute('aria-busy')==='false');
  const wordsIdle=()=>page.waitForFunction(()=>document.getElementById('words-results')?.getAttribute('aria-busy')==='false');
  const api=(route,body,method='POST')=>page.evaluate(async({route,body,method})=>AdamApi(route,{method,body:JSON.stringify(body)}),{route,body,method});
  const snapshot=async()=>await(await page.request.get(`${base}/api/v1/word-review/session`)).json();
  for(const width of[1440,768,390,320]){
   await page.setViewportSize({width,height:900});await page.goto(`${base}/vocabulary`);await wordsIdle();
   assert.equal(await page.locator('.words-row').count(),30);assert.equal(await page.locator('.words-tab').count(),3);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:path.join(out,`overview-${width}.png`),fullPage:true});
  }
  await page.goto(`${base}/vocabulary?sort=recent`);await wordsIdle();await page.evaluate(()=>window.__navigationProbe='stable');
  await page.locator('.words-tab').filter({hasText:'Выучено'}).click();await wordsIdle();assert.equal(await page.evaluate(()=>window.__navigationProbe),'stable');
  await page.goBack();await wordsIdle();assert.match(await page.locator('.words-tab[aria-current=page]').innerText(),/Все/);assert.equal(await page.evaluate(()=>window.__navigationProbe),'stable');
  await page.locator('.words-page-link').filter({hasText:'Далее'}).click();await wordsIdle();assert.equal(new URL(page.url()).searchParams.get('page'),'2');assert.equal(await page.evaluate(()=>window.__navigationProbe),'stable');
  await page.locator('#words-sort-menu summary').click();await page.getByRole('menuitemradio',{name:'По алфавиту',exact:true}).click();await wordsIdle();
  assert.equal(new URL(page.url()).searchParams.get('sort'),'alphabet');assert.equal(await page.evaluate(()=>window.__navigationProbe),'stable');
  assert.equal(await page.evaluate(()=>AdamWordText('ТÆМǼН')),'тӕмӕн');
  await page.locator('.words-delete').first().click();assert(await page.locator('#words-remove-dialog').isVisible());await page.keyboard.press('Escape');assert.equal(await page.locator('.words-menu').count(),0);
  await page.goto(`${base}/vocabulary?status=learning`);await wordsIdle();await page.setViewportSize({width:818,height:668});await page.screenshot({path:path.join(out,'learning-tablet.png')});
  await page.locator('#words-search input[name=search]').fill('неттакогослова');await page.locator('.words-search-submit').click();await wordsIdle();assert.match(await page.locator('.words-empty h2').innerText(),/Ничего не найдено/);assert.equal(await page.locator('#words-pagination').textContent(),'');
  await page.goto(`${base}/word-practice`);await idle();assert.equal(await page.locator('#review-points').count(),0);
  assert.equal((await page.request.post(`${base}/api/v1/word-review/sessions`,{data:{mode:'due'}})).status(),400);
  const guest=await browser.newContext();assert.equal((await guest.request.get(`${base}/api/v1/word-review/session`)).status(),401);await guest.close();
  await page.locator('input[name=mode][value=new]').check();await page.locator('#review-begin').click();await idle();let front=await snapshot();assert.equal(front.card.kind,'cards');assert.equal(front.card.translation,null);assert.deepEqual(front.card.options,[]);
  await page.setViewportSize({width:1440,height:1000});const bounds=await page.locator('#review-flip').boundingBox(),stage=await page.locator('.review-stage').boundingBox();assert(bounds.width<=440&&stage.width>bounds.width*1.5);
  await page.screenshot({path:path.join(out,'card-front-wide.png'),fullPage:true});
  // Pause each half of the real animation, inspect the midpoint and then finish it.
  await page.evaluate(()=>{const inner=document.querySelector('.review-flip-inner'),native=inner.animate.bind(inner);window.__flip=[];inner.animate=(frames,options)=>{const animation=native(frames,options);animation.pause();window.__flip.push({animation,duration:options.duration});return animation;};});
  await page.locator('#review-flip').focus();await page.keyboard.press('Space');await page.waitForFunction(()=>window.__flip.length===1);
  await page.evaluate(()=>window.__flip[0].animation.currentTime=70);
  assert.equal(await page.locator('.review-front').evaluate(x=>getComputedStyle(x).display),'flex');assert.equal(await page.locator('.review-back').evaluate(x=>getComputedStyle(x).display),'none');
  await page.screenshot({path:path.join(out,'flip-front-half.png'),clip:bounds});
  await page.evaluate(()=>window.__flip[0].animation.finish());await page.waitForFunction(()=>window.__flip.length===2);await page.evaluate(()=>window.__flip[1].animation.currentTime=85);
  assert.equal(await page.locator('.review-front').evaluate(x=>getComputedStyle(x).display),'none');assert.equal(await page.locator('.review-back').evaluate(x=>getComputedStyle(x).display),'flex');
  assert.equal(await page.locator('.review-card-controls').evaluate(x=>getComputedStyle(x).opacity),'0');
  await page.screenshot({path:path.join(out,'flip-back-half.png'),clip:bounds});
  await page.evaluate(()=>window.__flip[1].animation.finish());await idle();await page.waitForFunction(()=>document.activeElement.id==='review-known');
  assert.deepEqual(await page.evaluate(()=>window.__flip.map(x=>x.duration)),[140,170]);assert.equal((await page.locator('#review-flip').boundingBox()).height,bounds.height);
  await page.evaluate(()=>delete document.querySelector('.review-flip-inner').animate);await page.screenshot({path:path.join(out,'card-back-wide.png'),fullPage:true});
  await page.locator('#review-known').click();await idle();assert.equal(await page.locator('#review-feedback').textContent(),'');assert((await snapshot()).index===1);
  const mastered=await(await page.request.get(`${base}/api/v1/word-review/words?status=mastered&search=${encodeURIComponent(front.card.prompt)}`)).json();assert(mastered.items.some(x=>x.wordId===front.card.wordId));
  await page.reload();await idle();await page.locator('#review-resume').click();await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await page.screenshot({path:path.join(out,'card-front-mobile.png'),fullPage:true});
  await page.locator('#review-reveal').click();await idle();await page.locator('#review-unknown').click();await idle();
  let practice=await snapshot();assert.equal(practice.card.kind,'choice');assert.equal(practice.result,null);assert.equal(practice.errors,0);assert(await page.locator('#review-check-form').isVisible());
  const source=vocabulary.find(x=>normalize(x.word)===normalize(practice.card.prompt));assert(source);
  const correct=practice.card.options.find(x=>normalize(x)===normalize(source.russian));assert(correct);
  await page.locator('#review-options label').filter({hasText:normalize(correct)}).click();await page.locator('#review-check').click();await idle();assert((await snapshot()).result.correct);
  await page.locator('#review-settings-open').click();await idle();assert.equal(await page.locator('input[name=format]').count(),0);await page.keyboard.press('Escape');
  const round=await api('/word-review/sessions',{mode:'due'});assert.equal(round.card.kind,'pairs');assert(round.card.pairs.every(x=>x.expected===null));
  await page.reload();await idle();await page.locator('#review-resume').click();assert(await page.locator('#review-pairs').isVisible());
  const mapping=round.card.pairs.map(pair=>{const word=fixture.find(x=>x.id===pair.wordId);assert(word);const answer=round.card.direction.startsWith('Русский')?word.ossetian:word.russian;return round.card.options.findIndex(x=>normalize(x)===normalize(answer));});
  for(let index=0;index<mapping.length;index++){
   const left=page.locator(`#review-pairs [data-left="${index}"]`),right=page.locator(`#review-pairs [data-right="${mapping[index]}"]`);
   if(index===0){const a=await left.boundingBox(),b=await right.boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:10});await page.mouse.up();}
   else if(index===1){await left.focus();await page.keyboard.press('Enter');await right.focus();await page.keyboard.press('Enter');}
   else{await left.click();await right.click();}
  }
  assert.equal(await page.locator('#review-pairs-board .game-thread').count(),mapping.length);await page.locator('#review-pairs-check').click();await idle();assert((await snapshot()).result.correct);
  await page.screenshot({path:path.join(out,'matching-mobile.png'),fullPage:true});await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(out,'matching-wide.png'),fullPage:true});
  await api('/word-review/settings',{format:'auto',directInput:true},'PUT');const typed=await api('/word-review/sessions',{mode:'due'});assert.equal(typed.card.kind,'input');
  await page.reload();await idle();await page.locator('#review-resume').click();await page.setViewportSize({width:390,height:844});await page.locator('#review-input').fill('неверный ответ');await page.locator('#review-check').click();await idle();assert.match(await page.locator('#review-feedback').innerText(),/Правильный ответ/);
  await page.screenshot({path:path.join(out,'input-error-mobile.png'),fullPage:true});await page.setViewportSize({width:320,height:700});await page.evaluate(()=>document.documentElement.style.fontSize='200%');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.evaluate(()=>document.documentElement.style.fontSize='');
  await page.locator('#review-exit').click();await idle();assert.equal((await snapshot()).card,null);assert(!/Очки/.test(await page.locator('#review-totals').textContent()));await page.screenshot({path:path.join(out,'finish-mobile.png'),fullPage:true});
  const guestPage=await browser.newPage();await guestPage.goto(`${base}/word-practice`);assert(await guestPage.locator('#word-practice-app').isVisible());
  await page.goto(`${base}/vocabulary/available`);await page.waitForSelector('.words-topic-card');await page.screenshot({path:path.join(out,'topics-mobile.png'),fullPage:true});
  await page.locator('.words-topic-card').first().click();await page.waitForSelector('.topic-word-row');await page.getByRole('button',{name:'Выбрать все',exact:true}).click();await page.getByRole('button',{name:'Добавить в словарь',exact:true}).click();await page.waitForFunction(()=>document.getElementById('words-status').textContent.includes('Добавлено'));assert.equal(await page.locator('.topic-word-row input:not(:disabled)').count(),0);await page.screenshot({path:path.join(out,'topic-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('Review UX passed: 4 widths, AJAX filters/sort/pages/history, initial diagnosis, smooth flip midpoints, known/unknown branching, integrated pairs with mouse and keyboard, typed checks, no score counters, themes, CSRF and guest route.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
