/* The six original field photographs, as a compact, manually controlled
   carousel. Page scrolling stays independent of the photographs. */
const section=document.querySelector('section.field');
const track=document.getElementById('flTrack');
const stage=document.getElementById('flStage');
const cards=[...document.querySelectorAll('#flDeck .fl-card')];
const caption=document.getElementById('flCaption');
const count=document.getElementById('flCount');
const previous=document.getElementById('flPrev');
const next=document.getElementById('flNext');

if(section&&track&&stage&&cards.length&&caption&&count&&previous&&next){
  const reduced=matchMedia('(prefers-reduced-motion:reduce)');
  const clamp=value=>Math.max(0,Math.min(cards.length-1,Math.round(value)));
  const metadata=cards.map(card=>({
    card,button:card.querySelector('.fl-front'),
    title:card.querySelector('.shot-caption strong').textContent,
    description:card.querySelector('.shot-caption-text>span').textContent
  }));
  for(const {card} of metadata){
    const [width,height]=card.style.getPropertyValue('--ar').split('/').map(Number);
    card.style.setProperty('--photo-ratio',String(width>0&&height>0?width/height:.8));
  }
  let current=-1,visible=true,gesture=null,suppressClick=false;
  section.classList.add('is-live','is-compact');
  stage.setAttribute('role','region');
  stage.setAttribute('aria-roledescription','carousel');
  stage.setAttribute('aria-label','Prototype photographs');
  previous.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12"/></svg>';
  next.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10 6 6 6-6 6M16 12H4"/></svg>';

  function goTo(index){
    const target=clamp(index);
    if(target===current)return;
    current=target;
    metadata.forEach((item,i)=>{
      const selected=i===current;
      item.card.hidden=!selected;
      item.card.classList.toggle('is-current',selected);
      item.button.tabIndex=selected?0:-1;
      item.button.setAttribute('aria-label',`${item.title}. Open photograph ${i+1} of ${cards.length}.`);
    });
    caption.querySelector('strong').textContent=metadata[current].title;
    caption.querySelector('span').textContent=metadata[current].description;
    count.textContent=`${String(current+1).padStart(2,'0')} / ${String(cards.length).padStart(2,'0')}`;
    previous.disabled=current===0;
    next.disabled=current===cards.length-1;
    section.dataset.photo=String(current+1);
  }
  previous.addEventListener('click',()=>goTo(current-1));
  next.addEventListener('click',()=>goTo(current+1));
  stage.addEventListener('keydown',event=>{
    if(event.key==='ArrowLeft'){event.preventDefault();goTo(current-1);}
    if(event.key==='ArrowRight'){event.preventDefault();goTo(current+1);}
    if(event.key==='Home'){event.preventDefault();goTo(0);}
    if(event.key==='End'){event.preventDefault();goTo(cards.length-1);}
  });
  // Horizontal swipes change photographs; a vertical gesture or pinch stays
  // with the browser. A completed swipe must not open the lightbox.
  stage.addEventListener('pointerdown',event=>{
    if(!event.isPrimary||event.button!==0||event.target.closest('.fl-nav'))return;
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,dragging:false};
  });
  stage.addEventListener('pointermove',event=>{
    if(!gesture||event.pointerId!==gesture.id)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    if(!gesture.dragging&&Math.hypot(dx,dy)>8){
      if(Math.abs(dy)>=Math.abs(dx)){gesture=null;return;}
      gesture.dragging=true;
      try{stage.setPointerCapture(event.pointerId);}catch{}
    }
  });
  stage.addEventListener('pointerup',event=>{
    if(!gesture||event.pointerId!==gesture.id)return;
    const dx=event.clientX-gesture.x;
    if(gesture.dragging){
      suppressClick=true;
      if(Math.abs(dx)>36)goTo(current+(dx<0?1:-1));
      setTimeout(()=>{suppressClick=false;},0);
    }
    gesture=null;
  });
  stage.addEventListener('pointercancel',()=>{gesture=null;});
  stage.addEventListener('click',event=>{
    if(suppressClick){event.preventDefault();event.stopImmediatePropagation();}
  },{capture:true});
  stage.addEventListener('dragstart',event=>event.preventDefault());
  new IntersectionObserver(entries=>{visible=entries.at(-1).isIntersecting;}).observe(stage);
  goTo(0);
  // Retained for the site's QA tools. Navigation is explicit; this helper now
  // gives the compact stage's document position rather than a pinned timeline.
  window.pathosField={
    get state(){return{p:current,target:current,shown:current,visible,rendering:false,dragging:!!gesture?.dragging,reduced:reduced.matches};},
    get layout(){return{W:stage.clientWidth,H:stage.clientHeight};},
    scrollToP:()=>stage.getBoundingClientRect().top+scrollY,
    goTo,count:cards.length
  };
}
