#!/usr/bin/env node
// Native Full HD fallback from the original 3D film. No source image is
// enlarged, and lossless WebP preserves every pixel of the rendered crop.
// Requires Playwright and Python with Pillow in the development environment.
// Serve the site, then: node deliverables/build-hardware-poster.cjs [siteURL]
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const base=new URL(process.argv[2]||'http://localhost:3000/');
base.searchParams.set('bake','');base.hash='prototype';
const output=path.join(root,'assets/pathos-hardware-poster.webp');
(async()=>{
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'pathos-hardware-poster-'));
 const raw=path.join(scratch,'original-render.png');
 const browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11']:[]});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base.href,{waitUntil:'load'});
  await page.waitForFunction(()=>window.pathosBakeReady,undefined,{timeout:120000});
  const frame=await page.evaluate(()=>{
   const png=pathosBake(1),p=pathosPrototype,r=p.debug.renderer.getPixelRatio(),f=p.film;
   return {png,crop:[f.x*r,f.y*r,(f.x+f.w)*r,(f.y+f.h)*r].map(Math.round),antialias:p.debug.renderer.getContext().getContextAttributes().antialias};
  });
  if(errors.length)throw new Error(errors.join('; '));
  if(frame.crop[2]-frame.crop[0]!==1920||frame.crop[3]-frame.crop[1]!==1080)throw new Error('Offline render must contain an exact native 1920×1080 film crop');
  if(!frame.antialias)throw new Error('The native poster requires antialiasing');
  fs.writeFileSync(raw,Buffer.from(frame.png.split(',')[1],'base64'));
  const encode=spawnSync(process.env.PYTHON||'python',['-c',
   'from PIL import Image,ImageChops; import sys,json; source=Image.open(sys.argv[1]).convert("RGB"); crop=source.crop(tuple(map(int,sys.argv[3:7]))); crop.save(sys.argv[2],"WEBP",lossless=True,quality=100,method=6); result=Image.open(sys.argv[2]).convert("RGB"); assert result.size==(1920,1080); assert ImageChops.difference(crop,result).getbbox() is None; print(json.dumps({"size":result.size,"encoding":"lossless WebP","frame":1,"pixelExact":True}))',
   raw,output,...frame.crop.map(String)],{encoding:'utf8'});
  if(encode.status!==0)throw new Error(encode.stderr||'Poster encoding failed');
  console.log(encode.stdout.trim());
  console.log('Full HD fallback: '+fs.statSync(output).size+' bytes; original scene, first film frame, no resampling.');
 }finally{
  await browser.close();
  if(fs.existsSync(raw))fs.unlinkSync(raw);
  fs.rmdirSync(scratch);
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
