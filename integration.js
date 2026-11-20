import {createPlanet} from './planet.js';
import {clamp,turnRate,angleAt,revealAt,surfacePoint,emergePose,planReadingChunks} from './orbit-motion.js';

// Original nodes and native document spaces remain intact. The visual layers
// unroll from the sphere; their copy, controls and handlers stay untouched.
const UNIT_SELECTOR='.sec-head,.partner-rows>li,.partners-aside,.problem-chart,.problem-point,.feats>.feat,.sig-grid>.sig-card,.sig-meter,.statement,.pipeline>li,.sys-note,.sensor-table>.sensor-row:not(.sensor-row--head),.parts-foot,#pathos-iot .sys-grid>.sys-panel,.log>li,.ws-list>li,.how-steps>li,.how-scene,.founder,.faq-item';
const unitMap=new WeakMap();
const groups=[...document.querySelectorAll('[data-planet-story]')].map(element=>{
  const stage=element.querySelector('.planet-stage');
  const units=[...element.querySelectorAll(UNIT_SELECTOR)].map(el=>{
    const label=(el.querySelector('h2,h3,.how-t,summary,strong')?.textContent||el.textContent||'').trim().replace(/\s+/g,' ').slice(0,80);
    const unit={element:el,label,top:0,left:0,height:0,start:0,end:0,progress:-1,state:'',pinned:false,focused:false};
    el.classList.add('orbit-unit');unitMap.set(el,unit);return unit;
  });
  return {element,stage,surface:element.querySelector('.planet-surface'),type:stage.querySelector('.orbit-type'),typeWords:stage.querySelector('.orbit-type-words'),emittedLabel:'',chapters:[...element.querySelectorAll('[data-planet-chapter]')],links:[...element.querySelectorAll('.planet-chapter-links a')],count:stage.querySelector('.planet-chapter-count'),title:stage.querySelector('.planet-chapter-title'),note:stage.querySelector('.planet-chapter-note'),bar:stage.querySelector('.orbit-progress span'),thread:stage.querySelector('.orbit-thread-path'),trace:stage.querySelector('.orbit-surface-trace'),source:stage.querySelector('.orbit-source'),units,finale:element.querySelector('[data-planet-finale]'),bounds:[],top:0,bottom:0,index:-1,signal:.5,base:0,angle:-.45};
});
const motion=matchMedia('(prefers-reduced-motion:reduce)');
const control=document.getElementById('planetMotion');
const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');canvas.id='integratedPlanet';
let renderer=null,initializing=null,unavailable=false,active=null,frame=0,needsMeasure=true,dirty=true,lastTime=0,lastDraw=0,lastQuality=0,lastMeasure=-Infinity,scroll=scrollY,presentedScroll=scrollY,lastPointer=-Infinity;
let height=innerHeight,mobile=innerWidth<=640,rate=turnRate(height);
let paused=motion.matches,userOverride=false;
const wake=()=>{if(!frame&&!document.hidden)frame=requestAnimationFrame(tick);};
const scheduleMeasure=()=>{needsMeasure=true;dirty=true;wake();};

