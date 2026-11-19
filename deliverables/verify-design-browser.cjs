// Optional real-browser design regression. Serve the site on port 3000 first.
// PATHOS_QA_URL, PATHOS_CHROMIUM_PATH and PATHOS_QA_OUTPUT override defaults.
// Chromium software rendering verifies browser behavior, not phone GPU speed.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const failures=[];
const check=(ok,message)=>{if(!ok)failures.push(message);};
const base=process.env.PATHOS_QA_URL||'http://127.0.0.1:3000/';
const output=process.env.PATHOS_QA_OUTPUT||path.join(os.tmpdir(),'pathos-design-qa');
fs.mkdirSync(output,{recursive:true});

function luminance(color){
  const values=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{
    v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
  });
  return values[0]*.2126+values[1]*.7152+values[2]*.0722;
}
function contrast(a,b){const first=luminance(a),second=luminance(b);return(Math.max(first,second)+.05)/(Math.min(first,second)+.05);}

async function pageMetrics(page){
  return page.evaluate(()=>{
    const visible=el=>{
      const s=getComputedStyle(el),r=el.getBoundingClientRect();
      return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0&&!el.closest('[inert],[hidden],.sr-only,[aria-hidden="true"]');
    };
    const genuineInlineLink=el=>{
      if(el.tagName!=='A')return false;
      const paragraph=el.closest('p');
      return paragraph&&paragraph.textContent.replace(el.textContent,'').trim().length>2;
    };
    const targets=[...document.querySelectorAll('a,button,summary,input:not([type="hidden"]),select,textarea')]
      .filter(visible).filter(el=>!el.matches('.hp')&&!genuineInlineLink(el));
    const smallTargets=targets.map(el=>{
      const r=el.getBoundingClientRect();return{tag:el.tagName,id:el.id,text:(el.getAttribute('aria-label')||el.textContent||'').trim().replace(/\s+/g,' ').slice(0,60),width:r.width,height:r.height};
    }).filter(item=>item.width<43.9||item.height<43.9);
    const criticalOverflow=[...document.querySelectorAll('#hero h1,#hero .hero-sub,#hero .logo,#proof .proof-n,#proof .proof-l,#proof .proof-src,.planet-content h2,.planet-content h3,.planet-stage-caption,#tourTitle,#product .field-head h2,#contact h2,#contact label,#prototype h2,#prototype button,.fl-nav button')]
      .filter(visible).filter(el=>{
        if(el.scrollWidth>el.clientWidth+1)return true;
        if(!el.matches('#proof p,.fl-nav button'))return false;
        const box=el.getBoundingClientRect(),parent=el.parentElement.getBoundingClientRect();
        return box.left<parent.left-1||box.right>parent.right+1;
      })
      .map(el=>({tag:el.tagName,id:el.id,text:el.textContent.trim().slice(0,60),client:el.clientWidth,scroll:el.scrollWidth,parentWidth:el.parentElement.clientWidth}));
    return{width:innerWidth,height:innerHeight,rootFont:getComputedStyle(document.documentElement).fontSize,
      pageHeight:document.documentElement.scrollHeight,hardwareHeight:document.querySelector('#prototype').getBoundingClientRect().height,
      navHeight:document.querySelector('#nav').getBoundingClientRect().height,
      horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,smallTargets,criticalOverflow,
      navClipping:[...document.querySelectorAll('.nav>.brand,.nav>.planet-motion,.nav>.menu-btn')].filter(visible).map(el=>({id:el.id,className:el.className,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right})).filter(item=>item.left<0||item.right>innerWidth+1),
      partnerFonts:[...new Set([...document.querySelectorAll('#hero .logo')].map(el=>getComputedStyle(el).fontFamily))]};
  });
}

async function focusMetrics(page,selector){
  await page.keyboard.press('Tab');await page.locator(selector).first().focus();
  return page.locator(selector).first().evaluate(el=>{
    const style=getComputedStyle(el);
    let parent=el.parentElement,background='rgb(242, 236, 226)';
    while(parent){
      const color=getComputedStyle(parent).backgroundColor;
      if(!/rgba\([^)]*,\s*0\s*\)|transparent/.test(color)){background=color;break;}
      parent=parent.parentElement;
    }
    return{color:style.outlineColor,width:parseFloat(style.outlineWidth),offset:parseFloat(style.outlineOffset),outline:style.outlineStyle,background};
  });
}

