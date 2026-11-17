// Optional real-browser regression. Requires Playwright in the development environment.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs'),os=require('node:os');
const out=process.env.PATHOS_QA_OUTPUT||path.join(os.tmpdir(),'pathos-hardware-qa');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11','--enable-webgl','--enable-precise-memory-info']:['--enable-precise-memory-info']});
 try {
  for(const device of [{name:'desktop',width:1440,height:1000,dpr:1},{name:'desktop-retina',width:1440,height:1000,dpr:2},{name:'mobile',width:390,height:844,dpr:3}].filter(d=>!process.env.HW_QA_DEVICE||d.name===process.env.HW_QA_DEVICE)){
   const context=await browser.newContext({viewport:{width:device.width,height:device.height},deviceScaleFactor:device.dpr,isMobile:device.name==='mobile',hasTouch:device.name==='mobile'});
   const page=await context.newPage(),errors=[],requests=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
   const start=Date.now();
   await page.goto((process.env.PATHOS_QA_URL||'http://localhost:3000/?hardware=native-review#prototype'),{waitUntil:'load'});
   await page.evaluate(()=>document.fonts.ready);
   await page.waitForFunction(()=>window.pathosPrototype?.stats.gl&&window.pathosPrototype?.stats.ready,undefined,{timeout:90000});
   const readyMs=Date.now()-start;
   // Begin with real scroll input, as a visitor would. It cancels the page's
   // initial deep-link correction before scripted chapter-seeking assertions.
   await page.mouse.wheel(0,1);
   await page.waitForTimeout(100);
   for(const frame of device.name==='desktop'?[150,460,780,1080,1360,1590,1820,2060,2350,2720]:[460,1360,2350]){
    await page.evaluate(f=>scrollTo({top:pathosPrototype.scrollYForFrame(f),behavior:'instant'}),frame);
    await page.waitForFunction(f=>Math.abs(pathosPrototype.state.target-f)<2&&Math.abs(pathosPrototype.state.frame-pathosPrototype.state.target)<.1&&!pathosPrototype.state.rendering,frame,{timeout:12000}).catch(async e=>{console.log('FAILED SHOT',device.name,frame,await page.evaluate(()=>({state:pathosPrototype.state,stats:pathosPrototype.stats,scroll:scrollY,viewport:[innerWidth,innerHeight],rect:document.getElementById('hwTrack').getBoundingClientRect().toJSON()})));await page.screenshot({path:path.join(out,'hardware-qa-failure.png')});throw e;});
   }
   await page.evaluate(()=>scrollTo({top:pathosPrototype.scrollYForFrame(1360),behavior:'instant'}));
   await page.waitForFunction(()=>Math.abs(pathosPrototype.state.target-1360)<2&&!pathosPrototype.state.rendering&&Math.abs(pathosPrototype.state.frame-pathosPrototype.state.target)<.1);
   const before=await page.evaluate(()=>pathosPrototype.stats.frames);
   await page.waitForTimeout(300);
   const result=await page.evaluate(()=>{
    const p=pathosPrototype,c=p.debug.renderer.domElement;
    const poster=document.getElementById('hwPoster');
    return {state:p.state,stats:p.stats,film:{width:p.film.w,height:p.film.h},poster:[poster.naturalWidth,poster.naturalHeight],buffer:[c.width,c.height],css:[c.clientWidth,c.clientHeight],dpr:devicePixelRatio,memory:performance.memory?.usedJSHeapSize,geometries:p.debug.renderer.info.memory.geometries,textures:p.debug.renderer.info.memory.textures};
   });
   assert.equal(result.state.seq,false);assert.equal(result.stats.model,'./assets/pathos-hardware.glb');assert.equal(result.stats.quality,1);
   assert.equal(result.stats.shadow,2048);assert.equal(result.stats.frames,before,'Hardware draws must stop at rest');
   assert.equal(result.buffer[0],Math.floor(result.css[0]*result.stats.pixelRatio));assert.equal(result.buffer[1],Math.floor(result.css[1]*result.stats.pixelRatio));
   assert(result.stats.pixelRatio>=device.dpr,'HD floor cannot discard native retina pixels');
   assert(result.buffer[0]*result.buffer[1]<=8*1024*1024,'HD hardware buffers stay within allocation budget');
   assert(result.film.width*result.stats.pixelRatio>=1919.99&&result.film.height*result.stats.pixelRatio>=1079.99,'The actual Blender picture must be 1920 × 1080 or better on every tested layout');
   assert(result.stats.picturePixels[0]>=1920&&result.stats.picturePixels[1]>=1080,'Reported physical film dimensions meet Full HD');
   assert.equal(result.stats.antialias,true,'Rig edge antialiasing remains enabled on every tested layout');
   assert.deepEqual(result.poster,[1920,1080],'Browser receives the sharp Full HD loading/fallback poster');
   assert.equal(requests.filter(u=>u.includes('/hw-seq/')).length,0,'Native playback must not download film frames');
   assert.equal(requests.filter(u=>u.includes('hardware-mobile.glb')).length,0);
   await page.locator('#hwStage').screenshot({path:path.join(out,'pathos-hardware-hd-'+device.name+'.png')});
   await page.locator('#hw360').click();
   await page.waitForFunction(()=>pathosPrototype.state.mode==='orbit'&&!pathosPrototype.state.tweening&&!pathosPrototype.state.rendering);
   const texturesBefore=result.textures;
   await page.locator('#hwZoomIn').click();
   await page.waitForFunction(()=>!pathosPrototype.state.rendering);
   await page.locator('#hwExit360').click();
   await page.waitForFunction(()=>pathosPrototype.state.mode==='film'&&!pathosPrototype.state.tweening&&!pathosPrototype.state.rendering);
   const texturesAfter=await page.evaluate(()=>pathosPrototype.debug.renderer.info.memory.textures);
   assert(texturesAfter<=texturesBefore+1,'Orbit must not accumulate textures');
   assert.deepEqual(errors,[]);
   await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
   await page.waitForFunction(()=>!pathosPrototype.state.visible);
   const stopped=await page.evaluate(()=>pathosPrototype.stats.frames);await page.waitForTimeout(300);
   assert.equal(await page.evaluate(()=>pathosPrototype.stats.frames),stopped,'No offscreen hardware renders');
   assert(await page.evaluate(()=>pathosPrototype.stats.bufferPixels)<=Math.ceil(result.stats.pixelRatio)**2,'Offscreen render buffers must be released');
   await page.evaluate(()=>scrollTo({top:pathosPrototype.scrollYForFrame(1360),behavior:'instant'}));
   await page.waitForFunction(()=>pathosPrototype.state.visible&&pathosPrototype.stats.bufferPixels>10000&&!pathosPrototype.state.rendering);
   assert.deepEqual(await page.evaluate(()=>[pathosPrototype.debug.renderer.domElement.width,pathosPrototype.debug.renderer.domElement.height]),result.buffer,'Return restores Full HD resolution');
   console.log(JSON.stringify({device:device.name,readyMs,buffer:result.buffer,filmPixels:result.stats.picturePixels,poster:result.poster,antialias:result.stats.antialias,css:result.css,pixelRatio:result.stats.pixelRatio,geometries:result.geometries,textures:result.textures,heapMiB:Math.round(result.memory/1048576),gpu:result.stats.gpu,frames:result.stats.frames,errors,passed:'Full HD actual Blender picture and poster, antialiased rig edges, chapter seeking, original model, zero sequence downloads, 360/zoom/return, idle, offscreen release and return'}));
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
