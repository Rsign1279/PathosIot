// Policy regressions for automatic promotion, sustained lag and camera cuts.
// Uses the production module; no DOM, GPU or package dependencies required.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../hardware-adaptive.js'),'utf8');
  const {canProbeHardware,excellentHardware,createHardwareMonitor,sequencePair}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  let checks=0;const check=(value,message)=>{checks++;assert(value,message);};
  const capable={visible:true,width:1440,cores:12,memory:16};
  check(canProbeHardware(capable),'A capable foreground desktop may be measured');
  for(const veto of [{reduced:true},{saveData:true},{coarse:true},{width:390},{cores:4},{memory:4},{visible:false}])check(!canProbeHardware({...capable,...veto}),'Accessibility, data, load or device constraints veto automatic probing');
  const smooth=Array.from({length:48},()=>({cost:4,interval:16.7}));
  check(excellentHardware(smooth),'Actual smooth full-resolution scene measurements can pass');
  check(!excellentHardware(smooth.slice(1)),'A short or incomplete measurement cannot promote');
  check(!excellentHardware(smooth.map(s=>({...s,cost:9}))),'Consistently expensive scenes remain guided');
  check(!excellentHardware(smooth.map(s=>({...s,interval:33.3}))),'Fast submissions alone cannot hide poor delivered frame pacing');
  check(!excellentHardware([...smooth.slice(1),{cost:25,interval:16.7}]),'A serious render stall blocks automatic promotion');
  check(!excellentHardware([...smooth.slice(1),{cost:NaN,interval:16.7}]),'Unknown measurement results never imply capability');
  const good=createHardwareMonitor();let now=0;
  for(let i=0;i<180;i++){now+=16.7;check(!good.sample(now,16.7,i===40?80:4),'One isolated busy task cannot switch a working renderer');}
  const slow=createHardwareMonitor();let failed=false;now=0;
  for(let i=0;i<45;i++){now+=50;failed||=slow.sample(now,50,30);}
  check(failed,'Sustained expensive active frames trigger a downgrade');
  slow.reset();check(!slow.sample(now+3000,16.7,4),'The caller resets monitoring after a background/idle gap');
  check(!slow.sample(now+3017,17,4),'Returning from idle cannot immediately downgrade');
  const extremelySlow=createHardwareMonitor();let severe=false;
  for(let i=1;i<=4;i++)severe||=extremelySlow.sample(i*700,700,600);
  check(severe,'Very low frame rates still downgrade instead of lacking enough samples');
  check(createHardwareMonitor().sample(2000,2000,800),'A catastrophic active-frame stall falls back without waiting through more stalls');
  const pair=sequencePair(310,[50,51,52],[300,600]);
  check(pair.lo===51&&pair.hi===52&&pair.alpha>0&&pair.alpha<1,'Neighboring frames within a shot can blend');
  const cut=sequencePair(300,[49,50],[300,600]);
  check(cut.lo===cut.hi&&cut.alpha===0,'Distinct camera shots never crossfade into a double image');
  const gap=sequencePair(900,[0,479],[300,600,900]);
  check(gap.lo===gap.hi&&gap.alpha===0,'Missing frame ranges do not blend unrelated pictures');
  check(sequencePair(200,[],[300])===null,'No decoded frame leaves the current still intact');
  console.log(`${checks}/${checks} adaptive hardware policy and sequence checks passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