async function heroContrast(page,time){
  await page.evaluate(async frameTime=>{
    const video=document.getElementById('heroVideo');video.pause();
    await new Promise(resolve=>{
      video.addEventListener('seeked',resolve,{once:true});video.currentTime=frameTime;
      if(video.currentTime===frameTime&&video.readyState>=2)setTimeout(resolve,100);
    });
    document.querySelector('#hero .hero-title').style.visibility='hidden';
  },time);
  const samples=[];
  for(const selector of ['#hero .accent:not(.accent--mono)','#hero .accent--mono']){
    const word=page.locator(selector),box=await word.boundingBox();
    const color=await word.evaluate(el=>getComputedStyle(el).color);
    const screenshot=await page.screenshot({clip:box});
    const brightest=await page.evaluate(async png=>{
      const image=new Image();image.src=`data:image/png;base64,${png}`;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const context=canvas.getContext('2d');context.drawImage(image,0,0);
      const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
      let highest=0;
      for(let i=0;i<pixels.length;i+=4){
        const rgb=[pixels[i],pixels[i+1],pixels[i+2]].map(value=>{value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;});
        highest=Math.max(highest,rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722);
      }
      return highest;
    },screenshot.toString('base64'));
    const foreground=luminance(color);
    samples.push({text:await word.textContent(),time,contrast:(Math.max(foreground,brightest)+.05)/(Math.min(foreground,brightest)+.05)});
  }
  await page.evaluate(()=>document.querySelector('#hero .hero-title').style.visibility='');
  return samples;
}

