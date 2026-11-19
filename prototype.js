/* ==========================================================================
   PATHOS hardware in 3D: scroll-driven playback of the finished Blender film
   (deliverables/pathos-hardware/PATHOS_Final_Complete.blend, exported to
   assets/pathos-hardware.glb and a lighter assets/pathos-hardware-mobile.glb).

   - Scroll position maps to a film frame (1..2880 at 60 fps). Each shot gets a
     share of the scroll proportional to its length in the film.
   - The rendered frame eases toward the scroll target, so scrubbing is smooth
     in both directions and stops when it arrives.
   - The titles are HTML copies of the film's HUD, placed in the same 16:9
     frame and switched on the exact frames the film uses.
   - The film's node-based materials are rebuilt here: the MacBook screen steps
     through the four v1 screenshots on the film's frames, the wallpaper is the
     marble artwork, and the table carries the marble panel at the right edge
     of the frame during the opening and closing shots.
   - Guided playback uses the native 1080p/60fps film, with precise queued
     seeking. Lightweight preview images are an explicit error fallback.
     Live 3D retains the original geometry and Full HD picture resolution.
   ========================================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { hardwareResolution } from './hardware-quality.js';
import {canProbeHardware,excellentHardware,createHardwareMonitor,sequencePair,advanceHardwareMotion} from './hardware-adaptive.js';
import {createGuidedFilm} from './hardware-guided-film.js';

const FPS = 60, FIRST = 1, LAST = 2880;
// The film's frame: 16:9 on a 36 mm-wide sensor.
const FILM_ASPECT = 16 / 9;
const MODEL = './assets/pathos-hardware.glb';
const SHOT = '';
const PAGES = ['live-instrument', 'model-study', 'source-data', 'diagnostics'].map(p => `./assets/v1-${p}${SHOT}.webp`);
const MARBLE = './assets/marble.webp';

const section = document.getElementById('prototype');
const track = document.getElementById('hwTrack');
const stage = document.getElementById('hwStage');
const view = document.getElementById('hwView');
const statusEl = document.getElementById('hwStatus');
const tip = document.getElementById('hwTip');
const labelEl = document.getElementById('hwLabel');
const labelCard = labelEl.querySelector('.hw-label-card');
const orbitBtn = document.getElementById('hw360');
const orbitUi = document.getElementById('hwOrbitUi');
const rail = document.getElementById('hwRail');
const scrubEl = document.getElementById('hwScrub');
const frameEl = document.getElementById('hwFrame');
// User scrolling still selects film frames with reduced motion; easing stops.
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = motionQuery.matches;
motionQuery.addEventListener('change', e => {
  reduced = e.matches;
  document.documentElement.classList.toggle('hw-reduced', reduced);
  if (orbit) orbit.enableDamping = !reduced;
  tween = null; dirty = true; wake();
});
document.documentElement.classList.toggle('hw-reduced', reduced);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// The pre-rendered film (laptops and desktops). Every 6th film frame was
// rendered offline from this same scene (?bake, deliverables/hw-bake.cjs) at
// 1600x800 with the 1280x720 film frame in the middle, so it covers any view
// from 1.6:1 to 2.2:1 the way the live render would.
const SEQ = { step: 6, w: 1600, h: 800, fw: 1280, fh: 720, url: k => `./assets/hw-seq/${String(k).padStart(3, '0')}.webp` };
SEQ.n = Math.floor((LAST - FIRST) / SEQ.step) + 1;
// ?bake renders frames for that sequence; nothing else runs.
const bakeQuery = new URLSearchParams(location.search);
const BAKE = bakeQuery.has('bake') ? bakeQuery.get('bake')==='film'
  ? {w:1920,h:1080,s:1,film:true} : { w: SEQ.w, h: SEQ.h, s: 1.5 } : null;
// Guided frames are the safe first view. Live 3D is either explicitly chosen
// or promoted after measuring this exact scene at its intended resolution.
let USE_SEQ = !BAKE;

/* ---------- Film timing (from the Blender file) ---------- */

// "Screen page" value on the MacBook display (constant interpolation).
const pageAt = f => (f >= 2163 && f < 2520 ? 3 : f >= 2092 && f < 2520 ? 2 : f >= 2020 && f < 2520 ? 1 : 0);
// The camera's focal length changes per shot (glTF can't carry lens animation).
const LENS = [[2519, 44], [2249, 43], [1949, 47], [1679, 42], [1499, 72], [1199, 52], [899, 55], [689, 62], [299, 52], [1, 44]];
const lensAt = f => LENS.find(([k]) => f >= k)[1];
// Vertical half-angle tangent for a lens on the film's 36 mm-wide sensor.
const tanHalf = lens => 18 / lens / FILM_ASPECT;
// "Artwork timing": the marble panel on the table, opening and closing shots only.
const artAt = f => (f <= 285 || f >= 2520 ? 1 : 0);

/* ---------- Chapters (from the HTML) ---------- */

const chapters = [...document.querySelectorAll('#hwHud .hw-chapter')].map((el, i) => ({
  el, i,
  shotStart: +el.dataset.shotStart,
  shotEnd: +el.dataset.shotEnd,
  start: +el.dataset.start,      // titles on (0 = this shot has no titles)
  end: +el.dataset.end,          // titles off
}));
document.documentElement.classList.add('hw-js');

// Scroll share per shot: proportional to its length, with a floor so short
// shots still get enough scroll to read their titles.
const weights = chapters.map(c => Math.max(220, c.shotEnd - c.shotStart));
const totalW = weights.reduce((a, b) => a + b, 0);
const cum = weights.reduce((acc, w) => (acc.push(acc[acc.length - 1] + w / totalW), acc), [0]);

function frameAt(p) {
  p = clamp(p, 0, 1);
  let i = 0;
  while (i < chapters.length - 1 && p > cum[i + 1]) i++;
  const u = (p - cum[i]) / (cum[i + 1] - cum[i] || 1);
  const c = chapters[i];
  return clamp(c.shotStart + u * (c.shotEnd - c.shotStart), FIRST, LAST);
}
function progressAt(frame) {
  let i = chapters.findIndex(c => frame >= c.shotStart && frame < c.shotEnd);
  if (i === -1) i = frame < FIRST + 1 ? 0 : chapters.length - 1;
  const c = chapters[i];
  return clamp(cum[i] + ((frame - c.shotStart) / (c.shotEnd - c.shotStart)) * (cum[i + 1] - cum[i]), 0, 1);
}
// The stage pins `top` px below the viewport edge, so the film runs from the
// moment it pins until the moment it releases.
let pinTop = parseFloat(getComputedStyle(stage).top) || 0;
addEventListener('resize', () => { pinTop = parseFloat(getComputedStyle(stage).top) || 0; });
const scrollRange = () => Math.max(1, track.offsetHeight - stage.offsetHeight);
const scrollProgress = () => clamp((pinTop - track.getBoundingClientRect().top) / scrollRange(), 0, 1);
const scrollYForFrame = f => track.getBoundingClientRect().top + scrollY - pinTop + progressAt(f) * scrollRange() + 1;

/* ---------- Rail + scrubber ---------- */

const railButtons = chapters.map(c => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'hw-rail-btn';
  b.innerHTML = `<span class="n">${String(c.i + 1).padStart(2, '0')}</span><span class="l">${c.el.dataset.rail}</span>`;
  b.setAttribute('aria-label', `Chapter ${c.i + 1}: ${c.el.dataset.rail}`);
  b.addEventListener('click', () => {
    selectChapter(c.i);
  });
  rail.appendChild(b);
  return b;
});
const scrub = scrubEl.parentElement;
chapters.slice(1).forEach(c => {
  const t = document.createElement('i');
  t.style.left = (progressAt(c.shotStart) * 100).toFixed(2) + '%';
  scrub.appendChild(t);
});

/* ---------- HUD: frame-accurate titles ---------- */