// Offset geometry ignores transforms, avoiding feedback from the previous pose.
function layoutPosition(element){
  let top=0,left=0;
  for(let node=element;node;node=node.offsetParent){top+=node.offsetTop;left+=node.offsetLeft;}
  return{top,left};
}
function measure(){
  height=innerHeight;mobile=innerWidth<=640;rate=turnRate(height);
  let base=-.45;
  // Batch all layout reads here; a normal animation frame only uses the cache.
  for(const group of groups){
    const box=group.element.getBoundingClientRect(),stageBox=group.stage.getBoundingClientRect(),sphere=group.surface.getBoundingClientRect(),style=getComputedStyle(group.stage),groupStyle=getComputedStyle(group.element);
    group.top=box.top+scrollY;group.bottom=box.bottom+scrollY;group.left=stageBox.left;group.stageHeight=group.stage.offsetHeight;group.stickyTop=parseFloat(style.top)||0;group.padding=parseFloat(groupStyle.paddingTop)||0;group.paddingBottom=parseFloat(groupStyle.paddingBottom)||0;group.base=base;
    group.sphere={x:sphere.left+sphere.width/2-stageBox.left,y:sphere.top+sphere.height/2-stageBox.top,radius:group.surface.offsetWidth/2};
    group.bounds=group.chapters.map(chapter=>({top:layoutPosition(chapter).top,height:chapter.offsetHeight}));
    // Finish the rotation as the last heading reaches its reading position.
    group.stopAt=group.finale
      ? layoutPosition(group.finale).top-group.stickyTop-(mobile?group.stageHeight+16:16)
      : Infinity;
    for(const unit of group.units){
      const position=layoutPosition(unit.element);unit.top=position.top;unit.left=position.left;unit.height=unit.element.offsetHeight;
      unit.progress=-1;
    }
    // A row is one piece of the story. Keeping its columns in one coordinate
    // system prevents two entries collapsing into the same launch point.
    group.rows=[];
    for(const unit of [...group.units].sort((a,b)=>a.top-b.top||a.left-b.left)){
      let row=group.rows.at(-1);
      if(!row||Math.abs(row.top-unit.top)>4){row={top:unit.top,left:unit.left,bottom:unit.top+unit.height,units:[]};group.rows.push(row);}
      row.units.push(unit);row.left=Math.min(row.left,unit.left);row.bottom=Math.max(row.bottom,unit.top+unit.height);
    }
    for(const row of group.rows){
      row.chapter=0;for(let i=1;i<group.bounds.length;i++)if(row.top>=group.bounds[i].top)row.chapter=i;
    }
    group.chunks=planReadingChunks(group.rows,{
      height,mobile,readingTop:group.stickyTop+(mobile?group.stageHeight:0),
      firstVisibleAt:group.top+group.padding+group.sphere.y+group.sphere.radius*(mobile?.92:.24)-(height-24)
    });
    for(let index=0;index<group.chunks.length;index++){
      const chunk=group.chunks[index];
      for(const fragment of chunk.fragments){
        const row=fragment.row;row.chunk=chunk;
        row.start=angleAt(fragment.start,group.top,base,rate);row.end=angleAt(fragment.end,group.top,base,rate);
        for(const unit of row.units)unit.element.dataset.orbitChunk=String(index);
      }
    }
    base+=(group.bottom-group.top+height)*rate;
  }
  needsMeasure=false;lastMeasure=performance.now();dirty=true;
}
function mount(group){
  if(unavailable)return;
  if(canvas.parentElement!==group.surface){canvas.parentElement?.classList.remove('has-webgl');group.surface.appendChild(canvas);if(renderer)group.surface.classList.add('has-webgl');}
  if(!renderer&&!initializing){
    initializing=createPlanet(canvas).then(result=>{renderer=result;initializing=null;if(!renderer){unavailable=true;canvas.remove();}dirty=true;wake();}).catch(()=>{initializing=null;unavailable=true;canvas.remove();dirty=true;wake();});
  }
}
function setPose(unit,p,pose){
  const state=p===1?'reading':p===0?'waiting':'transit';
  if(unit.state!==state){unit.element.dataset.orbitState=state;unit.state=state;}
  if(unit.progress===p&&state!=='transit')return;
  const style=unit.element.style;style.setProperty('--emerge-opacity',pose.opacity.toFixed(3));
  if(state==='transit'){
    style.setProperty('--emerge-x',pose.x.toFixed(2)+'px');style.setProperty('--emerge-y',pose.y.toFixed(2)+'px');style.setProperty('--emerge-scale',pose.scale.toFixed(4));style.setProperty('--emerge-turn',pose.turn.toFixed(2)+'deg');style.setProperty('--emerge-roll',pose.roll.toFixed(2)+'deg');
  }
  unit.element.dataset.orbitProgress=p.toFixed(3);unit.progress=p;
}
function updateGroup(group,y){
  const atFinale=scroll>=group.stopAt;
  const focus=y+height*(mobile?.43:.38);
  let index=0;for(let i=0;i<group.bounds.length;i++)if(focus>=group.bounds[i].top)index=i;
  if(atFinale)index=group.chapters.length-1;
  if(group.index!==index){
    group.index=index;const chapter=group.chapters[index];group.count.textContent=String(index+1).padStart(2,'0')+' / '+String(group.chapters.length).padStart(2,'0');group.title.textContent=chapter.dataset.planetTitle;group.note.textContent=chapter.dataset.planetNote;
    group.links.forEach((link,i)=>{if(i===index)link.setAttribute('aria-current','step');else link.removeAttribute('aria-current');});
  }
  const current=group.bounds[index],within=clamp((focus-current.top)/Math.max(1,current.height));
  if(group.bar)group.bar.style.transform='scaleX('+((index+within)/group.chapters.length)+')';
  const angle=angleAt(Math.min(scroll,group.stopAt),group.top,group.base,rate);
  if(atFinale)group.element.dataset.orbitFinished='';
  else delete group.element.dataset.orbitFinished;
  if(!paused)group.angle=angle;
  group.element.dataset.orbitAngle=group.angle.toFixed(5);
  group.stage.style.setProperty('--orbit-angle',(group.angle*.24)+'rad');
  group.surface.style.setProperty('--stone-turn',(group.angle*.22)+'rad');
  const source=surfacePoint(group.angle,group.sphere,mobile);
  const stageTop=Math.max(group.top+group.padding,Math.min(y+group.stickyTop,group.bottom-group.paddingBottom-group.stageHeight));
  for(const unit of group.units)if(unit.pinned&&!unit.focused&&(unit.top+unit.height<y||unit.top>y+height))unit.pinned=false;
  for(const chunk of group.chunks)chunk.pinned=paused||chunk.rows.some(part=>part.units.some(unit=>unit.pinned));
  let lead=null,readingBottom=-Infinity;
  for(const row of group.rows){
    let p=row.chunk.pinned?1:revealAt(angle,row.start,row.end);
    // A scrollbar jump must not project distant blocks into this viewport.
    if(atFinale||row.bottom<y||row.top-y<height*.48)p=1;
    const pose=emergePose(p,group.left+source.x-row.left,stageTop+source.y-row.top,mobile);
    if(p>0&&p<1){
      // Protect previously delivered copy. The horizontal unrolling continues
      // while the flight's lower edge clears the preceding reading row.
      const safeTop=Math.min(row.top-y,readingBottom);
      pose.y=Math.max(pose.y,safeTop-(row.top-y));
    }
    for(const unit of row.units){
      const memberPose={...pose,x:pose.x+(unit.left-row.left)*(pose.scale-1),y:pose.y+(unit.top-row.top)*(pose.scale-1)};
      setPose(unit,p,memberPose);
      if(p>.025&&p<.96&&(!lead||Math.abs(p-.5)<Math.abs(lead.p-.5)))lead={unit,p,pose:memberPose};
    }
    if(p>0)readingBottom=Math.max(readingBottom,row.top-y+pose.y+(row.bottom-row.top)*pose.scale);
  }
  group.source.style.transform='translate('+source.x.toFixed(2)+'px,'+source.y.toFixed(2)+'px)';
  group.source.style.opacity=paused?'0':lead?'1':'.35';
  if(lead&&!paused){
    const {unit,pose}=lead,tx=unit.left-group.left+pose.x,ty=unit.top-stageTop+pose.y+8;
    // The incoming words travel across the marble itself before unrolling
    // into their original HTML. This surface printing shares the same angle.
    if(group.typeWords){
      if(group.emittedLabel!==unit.label){group.typeWords.textContent=unit.label;group.emittedLabel=unit.label;}
      group.typeWords.setAttribute('startOffset',(-720+lead.p*1720).toFixed(1));
      group.type.style.opacity=(Math.sin(lead.p*Math.PI)*.7).toFixed(3);
    }
    const cx=mobile?source.x+36:source.x+(tx-source.x)*.45,cy=mobile?source.y+(ty-source.y)*.5:source.y-44;
    group.thread.setAttribute('d','M'+source.x.toFixed(1)+','+source.y.toFixed(1)+' Q'+cx.toFixed(1)+','+cy.toFixed(1)+' '+(tx-8).toFixed(1)+','+ty.toFixed(1));
    group.thread.style.opacity=Math.min(.65,pose.trail).toFixed(3);
    const r=group.sphere.radius*.88;
    group.trace.setAttribute('d',mobile?'M'+(source.x-28)+','+(source.y-12)+' Q'+source.x+','+(source.y+6)+' '+(source.x+28)+','+(source.y-12):'M'+(source.x-22)+','+(source.y-r*.28)+' Q'+(source.x+12)+','+source.y+' '+(source.x-22)+','+(source.y+r*.28));
    group.trace.style.opacity=Math.min(.5,pose.trail).toFixed(3);
  }else{group.thread.style.opacity='0';group.trace.style.opacity='0';if(group.type)group.type.style.opacity='0';}
}
function tick(time){
  frame=0;if(document.hidden)return;
  // A details expansion changes height every frame. Coalesce those geometry
  // updates while still measuring the final size once its animation settles.
  if(needsMeasure&&time-lastMeasure>=80)measure();
  const y=scrollY,elapsed=lastTime?Math.min(64,time-lastTime):16;lastTime=time;
  active=groups.find(group=>group.top<y+height*.95&&group.bottom>y+112)||null;
  const delta=y-scroll;
  if(!active||paused||Math.abs(delta)>height*1.5)scroll=y;
  else scroll+=delta*(1-Math.exp(-elapsed/42));
  // Reading deadlines use the actual viewport. Catch the shared angle up at
  // a completed chunk boundary so smoothing cannot leave its last part late.
  let deadlineCaughtUp=false;
  if(active&&!paused&&delta>0){
    for(const chunk of active.chunks)if(chunk.end<=y&&chunk.end>presentedScroll){scroll=Math.max(scroll,chunk.end);deadlineCaughtUp=true;}
  }
  const settled=Math.abs(y-scroll)<.15;if(settled)scroll=y;
  const canDraw=time-lastDraw>=(mobile?1000/30:1000/45)||settled||deadlineCaughtUp;
  if(canDraw&&(dirty||!settled)){
    for(const group of groups)if(group.top<y+height*1.2&&group.bottom>y-height*.2)updateGroup(group,y);
    if(active){
      mount(active);
      if(renderer){const started=performance.now();renderer.render(active.angle,active.signal);if(performance.now()-started>20&&time-lastQuality>2000){renderer.lowerQuality();lastQuality=time;}}
    }
    lastDraw=time;presentedScroll=scroll;dirty=false;
  }
  // No idle spin: sphere and copy both stop at this angle.
  if(!settled||needsMeasure){dirty=true;wake();}else lastTime=0;
}
function updateMotion(){
  document.documentElement.classList.toggle('planet-paused',paused);
  if(control){
    control.setAttribute('aria-pressed',String(paused));
    control.setAttribute('aria-label',paused?'Resume planet and text motion':'Pause planet and text motion');
    const icon=control.querySelector('span:first-child');
    if(icon)icon.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(paused?'<path d="m9 5 11 7-11 7Z"/>':'<path d="M9 5v14M15 5v14"/>')+'</svg>';
    const label=control.querySelector('.planet-motion-label');
    if(label)label.textContent=paused?'Resume story':'Pause story';
  }
  // A pause exposes every word; it never strands half-revealed copy.
  if(paused)for(const group of groups)for(const unit of group.units)setPose(unit,1,emergePose(1,0,0,mobile));
  scroll=scrollY;dirty=true;wake();
}
control?.addEventListener('click',()=>{userOverride=true;paused=!paused;updateMotion();});
motion.addEventListener('change',()=>{if(!userOverride){paused=motion.matches;updateMotion();}});
addEventListener('scroll',()=>{dirty=true;wake();},{passive:true});
addEventListener('resize',scheduleMeasure,{passive:true});
document.addEventListener('visibilitychange',()=>{lastTime=0;if(document.hidden){if(frame)cancelAnimationFrame(frame);frame=0;}else{dirty=true;wake();}});
document.addEventListener('pointerdown',()=>{lastPointer=performance.now();},{passive:true});
document.addEventListener('focusin',event=>{
  const unit=unitMap.get(event.target.closest('.orbit-unit'));if(!unit)return;
  unit.focused=true;
  if(performance.now()-lastPointer>=180){unit.pinned=true;dirty=true;wake();}
});
document.addEventListener('focusout',event=>{const unit=unitMap.get(event.target.closest('.orbit-unit'));if(unit)unit.focused=false;});
document.addEventListener('click',event=>{
  const unit=unitMap.get(event.target.closest('.orbit-unit'));if(unit&&event.target.closest('a,button,summary,input,select,textarea,[role=button]'))unit.pinned=true;
  dirty=true;wake();
});
for(const group of groups){
  const signalGrid=group.element.querySelector('.sig-grid');
  if(signalGrid)new MutationObserver(()=>{const selected=signalGrid.querySelectorAll('[aria-pressed=true]').length;group.signal=selected?selected/4:.5;dirty=true;wake();}).observe(signalGrid,{subtree:true,attributes:true,attributeFilter:['aria-pressed']});
}
const sizes=new ResizeObserver(scheduleMeasure);groups.forEach(group=>sizes.observe(group.element));
if(document.getElementById('main'))sizes.observe(document.getElementById('main'));
const visibility=new IntersectionObserver(()=>{dirty=true;wake();},{threshold:0});groups.forEach(group=>visibility.observe(group.element));
canvas.addEventListener('planetrestore',()=>{renderer?.destroy();renderer=null;initializing=null;if(active)mount(active);});
canvas.addEventListener('planetchange',()=>{dirty=true;wake();});
document.fonts.ready.then(scheduleMeasure);addEventListener('load',scheduleMeasure,{once:true});
document.addEventListener('load',event=>{if(event.target.tagName==='IMG')scheduleMeasure();},true);
measure();updateMotion();

