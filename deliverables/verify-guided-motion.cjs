// Measure decoded frames during real scroll motion, rather than accepting
// timeline counters as proof of smooth playback. Supports all three engines.
const pw=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const engine=process.env.PATHOS_QA_BROWSER||'chromium';
const base=process.env.PATHOS_QA_URL||'http://127.0.0.1:38741/';
(async()=>{
 const browser=await pw[engine].launch(engine==='chromium'?{executablePath:'/usr/bin/chromium',args:['--enable-unsafe-swiftshader']}:{});
 try{
  for(const size of [{width:1440,height:1000},{width:375,height:812}].filter(s=>!process.env.PATHOS_QA_WIDTH||s.width===Number(process.env.PATHOS_QA_WIDTH))){
   const page=await browser.newPage({viewport:size});const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>4}));
   if(process.env.PATHOS_FILM_FIXTURE){
    const data=fs.readFileSync(process.env.PATHOS_FILM_FIXTURE);
    await page.route('**/assets/hardware/rig-1080p60.mp4*',route=>{
     const range=/bytes=(\d+)-(\d*)/.exec(route.request().headers()['range']||'');
     const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),data.length-1):data.length-1;
     return route.fulfill({status:range?206:200,headers:{'content-type':'video/mp4','accept-ranges':'bytes','content-length':String(end-start+1),...(range?{'content-range':`bytes ${start}-${end}/${data.length}`}:{})},body:data.subarray(start,end+1)});
    });
   }
   await page.goto(new URL('#prototype',base).href,{waitUntil:'load'});
   await page.evaluate(()=>document.fonts.ready);
   await page.locator('#hwStage').scrollIntoViewIfNeeded();
   // A real visitor's wheel input cancels the initial section-anchor correction.
   await page.mouse.wheel(0,1);
   await page.waitForFunction(()=>window.pathosPrototype?.state.ready&&pathosPrototype.stats.guidedSource==='native-film',undefined,{timeout:30000});
   assert.deepEqual(await page.evaluate(()=>pathosPrototype.stats.guidedPixels),[1920,1080]);
   await page.evaluate(()=>scrollTo(0,pathosPrototype.scrollYForFrame(950)));
   try{await page.waitForFunction(()=>Math.abs(pathosPrototype.state.frame-950)<2);}catch(error){console.error(JSON.stringify(await page.evaluate(()=>({state:pathosPrototype.state,stats:pathosPrototype.stats,metrics:pathosPrototype.debug.guidedMetrics,hidden:document.hidden,video:pathosPrototype.debug.guidedVideo?{time:pathosPrototype.debug.guidedVideo.currentTime,ready:pathosPrototype.debug.guidedVideo.readyState,seeking:pathosPrototype.debug.guidedVideo.seeking,network:pathosPrototype.debug.guidedVideo.networkState}:null}))));throw error;}
   const motion=await page.evaluate(async()=>{
    const start=performance.now(),observed=[];let previous=-1;
    // A continuous wheel-like movement, then a reversal, within one camera shot.
    while(performance.now()-start<2200){
     const elapsed=performance.now()-start,p=Math.min(1,elapsed/2200);
     const frame=950+160*Math.sin(p*Math.PI);
     scrollTo(0,pathosPrototype.scrollYForFrame(frame));
     const actual=pathosPrototype.state.frame;
     if(actual!==previous){observed.push({at:elapsed,frame:actual});previous=actual;}
     await new Promise(requestAnimationFrame);
    }
    scrollTo(0,pathosPrototype.scrollYForFrame(950));
    return {observed,presentations:pathosPrototype.stats.presentations,metrics:pathosPrototype.debug.guidedMetrics,state:pathosPrototype.state};
   });
   await page.waitForFunction(()=>Math.abs(pathosPrototype.state.frame-950)<2);
   if(process.env.PATHOS_QA_DEBUG)console.log(JSON.stringify({phase:'scroll',engine,size,last:motion.observed.slice(-6),state:motion.state,metrics:motion.metrics}));
   assert(motion.observed.length>=25,'Scroll movement must show decoded frames rather than repeatedly freeze');
   assert(Math.max(...motion.observed.map(v=>v.frame))>1040,'The picture follows forward scrolling');
   assert(await page.evaluate(()=>pathosPrototype.state.frame)<970,'The picture follows reverse scrolling and settles at its requested pose');
   const gaps=motion.observed.slice(1).map((v,i)=>v.at-motion.observed[i].at);
   assert(Math.max(...gaps)<300,'Normal scrolling must not leave prolonged frozen frames');
   await page.waitForFunction(()=>!pathosPrototype.state.rendering);
   const idle=await page.evaluate(()=>pathosPrototype.stats.presentations);await page.waitForTimeout(200);
   assert.equal(await page.evaluate(()=>pathosPrototype.stats.presentations),idle,'The guide settles cleanly and does not run at rest');
   await page.locator('#hwPlay').click();const playing=await page.evaluate(()=>pathosPrototype.stats.presentations);
   await page.waitForTimeout(1000);const delivered=await page.evaluate(()=>pathosPrototype.stats.presentations)-playing;
   assert(delivered>=20,'Play uses the browser decoder for continuous high-cadence playback');
   await page.locator('#hwPlay').click();assert(await page.evaluate(()=>pathosPrototype.debug.guidedVideo.paused));
   await page.evaluate(async()=>{for(let i=0;i<3;i++){pathosPrototype.play();await new Promise(requestAnimationFrame);pathosPrototype.pause();}});
   await page.waitForTimeout(100);
   assert(await page.evaluate(()=>pathosPrototype.state.playback==='paused'&&pathosPrototype.debug.guidedVideo.paused),'Rapid manual pauses win over pending play promises');
   await page.evaluate(()=>pathosPrototype.seek(pathosPrototype.progressAt(2870)));
   await page.waitForFunction(()=>Math.abs(pathosPrototype.state.frame-2870)<2);
   await page.locator('#hwPlay').click();
   await page.waitForFunction(()=>pathosPrototype.state.playback==='paused'&&pathosPrototype.state.frame>=2879);
   await page.locator('#hwPlay').click();
   await page.waitForFunction(()=>pathosPrototype.state.frame<150);
   await page.locator('#hwPlay').click();
   await page.evaluate(()=>pathosPrototype.seek(pathosPrototype.progressAt(2879)));
   await page.waitForFunction(()=>pathosPrototype.state.frame===2879);
   await page.locator('#hwPlay').click();
   await page.waitForFunction(()=>pathosPrototype.state.frame<150);
   await page.locator('#hwPlay').click();
   await page.locator('#hero').scrollIntoViewIfNeeded();await page.waitForTimeout(100);
   const offscreen=await page.evaluate(()=>pathosPrototype.stats.presentations);await page.waitForTimeout(150);
   assert.equal(await page.evaluate(()=>pathosPrototype.stats.presentations),offscreen,'Offscreen playback releases its draw loop');
   assert.deepEqual(errors,[]);
   const latency=motion.metrics.latencies.slice().sort((a,b)=>a-b);
   console.log(JSON.stringify({engine,size,decodedChanges:motion.observed.length,maxGap:Math.max(...gaps),oneSecondPlayFrames:delivered,seekP95:latency[Math.ceil(latency.length*.95)-1],fixture:!!process.env.PATHOS_FILM_FIXTURE,passed:true}));
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