let shownFrame = -1, activeChapter = -1;
function updateHud(f) {
  // The film evaluates whole frames; so do the titles and the screen.
  const fi = clamp(Math.round(f), FIRST, LAST);
  if (fi === shownFrame) return;
  shownFrame = fi;
  frameEl.textContent = String(fi).padStart(4, '0');
  scrubEl.style.transform = `scaleX(${progressAt(f).toFixed(4)})`;

  for (const c of chapters) {
    const on = c.start > 0 && fi >= c.start && fi < c.end;
    c.el.classList.toggle('is-on', on);
    if (!on) continue;
    // --t: frames since the titles came in; --x: 1 → 0 over the last 3 frames.
    c.el.style.setProperty('--t', Math.min(30, fi - c.start));
    c.el.style.setProperty('--x', clamp((c.end - fi) / 3, 0, 1).toFixed(3));
  }
  // The rail follows the shot.
  const current = chapters.findIndex(c => fi >= c.shotStart && fi < c.shotEnd);
  if (current !== activeChapter && current !== -1) {
    activeChapter = current;
    // A pinned label belongs to its shot; the next shot starts clean.
    if (pinned && mode === 'film') closeLabel();
    railButtons.forEach((b, i) => {
      b.classList.toggle('is-on', i === current);
      b.classList.toggle('is-past', i < current);
      if (i === current) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
  }
}

/* ---------- Film frame: where the 16:9 picture sits in the view ---------- */

// The whole film frame always stays in view (letterboxed by more of the
// table when the view is taller or wider than 16:9). On phones the picture
// is lifted so the titles fit underneath.
const film = { x: 0, y: 0, w: 1, h: 1, zoom: 1, lift: 0, compact: false };
const MAX_TAN = Math.tan(THREE.MathUtils.degToRad(84) / 2);
function layoutFilm(w, h) {
  const aspect = w / h;
  // How much taller the view's field is than the film's (1 when the view is
  // 16:9 or wider). The same for every lens, so the film frame never moves.
  film.zoom = Math.min(MAX_TAN / tanHalf(42), Math.max(1, FILM_ASPECT / aspect));
  const tH = 1, tW = FILM_ASPECT, tV = film.zoom;
  film.w = w * tW / (tV * aspect);
  film.h = h * tH / tV;
  // Too small for the film's own title sizes: stack the titles under the picture.
  film.compact = film.w < 880;
  view.classList.toggle('is-compact', film.compact);
  film.lift = film.compact ? Math.min(h * 0.2, Math.max(0, (h - film.h) / 2 - 8)) : 0;
  film.x = (w - film.w) / 2;
  film.y = (h - film.h) / 2 - film.lift;
  const s = view.style;
  s.setProperty('--fx', film.x.toFixed(1) + 'px');
  s.setProperty('--fy', film.y.toFixed(1) + 'px');
  s.setProperty('--fw', film.w.toFixed(1) + 'px');
  s.setProperty('--fh', film.h.toFixed(1) + 'px');
}
layoutFilm(view.clientWidth || 1, view.clientHeight || 1);

/* ---------- Three.js ---------- */

const stats = { ready: false, frames: 0, drawCalls: 0, triangles: 0, quality: 0, model: MODEL, page: 0, gpu: '', low: false, shadow: 0 };
let renderer, scene, camera, mixer;
let cur = FIRST, tgt = FIRST, visible = false, dirty = true, raf = 0, last = 0;
let motionVelocity=0;
let playback='scroll',manualInteracted=false,manualMode=false,requestedRenderer='guided',loading3D=false,modeReason='Preparing the guided visual…',lastStateEvent=-Infinity;
let glPromise=null,benchmarking=false,benchmarkTicket=0,modeRequest=0,autoConsidered=false,autoTimer=0,contextLost=false;
let lastHardwareInput=performance.now();
const pacing=createHardwareMonitor();
let appliedFrame = NaN, renderWidth = 0, renderHeight = 0, renderRatio = 0, maxRenderDimension = 8192;
const pickables = [];
const actions = [];
// 360 view: 'film' follows the Blender camera; 'orbit' is the visitor's own.
let mode = 'film', orbit = null, orbitCam = null, orbitHome=null,tween = null, tweenCam = null, zoomGoal = 0;
const uFilm = { value: new THREE.Vector4(0, 0, 1, 1) }, uArt = { value: 1 };
let screenMat = null, pageTex = [], shownPage = -1;
let resourceGeneration=0;
const ownedTextures=new Set();
function disposeFailedGL(){
  resourceGeneration++;
  const geometries=new Set(),materials=new Set();
  scene?.traverse(object=>{if(object.geometry)geometries.add(object.geometry);for(const material of [].concat(object.material||[])){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)ownedTextures.add(value);}});
  if(scene?.environment)ownedTextures.add(scene.environment);
  for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
  for(const texture of ownedTextures)texture.dispose();ownedTextures.clear();
  orbit?.dispose();renderer?.domElement.remove();renderer?.dispose();
  renderer=null;scene=null;camera=null;mixer=null;orbit=null;orbitCam=null;screenMat=null;pageTex=[];actions.length=0;pickables.length=0;
  renderWidth=renderHeight=renderRatio=0;stats.gl=false;stats.ready=seqDrawn;contextLost=false;
}

function stateSnapshot(){
  const baked=USE_SEQ&&mode==='film'&&!tween;
  const frame=baked&&guidedFilm&&seqDrawn?guidedFilm.frame:cur;
  return {frame,target:tgt,chapter:activeChapter,visible,rendering:!!raf||!!(guidedFilm&&USE_SEQ&&visible&&playback==='play'),page:baked?pageAt(Math.round(frame)):shownPage,art:baked?artAt(Math.round(frame)):uArt.value,mode,seq:USE_SEQ,tweening:!!tween,label:pinned?LABELS[pinned.obj.name][0]:null,
    rendererMode:USE_SEQ?'guided':'3d',playback,progress:progressAt(frame),modeReason,loading3D,ready:USE_SEQ?seqDrawn:!!stats.gl};
}
function publish(force=false){
  const now=performance.now();if(!force&&now-lastStateEvent<100)return;lastStateEvent=now;
  syncCanvasAccess();
  document.dispatchEvent(new CustomEvent('pathos:hardwarestate',{detail:stateSnapshot()}));
}
function syncCanvasAccess(){
  if(!renderer)return;
  const canvas=renderer.domElement,available=!USE_SEQ&&!contextLost&&visible&&!document.hidden;
  canvas.tabIndex=available?0:-1;canvas.setAttribute('aria-hidden',String(!available));
  canvas.setAttribute('aria-label',mode==='orbit'?'360 degree hardware model. Arrow keys rotate, plus and minus zoom, R resets, Escape returns to the walkthrough.':'Interactive 3D hardware model. Press Enter to open the 360 degree view.');
  if(!available&&document.activeElement===canvas)document.getElementById(USE_SEQ?'hwGuidedTab':'hw3DTab')?.focus({preventScroll:true});
}
function markManual(){manualInteracted=true;benchmarkTicket++;benchmarking=false;clearTimeout(autoTimer);}
function seek(progress,{manual=true}={}){
  motionVelocity=0;
  guidedFilm?.setPlaying(false);
  if(manual)markManual();playback='paused';cur=tgt=frameAt(clamp(Number(progress)||0,0,1));
  if(mode==='orbit')exitOrbit();if(!guidedFilm||!USE_SEQ)updateHud(cur);dirty=true;last=0;pacing.reset();wake();publish(true);
}
function selectChapter(index){
  const c=chapters[clamp(Math.round(Number(index)||0),0,chapters.length-1)];
  const frame=c.start?Math.min(c.start+40,c.end-12):c.shotStart+40;
  seek(progressAt(frame));
  scrollTo({top:scrollYForFrame(frame),behavior:'instant'});
  playback='scroll';
  publish(true);
}
function play(){markManual();motionVelocity=0;if(mode==='orbit')exitOrbit();if(guidedFilm&&USE_SEQ)cur=tgt=guidedFilm.frame;if(cur>=LAST-1){cur=tgt=FIRST;if(USE_SEQ)guidedFilm?.seek(FIRST);}playback='play';last=0;dirty=true;wake();publish(true);}
function pause(){markManual();motionVelocity=0;guidedFilm?.setPlaying(false);if(guidedFilm&&USE_SEQ)cur=guidedFilm.frame;playback='paused';tgt=cur;dirty=true;wake();publish(true);}
function resumeScroll(){markManual();motionVelocity=0;guidedFilm?.setPlaying(false);if(mode==='orbit')exitOrbit();playback='scroll';cur=tgt=frameAt(scrollProgress());if(!guidedFilm)updateHud(cur);dirty=true;last=0;wake();publish(true);}
function resetOrbit(){
  mode='film';tween=null;if(orbit)orbit.enabled=false;
  if(renderer)renderer.domElement.style.touchAction='pan-y';
  stage.classList.remove('is-orbit');orbitBtn.setAttribute('aria-pressed','false');orbitUi.hidden=true;closeLabel();tip.hidden=true;
}
function guided(reason='Guided playback is ready.'){
  motionVelocity=0;guidedFilm?.seek(cur);
  benchmarkTicket++;modeRequest++;benchmarking=false;requestedRenderer='guided';loading3D=false;
  resetOrbit();USE_SEQ=true;modeReason=!seqDrawn&&reason==='Guided playback is ready.'?'Preparing the guided visual…':reason;pacing.reset();last=0;
  if(!seqCanvas)seqStart();
  showLive(false);seqRequest(clamp((cur-FIRST)/SEQ.step,0,SEQ.n-1));
  if(renderer?.domElement.style.visibility!=='visible')releaseDrawBuffer();orbitBtn.hidden=true;
  stats.ready=seqDrawn;dirty=true;wake();publish(true);
}
function activate3D(reason){
  if(!stats.gl||contextLost||renderer?.getContext().isContextLost()||requestedRenderer!=='3d')return;
  if(USE_SEQ&&guidedFilm?.ready)cur=tgt=guidedFilm.frame;
  motionVelocity=0;
  USE_SEQ=false;loading3D=false;modeReason=reason;stats.ready=true;if(visible&&!document.hidden)resize();else releaseDrawBuffer();showLive(true);
  orbitBtn.hidden=false;pacing.reset();last=0;dirty=true;wake();publish(true);
}
async function setRendererMode(value,{manual=true}={}){
  if(value!=='guided'&&value!=='3d')return;
  const request=++modeRequest;
  if(manual){markManual();manualMode=true;}
  if(value==='guided'){guided();return;}
  requestedRenderer='3d';loading3D=true;modeReason='Loading interactive 3D…';publish(true);
  let timer;
  try{
    await Promise.race([startGL(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('3D loading timed out')),45000);})]);
    if(request===modeRequest&&requestedRenderer==='3d')activate3D('Interactive 3D is ready.');
  }catch{if(request===modeRequest)guided('Interactive 3D is unavailable. Guided playback remains available.');}
  finally{clearTimeout(timer);}
}

