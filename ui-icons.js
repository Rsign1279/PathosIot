// Shared decorative controls. Accessible names remain on their native buttons.
const paths={right:'M4 12h16m-6-6 6 6-6 6',left:'M20 12H4m6-6-6 6 6 6',close:'m6 6 12 12M18 6 6 18',plus:'M12 5v14M5 12h14',minus:'M5 12h14'};
const icon=name=>`<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${paths[name]}"/></svg>`;
for(const [selector,name] of [
  ['#flPrev,#lightboxPrev','left'],['#flNext,#lightboxNext','right'],
  ['.lightbox-close,.hw-label-x','close'],['#hwZoomIn','plus'],['#hwZoomOut','minus'],
  ['.hw-start>span[aria-hidden],.text-link>span[aria-hidden],.founder-link>span[aria-hidden]','right']
])document.querySelectorAll(selector).forEach(element=>{element.innerHTML=icon(name);});
document.querySelectorAll('.feat-more').forEach(element=>{
  element.textContent=element.textContent.replace(/\s*→\s*$/,'');
  element.insertAdjacentHTML('beforeend',icon('right'));
});
