// UI for the compact hardware player. Playback and rendering stay in prototype.js.
const section=document.getElementById('prototype');
if(section?.classList.contains('hw-experience')){
  const tabs=[...section.querySelectorAll('[data-hw-mode]')];
  const panel=document.getElementById('hwExperiencePanel');
  const play=document.getElementById('hwPlay');
  const playText=document.getElementById('hwPlayText');
  const playIcon=document.getElementById('hwPlayIcon');
  const seek=document.getElementById('hwSeek');
  const time=document.getElementById('hwTime');
  const start=document.getElementById('hwStart');
  const startText=document.getElementById('hwStartText');
  const note=document.getElementById('hwModeNote');
  const chapters=[...section.querySelectorAll('.hw-chapter')];
  let current={rendererMode:'guided',playback:'paused',progress:0,chapter:0,frame:1,ready:false,loading3D:false};
  let seeking=false,lastChapter=-1,lastNote='';
  const clamp=value=>Math.min(1,Math.max(0,Number(value)||0));
  const clock=seconds=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
  const setText=(element,value)=>{if(element&&element.textContent!==value)element.textContent=value;};
  let iconPlaying=null;
  function setPlayIcon(playing){
    if(!playIcon||iconPlaying===playing)return;iconPlaying=playing;
    const shape=playing?'<path d="M3 2.5h3.5v11H3Zm6.5 0H13v11H9.5Z"/>':'<path d="M4 2.5 13 8l-9 5.5Z"/>';
    playIcon.innerHTML=`<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">${shape}</svg>`;
  }
  function setNote(value){if(value!==lastNote){setText(note,value);lastNote=value;}}
  function sync(state){
    if(!state)return;current={...current,...state};
    const mode=current.rendererMode==='3d'?'3d':'guided';
    section.dataset.hwRenderer=mode;
    section.dataset.hwPlayback=current.playback||'paused';
    section.dataset.hwLoading3d=String(!!current.loading3D);
    for(const tab of tabs){
      const selected=tab.dataset.hwMode===mode;
      tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
      if(tab.dataset.hwMode==='3d'&&current.loading3D)tab.setAttribute('aria-busy','true');
      else tab.removeAttribute('aria-busy');
    }
    panel?.setAttribute('aria-labelledby',mode==='3d'?'hw3DTab':'hwGuidedTab');
    const playing=current.playback==='play';
    setText(playText,playing?'Pause':'Play');setPlayIcon(playing);
    play?.setAttribute('aria-label',playing?'Pause walkthrough':'Play walkthrough');
    setText(startText,mode==='3d'?(current.mode==='orbit'?'Back to walkthrough':'Start exploring'):playing?'Pause walkthrough':'Start walkthrough');
    const progress=clamp(current.progress);
    if(!seeking&&seek)seek.value=String(Math.round(progress*1000));
    seek?.style.setProperty('--hw-progress',`${(progress*100).toFixed(1)}%`);
    const seconds=Number.isFinite(current.frame)?Math.max(0,(current.frame-1)/60):progress*48;
    const chapter=Math.max(0,Math.min(chapters.length-1,Number(current.chapter)||0));
    const chapterName=chapters[chapter]?.dataset.rail||'Overview';
    setText(time,`${clock(seconds)} / 0:48`);
    seek?.setAttribute('aria-valuetext',`${clock(seconds)} of 0:48 — ${chapterName}`);
    if(chapter!==lastChapter){
      chapters.forEach((element,index)=>{const selected=index===chapter;element.dataset.hwCurrent=String(selected);element.setAttribute('aria-hidden',String(!selected));});
      lastChapter=chapter;
    }
    if(current.loading3D)setNote('Preparing the 3D walkthrough. You can keep using the guided visual.');
    else if(current.modeReason==='Guided playback is ready.')setNote(current.playback==='scroll'?'Scroll through the guided visual, or press Play.':playing?'The guided walkthrough is playing.':'Use Play, the timeline, or a chapter to explore.');
    else if(current.modeReason==='Interactive 3D is ready.')setNote(current.mode==='orbit'?'Drag to look around, or select a part to learn more.':'Choose Start exploring to rotate the rig, or Play to watch.');
    else if(current.modeReason)setNote(current.modeReason);
    else setNote(mode==='3d'?'Explore every part in 3D, or play the complete walkthrough.':'Play, move the timeline, or choose a chapter.');
  }
  async function action(callback){
    try{
      const api=window.pathosPrototype||await window.pathosLoadHardware?.();
      if(!api)throw new Error('Hardware player unavailable');
      await callback(api);sync(api.state);
    }catch{setNote('The interactive view could not open. The guided visual and real build remain available.');}
  }
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>action(api=>api.setRendererMode(tab.dataset.hwMode,{manual:true})));
    tab.addEventListener('keydown',event=>{
      let target;
      if(event.key==='ArrowRight'||event.key==='ArrowLeft')target=(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      else if(event.key==='Home')target=0;
      else if(event.key==='End')target=tabs.length-1;
      if(target===undefined)return;
      event.preventDefault();tabs.forEach((button,i)=>button.tabIndex=i===target?0:-1);tabs[target].focus();
    });
  });
  play?.addEventListener('click',()=>action(api=>current.playback==='play'?api.pause():api.play()));
  start?.addEventListener('click',()=>{
    section.querySelector('.hw-experience-main')?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
    action(api=>current.rendererMode==='3d'?(current.mode==='orbit'?api.exitOrbit():api.enterOrbit()):current.playback==='play'?api.pause():api.play());
  });
  document.getElementById('hwExplore3D')?.addEventListener('click',()=>{
    document.getElementById('hw3DTab')?.focus();action(api=>api.setRendererMode('3d',{manual:true}));
  });
  seek?.addEventListener('pointerdown',()=>{seeking=true;});
  seek?.addEventListener('input',()=>{
    const progress=clamp(Number(seek.value)/1000);seek.style.setProperty('--hw-progress',`${progress*100}%`);
    action(api=>api.seek(progress,{manual:true}));
  });
  const endSeek=()=>{if(seeking){seeking=false;sync(window.pathosPrototype?.state);}};
  addEventListener('pointerup',endSeek);addEventListener('pointercancel',endSeek);
  seek?.addEventListener('change',()=>{seeking=false;sync(window.pathosPrototype?.state);});
  seek?.addEventListener('blur',endSeek);
  document.addEventListener('pathos:hardwarestate',event=>sync(event.detail));
  document.addEventListener('pathos:hardwareready',()=>sync(window.pathosPrototype?.state));
  sync(window.pathosPrototype?.state||current);
}