// Keep the founder's original navigation handlers, focus trap and mobile panel.
const nav=document.getElementById('nav'),main=document.getElementById('main'),footer=document.querySelector('.site-foot');
const mobileMenu=matchMedia('(max-width:900px)');
if(nav){
  const syncMenu=()=>{const open=mobileMenu.matches&&nav.classList.contains('open');if(main)main.inert=open;if(footer)footer.inert=open;document.body.style.overflow=open?'hidden':'';};
  new MutationObserver(syncMenu).observe(nav,{attributes:true,attributeFilter:['class']});mobileMenu.addEventListener('change',syncMenu);
  nav.querySelector('#navLinks')?.addEventListener('click',event=>{
    const link=event.target.closest('a[href^="#"]');
    // Pointer navigation should scroll without outlining an entire section.
    // Keyboard activation transfers focus to its heading, so the next Tab
    // continues inside the destination after the mobile menu closes.
    if(!link||!mobileMenu.matches||event.detail!==0)return;
    const destination=document.querySelector(link.getAttribute('href'));
    const heading=destination?.querySelector('h1,h2,h3');
    if(!heading)return;
    queueMicrotask(()=>{
      const temporary=!heading.hasAttribute('tabindex');
      if(temporary)heading.tabIndex=-1;
      heading.focus({preventScroll:true});
      if(temporary)heading.addEventListener('blur',()=>heading.removeAttribute('tabindex'),{once:true});
    });
  });
  nav.addEventListener('keydown',event=>{if(event.key!=='Tab'||!mobileMenu.matches||!nav.classList.contains('open'))return;const focusable=[...nav.querySelectorAll('a[href],button:not([disabled])')].filter(el=>el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});
  syncMenu();
}
