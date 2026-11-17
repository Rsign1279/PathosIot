// Optional real-browser WebGL regression. Serve the repository on port 3000 first.
// Requires Playwright; PATHOS_QA_URL and PATHOS_CHROMIUM_PATH are optional.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.PATHOS_QA_URL||'http://127.0.0.1:3000/';

(async()=>{
  const browser=await chromium.launch({headless:true,
    executablePath:process.env.PATHOS_CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
    args:['--enable-unsafe-swiftshader']});
  try{
    // Render the real shader in isolation, sampling its pixels immediately.
    const page=await browser.newPage();
    await page.route('**/__planet-qa',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body>'}));
    await page.goto(new URL('/__planet-qa',base).href);
    const material=await page.evaluate(async()=>{
      const {createPlanet}=await import('/planet.js');
      const canvas=document.createElement('canvas');canvas.style.cssText='width:384px;height:384px';document.body.append(canvas);
      const ready=new Promise(resolve=>canvas.addEventListener('planetchange',resolve,{once:true}));
      const planet=await createPlanet(canvas);if(!planet)throw new Error('Actual WebGL shader failed to initialize');
      await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Engraving did not load')),10000))]);
      const gl=canvas.getContext('webgl'),engraved=gl.getUniformLocation(gl.getParameter(gl.CURRENT_PROGRAM),'uEngraved');
      function pixels(angle,enabled=1){
        gl.uniform1f(engraved,enabled);planet.render(angle);
        const data=new Uint8Array(canvas.width*canvas.height*4);
        gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;
      }
      function changed(a,b){let count=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])count++;return count;}
      const center=-.35,front=changed(pixels(center),pixels(center,0));
      const limb=changed(pixels(center+Math.PI/2),pixels(center+Math.PI/2,0));
      const back=changed(pixels(center+Math.PI),pixels(center+Math.PI,0));
      const original=pixels(center);pixels(1.4);pixels(-1.8);
      const reverse=changed(original,pixels(center)),error=gl.getError();planet.destroy();
      return {front,limb,back,reverse,error};
    });
    assert(material.front>1000,'The decoded engraving changes a visible area on the front');
    assert(material.limb>0&&material.limb<material.front,'The engraving foreshortens at the limb');
    assert.equal(material.back,0,'A material-anchored engraving disappears behind the sphere');
    assert.equal(material.reverse,0,'Revisiting an angle produces exactly the same pixels');
    assert.equal(material.error,0,'Shader, textures, uniforms and actual drawing must be valid');
    console.log(JSON.stringify({material}));await page.close();

    // Exercise the real owner/scheduler, including disposal after restoration.
    for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
      const context=await browser.newContext({viewport});
      const live=await context.newPage(),errors=[],warnings=[];
      live.on('pageerror',error=>errors.push(error.message));
      live.on('console',message=>{if(message.text().includes('INVALID_'))warnings.push(message.text());});
      await live.goto(base,{waitUntil:'load'});await live.evaluate(()=>document.fonts.ready);
      for(let index=0;index<2;index++){
        const group=live.locator('[data-planet-story]').nth(index);
        const top=await group.evaluate(el=>el.getBoundingClientRect().top+scrollY);
        await live.evaluate(y=>scrollTo(0,y+120),top);
        await group.locator('.planet-surface.has-webgl canvas').waitFor();
        assert(await group.locator('.orbit-lines,.orbit-thread,.orbit-source').evaluateAll(els=>els.length===3&&els.every(el=>getComputedStyle(el).display==='none')));
      }
      await live.evaluate(()=>{
        const canvas=document.getElementById('integratedPlanet');
        window.__planetLoss=canvas.getContext('webgl').getExtension('WEBGL_lose_context');
        if(!window.__planetLoss)throw new Error('Context-loss extension unavailable');
        window.__planetLoss.loseContext();
      });
      await live.locator('.planet-surface.has-webgl').waitFor({state:'detached'});
      await live.evaluate(()=>window.__planetLoss.restoreContext());
      await live.locator('.planet-surface.has-webgl canvas').waitFor();
      assert.equal(await live.evaluate(()=>document.querySelector('#integratedPlanet').getContext('webgl').getError()),0,'Restored renderer must not produce GL errors');
      assert.deepEqual(warnings,[],'Restoration must not delete obsolete context handles');
      assert.deepEqual(errors,[]);assert.equal(await live.locator('#integratedPlanet').count(),1);
      console.log(JSON.stringify({viewport,passed:'Shared renderer, hidden lines, context loss/fallback/restoration, no GL or JS errors'}));
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
