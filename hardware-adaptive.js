// Conservative playback policy. Hardware hints only veto a probe; an actual
// full-resolution scene benchmark is required before automatic promotion.
export function canProbeHardware({reduced=false,saveData=false,coarse=false,cores=0,memory,width=0,visible=false}={}) {
  return visible&&!reduced&&!saveData&&!coarse&&width>=900&&cores>=8&&(!Number.isFinite(memory)||memory>=8);
}

export function excellentHardware(samples) {
  if(samples.length<48||samples.some(s=>!Number.isFinite(s.cost)||!Number.isFinite(s.interval)))return false;
  const sorted=key=>samples.map(s=>s[key]).sort((a,b)=>a-b);
  const cost=sorted('cost'),interval=sorted('interval'),p95=values=>values[Math.ceil(values.length*.95)-1];
  return p95(cost)<8&&cost.at(-1)<14&&p95(interval)<21&&interval.at(-1)<35;
}

// Critically damped, time-based movement: gentle acceleration and settling,
// with the same response on 30/60/120 Hz displays and no free-running inertia.
export function advanceHardwareMotion(frame,velocity,target,seconds,reduced=false){
  if(reduced)return {frame:target,velocity:0};
  const dt=Math.max(0,Math.min(.1,Number(seconds)||0)),rate=20;
  const error=frame-target,combined=velocity+rate*error,decay=Math.exp(-rate*dt);
  const next=target+(error+combined*dt)*decay;
  const speed=(velocity-rate*combined*dt)*decay;
  return Math.abs(next-target)<.05&&Math.abs(speed)<.5?{frame:target,velocity:0}:{frame:next,velocity:speed};
}

// Ignore idle gaps. Require sustained poor pacing while frames are requested;
// a single busy frame or a return from a background tab is not a downgrade.
export function createHardwareMonitor() {
  let samples=[];
  return {
    reset(){samples=[];},
    sample(now,interval,cost){
      if(!Number.isFinite(interval)||interval<=0){samples=[];return false;}
      // Once an active frame blocks interaction for this long, waiting for a
      // large sample window would prolong a visibly broken experience.
      if(interval>=1500||cost>=500)return true;
      samples.push({now,interval,bad:interval>34||cost>24});
      samples=samples.filter(s=>now-s.now<=3000);
      const bad=samples.filter(s=>s.bad),duration=samples.reduce((sum,s)=>sum+s.interval,0);
      return bad.length>=3&&now-samples[0].now>=1000&&duration>=1200&&bad.reduce((sum,s)=>sum+s.interval,0)/duration>.35;
    }
  };
}

// Cuts belong to distinct cameras. Interpolating across one creates a ghost
// image; between cuts a bounded nearby pair may be blended.
export function sequencePair(frame,available,shotStarts,first=1,step=6) {
  const u=Math.max(0,(frame-first)/step),target=Math.round(u);
  let lo=-1,hi=-1;
  for(const n of available){if(n<=u&&(lo<0||n>lo))lo=n;if(n>=u&&(hi<0||n<hi))hi=n;}
  if(lo<0&&hi<0)return null;
  if(lo<0)lo=hi;if(hi<0)hi=lo;
  if(hi-lo>2||shotStarts.some(cut=>cut>first+lo*step&&cut<=first+hi*step)){
    const nearest=Math.abs(target-lo)<=Math.abs(hi-target)?lo:hi;return {lo:nearest,hi:nearest,alpha:0};
  }
  return {lo,hi,alpha:hi===lo?0:(u-lo)/(hi-lo)};
}