function considerAuto3D(){
  if(autoConsidered||benchmarking||manualInteracted||manualMode||BAKE||!seqReady||!canProbeHardware({reduced,saveData:navigator.connection?.saveData,coarse:matchMedia('(pointer:coarse)').matches,cores:navigator.hardwareConcurrency,memory:navigator.deviceMemory,width:innerWidth,visible:visible&&!document.hidden}))return;
  clearTimeout(autoTimer);
  const whenQuiet=()=>{
    if(manualInteracted||manualMode||!visible||document.hidden)return;
    const remaining=1500-(performance.now()-lastHardwareInput);
    if(remaining>0){autoTimer=setTimeout(whenQuiet,remaining);return;}
    autoConsidered=true;benchmark3D();
  };
  autoTimer=setTimeout(whenQuiet,1500);
}
async function benchmark3D(){
  const ticket=++benchmarkTicket;benchmarking=true;
  const current=()=>ticket===benchmarkTicket&&!manualInteracted&&!manualMode&&visible&&!document.hidden&&!reduced;
  try{
    await startGL({probe:true});if(!current())return;
    const gl=renderer.getContext();
    if(/swiftshader|llvmpipe|software|microsoft basic/i.test(stats.gpu))return;
    resize();const samples=[];let previous=0;
    for(let index=0;index<52;index++){
      const now=await new Promise(requestAnimationFrame);if(!current())return;
      const startedAt=performance.now();
      apply([150,460,780,1080,1360,1590,1820,2060,2350,2720][index%10]);
      renderer.render(scene,camera);gl.finish();
      const cost=performance.now()-startedAt;
      if(cost>35||(index>=4&&(cost>=14||now-previous>=35))||gl.getError()!==gl.NO_ERROR)return;
      if(index>=4)samples.push({cost,interval:now-previous});previous=now;
    }
    stats.benchmark={samples:samples.length,excellent:excellentHardware(samples)};
    if(current()&&stats.benchmark.excellent){requestedRenderer='3d';activate3D('Interactive 3D enabled after a smooth playback check.');}
  }catch{/* Guided remains the working view when optional probing fails. */}
  finally{
    benchmarking=false;
    if(renderer&&!contextLost){apply(cur);if(USE_SEQ)releaseDrawBuffer();}
    updateHud(guidedFilm?.ready&&USE_SEQ?guidedFilm.frame:cur);dirty=true;wake();publish(true);considerAuto3D();
  }
}

// Parts you can click: [name, what it does]. Keys are node names in the GLB.
const LABELS = {
  ESP32_S3: ['ESP32-S3', 'The controller. Reads every sensor and streams the data over Wi-Fi.'],
  TMP117: ['TMP117 · skin temperature', 'Blood vessels in the hands tighten under stress, so the skin cools slightly.'],
  ADS1115: ['ADS1115 · 16-bit ADC', 'Turns the GSR module\u2019s analog signal into precise numbers for the ESP32.'],
  MPU6050: ['MPU6050 · motion', 'Tells walking from sitting, so movement isn\u2019t mistaken for stress.'],
  MAX30102: ['MAX30102 · heart rate and HRV', 'Not just how fast the heart beats, but how much the gap between beats varies.'],
  BME280: ['BME280 · environment', 'Room temperature, humidity and pressure, so a hot room doesn\u2019t look like a sweaty palm.'],
  GSR_Module: ['GSR module · skin conductance', 'Sweat glands react quickly under stress, sometimes before you notice it yourself.'],
  MicroSD_Breakout: ['microSD · local storage', 'Every session is logged on the device, over its own SPI bus.'],
  Electrode_Leads: ['Finger electrodes', 'Two leads on the fingertips carry skin conductance to the GSR module.'],
  GSR_Analog: ['GSR analog line', 'The raw skin-conductance signal, on its way to the ADS1115.'],
  I2C_SDA: ['I\u00b2C data (SDA)', 'The shared data line for the I\u00b2C sensors.'],
  I2C_SCL: ['I\u00b2C clock (SCL)', 'The shared clock line for the I\u00b2C sensors.'],
  SPI_Wires: ['SPI bus', 'A dedicated bus from the ESP32 to the microSD card.'],
  Power_3V3: ['3.3 V power', 'Feeds every module from the ESP32\u2019s regulator.'],
  Ground: ['Ground', 'The common return for every module.'],
  USB_Cable: ['USB power cable', '5 V from the power bank to the board.'],
  Laptop: ['MacBook · Pathos IoT dashboard', 'Receives the stream over Wi-Fi and runs the v1 software: live view, model study, source data and diagnostics.'],
  PATHOS_ROOT__static: ['The Pathos IoT rig', 'Breadboard, power bank and finger electrodes. The parts budget is under $25.'],
};

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function fail(message) {
  statusEl.textContent = message;
  statusEl.classList.add('is-error');
  stage.classList.add('is-static');
  // Still let the titles follow the scroll over the poster.
  addEventListener('scroll', () => updateHud(frameAt(scrollProgress())), { passive: true });
  updateHud(frameAt(scrollProgress()));
}

function resize() {
  const w = BAKE ? BAKE.w : view.clientWidth, h = BAKE ? BAKE.h : view.clientHeight;
  if (!w || !h) return;
  layoutFilm(w, h);
  if (BAKE) {
    // A view 1600x800 with the film frame 1280x720 in the middle.
    film.zoom = BAKE.film?1:SEQ.h / SEQ.fh; film.w = BAKE.film?BAKE.w:SEQ.fw; film.h = BAKE.film?BAKE.h:SEQ.fh;
    film.x = (w - film.w) / 2; film.y = (h - film.h) / 2; film.lift = 0;
  }
  if (seqCanvas) seqResize(w, h);
  // The renderer exists while the GLB is still loading; its camera does not.
  // Guided layout can resize immediately, but live projection waits for init.
  if (!renderer||!camera) return;
  if(!BAKE&&!benchmarking&&(!visible||document.hidden)){releaseDrawBuffer();return;}
  if(USE_SEQ&&!benchmarking&&!loading3D&&!BAKE){releaseDrawBuffer();return;}
  const resolution = hardwareResolution(w, h, devicePixelRatio || 1, maxRenderDimension, film.w, film.h);
  const ratio = BAKE ? BAKE.s : resolution.ratio;
  // Repeated resize notifications must not reallocate the same GPU buffers.
  if (w !== renderWidth || h !== renderHeight || ratio !== renderRatio) {
    renderWidth = w; renderHeight = h; renderRatio = ratio;
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
  }
  camera.aspect = w / h;
  setLens(lensAt(Math.round(cur)));
  if (film.lift) camera.setViewOffset(w, h, 0, film.lift, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  // Film frame in drawing-buffer pixels, origin bottom-left (gl_FragCoord).
  const k = renderer.getDrawingBufferSize(new THREE.Vector2()).x / w;
  uFilm.value.set(film.x * k, (h - film.y - film.h) * k, film.w * k, film.h * k);
  stats.quality = 1;
  stats.pixelRatio = ratio;
  stats.picturePixels = [Math.floor(film.w * ratio), Math.floor(film.h * ratio)];
  stats.bufferPixels = renderer.domElement.width * renderer.domElement.height;
  dirty = true;
  wake();
}

function showPage(n) {
  if (!screenMat) return;
  if (!pageTex[n]) n = 0;          // a later page still on its way: hold the first
  if (n === shownPage || !pageTex[n]) return;
  shownPage = stats.page = n;
  screenMat.map = pageTex[n];
  screenMat.color.setScalar(0.955); // emission + 4.5% glossy in the film
  screenMat.needsUpdate = true;
}

let shownLens = 0;
function setLens(lens) {
  shownLens = lens;
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanHalf(lens) * film.zoom));
  camera.updateProjectionMatrix();
}