async function verifyPlaybackAndStudyFocus(browser){
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const page=await context.newPage(),samples=[];
  try{
    await page.goto(base,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
    const video=page.locator('#filmVideo');await video.waitFor({state:'attached'});
    check(await video.evaluate(el=>el.controls),'The project film retains native playback and seeking controls');
    check(await page.locator('#film .film-scrub,#film .film-seek,#film input[type="range"]').count()===0,'The project film has no duplicate custom timeline');
    const filmFocus=await focusMetrics(page,'#filmVideo');
    samples.push({surface:'film player',...filmFocus,contrast:contrast(filmFocus.color,filmFocus.background)});
    await page.screenshot({path:path.join(output,'focus-film-player.png')});
    await page.goto(new URL('hardware.html',base).href,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
    for(const [selector,surface] of [['.study-back','study back link'],['.study-foot a','study footer link']]){
      const focus=await focusMetrics(page,selector);
      samples.push({surface,...focus,contrast:contrast(focus.color,focus.background)});
      await page.screenshot({path:path.join(output,`focus-${surface.replaceAll(' ','-')}.png`)});
    }
    for(const sample of samples){
      check(sample.outline==='solid'&&sample.width===3&&sample.offset===3,`${sample.surface}: focus uses the shared 3px outline and offset`);
      check(sample.contrast>=3,`${sample.surface}: keyboard focus contrasts against the dark surface`);
    }
    console.log(JSON.stringify({playbackAndStudyFocus:samples}));
  }finally{await context.close();}
}

async function renderedFonts(page,selector){
  const session=await page.context().newCDPSession(page);
  try{
    await session.send('DOM.enable');await session.send('CSS.enable');
    const {root}=await session.send('DOM.getDocument');
    const {nodeId}=await session.send('DOM.querySelector',{nodeId:root.nodeId,selector});
    if(!nodeId)throw new Error(`Missing font inspection target: ${selector}`);
    const {fonts}=await session.send('CSS.getPlatformFontsForNode',{nodeId});
    return fonts.filter(font=>font.glyphCount>0).map(font=>({family:font.familyName,custom:font.isCustomFont,glyphs:font.glyphCount}));
  }finally{await session.detach();}
}

async function verifyReferencePresentation(browser){
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  try{
    await page.goto(base,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
    const typography=[];
    for(const [selector,family,weight] of [
      ['#hero h1','EB Garamond','400'],
      ['#proof .proof-n','EB Garamond','400'],
      ['#hero .hero-cta .btn','Figtree','500'],
      ['#contact .contact-form label','Figtree',null],
      ['#hwPlay','Figtree',null]
    ]){
      const fonts=await renderedFonts(page,selector);
      const style=await page.locator(selector).first().evaluate(el=>({family:getComputedStyle(el).fontFamily,weight:getComputedStyle(el).fontWeight}));
      const expected=family.toLowerCase().replaceAll(' ','');
      check(fonts.length>0&&fonts.every(font=>font.custom&&font.family.toLowerCase().replaceAll(' ','').includes(expected)),`${selector}: text is actually rendered with the chosen ${family} webfont`);
      if(weight)check(style.weight===weight,`${selector}: the reference's display/control weight is respected`);
      typography.push({selector,...style,rendered:fonts});
    }
    const palette=await page.evaluate(()=>{
      const root=getComputedStyle(document.documentElement);
      return Object.fromEntries(['--color-page','--color-dark','--color-accent','--color-lilac'].map(name=>[name,root.getPropertyValue(name).trim().toLowerCase()]));
    });
    const expectedPalette={'--color-page':'#f2ece2','--color-dark':'#10100e','--color-accent':'#e4c58f','--color-lilac':'#d5c2df'};
    check(Object.entries(expectedPalette).every(([name,color])=>palette[name]===color),'Reference adaptation retains the established Pathos palette');
    const controls=await page.locator('#hero .hero-cta .btn,#contact button[type="submit"],#hwPlay').evaluateAll(elements=>elements.map(el=>{
      const style=getComputedStyle(el);return{text:el.textContent.trim(),border:style.borderTopWidth,radius:style.borderTopLeftRadius,shadow:style.boxShadow};
    }));
    check(controls.every(control=>control.border==='2px'&&control.radius==='12px'&&control.shadow==='none'),'Primary controls share the reference border, radius and flat treatment');
    const panels=await page.locator('.device,.problem-chart,.how-scene,.press-strip .shot').evaluateAll(elements=>elements.map(el=>{
      const style=getComputedStyle(el);return{className:el.className,radius:style.borderTopLeftRadius,shadow:style.boxShadow};
    }));
    check(panels.length>0&&panels.every(panel=>panel.radius==='32px'&&panel.shadow==='none'),'Existing framed panels use the flat rounded reference treatment');
    // Test real computed form styling, including the older high-specificity
    // marble selectors. An invalid empty submit never sends a message.
    await page.route('**/formsubmit.co/**',route=>route.abort());
    const fields=await page.locator('#contactName,#contactEmail,#contactOrg,#contactInterest,#contactMessage').evaluateAll(elements=>elements.map(el=>{
      const style=getComputedStyle(el);return{id:el.id,widths:[style.borderTopWidth,style.borderRightWidth,style.borderBottomWidth,style.borderLeftWidth],radius:style.borderTopLeftRadius,border:style.borderTopColor,background:style.backgroundColor,repeat:style.backgroundRepeat};
    }));
    check(fields.every(field=>field.widths.every(width=>width==='2px')&&field.radius==='12px'),'Contact fields retain four visible 2px borders and 12px corners');
    check(fields.every(field=>field.border==='rgb(203, 198, 184)'&&contrast(field.border,field.background)>=3),'Normal contact field borders remain visible against the dark background');
    check(fields.find(field=>field.id==='contactInterest')?.repeat==='no-repeat','Restyled select keeps exactly one non-repeating arrow');
    await page.locator('#contactForm').evaluate(form=>{form.reset();form.requestSubmit();});
    await page.waitForFunction(()=>document.getElementById('contactName').getAttribute('aria-invalid')==='true');
    const invalid=await page.locator('#contactName').evaluate(el=>{
      const style=getComputedStyle(el);return{border:style.borderTopColor,background:style.backgroundColor,summary:document.getElementById('formStatus').textContent};
    });
    check(invalid.border==='rgb(255, 192, 205)'&&contrast(invalid.border,invalid.background)>=3,'Invalid contact fields have a distinct contrast-safe error border');
    await page.locator('#contactName').fill('Design QA preview');
    await page.locator('#contactName').evaluate(el=>el.blur());
    const corrected=await page.locator('#contactName').evaluate(el=>({border:getComputedStyle(el).borderTopColor,invalid:el.getAttribute('aria-invalid'),summary:document.getElementById('formStatus').textContent}));
    check(corrected.invalid!=='true'&&corrected.border==='rgb(203, 198, 184)'&&corrected.summary!==invalid.summary,'Correcting a field restores its normal border and updates the summary');
    await page.locator('#hwView').scrollIntoViewIfNeeded();await page.waitForFunction(()=>window.pathosPrototype?.state.ready,undefined,{timeout:10000});
    const cinematic=await page.locator('#hwView').evaluate(view=>{
      const section=document.getElementById('prototype'),style=getComputedStyle(section);
      const available=section.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
      return{width:view.getBoundingClientRect().width,available};
    });
    check(cinematic.width>=cinematic.available*.85,'The rig uses a broad cinematic presentation rather than a narrow sidebar card');
    console.log(JSON.stringify({referencePresentation:{typography,palette,controls,panels,fields,invalid,corrected,cinematic}}));
  }finally{await page.close();}
}

(async()=>{
  const browser=await chromium.launch({headless:true,
    executablePath:process.env.PATHOS_CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
    args:['--enable-unsafe-swiftshader']});
  try{
    if(!process.env.PATHOS_QA_FOCUS_ONLY)await verifyReferencePresentation(browser);
    if(process.env.PATHOS_QA_REFERENCE_ONLY){
      console.log(JSON.stringify({failures}));assert.deepEqual(failures,[]);return;
    }
    await verifyPlaybackAndStudyFocus(browser);
    if(process.env.PATHOS_QA_FOCUS_ONLY){
      console.log(JSON.stringify({failures}));assert.deepEqual(failures,[]);return;
    }
    for(const config of [
      {name:'phone',width:375,height:812,touch:true},
      {name:'landscape',width:844,height:390,touch:true},
      {name:'tablet-fallback',width:768,height:1024,noGL:true},
      {name:'desktop',width:1440,height:1000},
      {name:'zoom-200-layout',width:700,height:1000},
      {name:'large-text',width:375,height:1000,fontSize:32},
      {name:'tablet-large-text',width:768,height:1024,fontSize:32}
    ]){
      const context=await browser.newContext({viewport:{width:config.width,height:config.height},
        reducedMotion:'reduce',hasTouch:!!config.touch,isMobile:!!config.touch});
      if(config.noGL)await context.addInitScript(()=>{
        const get=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(type,...args){return/webgl/.test(type)?null:get.call(this,type,...args);};
      });
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
      // This verification never delivers contact messages or opens external apps.
      await page.route('**/formsubmit.co/**',route=>route.abort());
      await page.goto(base,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
      if(config.fontSize)await page.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,config.fontSize);
      await page.waitForTimeout(150);
      const metrics=await pageMetrics(page);
      check(!metrics.horizontalOverflow,`${config.name}: the page must not scroll sideways`);
      check(metrics.criticalOverflow.length===0,`${config.name}: important text must remain within its container`);
      check(metrics.smallTargets.length===0,`${config.name}: standalone controls must provide 44px targets`);
      check(metrics.hardwareHeight<config.height*4,`${config.name}: the rig must not impose a long pinned scroll stage`);
      check(metrics.partnerFonts.length<=2,`${config.name}: the partner strip uses the two chosen brand typefaces`);
      if(config.name==='landscape')check(metrics.navHeight<=64, 'Landscape navigation should leave room for content');
      if(config.fontSize)check(metrics.rootFont==='32px','The user text-size setting must be retained');
      check(metrics.navClipping.length===0,`${config.name}: navigation controls must stay in view`);
      const pause=page.locator('#planetMotion .planet-motion-label');
      check(await pause.isVisible(),`${config.name}: motion control keeps a visible label`);
      const heroControl=page.locator('.hero-film-control');
      check(await heroControl.isVisible(),`${config.name}: a hero playback control is available`);
      check(/Play/.test(await heroControl.textContent()),`${config.name}: reduced motion starts the hero paused`);
      await page.screenshot({path:path.join(output,`${config.name}-hero.png`)});

      const focus=await focusMetrics(page,'.step-btn');
      check(focus.width>=2&&focus.outline==='solid','Keyboard focus must have a substantial visible outline');
      check(contrast(focus.color,focus.background)>=3,`${config.name}: focus ring must contrast against the cream surface`);
      const darkFocus=await focusMetrics(page,'#contactName');
      check(contrast(darkFocus.color,darkFocus.background)>=3,`${config.name}: focus ring must contrast against the dark surface`);
      if(config.touch){
        await page.locator('#navToggle').tap();
        const link=page.locator('#navLinks a[href="#problem"]');await link.tap();
        await page.waitForTimeout(100);
        const mobileFocus=await page.evaluate(()=>({tag:document.activeElement.tagName,id:document.activeElement.id}));
        check(mobileFocus.id!=='problem','Pointer navigation must not draw focus around an entire section');
      }
      await page.locator('#hwView').scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>window.pathosPrototype?.state.ready,undefined,{timeout:10000});
      const tabs=page.getByRole('tablist',{name:/hardware|walkthrough|view/i});
      check(await tabs.count()===1,`${config.name}: hardware modes use a labeled tab list`);
      check(await page.locator('#hwGuidedTab').getAttribute('aria-selected')==='true',`${config.name}: reduced motion starts in the guided view`);
      check(await page.locator('#hwExperiencePanel').getAttribute('aria-labelledby')==='hwGuidedTab',`${config.name}: panel label matches the actual renderer`);
      await page.locator('#hwGuidedTab').focus();await page.locator('#hwGuidedTab').press('ArrowRight');
      check(await page.locator('#hw3DTab').evaluate(el=>document.activeElement===el),`${config.name}: keyboard arrows move between tabs`);
      check(await page.locator('#hwGuidedTab').getAttribute('aria-selected')==='true',`${config.name}: focus alone must not activate the expensive renderer`);
      const view=await page.locator('#hwView').boundingBox();
      const film=await page.evaluate(()=>({width:window.pathosPrototype.film.w,height:window.pathosPrototype.film.h}));
      check(Math.abs(film.width/film.height-16/9)<.05,`${config.name}: guided playback preserves the 16:9 film picture`);
      check(film.width<=view.width+1&&film.height<=view.height+1,`${config.name}: the entire film picture fits without cropping`);
      check(Math.abs(view.width/view.height-16/9)<.05,`${config.name}: the cinematic picture retains its film proportions`);
      const chapter=await page.locator('#prototype .hw-chapter[data-hw-current="true"]').boundingBox();
      const stage=view.width<880?await page.locator('#hwStage').boundingBox():view;
      check(chapter&&chapter.x>=stage.x-1&&chapter.x+chapter.width<=stage.x+stage.width+1&&chapter.y>=stage.y-1&&chapter.y+chapter.height<=stage.y+stage.height+1,`${config.name}: the active shot details stay inside the cinematic stage`);
      if(view.width<880)check(chapter&&chapter.y>=view.y+view.height-1,`${config.name}: readable shot details stay below the uncropped compact picture`);
      if(view.width>=880){
        const details=await page.locator('#prototype .hw-chapter[data-hw-current="true"] :is(.hw-eyebrow,.hw-title,.hw-caption,.hw-line,.hw-plate)').evaluateAll(elements=>elements
          .filter(el=>{const style=getComputedStyle(el),box=el.getBoundingClientRect();return style.visibility!=='hidden'&&box.width>0&&box.height>0;})
          .map(el=>{
            let opacity=1;
            for(let node=el;node&&node.id!=='hwStage';node=node.parentElement)opacity*=Number(getComputedStyle(node).opacity);
            return{text:el.textContent.trim().slice(0,60),opacity};
          }));
        check(details.length>0&&details.every(detail=>detail.opacity>=.99),`${config.name}: paused desktop shot details are fully opaque through their ancestors`);
      }
      await page.screenshot({path:path.join(output,`${config.name}-hardware.png`)});
      check(errors.length===0,`${config.name}: no uncaught browser errors`);
      console.log(JSON.stringify({config:config.name,...metrics,focus,darkFocus,errors}));
      await context.close();
    }
    const boundaries=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
    await boundaries.goto(base,{waitUntil:'load'});await boundaries.evaluate(()=>document.fonts.ready);
    for(const width of [320,640,641,900,901,1100,1101,1440]){
      await boundaries.setViewportSize({width,height:900});
      const clipped=await boundaries.evaluate(()=>[...document.querySelectorAll('.nav>.brand,.nav>.planet-motion,.nav>.menu-btn,.nav .nav-link')]
        .filter(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;})
        .filter(el=>{const r=el.getBoundingClientRect();return r.left<0||r.right>innerWidth+1;})
        .map(el=>({text:(el.getAttribute('aria-label')||el.textContent).trim(),right:el.getBoundingClientRect().right})));
      check(clipped.length===0,`${width}px: navigation must fit at responsive boundaries`);
      console.log(JSON.stringify({navBoundary:{width,clipped}}));
    }
    await boundaries.close();
    for(const width of [375,1440]){
      const page=await browser.newPage({viewport:{width,height:1000}});
      await page.goto(base,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
      await page.waitForFunction(()=>document.getElementById('heroVideo').readyState>=2,undefined,{timeout:20000});
      const control=page.locator('.hero-film-control');
      if((await control.textContent()).includes('Pause'))await control.click();
      const samples=[];
      for(const time of [0,4,8,12])samples.push(...await heroContrast(page,time));
      check(samples.every(sample=>sample.contrast>=3),`${width}px: large gold text must contrast against sampled video backgrounds`);
      console.log(JSON.stringify({heroContrast:{width,samples}}));await page.close();
    }
  console.log(JSON.stringify({failures}));assert.deepEqual(failures,[]);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
