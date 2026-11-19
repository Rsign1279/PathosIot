// Browser-decoded native Full HD frames. One in-flight seek; newer scroll
// positions replace the pending target instead of continually cancelling decode.
export function createGuidedFilm({host,url,onFrame,onReady,onError,onEnded,onBuffering}){
 const video=document.createElement('video');
 video.muted=true;video.playsInline=true;video.preload=navigator.connection?.saveData?'metadata':'auto';video.controls=false;
 video.disablePictureInPicture=true;video.disableRemotePlayback=true;video.tabIndex=-1;
 video.setAttribute('aria-hidden','true');
 // Let the browser compositor paint the film directly. Copying each decoded
 // Full HD frame through a canvas is expensive, especially in Safari.
 Object.assign(video.style,{position:'absolute',left:'var(--fx,0px)',top:'var(--fy,0px)',width:'var(--fw,100%)',height:'var(--fh,100%)',maxWidth:'none',objectFit:'contain',visibility:'hidden',pointerEvents:'none',zIndex:'0'});
 host.append(video);
 let active=true,ready=false,disposed=false,playing=false,wanted=1,presented=1;
 let callback=0,fallback=0,timeout=0,lastTime=-1;
 let playVersion=0;
 let bufferTimer=0;
 let seekStarted=0,seeks=0;const latencies=[];
 const fps=60,first=1,last=2880;
 const clamp=f=>Math.max(first,Math.min(last,Math.round(Number(f)||first)));
 const timeFor=f=>Math.min((clamp(f)-first)/fps+.00001,Math.max(0,(video.duration||48)-1/fps));
 function buffered(){clearTimeout(bufferTimer);bufferTimer=0;onBuffering?.(false);}
 function buffering(){if(!active||disposed||bufferTimer)return;bufferTimer=setTimeout(()=>{bufferTimer=0;if(active&&!disposed)onBuffering?.(true);},500);}
 function fail(){
  if(disposed)return;dispose();onError?.();
 }
 function present(time=video.currentTime){
  if(disposed||!active||video.readyState<2)return;
  presented=clamp(Math.round(time*fps)+first);
  if(!ready){
   if(video.videoWidth<1920||video.videoHeight<1080){fail();return;}
   ready=true;clearTimeout(timeout);document.removeEventListener('pointerdown',prime);onReady?.({width:video.videoWidth,height:video.videoHeight});
  }
  video.style.visibility='visible';
  buffered();
  if(Math.abs(time-lastTime)<.000001)return;
  lastTime=time;onFrame?.(presented,video);
 }
 function pump(){
  if(disposed||!active||playing||video.readyState<1||video.seeking)return;
  const time=timeFor(wanted);
  if(video.readyState>=2&&Math.abs(video.currentTime-time)<.5/fps){present();return;}
  seekStarted=performance.now();seeks++;buffering();video.currentTime=time;
 }
 function follow(){
  if(disposed||!active||!playing)return;
  const version=playVersion;
  if(typeof video.requestVideoFrameCallback==='function'){
   callback=video.requestVideoFrameCallback((_,metadata)=>{if(version!==playVersion||!playing||!active||disposed)return;callback=0;present(metadata.mediaTime);follow();});
  }else{
   fallback=requestAnimationFrame(()=>{if(version!==playVersion||!playing||!active||disposed)return;fallback=0;present();follow();});
  }
 }
 function stopCallbacks(){
  if(callback)video.cancelVideoFrameCallback?.(callback);
  if(fallback)cancelAnimationFrame(fallback);callback=fallback=0;
 }
 function seek(frame){wanted=clamp(frame);pump();}
 function setPlaying(value){
  const next=!!value;
  if(playing===next)return;
  const version=++playVersion;
  playing=next;stopCallbacks();
  if(!next){video.pause();wanted=presented;return;}
  if(!active)return;
  video.play().then(()=>{if(disposed||version!==playVersion)return;if(active&&playing)follow();else video.pause();}).catch(()=>{if(disposed||version!==playVersion)return;playing=false;onEnded?.();});
 }
 function setActive(value){
  if(active===!!value)return;
  active=!!value;
  if(active&&!ready)timeout=setTimeout(fail,20000);
  if(!active){playVersion++;video.style.visibility='hidden';clearTimeout(timeout);buffered();stopCallbacks();video.pause();}
  else if(playing){playing=false;setPlaying(true);}
  else{lastTime=-1;pump();}
 }
 function prime(){
  if(disposed||!active||ready)return;
  video.play().then(()=>{if(!playing){video.pause();present();pump();}}).catch(()=>{});
 }
 function dispose(){
  if(disposed)return;disposed=true;playVersion++;clearTimeout(timeout);buffered();stopCallbacks();document.removeEventListener('pointerdown',prime);video.pause();video.removeAttribute('src');video.load();video.remove();
 }
 video.addEventListener('loadedmetadata',()=>{if(video.duration<47.9){fail();return;}pump();});
 video.addEventListener('loadeddata',()=>{present();pump();});
 video.addEventListener('canplay',()=>{present();pump();});
 video.addEventListener('waiting',buffering);
 video.addEventListener('pause',()=>{if(disposed||!active||!playing||!video.paused||video.ended)return;playing=false;playVersion++;stopCallbacks();onEnded?.();});
 video.addEventListener('seeked',()=>{if(seekStarted){latencies.push(performance.now()-seekStarted);if(latencies.length>120)latencies.shift();seekStarted=0;}present();pump();});
 video.addEventListener('ended',()=>{if(!video.ended)return;playing=false;playVersion++;stopCallbacks();present((last-first)/fps);onEnded?.();});
 video.addEventListener('error',fail);
 document.addEventListener('pointerdown',prime,{passive:true});
 timeout=setTimeout(fail,20000);
 video.src=url;video.load();
 return {seek,setPlaying,setActive,dispose,video,redraw(){lastTime=-1;present();},get ready(){return ready;},get frame(){return presented;},get metrics(){const q=video.getVideoPlaybackQuality?.();return {seeks,latencies:[...latencies],quality:q?{total:q.totalVideoFrames,dropped:q.droppedVideoFrames}:null};}};
}