function apply(frame) {
  // Seek every clip to exactly this time. (mixer.setTime can't do this for
  // play-once clips: once one reaches its end three.js pauses it, and a later
  // setTime rewinds it to 0 without advancing, snapping parts to their
  // starting pose.)
  if (frame !== appliedFrame) {
    const t = frame / FPS;
    for (const a of actions) {
      a.enabled = true;
      a.paused = false;
      a.time = Math.min(t, a.getClip().duration);
    }
    mixer.update(0);
    appliedFrame = frame;
    // A camera orbit changes no caster geometry, so reuse its full-resolution
    // shadow. Film motion explicitly invalidates it when the pose changes.
    renderer.shadowMap.needsUpdate = true;
  }
  const fi = Math.round(frame);
  if (lensAt(fi) !== shownLens) setLens(lensAt(fi));
  showPage(pageAt(fi));
  uArt.value = artAt(fi);
  if(!benchmarking)updateHud(frame);
}

/* ---------- 360 view ---------- */

const v3 = new THREE.Vector3(), q4 = new THREE.Quaternion();
function syncProjection(c) {
  c.fov = camera.fov; c.aspect = camera.aspect; c.near = camera.near; c.far = camera.far;
  if (camera.view && camera.view.enabled) {
    const v = camera.view;
    c.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX, v.offsetY, v.width, v.height);
  } else c.clearViewOffset();
  c.updateProjectionMatrix();
}
function filmPose() {
  camera.updateWorldMatrix(true, false);
  return { p: camera.getWorldPosition(new THREE.Vector3()), q: camera.getWorldQuaternion(new THREE.Quaternion()) };
}
const easeInOut = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
function startTween(from, to, done) {
  tweenCam = tweenCam || new THREE.PerspectiveCamera();
  tween = { from, to, t: reduced ? 1 : 0, done };
}
function stepTween(dt) {
  if (!tween) return false;
  tween.t = Math.min(1, tween.t + dt / 0.65);
  const k = easeInOut(tween.t), to = tween.to();
  syncProjection(tweenCam);
  tweenCam.position.lerpVectors(tween.from.p, to.p, k);
  tweenCam.quaternion.slerpQuaternions(tween.from.q, to.q, k);
  if (tween.t >= 1) { const d = tween.done; tween = null; d && d(); }
  return true;
}
const activeCam = () => (tween ? tweenCam : mode === 'orbit' ? orbitCam : camera);

function enterOrbit() {
  if (mode === 'orbit' || !orbit) return;
  markManual();playback='paused';tgt=cur;
  closeLabel();
  const from = filmPose();
  // Start the orbit exactly where the film camera is, looking at the same
  // point (the camera's focus target), so nothing jumps.
  syncProjection(orbitCam);
  orbitCam.position.copy(from.p);
  orbitCam.quaternion.copy(from.q);
  const focus = scene.getObjectByName('Camera_Focus');
  const dist = focus ? focus.getWorldPosition(v3).distanceTo(from.p) : 0.5;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(from.q);
  orbit.target.copy(from.p).addScaledVector(fwd, clamp(dist, orbit.minDistance, orbit.maxDistance));
  orbit.update();
  zoomGoal = orbitCam.position.distanceTo(orbit.target);
  orbitHome={position:orbitCam.position.clone(),target:orbit.target.clone()};
  const to = { p: orbitCam.position.clone(), q: orbitCam.quaternion.clone() };
  mode = 'orbit';
  orbit.enabled = true;
  renderer.domElement.style.touchAction = 'none';
  stage.classList.add('is-orbit');
  orbitBtn.setAttribute('aria-pressed', 'true');
  orbitUi.hidden = false;
  startTween(from, () => to);
  wake();publish(true);
}
function exitOrbit() {
  if (mode !== 'orbit') return;
  closeLabel();
  const from = { p: orbitCam.position.clone(), q: orbitCam.quaternion.clone() };
  mode = 'film';
  orbit.enabled = false;
  renderer.domElement.style.touchAction = 'pan-y';
  stage.classList.remove('is-orbit');
  orbitBtn.setAttribute('aria-pressed', 'false');
  orbitUi.hidden = true;
  // Glide back to wherever the film camera is now.
  startTween(from, filmPose);
  wake();publish(true);
}

/* ---------- Click labels ---------- */

let pinned = null;   // { obj, local: Vector3 }
function closeLabel() {
  if (!pinned) return;
  pinned = null;
  labelEl.hidden = true;
}
function placeLabel() {
  if (!pinned) return;
  const cam = activeCam();
  v3.copy(pinned.local);
  pinned.obj.localToWorld(v3);
  v3.project(cam);
  const w = view.clientWidth, h = view.clientHeight;
  const x = (v3.x * 0.5 + 0.5) * w, y = (-v3.y * 0.5 + 0.5) * h;
  const off = v3.z > 1 || x < 0 || x > w || y < 0 || y > h;
  labelEl.classList.toggle('is-off', off);
  labelEl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  // Keep the card inside the view: beside the dot when it fits, otherwise
  // slid along the edge; below the dot unless that runs off the bottom.
  const cw = labelCard.offsetWidth, ch = labelCard.offsetHeight, m = 8;
  let cx = x + 16;
  if (cx + cw > w - m) cx = x - 16 - cw;
  if (cx < m) cx = clamp(x - cw / 2, m, Math.max(m, w - m - cw));
  let cy = y + 14;
  if (cy + ch > h - m) cy = y - 14 - ch;
  if (cy < m) cy = m;
  labelCard.style.left = (cx - x).toFixed(1) + 'px';
  labelCard.style.top = (cy - y).toFixed(1) + 'px';
}
function labelFor(obj) {
  for (let o = obj; o; o = o.parent) if (LABELS[o.name]) return o;
  return null;
}

function render(now) {
  raf = 0;
  if (!visible || document.hidden) return;
  const interval=last?now-last:0;
  const dt = Math.min(0.1, interval / 1000);
  last = now;

  if(playback==='play'&&mode==='film'&&(!guidedFilm||!USE_SEQ)){
    tgt=Math.min(LAST,tgt+dt*FPS);
    if(tgt===LAST){playback='paused';publish(true);}
  }else if (playback==='scroll') tgt = frameAt(scrollProgress());
  const movement=advanceHardwareMotion(cur,motionVelocity,tgt,dt,reduced);
  cur=clamp(movement.frame,FIRST,LAST);motionVelocity=cur===movement.frame?movement.velocity:0;
  let moving = cur !== tgt||(playback==='play'&&(!guidedFilm||!USE_SEQ));
  if (mode === 'orbit' && orbit) {
    syncProjection(orbitCam);
    // Zoom buttons ease the distance; damping keeps every move gentle.
    const off = v3.subVectors(orbitCam.position, orbit.target), d = off.length();
    if (Math.abs(zoomGoal - d) > 1e-4) {
      off.setLength(d + (zoomGoal - d) * (1 - Math.exp(-dt * 9)));
      orbitCam.position.copy(orbit.target).add(off);
      moving = true;
    }
    if (orbit.update()) moving = true;
  }
  if (stepTween(dt)) moving = true;
  // With the pre-rendered film, the live scene only draws in the 360 view and
  // while gliding into or out of it.
  const live = !!renderer&&!contextLost&&!USE_SEQ;
  showLive(live);

  if ((moving || dirty) && !live) {
    if(!guidedFilm)updateHud(cur);
    drawSeq(cur);
    // A pinned label follows its part: pose the (undrawn) scene to match.
    if (pinned && mixer) { apply(cur); placeLabel(); }
    dirty = false;
  } else if (moving || dirty) {
    const startedAt=performance.now();
    apply(cur);
    placeLabel();
    renderer.render(scene, activeCam());
    stats.frames++;
    stats.drawCalls = renderer.info.render.calls;
    stats.triangles = renderer.info.render.triangles;
    dirty = false;
    if(!BAKE&&interval&&pacing.sample(now,interval,performance.now()-startedAt)){
      autoConsidered=true;guided('Switched to Guided to keep playback smooth.');
    }
  }
  publish();
  if (moving&&!raf) raf = requestAnimationFrame(render);
  else {last = 0;pacing.reset();publish(true);}
}
function wake() { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(render); }
function releaseDrawBuffer() {
  if (!renderer || BAKE || contextLost) return;
  // Keep the model for instant return, but surrender large color/depth/MSAA
  // buffers while nobody can see the study. CSS size stays unchanged.
  renderer.setSize(1, 1, false);
  renderWidth = renderHeight = renderRatio = 0;
  stats.bufferPixels = renderer.domElement.width * renderer.domElement.height;
  scene?.traverse(object=>{if(object.shadow?.map){object.shadow.map.dispose();object.shadow.map=null;}if(object.shadow?.mapPass){object.shadow.mapPass.dispose();object.shadow.mapPass=null;}});
  renderer.shadowMap.needsUpdate=true;
}
document.addEventListener('visibilitychange', () => {
  guidedFilm?.setActive(!document.hidden&&visible&&USE_SEQ);
  if (document.hidden) {
    if (raf) cancelAnimationFrame(raf);
    raf = 0; last = 0;
    benchmarkTicket++;benchmarking=false;releaseDrawBuffer();pacing.reset();suspendSequence();last=0;
  } else {
    if (visible && renderer && !renderWidth&&!USE_SEQ) resize();
    dirty = true; wake(); seqPump();considerAuto3D();
  }
  publish(true);
});

