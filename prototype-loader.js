// Preserve the full in-page hardware study; load it only when it approaches.
const section=document.getElementById('prototype');
let loading=null;
const start=()=>{
  if(!section)return Promise.resolve(null);
  if(!loading)loading=import('./prototype.js').then(()=>window.pathosPrototype).catch(error=>{
    const status=document.getElementById('hwStatus');if(status){status.hidden=false;status.textContent='The hardware study could not load. The still and the real prototype photographs remain available.';}
    loading=null;throw error;
  });
  return loading;
};
window.pathosLoadHardware=start;
if(section){
  if(location.hash.startsWith('#prototype')||new URLSearchParams(location.search).has('bake'))start().catch(()=>{});
  else new IntersectionObserver((entries,observer)=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();start().catch(()=>{});}},{rootMargin:'100% 0px'}).observe(section);
}
