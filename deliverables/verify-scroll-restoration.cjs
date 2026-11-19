// Browser regression for the original pinned stories. Serve the site on :3000.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.PATHOS_QA_URL||'http://127.0.0.1:3000/';
const out=process.env.PATHOS_QA_OUTPUT||'/tmp/pathos-restored-scroll';
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--enable-unsafe-swiftshader']});
 try{
  for(const size of [{width:1440,height:1000},{width:375,height:812},{width:844,height:390}]){
   const page=await browser.newPage({viewport:size});const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>4}));
   await page.goto(base,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
   const device=await page.locator('#deviceTrack').evaluate(track=>({top:track.getBoundingClientRect().top+scrollY,range:track.offsetHeight-innerHeight,height:track.offsetHeight,position:getComputedStyle(track.querySelector('.device-stage')).position}));
   assert.equal(device.position,'sticky');assert(device.range>size.height);
   for(const i of [0,1,2,3,2,1,0]){
    await page.evaluate(({top,range,i})=>scrollTo(0,top+range*(i+.5)/4),{...device,i});
    await page.waitForFunction(index=>pathosDevice.state.index===index,i);
    assert.equal(await page.locator('#device .screen-shot.is-on').count(),1);
    assert.equal(await page.locator('.step-btn[aria-current="step"]').count(),1);
    assert.equal(await page.locator('.device-stage').evaluate(el=>Math.abs(el.getBoundingClientRect().top)<2),true);
   }
   await page.evaluate(({top,range})=>scrollTo(0,top+range*.25),device);
   await page.waitForFunction(()=>Math.abs(parseFloat(getComputedStyle(document.getElementById('device')).getPropertyValue('--ry')))>8);
   await page.screenshot({path:`${out}/app-${size.width}.png`});
   await page.locator('#prototype').scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>window.pathosPrototype?.state.ready);
   const geometry=await page.locator('#hwTrack').evaluate(track=>({height:track.offsetHeight,viewport:innerHeight,stage:document.getElementById('hwStage').offsetHeight,position:getComputedStyle(document.getElementById('hwStage')).position}));
   assert.equal(geometry.position,'sticky');
   assert(Math.abs(geometry.height/geometry.viewport-(size.width<=800?9.8:10.8))<.02);
   const samples=[];
   for(const progress of [.02,.2,.5,.7,.705,.735,.77,.88,.98,.5,.02]){
    await page.evaluate(p=>scrollTo(0,pathosPrototype.scrollYForFrame(pathosPrototype.frameAt(p))),progress);
    await page.waitForFunction(p=>Math.abs(pathosPrototype.state.progress-p)<.003,progress);
    const state=await page.evaluate(()=>({frame:pathosPrototype.state.frame,page:pathosPrototype.state.page,top:document.getElementById('hwStage').getBoundingClientRect().top,pin:parseFloat(getComputedStyle(document.getElementById('hwStage')).top)}));
    assert(Math.abs(state.top-state.pin)<2,'Blender stage remains pinned throughout its timeline');
    assert.equal(await page.evaluate(()=>pathosPrototype.state.playback),'scroll');
    const f=Math.round(state.frame),expected=f>=2163&&f<2520?3:f>=2092&&f<2520?2:f>=2020&&f<2520?1:0;
    assert.equal(state.page,expected,'The MacBook screen follows the original Blender frames');
    samples.push({progress,...state});
   }
   for(const [frame,pageIndex] of [[1990,0],[2050,1],[2120,2],[2250,3],[2600,0]]){
    await page.evaluate(f=>scrollTo(0,pathosPrototype.scrollYForFrame(f)),frame);
    await page.waitForFunction(f=>Math.abs(pathosPrototype.state.frame-f)<2,frame);
    assert.equal(await page.evaluate(()=>pathosPrototype.state.page),pageIndex);
   }
   await page.evaluate(()=>scrollTo(0,pathosPrototype.scrollYForFrame(2100)));
   await page.waitForFunction(()=>Math.abs(pathosPrototype.state.frame-2100)<3);
   await page.screenshot({path:`${out}/hardware-${size.width}.png`});
   await page.locator('#hwPlay').click();const frame=await page.evaluate(()=>pathosPrototype.state.frame);
   await page.waitForFunction(f=>pathosPrototype.state.frame>f+5,frame);
   await page.locator('#hwPlay').click();const paused=await page.evaluate(()=>pathosPrototype.state.frame);
   await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>pathosPrototype.state.frame),paused);
   await page.locator('#hwScroll').click();assert.equal(await page.evaluate(()=>pathosPrototype.state.playback),'scroll');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.deepEqual(errors,[]);
   console.log(JSON.stringify({size,device,geometry,samples,passed:'Pinned forward/reverse Blender, all app screens and turn animation, original MacBook screen timing, optional playback'}));
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