/* ---------- Pre-rendered film ---------- */

let seqCanvas = null, seqCtx = null, seqReady = false,seqDrawn=false, seqDpr = 1, seqKey = '', liveShown = null;
let guidedFilm=null;
// Never preload the whole film: keep six decoded images on phones or ten on
// desktop, with three in-flight requests. Obsolete bitmaps are explicitly closed.
const smallSequence=matchMedia('(max-width:640px)').matches;
const SEQ_CACHE_LIMIT = smallSequence?6:10, SEQ_CONCURRENCY = 3,SEQ_PREFETCH=smallSequence?2:3;
const seqImgs = new Map(), seqPending = new Map(), seqErrors = new Map();
let seqWanted = [], seqCenter = -1, seqLoaded = 0, seqFailures = 0;
let pickAt = null;
function suspendSequence(){
  for(const controller of seqPending.values())controller.abort();
  for(const [index,bitmap] of seqImgs)if(Math.abs(index-seqCenter)>1){bitmap.close?.();seqImgs.delete(index);}
  stats.seqCached=seqImgs.size;
}

function seqRemember(k, bitmap) {
  seqImgs.set(k, bitmap);
  while (seqImgs.size > SEQ_CACHE_LIMIT) {
    let victim = -1, distance = -1;
    for (const n of seqImgs.keys()) {
      if (Math.abs(n - seqCenter) > distance) { victim = n; distance = Math.abs(n - seqCenter); }
    }
    seqImgs.get(victim)?.close?.();
    seqImgs.delete(victim);
  }
  stats.seqCached = seqImgs.size;
}
function seqRequest(u) {
  const center = clamp(Math.round(u), 0, SEQ.n - 1);
  if (center === seqCenter && seqWanted.length) { seqPump(); return; }
  seqCenter = center;
  // Required blend pair first; a short, nearby window follows. No background
  // sweep downloads the remainder of the film.
  const wanted = [Math.floor(u), Math.ceil(u), center];
  for (let d = 1; d <= SEQ_PREFETCH; d++) wanted.push(center + d, center - d);
  seqWanted = [...new Set(wanted)].filter(k => k >= 0 && k < SEQ.n);
  for (const [k, controller] of seqPending) if (Math.abs(k - center) > 8) controller.abort();
  seqPump();
}
function seqPump() {
  if(guidedFilm)return;
  if (!USE_SEQ || document.hidden || (!visible && seqReady)) return;
  for (const k of seqWanted) {
    if (seqPending.size >= SEQ_CONCURRENCY) break;
    if (seqImgs.has(k) || seqPending.has(k) || (seqErrors.has(k) && seqErrors.get(k) > performance.now() - 10000)) continue;
    const controller = new AbortController();
    seqPending.set(k, controller);
    stats.seqPending = seqPending.size;
    fetch(SEQ.url(k), { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`Frame ${k}: ${response.status}`);
        return response.blob();
      })
      .then(blob => createImageBitmap(blob))
      .then(bitmap => {
        if (controller.signal.aborted || Math.abs(k - seqCenter) > 8 || !USE_SEQ) { bitmap.close(); return; }
        seqRemember(k, bitmap);
        stats.seqLoaded = ++seqLoaded;
        if (!seqReady)seqReady=true;
        considerAuto3D();
        seqKey = ''; dirty = true; wake();
      })
      .catch(error => {
        if (error.name === 'AbortError' || controller.signal.aborted) return;
        seqErrors.set(k, performance.now());
        if (++seqFailures >= 3 && !seqReady) seqFail();
      })
      .finally(() => {
        seqPending.delete(k); stats.seqPending = seqPending.size;
        seqPump();
      });
  }
}

