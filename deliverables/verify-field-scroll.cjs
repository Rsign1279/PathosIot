// Exercise actual scrolling, poses and controls of the restored six-photo deck.
const pw=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const engine=process.env.PATHOS_QA_BROWSER||'chromium',base=process.env.PATHOS_QA_URL||'http://127.0.0.1:38741/';
(async()=>{
 const browser=await pw[engine].launch(engine==='chromium'?{executablePath:'/usr/bin/chromium',args:['--enable-unsafe-swiftshader']}:{});
 try{
  const cases=[{name:'desktop',width:1440,height:1000},{name:'phone',width:375,height:812},{name:'landscape',width:844,height:390},{name:'reduced',width:375,height:812,reduced:true},{name:'large-text',width:375,height:1000,large:true}].filter(c=>!process.env.PATHOS_FIELD_CASE||process.env.PATHOS_FIELD_CASE.split(',').includes(c.name));
  for(const size of cases){
   const page=await browser.newPage({viewport:{width:size.width,height:size.height},reducedMotion:size.reduced?'reduce':'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(new URL('#product',base).href,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
   if(size.large)await page.evaluate(()=>document.documentElement.style.fontSize='32px');
   await page.locator('#flStage').scrollIntoViewIfNeeded();await page.mouse.wheel(0,1);
   await page.waitForFunction(()=>window.pathosField?.layout.W>1);
   const select=async p=>{await page.evaluate(p=>scrollTo(0,pathosField.scrollToP(p)),p);await page.waitForFunction(p=>Math.abs(pathosField.state.p-p)<.015&&!pathosField.state.rendering,p);};
   const titles=await page.locator('#flDeck .shot-caption strong').allTextContents();assert.equal(titles.length,6);
   for(const i of [0,1,2,3,4,5,3,0]){
    await select(i);assert.equal(await page.locator('#flCaption strong').textContent(),titles[i]);assert.equal(await page.locator('#flCount').textContent(),`${String(i+1).padStart(2,'0')} / 06`);
    assert.equal(await page.locator('#flDeck .fl-front').evaluateAll(nodes=>nodes.filter(n=>n.tabIndex===0).length),1);
    const pin=await page.locator('#flStage').evaluate(el=>({top:el.getBoundingClientRect().top,pin:parseFloat(getComputedStyle(el).top)}));assert(Math.abs(pin.top-pin.pin)<2,'Photo stage stays pinned through forward/reverse scrolling');
   }
   await select(1.5);
   const poses=await page.locator('#flDeck .fl-card').evaluateAll(nodes=>nodes.map(n=>({transform:n.style.transform,visible:getComputedStyle(n).visibility!=='hidden'})));
   if(size.reduced){assert.equal(poses.filter(p=>p.visible).length,1);assert(!poses.some(p=>p.transform.includes('rotate')),'Reduced motion uses direct photo selection');}
   else{assert(poses.filter(p=>p.visible).length>=3,'Neighbouring photos remain part of the moving deck');assert(poses.some(p=>/rotateY\(-?\d/.test(p.transform)),'Cards retain their original banking and flips');}
   const before=await page.evaluate(()=>pathosField.state.p);await page.mouse.wheel(0,400);await page.waitForFunction(p=>pathosField.state.p>p+.15,before);
   await select(2);await page.locator('#flNext').click();await page.waitForFunction(()=>pathosField.state.shown===3&&!pathosField.state.rendering);
   await page.locator('#flPrev').focus();await page.keyboard.press('Home');await page.waitForFunction(()=>pathosField.state.shown===0&&!pathosField.state.rendering);
   if(size.name==='desktop'){
    await select(2);const point=await page.evaluate(()=>{const r=document.getElementById('flStage').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+pathosField.layout.cy,spread:pathosField.layout.spread};});
    await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x-point.spread*.8,point.y,{steps:12});await page.mouse.up();await page.waitForFunction(()=>pathosField.state.shown>=3&&!pathosField.state.rendering);assert.equal(await page.locator('.lightbox.open').count(),0,'A swipe must not open a photograph');
    await page.locator('#flDeck .fl-front').nth(await page.evaluate(()=>pathosField.state.shown)).click();await page.waitForSelector('.lightbox.open');await page.keyboard.press('Escape');await page.waitForSelector('.lightbox.open',{state:'hidden'});
   }
   const ui=await page.locator('.fl-ui').boundingBox(),stage=await page.locator('#flStage').boundingBox();assert(ui.y>=stage.y&&ui.y+ui.height<=stage.y+stage.height+2,'Caption and controls remain inside the stage');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'The rotating deck does not create horizontal page overflow');
   if(size.name==='desktop'){fs.mkdirSync('/tmp/pathos-field-qa',{recursive:true});await select(2);await page.locator('#flStage').screenshot({path:'/tmp/pathos-field-qa/desktop.png'});}
   await page.locator('#hero').scrollIntoViewIfNeeded();await page.waitForFunction(()=>!pathosField.state.visible&&!pathosField.state.rendering);
   assert.deepEqual(errors,[]);console.log(JSON.stringify({engine,case:size.name,passed:true,photos:6,scrollForwardAndReverse:true,reduced:!!size.reduced}));await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
