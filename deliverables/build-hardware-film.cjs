// Render the original rig directly to an AVC stream: no preview enlargement.
// Requires Chromium with WebCodecs, ffmpeg, and a running site.
// DISPLAY=:99 LIBGL_ALWAYS_SOFTWARE=1 node deliverables/build-hardware-film.cjs [site] [frames]
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'assets/hardware');
const frames=Number(process.argv[3]||2880),fps=60;
fs.mkdirSync(out,{recursive:true});
const raw=path.join(os.tmpdir(),`pathos-rig-native-${Date.now()}-${process.pid}.h264`),movie=frames===2880?path.join(out,'rig-1080p60.mp4'):path.join(os.tmpdir(),`pathos-rig-sample-${frames}.mp4`);
(async()=>{
 const stream=fs.createWriteStream(raw);
 const browser=await chromium.launch({executablePath:process.env.PATHOS_CHROMIUM_PATH||'/usr/bin/chromium',headless:!process.env.DISPLAY,args:process.env.DISPLAY?['--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist','--disable-vulkan']:['--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  page.on('pageerror',e=>process.stderr.write(e.message+'\n'));
  await page.exposeFunction('pathosFilmChunk',async encoded=>{
   const data=Buffer.from(encoded,'base64');
   if(!stream.write(data))await new Promise(resolve=>stream.once('drain',resolve));
  });
  await page.exposeFunction('pathosFilmProgress',data=>console.log(JSON.stringify(data)));
  const url=new URL(process.argv[2]||'http://127.0.0.1:3000/');url.searchParams.set('bake','film');url.hash='prototype';
  await page.goto(url.href,{waitUntil:'load'});
  await page.waitForFunction(()=>window.pathosBakeReady,undefined,{timeout:120000});
  const result=await page.evaluate(async({frames,fps})=>{
   const config={codec:'avc1.64002a',width:1920,height:1080,bitrate:12000000,framerate:fps,latencyMode:'realtime',avc:{format:'annexb'}};
   if(!(await VideoEncoder.isConfigSupported(config)).supported)throw new Error('Native Full HD AVC encoding unavailable');
   let failure=null,writes=Promise.resolve(),bytes=0,encoded=0;
   const encoder=new VideoEncoder({error:e=>{failure=e;},output:chunk=>{
    const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);bytes+=data.length;encoded++;
    let binary='';for(let i=0;i<data.length;i+=32768)binary+=String.fromCharCode(...data.subarray(i,i+32768));
    const base64=btoa(binary);writes=writes.then(()=>window.pathosFilmChunk(base64));
   }});
   encoder.configure(config);const start=performance.now();
   for(let i=0;i<frames;i++){
    const source=pathosBakeCanvas(i+1),film=pathosPrototype.film,ratio=pathosPrototype.debug.renderer.getPixelRatio();
    const crop=[film.x*ratio,film.y*ratio,film.w*ratio,film.h*ratio].map(Math.round);
    if(crop[2]!==1920||crop[3]!==1080)throw new Error('Baked film must contain native 1920×1080 pixels');
    const frame=new VideoFrame(source,{timestamp:Math.round(i*1e6/fps),duration:Math.round(1e6/fps)});
    encoder.encode(frame,{keyFrame:i%2===0});frame.close();
    while(encoder.encodeQueueSize>3){if(failure)throw failure;await new Promise(resolve=>setTimeout(resolve,1));}
    if(i%120===0){await writes;await window.pathosFilmProgress({rendered:i+1,total:frames,seconds:Math.round((performance.now()-start)/1000),bytes});}
   }
   await encoder.flush();await writes;if(failure)throw failure;encoder.close();
   return {frames,encoded,width:1920,height:1080,fps,bytes,seconds:Math.round((performance.now()-start)/1000)};
  },{frames,fps});
  await new Promise((resolve,reject)=>{stream.on('error',reject);stream.end(resolve)});
  console.log(JSON.stringify(result));
  const encodedMovie=movie+`.pending-${process.pid}.mp4`;
  const mux=cp.spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-r',String(fps),'-i',raw,'-vf',`setpts=N/(${fps}*TB),colorspace=all=bt709:format=yuv420p`,'-r',String(fps),'-fps_mode','cfr','-c:v','libx264','-preset','medium','-crf','18','-maxrate','14M','-bufsize','28M','-g','2','-keyint_min','2','-sc_threshold','0','-bf','0','-pix_fmt','yuv420p','-movflags','+faststart','-an',encodedMovie],{encoding:'utf8'});
  if(mux.status)throw new Error(mux.stderr);
  const check=JSON.parse(cp.execFileSync('ffprobe',['-v','error','-show_entries','stream=nb_frames,avg_frame_rate','-show_entries','format=duration','-of','json',encodedMovie],{encoding:'utf8'}));
  if(Number(check.streams[0].nb_frames)!==frames||check.streams[0].avg_frame_rate!==`${fps}/1`||Math.abs(Number(check.format.duration)-frames/fps)>.02)throw new Error('Encoded film timing validation failed; raw export retained');
  if(frames===2880&&fs.statSync(encodedMovie).size>=90*1024*1024)throw new Error('Film exceeds static delivery budget; native master retained');
  fs.renameSync(encodedMovie,movie);
  console.log('Native Full HD film: '+movie+' ('+fs.statSync(movie).size+' bytes)');
  // Keep the native master until the complete delivery has been reviewed.
  console.log('Native AVC master retained at '+raw);
 }finally{stream.destroy();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