function seqResize(w, h) {
  if (!seqCanvas) return;
  seqDpr = Math.min(devicePixelRatio || 1, 2);
  const width=Math.round(w*seqDpr),height=Math.round(h*seqDpr);
  if(seqCanvas.width===width&&seqCanvas.height===height)return;
  seqCanvas.width=width;seqCanvas.height=height;seqDrawn=false;
  if(USE_SEQ){stats.ready=false;stage.classList.remove('is-ready');}
  seqKey = ''; dirty = true; wake();
  guidedFilm?.redraw();
}
// Draws the two samples either side of frame f, blended, with the image's
// film frame on the view's film frame; edges feather into the backdrop.
function drawSeq(f) {
  if (!seqCtx) return;
  if(guidedFilm){guidedFilm.setPlaying(playback==='play');if(playback!=='play')guidedFilm.seek(f);return;}
  const u = clamp((f - FIRST) / SEQ.step, 0, SEQ.n - 1);
  seqRequest(u);
  const pair=sequencePair(f,seqImgs.keys(),chapters.slice(1).map(chapter=>chapter.shotStart),FIRST,SEQ.step);
  if(!pair)return;
  const {lo,hi,alpha:a}=pair;
  const key = `${lo}:${hi}:${a.toFixed(3)}:${seqCanvas.width}x${seqCanvas.height}`;
  if (key === seqKey) return;
  seqKey = key;
  const c = seqCtx, W = seqCanvas.width, H = seqCanvas.height, d = seqDpr;
  const k = (film.w / SEQ.fw) * d;
  const iw = SEQ.w * k, ih = SEQ.h * k;
  const ix = film.x * d - ((SEQ.w - SEQ.fw) / 2) * k, iy = film.y * d - ((SEQ.h - SEQ.fh) / 2) * k;
  c.globalAlpha = 1;
  c.fillStyle = '#060607';
  c.fillRect(0, 0, W, H);
  c.drawImage(seqImgs.get(lo), ix, iy, iw, ih);
  if (a > 0.004) { c.globalAlpha = a; c.drawImage(seqImgs.get(hi), ix, iy, iw, ih); c.globalAlpha = 1; }
  const e = 40 * k;
  const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(6,6,7,1)'); g.addColorStop(1, 'rgba(6,6,7,0)');
    c.fillStyle = g; c.fillRect(rx, ry, rw, rh);
  };
  if (ix > 0) edge(ix, 0, ix + e, 0, ix, iy, e, ih);
  if (ix + iw < W) edge(ix + iw, 0, ix + iw - e, 0, ix + iw - e, iy, e, ih);
  if (iy > 0) edge(0, iy, 0, iy + e, ix, iy, iw, e);
  if (iy + ih < H) edge(0, iy + ih, 0, iy + ih - e, ix, iy + ih - e, iw, e);
  if(!seqDrawn){seqDrawn=true;stats.ready=true;if(modeReason==='Preparing the guided visual…')modeReason='Guided playback is ready.';stage.classList.remove('is-static');stage.classList.add('is-ready');statusEl.hidden=true;publish(true);}
}
function showLive(on) {
  if(on)guidedFilm?.setPlaying(false);
  guidedFilm?.setActive(!on&&visible&&!document.hidden);
  if (on === liveShown) return;
  // A switch back to Guided can need one decode. Hold the last native
  // picture until that frame arrives instead of flashing an older pose.
  const holdNative=!on&&liveShown===true&&guidedFilm?.ready&&!contextLost&&Math.abs(guidedFilm.frame-cur)>1;
  liveShown = on;
  if (renderer) renderer.domElement.style.visibility = on||holdNative ? 'visible' : 'hidden';
  if (seqCanvas) seqCanvas.style.visibility = on||guidedFilm ? 'hidden' : 'visible';
  seqKey = ''; dirty = true;
}
// The live scene, built only when someone asks for it: a click on the
// picture (labels, then part names on hover) or the 360 view.
function startGL({probe=false}={}) {
  if(stats.gl&&!contextLost)return Promise.resolve();
  if(glPromise)return glPromise;
  if(contextLost)return Promise.reject(new Error('3D context is unavailable'));
  glPromise=init({probe}).catch(error=>{
    console.warn('Pathos 3D unavailable:',error.message);
    disposeFailedGL();throw error;
  }).finally(()=>{glPromise=null;});
  return glPromise;
}
function seqFail() {
  if (!USE_SEQ || seqReady) return;
  modeReason='Guided frames could not load. The still remains available; retry a chapter or choose 3D.';
  statusEl.textContent=modeReason;statusEl.hidden=false;stage.classList.add('is-static');publish(true);
}
function seqStart() {
  if(seqCanvas)return;
  seqCanvas = document.createElement('canvas');
  seqCanvas.className = 'hw-seq';
  seqCanvas.setAttribute('aria-hidden', 'true');
  view.prepend(seqCanvas);
  seqCtx = seqCanvas.getContext('2d', { alpha: false });
  if(!seqCtx){seqFail();return;}
  resize();
  new ResizeObserver(resize).observe(view);
  const initialFrame=playback==='scroll'?frameAt(scrollProgress()):cur;
  guidedFilm=createGuidedFilm({host:view,url:'./assets/hardware/rig-1080p60.mp4?v=1',
    onReady:dimensions=>{seqReady=true;seqCanvas.style.visibility='hidden';stats.guidedSource='native-film';stats.guidedPixels=[dimensions.width,dimensions.height];stats.seqCached=0;stats.seqPending=0;considerAuto3D();},
    onFrame:(frame,video)=>{
      if(!USE_SEQ||!seqCtx)return;
      if(renderer&&renderer.domElement.style.visibility!=='hidden'){renderer.domElement.style.visibility='hidden';if(!benchmarking)releaseDrawBuffer();}
      stats.presentedFrame=frame;stats.presentations=(stats.presentations||0)+1;
      const previousChapter=activeChapter,becameReady=!seqDrawn;
      updateHud(frame);if(playback==='play'){cur=tgt=frame;motionVelocity=0;}
      if(!seqDrawn){seqDrawn=true;stats.ready=true;modeReason='Guided playback is ready.';stage.classList.remove('is-static');stage.classList.add('is-ready');statusEl.hidden=true;}
      publish(becameReady||previousChapter!==activeChapter||(!raf&&playback!=='play'));
    },
    onError:()=>{guidedFilm=null;if(USE_SEQ&&renderer){renderer.domElement.style.visibility='hidden';if(!benchmarking)releaseDrawBuffer();}seqReady=false;seqDrawn=false;stats.ready=false;seqCanvas.style.visibility='visible';stage.classList.remove('is-ready');stats.guidedSource='preview';modeReason='The Full HD film could not load. Showing the lightweight preview.';seqRequest(clamp((cur-FIRST)/SEQ.step,0,SEQ.n-1));dirty=true;wake();publish(true);},
    onBuffering:loading=>{if(loading&&visible&&USE_SEQ){statusEl.textContent='Loading the next part of the walkthrough…';statusEl.hidden=false;}else if(seqDrawn)statusEl.hidden=true;},
    onEnded:()=>{playback='paused';tgt=cur;publish(true);}
  });
  guidedFilm.seek(initialFrame);
  new IntersectionObserver(entries => {
    visible = entries[entries.length - 1].isIntersecting;
    guidedFilm?.setActive(visible&&!document.hidden&&USE_SEQ);
    if (visible) {if(renderer&&!USE_SEQ&&!renderWidth)resize();dirty = true; wake(); seqPump();considerAuto3D(); }
    else {benchmarkTicket++;benchmarking=false;if(mode==='orbit'){exitOrbit();tween=null;}releaseDrawBuffer();pacing.reset();suspendSequence();last=0;}
    publish(true);
  }, { rootMargin: '120px 0px' }).observe(stage);
  addEventListener('scroll', () => {
    lastHardwareInput=performance.now();
    if(benchmarking){benchmarkTicket++;autoConsidered=false;}
    if (!visible) {
      const r = stage.getBoundingClientRect();
      if (r.bottom > -120 && r.top < innerHeight + 120) { visible = true; dirty = true; }
    }
    if(playback==='scroll'){dirty=true;wake();}
  }, { passive: true });
  orbitBtn.hidden=USE_SEQ;
}
orbitBtn.addEventListener('click', () => {
  if (!stats.gl||USE_SEQ) {setRendererMode('3d').then(()=>{if(!USE_SEQ)enterOrbit();});return;}
  mode === 'orbit' ? exitOrbit() : enterOrbit();
});

const texLoader = new THREE.TextureLoader();
function loadTexture(url, { flipY = false, wrap = THREE.ClampToEdgeWrapping } = {}) {
  const generation=resourceGeneration;
  return texLoader.loadAsync(url).then(t => {
    if(generation!==resourceGeneration){t.dispose();throw new Error('Obsolete texture load');}ownedTextures.add(t);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = flipY;
    t.wrapS = t.wrapT = wrap;
    t.anisotropy = renderer ? Math.min(16, renderer.capabilities.getMaxAnisotropy()) : 1;
    return t;
  });
}

// Light from the film's five disc area lights: position (Blender, Z up),
// aim direction, power in watts, colour.
const LIGHTS = [
  { name: 'Neutral overhead softbox', p: [-0.11, -0.07, 0.38], d: [0.271, 0.222, -0.937], w: 3.05, c: [1, 0.975, 0.94], shadow: true },
  { name: 'Warm edge reflector', p: [0.27, 0, 0.22], d: [-0.795, 0.147, -0.589], w: 1.0, c: [1, 0.94, 0.83] },
  { name: 'Soft front fill', p: [-0.18, -0.25, 0.14], d: [0.538, 0.777, -0.329], w: 0.79, c: [0.87, 0.925, 1] },
  { name: 'Display lid rim', p: [0.04, 0.48, 0.3], d: [0.119, -0.559, -0.82], w: 1.15, c: [0.88, 0.94, 1] },
  { name: 'Edge strip', p: [0.08, 0.3, 0.25], d: [-0.229, -0.716, -0.659], w: 0.95, c: [1, 0.85, 0.8] },
];
const LIGHT_SCALE = window.__hwTune?.light ?? 0.8;

const shadowSize = 2048;
const yUp = ([x, y, z]) => new THREE.Vector3(x, z, -y);

