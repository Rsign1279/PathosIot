// Adaptive controls for the cinematic hardware study. Rendering stays in prototype.js.
const section=document.getElementById('prototype');
if(section?.classList.contains('hw-experience')){
  const tabs=[...section.querySelectorAll('[data-hw-mode]')];
  const panel=document.getElementById('hwExperiencePanel');
  const play=document.getElementById('hwPlay');
  const playText=document.getElementById('hwPlayText');
  const playIcon=document.getElementById('hwPlayIcon');
  const note=document.getElementById('hwModeNote');
  const scroll=document.getElementById('hwScroll');
  const chapters=[...section.querySelectorAll('.hw-chapter')];
  let current={rendererMode:'guided',playback:'scroll',progress:0,chapter:0,frame:1,ready:false,loading3D:false};
  let lastChapter=-1,lastNote='';
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
    scroll?.setAttribute('aria-pressed',String(current.playback==='scroll'));
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
    const chapter=Math.max(0,Math.min(chapters.length-1,Number(current.chapter)||0));
    if(chapter!==lastChapter){
      chapters.forEach((element,index)=>{const selected=index===chapter;element.dataset.hwCurrent=String(selected);element.setAttribute('aria-hidden',String(!selected));});
      lastChapter=chapter;
    }
    if(current.loading3D)setNote('Preparing the 3D walkthrough. You can keep using the guided visual.');
    else if(current.modeReason==='Guided playback is ready.')setNote(current.playback==='scroll'?'Scroll to take the rig apart, or press Play.':playing?'The guided walkthrough is playing.':'Choose Scroll, Play, or a chapter to explore.');
    else if(current.modeReason==='Interactive 3D is ready.')setNote(current.mode==='orbit'?'Drag to look around, or select a part to learn more.':'Choose 360° view to rotate the rig, or scroll to follow the walkthrough.');
    else if(current.modeReason)setNote(current.modeReason);
    else setNote(mode==='3d'?'Explore every part in 3D, or play the complete walkthrough.':'Scroll through the rig, press Play, or choose a chapter.');
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
  scroll?.addEventListener('click',()=>action(api=>api.resumeScroll()));
  play?.addEventListener('click',()=>action(api=>current.playback==='play'?api.pause():api.play()));
  document.addEventListener('pathos:hardwarestate',event=>sync(event.detail));
  document.addEventListener('pathos:hardwareready',()=>sync(window.pathosPrototype?.state));
  sync(window.pathosPrototype?.state||current);
}
