// Browser regression for the cinematic Guided/3D study. Serve on :3000.
// HW_QA_3D=1 adds a manual Full HD model/context-loss check (may be slow on software GL).
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const out=process.env.PATHOS_QA_OUTPUT||path.join(os.tmpdir(),'pathos-hardware-qa');
const base=process.env.PATHOS_QA_URL||'http://127.0.0.1:3000/';
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PATHOS_CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--enable-unsafe-swiftshader']});
 try{
  const cases=[{name:'desktop',width:1440,height:1000,dpr:1},{name:'mobile',width:375,height:812,dpr:3},{name:'mobile-save-data',width:375,height:812,dpr:2,saveData:true},{name:'tablet-no-gl',width:768,height:1024,dpr:2,noGL:true},{name:'landscape-reduced',width:844,height:390,dpr:2,reduced:true},{name:'missing-frames',width:390,height:844,dpr:1,missing:true},{name:'loading-timeout',width:1440,height:1000,dpr:1,timeout:true},{name:'loading-resize',width:375,height:900,dpr:1,resize:true},{name:'loading-context',width:375,height:900,dpr:1,contextLoss:true}].filter(d=>!process.env.HW_QA_DEVICE||d.name===process.env.HW_QA_DEVICE);
  for(const device of cases){
   const context=await browser.newContext({viewport:{width:device.width,height:device.height},deviceScaleFactor:device.dpr,reducedMotion:device.reduced?'reduce':'no-preference',isMobile:device.width<500,hasTouch:device.width<500});
   // Exercise Guided without allowing an automatic hardware probe to alter the
   // fixture; the policy suite independently tests automatic eligibility.
   await context.addInitScript(({noGL,timeout,saveData})=>{
    Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>4});
    if(saveData)Object.defineProperty(navigator,'connection',{get:()=>({saveData:true})});
    if(noGL){const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:get.call(this,type,...args);};}
    if(timeout){const timer=window.setTimeout;window.setTimeout=(callback,delay,...args)=>timer(callback,delay===45000?25:delay,...args);}
   },{noGL:!!device.noGL,timeout:!!device.timeout,saveData:!!device.saveData});
   const page=await context.newPage(),errors=[],requests=[];
   page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
   if(device.missing){await page.route('**/assets/hw-seq/*.webp',route=>route.abort());await page.route('**/assets/hardware/rig-1080p60.mp4*',route=>route.abort());}
   if(device.timeout)await page.route('**/assets/pathos-hardware.glb',()=>{});
   let heldModel;
   if(device.resize||device.contextLoss)await page.route('**/assets/pathos-hardware.glb',route=>{heldModel=route;});
   await page.goto(new URL('#prototype',base).href,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
   await page.waitForFunction(()=>window.pathosPrototype);
   await page.locator('#hwStage').scrollIntoViewIfNeeded();
   if(device.missing){
    await page.waitForFunction(()=>pathosPrototype.state.modeReason.includes('could not load'));
    assert.equal(await page.evaluate(()=>pathosPrototype.state.ready),false);
    assert.equal(await page.locator('#hwPoster').evaluate(el=>getComputedStyle(el).opacity),'1');
   }else{
    await page.waitForFunction(()=>pathosPrototype.state.ready);
    assert.equal(await page.locator('#hwGuidedTab').getAttribute('aria-selected'),'true');
    assert(!requests.some(url=>url.includes('/pathos-hardware.glb')),'Guided must not fetch the 3D model');
    assert.equal(await page.evaluate(()=>pathosPrototype.stats.guidedSource),'native-film','Guided uses the native Full HD film');
    assert.deepEqual(await page.evaluate(()=>pathosPrototype.stats.guidedPixels),[1920,1080]);
    assert(!requests.some(url=>url.includes('/assets/hw-seq/')),'Normal playback never enlarges the old 720p preview frames');
    assert.equal(await page.locator('#hw360').isVisible(),false);
    if(device.name==='mobile'){
     await page.mouse.wheel(0,1);
     for(const progress of [.1,.7]){
      await page.evaluate(p=>scrollTo(0,pathosPrototype.scrollYForFrame(pathosPrototype.frameAt(p))),progress);
      await page.waitForFunction(p=>Math.abs(pathosPrototype.state.progress-p)<.006,progress);
      assert.equal(await page.evaluate(()=>pathosPrototype.state.playback),'scroll','The taller mobile stage still supports optional scroll playback');
     }
    }
    if(device.reduced){
     await page.evaluate(()=>scrollTo(0,pathosPrototype.scrollYForFrame(pathosPrototype.frameAt(.4))));
     await page.waitForFunction(()=>Math.abs(pathosPrototype.state.progress-.4)<.006);
     assert.equal(await page.evaluate(()=>pathosPrototype.state.playback),'scroll','User scroll still scrubs the original film with reduced motion');
     assert(await page.evaluate(()=>Math.abs(pathosPrototype.state.frame-pathosPrototype.state.target)<.1),'Reduced motion removes easing rather than disabling scroll control');
    }
    for(const index of [0,4,7,9]){
     if(await page.locator('#hwRail button').nth(index).isVisible())await page.locator('#hwRail button').nth(index).click();
     else await page.evaluate(i=>pathosPrototype.selectChapter(i),index);
     await page.waitForFunction(i=>pathosPrototype.state.chapter===i,index);
     assert.equal(await page.locator('.hw-chapter[data-hw-current="true"]').count(),1);
     assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#hwHud .hw-chapter')].findIndex(el=>el.dataset.hwCurrent==='true')),index,'Chapter controls match the decoded picture');
    }
    await page.evaluate(()=>pathosPrototype.seek(.25));
    await page.waitForFunction(()=>Math.abs(pathosPrototype.state.progress-.25)<.002);
    const selectedFrame=await page.evaluate(()=>pathosPrototype.state.frame);await page.mouse.wheel(0,10);await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>pathosPrototype.state.frame),selectedFrame,'Manual timeline choices take precedence over subsequent page scrolling');
    await page.locator('#hwPlay').click();const before=await page.evaluate(()=>pathosPrototype.state.frame);
    await page.waitForFunction(frame=>pathosPrototype.state.frame>frame+5,before);
    await page.locator('#hwPlay').click();const paused=await page.evaluate(()=>pathosPrototype.state.frame);
    await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>pathosPrototype.state.frame),paused);
    const cache=await page.evaluate(()=>pathosPrototype.stats.seqCached);
    assert(cache<=(device.width<=640?6:10),'Decoded sequence cache remains bounded');
    await page.locator('#hwStage').screenshot({path:path.join(out,`hardware-${device.name}.png`)});
    if(device.resize){
     await page.evaluate(()=>{window.__pending3D=pathosPrototype.setRendererMode('3d');});
     await page.waitForFunction(()=>!!pathosPrototype.debug.renderer&&!pathosPrototype.debug.camera);
     await page.setViewportSize({width:430,height:900});await page.waitForTimeout(200);
     assert.equal(await page.evaluate(()=>pathosPrototype.state.rendererMode),'guided');
     assert.deepEqual(errors,[],'Resizing while the model camera is unavailable must not throw');
     await page.evaluate(()=>pathosPrototype.setRendererMode('guided'));
     assert(heldModel,'The fixture must keep the GLB pending during resize');await heldModel.abort();
     await page.evaluate(()=>window.__pending3D);
     assert.equal(await page.evaluate(()=>pathosPrototype.state.rendererMode),'guided');
    }
    if(device.contextLoss){
     await page.evaluate(()=>{window.__pending3D=pathosPrototype.setRendererMode('3d');});
     await page.waitForFunction(()=>!!pathosPrototype.debug.renderer&&!pathosPrototype.debug.camera);
     await page.evaluate(()=>pathosPrototype.debug.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
     await page.waitForFunction(()=>!pathosPrototype.state.loading3D&&pathosPrototype.state.modeReason.includes('became unavailable'));
     assert.equal(await page.locator('#hwGuidedTab').getAttribute('aria-selected'),'true');
     assert(heldModel,'The GLB must still be pending when the context is lost');await heldModel.continue();
     await page.evaluate(()=>window.__pending3D);
     assert.equal(await page.evaluate(()=>pathosPrototype.state.rendererMode),'guided');
     assert.equal(await page.evaluate(()=>!!pathosPrototype.stats.gl),false,'A model finishing after context loss cannot mark live 3D ready');
    }
    if(device.noGL||device.timeout){
     await page.locator('#hw3DTab').click();await page.waitForFunction(()=>!pathosPrototype.state.loading3D);
     assert.equal(await page.evaluate(()=>pathosPrototype.state.rendererMode),'guided');
     assert.equal(await page.locator('#hwGuidedTab').getAttribute('aria-selected'),'true');
     assert(await page.evaluate(()=>pathosPrototype.state.modeReason.includes('unavailable')));
     if(device.noGL){
      await page.evaluate(async()=>{const old=pathosPrototype.setRendererMode('3d');await pathosPrototype.setRendererMode('guided');await old;});
      assert.equal(await page.evaluate(()=>pathosPrototype.state.modeReason),'Guided playback is ready.','A stale 3D failure must not override the latest manual choice');
     }
    }
    if(process.env.HW_QA_3D==='1'&&device.name==='desktop'){
     await page.emulateMedia({reducedMotion:'reduce'});
     const preserved=await page.evaluate(()=>pathosPrototype.state.frame);
     await page.locator('#hw3DTab').click();await page.waitForFunction(()=>pathosPrototype.state.rendererMode==='3d',undefined,{timeout:90000});
     assert.equal(await page.evaluate(()=>pathosPrototype.state.frame),preserved);
     const native=await page.evaluate(()=>({stats:pathosPrototype.stats,state:pathosPrototype.state}));
     assert.deepEqual(Array.from(native.stats.picturePixels),[1920,1080]);assert(native.stats.bufferPixels<=8*1024*1024);assert(native.stats.antialias);
     // Returning to Guided must hold the live picture while its new pose decodes.
     await page.evaluate(f=>pathosPrototype.seek(pathosPrototype.progressAt(f)),Math.min(2800,preserved+120));
     await page.waitForFunction(f=>Math.abs(pathosPrototype.state.frame-f)<.1,Math.min(2800,preserved+120));
     const held=await page.evaluate(()=>{pathosPrototype.setRendererMode('guided');const canvas=pathosPrototype.debug.renderer.domElement;return canvas.style.visibility==='visible'&&canvas.width>1;});
     assert(held,'The native picture remains intact until the matching film frame arrives');
     await page.waitForFunction(f=>Math.abs(pathosPrototype.state.frame-f)<2,Math.min(2800,preserved+120));
     assert.equal(await page.evaluate(()=>pathosPrototype.debug.renderer.domElement.width),1,'The hidden native buffer is released after the film arrives');
     await page.evaluate(()=>pathosPrototype.setRendererMode('3d'));
     await page.evaluate(f=>pathosPrototype.seek(pathosPrototype.progressAt(f)),preserved);
     const keyboard=await page.evaluate(async()=>{
      await pathosPrototype.enterOrbit();const mode=pathosPrototype.state.mode;
      const {renderer,orbit,orbitCam}=pathosPrototype.debug,canvas=renderer.domElement;
      canvas.focus({preventScroll:true});
      const original=orbitCam.position.clone(),target=orbit.target.clone();
      const press=key=>{const event=new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});canvas.dispatchEvent(event);return event.defaultPrevented;};
      const handled=press('ArrowLeft'),rotated=orbitCam.position.distanceTo(original)>1e-4;
      press('ArrowRight');press('+');
      for(let i=0;i<50;i++)press('+');const minimum=orbitCam.position.distanceTo(orbit.target);
      for(let i=0;i<50;i++)press('-');const maximum=orbitCam.position.distanceTo(orbit.target);
      press('+');const closer=orbitCam.position.distanceTo(orbit.target)<maximum;
      for(let i=0;i<50;i++)press('ArrowUp');
      let offset=orbitCam.position.clone().sub(orbit.target),phi=Math.acos(offset.y/offset.length());const above=phi>=orbit.minPolarAngle-1e-8;
      for(let i=0;i<50;i++)press('ArrowDown');offset=orbitCam.position.clone().sub(orbit.target);phi=Math.acos(offset.y/offset.length());const below=phi<=orbit.maxPolarAngle+1e-8;
      press('r');const reset=orbitCam.position.distanceTo(original)<1e-8&&orbit.target.distanceTo(target)<1e-8;
      const tabFree=!press('Tab'),outside=new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true});document.body.dispatchEvent(outside);
      press('Escape');const escaped=pathosPrototype.state.mode==='film'&&document.activeElement===document.getElementById('hw360');
      canvas.focus({preventScroll:true});press('Enter');
      document.getElementById('hwZoomIn').click();document.getElementById('hwZoomOut').click();
      const focusable=canvas.tabIndex===0&&canvas.getAttribute('aria-hidden')==='false';
      window.__hwLoss=renderer.getContext().getExtension('WEBGL_lose_context');window.__hwLoss.loseContext();
      return {mode,handled,rotated,closer,minimum,maximum,minDistance:orbit.minDistance,maxDistance:orbit.maxDistance,above,below,reset,tabFree,outsideFree:!outside.defaultPrevented,escaped,entered:pathosPrototype.state.mode==='orbit',focusable};
     });assert.equal(keyboard.mode,'orbit');
     for(const key of ['handled','rotated','closer','above','below','reset','tabFree','outsideFree','escaped','entered','focusable'])assert(keyboard[key],`3D keyboard behavior: ${key}`);
     assert(Math.abs(keyboard.minimum-keyboard.minDistance)<1e-8);assert(Math.abs(keyboard.maximum-keyboard.maxDistance)<1e-8);
     await page.waitForFunction(()=>pathosPrototype.state.rendererMode==='guided');
     await page.waitForFunction(f=>Math.abs(pathosPrototype.state.frame-f)<.1,preserved);
     assert.equal(await page.locator('#hwGuidedTab').getAttribute('aria-selected'),'true');
     assert.equal(await page.evaluate(()=>pathosPrototype.state.frame),preserved);
     assert.equal(await page.evaluate(()=>pathosPrototype.debug.renderer.domElement.tabIndex),-1,'Guided removes the hidden live canvas from the tab order');
     await page.evaluate(()=>window.__hwLoss.restoreContext());await page.waitForTimeout(300);
     assert.equal(await page.evaluate(()=>pathosPrototype.state.rendererMode),'guided','Context restoration must not override the fallback');
     console.log(JSON.stringify({native:'manual Full HD rendering and context-loss fallback',gpu:native.stats.gpu,physicalDeviceBenchmark:false}));
    }
   }
   const geometry=await page.locator('#hwTrack').evaluate(el=>({track:el.offsetHeight,stage:document.getElementById('hwStage').offsetHeight,width:document.getElementById('hwStage').getBoundingClientRect().width,viewport:innerWidth}));
   assert(geometry.track>geometry.stage*8,'The original Blender scroll runway is restored');
   if(geometry.viewport>=1200)assert(geometry.width>=geometry.viewport*.8,'Desktop hardware must retain the full-width cinematic stage');
   assert(await page.locator('#hwHud').evaluate(el=>!!el.closest('#hwView')),'Shot titles stay inside the cinematic view');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.equal(await page.locator('#hwHud .hw-chapter').count(),10,'Every original chapter is retained');assert.deepEqual(errors,[]);
   console.log(JSON.stringify({device:device.name,passed:'Cinematic stage, bounded Guided, chapter/seek/play/pause and graceful fallback',physicalDeviceBenchmark:false}));
   await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