async function init({probe=false}={}) {
  if (!window.WebGLRenderingContext) throw new Error('WebGL unavailable');
  try {
    // Keep fine wires, pin rows and engraved geometry clean on every display.
    // The existing pixel ceiling and offscreen release bound buffer memory.
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (e) { throw new Error('WebGL unavailable'); }
  const owner=renderer;
  // Context loss can happen during network loading or shader compilation,
  // before the model supplies a camera. Observe it from the first allocation.
  owner.domElement.addEventListener('webglcontextlost',event=>{
    event.preventDefault();if(renderer!==owner)return;
    contextLost=true;autoConsidered=true;guided('Switched to Guided because interactive 3D became unavailable.');
  });
  owner.domElement.addEventListener('webglcontextrestored',()=>{
    if(renderer!==owner)return;
    contextLost=false;owner.shadowMap.needsUpdate=true;releaseDrawBuffer();dirty=true;wake();publish(true);
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stats.shadow = shadowSize;
  // The film is graded with AgX at -0.12 EV.
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = Math.pow(2, -0.12);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  const context = renderer.getContext();
  stats.antialias = context.getContextAttributes().antialias;
  maxRenderDimension = context.getParameter(context.MAX_RENDERBUFFER_SIZE);
  // Inspect the actual renderer, without allocating a second probe context.
  const gpuInfo = context.getExtension('WEBGL_debug_renderer_info');
  stats.gpu = String(context.getParameter(gpuInfo ? gpuInfo.UNMASKED_RENDERER_WEBGL : context.RENDERER));
  if(probe&&/swiftshader|llvmpipe|software|microsoft basic/i.test(stats.gpu))throw new Error('Automatic 3D requires an accelerated renderer');
  renderer.setClearColor(0x060607, 1);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment(renderer);
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environmentIntensity = 0.22;

  for (const L of LIGHTS) {
    const pos = yUp(L.p), dir = yUp(L.d).normalize();
    const s = new THREE.SpotLight(new THREE.Color().setRGB(...L.c, THREE.LinearSRGBColorSpace), (L.w / Math.PI) * LIGHT_SCALE, 0, 1.3, 1, 2);
    s.name = L.name;
    s.position.copy(pos);
    s.target.position.copy(pos).addScaledVector(dir, 0.4);
    if (L.shadow) {
      s.castShadow = true;
      s.shadow.mapSize.set(shadowSize, shadowSize);
      s.shadow.camera.near = 0.05; s.shadow.camera.far = 2;
      s.shadow.focus = 0.62;
      s.shadow.bias = -0.0003; s.shadow.normalBias = 0.0015; s.shadow.radius = 5;
    }
    scene.add(s, s.target);
  }

  const draco = new DRACOLoader();
  draco.setWorkerLimit(2);
  draco.setDecoderPath('./assets/vendor/draco/');
  draco.setDecoderConfig({ type: 'wasm' });
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  // Model, first screenshot and the marble artwork load together.
  const assets = await Promise.allSettled([
    loader.loadAsync(MODEL, e => {
      if (e.total&&loading3D) modeReason = `Loading interactive 3D · ${Math.round((e.loaded / e.total) * 100)}%`;
    }),
    loadTexture(PAGES[0]),
    loadTexture(MARBLE),
    loadTexture(MARBLE, { flipY: true, wrap: THREE.MirroredRepeatWrapping }),
  ]);
  draco.dispose();
  // Wait for every sibling request before disposing a failed load; otherwise
  // a late texture completion can leak into the next renderer generation.
  const failedAsset=assets.find(result=>result.status==='rejected');
  if(failedAsset){const model=assets[0];if(model.status==='fulfilled')scene.add(model.value.scene);throw failedAsset.reason;}
  const [gltf,page0,marbleUV,marbleWin]=assets.map(result=>result.value);
  pageTex[0] = page0;

  scene.add(gltf.scene);
  if(renderer!==owner||contextLost||context.isContextLost())throw new Error('3D context was lost during loading');
  if(probe&&requestedRenderer!=='3d'&&(manualInteracted||document.hidden||!visible||performance.now()-lastHardwareInput<1500))throw new Error('Automatic 3D check cancelled');
  camera = gltf.cameras[0];
  if (!camera) throw new Error('Model has no camera');
  camera.near = 0.004; camera.far = 20;

  // MacBook wallpaper: the marble, with the film's mapping (u' = 0.865u + 0.067).
  marbleUV.repeat.set(0.8653846, 1);
  marbleUV.offset.set(0.0673077, 0);
  const wallpaper = new THREE.MeshBasicMaterial({ map: marbleUV, name: 'MacBook wallpaper' });
  screenMat = new THREE.MeshBasicMaterial({ color: 0x000000, name: 'PATHOS dashboard window' });

  // The table: near-black matte, with the marble panel in screen space at the
  // right of the frame (window x > 0.82, sampled at x - 0.107) while it's on.
  // The film's world is near black, so the table reflects only the lights.
  const T = window.__hwTune || {};
  const table = new THREE.MeshPhysicalMaterial({ name: 'Natural matte black tabletop', roughness: T.rough ?? 0.7, metalness: 0, specularIntensity: T.spec ?? 0.3, envMapIntensity: 0.05 });
  table.color.setRGB(0.0032, 0.0032, 0.0032, THREE.LinearSRGBColorSpace);
  table.onBeforeCompile = sh => {
    sh.uniforms.uMarble = { value: marbleWin };
    sh.uniforms.uFilm = uFilm;
    sh.uniforms.uArt = uArt;
    sh.fragmentShader = 'uniform sampler2D uMarble;\nuniform vec4 uFilm;\nuniform float uArt;\n' +
      sh.fragmentShader.replace('#include <opaque_fragment>', `
        vec2 wc = (gl_FragCoord.xy - uFilm.xy) / uFilm.zw;
        float px = 0.75 / uFilm.z;
        float art = uArt * smoothstep(0.82 - px, 0.82 + px, wc.x);
        if (art > 0.0) outgoingLight = mix(outgoingLight, texture2D(uMarble, vec2(wc.x - 0.107, wc.y)).rgb * 0.85, art);
        #include <opaque_fragment>`);
  };

  const glow = glowTexture();
  const found = { screen: false, wallpaper: false, table: false };
  gltf.scene.traverse(o => {
    if (LABELS[o.name]) pickables.push({ obj: o, label: LABELS[o.name] });
    if (!o.isMesh) return;
    // GLTFLoader turns spaces in node names into underscores; compare without them.
    const key = o.name.replace(/[\s_]+/g, ' ').trim();
    if (key === 'PATHOS dashboard • inset rounded window') { o.material = screenMat; found.screen = true; }
    else if (key === 'Liquid Retina active display') { o.material = wallpaper; found.wallpaper = true; }
    else if (key === 'Dark studio sweep') { o.material = table; found.table = true; }
    // Dark glossy parts (display glass, the notch, keys, epoxy) would mirror the
    // bright studio environment; in the film they only mirror a near-black world.
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m.isMeshStandardMaterial || m.userData.env) continue;
      m.userData.env = true;
      // Brushed-metal anisotropy needs mesh tangents the export doesn't carry;
      // without them it blows out to white, so render those parts isotropic.
      if (m.anisotropy) { m.anisotropy = 0; m.anisotropyMap = null; }
      if (/black|glass|epoxy|lens/i.test(m.name) && !/Midnight/.test(m.name)) m.envMapIntensity = 0.15;
      // Bare metals (RF shield, pins, solder) mirror the lights, not a bright room.
      else if (/shield|nickel|tin|solder|Brushed|springs/i.test(m.name)) m.envMapIntensity = window.__hwTune?.metal ?? 0.35;
    }
    const fx = /^(DataPulse__|WiFi_packet_|Highlight__)/.test(o.name);
    // Shape-keyed wires would need their morphs recomputed in the shadow pass too; skip them.
    o.castShadow = !fx && !o.morphTargetInfluences && o.material !== table && o.material !== screenMat && o.material !== wallpaper;
    o.receiveShadow = !fx && o.material !== screenMat && o.material !== wallpaper;
    o.frustumCulled = !o.morphTargetInfluences;
    // Soft additive halo on travelling pulses and Wi-Fi packets.
    if (/^(DataPulse__|WiFi_packet_)/.test(o.name)) {
      o.geometry.computeBoundingSphere();
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glow, color: mat.emissive || mat.color, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8,
      }));
      const r = o.geometry.boundingSphere.radius * 7;
      s.scale.set(r, r, r);
      s.position.copy(o.geometry.boundingSphere.center);
      o.add(s);
    }
  });
  stats.materials = found;
  if (!found.screen || !found.wallpaper || !found.table) console.warn('PATHOS 3D: film materials not found', found);

  mixer = new THREE.AnimationMixer(gltf.scene);
  for (const clip of gltf.animations) {
    const a = mixer.clipAction(clip);
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.play();
    actions.push(a);
  }

  view.appendChild(renderer.domElement);
  if (USE_SEQ) { liveShown = null; showLive(false); }
  resize();
  // Warm the GPU: compile shaders and upload geometry before the first scroll frame.
  apply(cur);
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  else renderer.compile(scene, camera);
  if(renderer!==owner||contextLost||context.isContextLost())throw new Error('3D context was lost during compilation');
  if(BAKE)cur = tgt = frameAt(scrollProgress());
  apply(cur);
  if(BAKE||((!USE_SEQ||benchmarking||loading3D)&&visible&&!document.hidden))renderer.render(scene, camera);
  stats.ready = USE_SEQ?seqDrawn:true;
  if(stats.ready){stage.classList.add('is-ready');statusEl.hidden = true;}

  // The other three screenshots arrive in the background, well before the
  // laptop shot; the screen holds the first page until they do.
  PAGES.slice(1).forEach((url, i) => loadTexture(url).then(t => {
    pageTex[i + 1] = t;
    renderer.initTexture(t);
    shownPage = -1; dirty = true; wake();
  }).catch(() => {}));

  // Pointer. In the film nothing but scroll moves the picture: a click
  // labels the part under it, hovering names it. The 360 view is the only
  // mode in which dragging moves the camera.
  const canvas = renderer.domElement;
  canvas.style.touchAction = 'pan-y';
  canvas.tabIndex=-1;canvas.setAttribute('role','group');
  const keyboardHint=stage.querySelector('.hw-orbit-hint');
  if(keyboardHint){keyboardHint.id='hwModelKeyboardHelp';keyboardHint.textContent='Drag or use arrow keys to look around · + / − zoom · R resets · Escape returns · tap a part to label it';canvas.setAttribute('aria-describedby',keyboardHint.id);}
  // The mouse wheel always scrolls the page (trackpad pinch, sent as
  // ctrl+wheel, still zooms in the 360 view). Registered before the
  // controls so it runs first.
  canvas.addEventListener('wheel', e => { if (!e.ctrlKey || mode !== 'orbit') e.stopImmediatePropagation(); }, { passive: true });
  orbitCam = new THREE.PerspectiveCamera();
  orbit = new OrbitControls(orbitCam, canvas);
  orbit.enabled = false;
  orbit.enableDamping = !reduced;
  orbit.dampingFactor = 0.07;
  orbit.rotateSpeed = 0.35;
  orbit.zoomSpeed = 0.6;
  orbit.enablePan = false;
  orbit.minDistance = 0.14;
  orbit.maxDistance = 1.5;
  orbit.minPolarAngle = 0.12;
  orbit.maxPolarAngle = Math.PI / 2 - 0.06;   // stay above the table
  canvas.style.touchAction = 'pan-y';         // OrbitControls sets 'none'; only the 360 view needs it
  orbit.addEventListener('change', wake);
  const keyOffset=new THREE.Vector3(),keySphere=new THREE.Spherical();
  canvas.addEventListener('keydown',event=>{
    if(document.activeElement!==canvas||USE_SEQ||contextLost||!visible||event.altKey||event.ctrlKey||event.metaKey)return;
    if(mode!=='orbit'){
      if(event.key==='Enter'||event.key===' '){event.preventDefault();enterOrbit();}
      return;
    }
    if(event.key==='Escape'){event.preventDefault();exitOrbit();orbitBtn.focus({preventScroll:true});return;}
    const key=event.key.toLowerCase();
    if(!['arrowleft','arrowright','arrowup','arrowdown','+','=','-','_','r'].includes(key))return;
    event.preventDefault();markManual();tween=null;
    const damping=orbit.enableDamping;orbit.enableDamping=false;orbit.update();
    if(key==='r'&&orbitHome){orbit.target.copy(orbitHome.target);orbitCam.position.copy(orbitHome.position);}
    else{
      keyOffset.subVectors(orbitCam.position,orbit.target);keySphere.setFromVector3(keyOffset);
      if(key==='arrowleft')keySphere.theta-=.12;
      if(key==='arrowright')keySphere.theta+=.12;
      if(key==='arrowup')keySphere.phi-=.1;
      if(key==='arrowdown')keySphere.phi+=.1;
      if(key==='+'||key==='=')keySphere.radius*=.8;
      if(key==='-'||key==='_')keySphere.radius*=1.25;
      keySphere.phi=clamp(keySphere.phi,orbit.minPolarAngle,orbit.maxPolarAngle);
      keySphere.radius=clamp(keySphere.radius,orbit.minDistance,orbit.maxDistance);
      orbitCam.position.copy(orbit.target).add(keyOffset.setFromSpherical(keySphere));
    }
    orbitCam.lookAt(orbit.target);orbit.update();orbit.enableDamping=damping;
    zoomGoal=orbitCam.position.distanceTo(orbit.target);dirty=true;wake();publish(true);
  });

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), box = new THREE.Box3(), hit = new THREE.Vector3();
  const ndcAt = e => {
    const r = view.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    return r;
  };
  const pickTargets = [];
  gltf.scene.traverse(o => { if (o.isMesh && !/^(DataPulse__|WiFi_packet_|Highlight__)/.test(o.name) && o.material !== table) pickTargets.push(o); });

  let press = null, tipTimer = 0;
  view.addEventListener('pointerdown', e => {
    if (USE_SEQ||e.button !== 0 || e.target.closest('.hw-label, .hw-orbit-ui')) return;
    press = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  });
  view.addEventListener('pointercancel', () => { press = null; });
  pickAt = (clientX, clientY) => {
    if(USE_SEQ)return;
    ndcAt({ clientX, clientY });
    const cam = activeCam();
    ray.setFromCamera(ndc, cam);
    let found = null;
    for (const h of ray.intersectObjects(pickTargets, false)) {
      if (!h.object.visible) continue;
      const owner = labelFor(h.object);
      if (owner) { found = { owner, point: h.point }; break; }
    }
    if (!found) { closeLabel(); return; }
    const [title, desc] = LABELS[found.owner.name];
    labelEl.querySelector('strong').textContent = title;
    labelEl.querySelector('.hw-label-d').textContent = desc;
    pinned = { obj: found.owner, local: found.owner.worldToLocal(found.point.clone()), shot: activeChapter };
    labelEl.hidden = false;
    placeLabel();
    tip.hidden = true;
  };
  view.addEventListener('pointerup', e => {
    if (!press || e.target.closest('.hw-label, .hw-orbit-ui')) return;
    const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y), long = e.timeStamp - press.t;
    press = null;
    if (moved > 6 || long > 700) return;           // that was a drag, not a click
    pickAt(e.clientX, e.clientY);
  });
  view.addEventListener('pointermove', e => {
    if (USE_SEQ||e.pointerType !== 'mouse' || e.buttons || tipTimer) return;
    tipTimer = requestAnimationFrame(() => {
      tipTimer = 0;
      const r = ndcAt(e);
      if (USE_SEQ && mode === 'film' && !tween) apply(cur);
      ray.setFromCamera(ndc, activeCam());
      let best = null, bestD = Infinity;
      for (const p of pickables) {
        box.setFromObject(p.obj);
        if (ray.ray.intersectBox(box, hit)) {
          const d = hit.distanceTo(ray.ray.origin);
          if (d < bestD) { bestD = d; best = p; }
        }
      }
      view.classList.toggle('is-pointing', !!best);
      if (best && !pinned) {
        tip.textContent = best.label[0];
        tip.style.transform = `translate(${(e.clientX - r.left + 14).toFixed(0)}px, ${(e.clientY - r.top + 14).toFixed(0)}px)`;
        tip.hidden = false;
      } else tip.hidden = true;
    });
  });
  view.addEventListener('pointerleave', () => { tip.hidden = true; view.classList.remove('is-pointing'); });

  labelEl.querySelector('.hw-label-x').addEventListener('click', closeLabel);
  orbitBtn.hidden = USE_SEQ;
  document.getElementById('hwExit360').addEventListener('click', exitOrbit);
  document.getElementById('hwZoomIn').addEventListener('click', () => { zoomGoal = clamp(zoomGoal * 0.8, orbit.minDistance, orbit.maxDistance); wake(); });
  document.getElementById('hwZoomOut').addEventListener('click', () => { zoomGoal = clamp(zoomGoal * 1.25, orbit.minDistance, orbit.maxDistance); wake(); });
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (pinned) closeLabel();
    else if (mode === 'orbit') exitOrbit();
  });

  stats.gl = true;
  if(USE_SEQ&&!benchmarking&&!loading3D)releaseDrawBuffer();
  wake();publish(true);
}

