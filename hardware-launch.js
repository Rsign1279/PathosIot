// The standalone study uses the same compact player and lazy renderer as home.
document.documentElement.classList.add('js');
import './ui-icons.js';
import('./prototype-loader.js').then(()=>import('./hardware-experience.js')).then(()=>window.pathosLoadHardware()).catch(error=>{
  document.documentElement.classList.remove('js','hw-js');
  const status=document.getElementById('hwStatus');
  if(status){status.textContent='The interactive study could not load. The still and prototype photographs remain available.';status.hidden=false;}
  console.warn('Pathos IoT hardware study:',error.message);
});