updateHud(FIRST);
addEventListener('resize', () => { if (!renderer) layoutFilm(view.clientWidth || 1, view.clientHeight || 1); });
// Start only near the study. There is no idle-triggered preload on the landing
// page; the standalone study imports this module on explicit entry.
let started = false;
const start = () => {
  if (started) return;
  started = true;
  near.disconnect();
  if (USE_SEQ) seqStart(); else startGL().catch(()=>fail('The interactive model could not load. The still remains available.'));
};
const near = new IntersectionObserver(es => { if (es[es.length - 1].isIntersecting) start(); }, { rootMargin: '200% 0px' });
near.observe(stage);
if (BAKE) {
  // Offline rendering of the sequence (deliverables/hw-bake.cjs).
  started = true; near.disconnect();
  init().then(async () => {
    await Promise.all(PAGES.map((url, i) => pageTex[i] || loadTexture(url).then(t => { pageTex[i] = t; })));
    let bakedShadowPose='';
    window.pathosBakeCanvas = f => {
      resize();shownPage=-1;apply(f);
      if(BAKE.film){
        // Camera, screen and non-casting pulses do not change any shadow.
        // Reuse shadows only when every caster retains its exact world pose.
        scene.updateMatrixWorld(true);const poses=[];
        scene.traverse(o=>{if(o.isMesh&&o.castShadow)poses.push(o.visible,...o.matrixWorld.elements);});
        const pose=poses.join(',');renderer.shadowMap.needsUpdate=pose!==bakedShadowPose;bakedShadowPose=pose;
      }
      renderer.render(scene,camera);return renderer.domElement;
    };
    window.pathosBake = f => window.pathosBakeCanvas(f).toDataURL('image/png');
    window.pathosBakeReady = true;
  });
}

window.pathosPrototype = {
  stats, film,
  get state() {return stateSnapshot();},
  setRendererMode,play,pause,seek,selectChapter,resumeScroll,
  frameAt, progressAt, scrollProgress, scrollYForFrame,
  get debug() { return { scene, camera, mixer, orbit, orbitCam, renderer, guidedVideo:guidedFilm?.video, guidedMetrics:guidedFilm?.metrics }; },
  enterOrbit: async () => {if(USE_SEQ)await setRendererMode('3d');if(!USE_SEQ)enterOrbit();}, exitOrbit: () => exitOrbit(),
  // Tests: pose the live scene at the current frame (with the pre-rendered
  // film it is only posed when picked or labelled).
  sync: () => { if (mixer && mode === 'film' && !tween) apply(cur); },
};
publish(true);document.dispatchEvent(new CustomEvent('pathos:hardwareready',{detail:window.pathosPrototype}));
