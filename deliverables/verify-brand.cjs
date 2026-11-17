#!/usr/bin/env node
// Independent asset-data and renderer lifecycle checks. No browser or packages.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
let checks=0;const failures=[];
function check(ok,message){checks++;if(!ok)failures.push(message);}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

// Decode PNG filters without relying on the asset generator or graphics stack.
function decodePNG(file){
  const png=fs.readFileSync(path.join(root,file));
  check(png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),`${file}: PNG signature`);
  let width,height,color,bitDepth,offset=8;const chunks=[],idat=[];
  while(offset+12<=png.length){
    const size=png.readUInt32BE(offset),tag=png.toString('ascii',offset+4,offset+8),data=png.subarray(offset+8,offset+8+size);
    chunks.push(tag);
    if(tag==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);bitDepth=data[8];color=data[9];}
    if(tag==='IDAT')idat.push(data);
    offset+=size+12;
  }
  const channels=color===6?4:color===2?3:0;
  if(!channels||bitDepth!==8)throw new Error(`Unsupported test PNG format ${color}/${bitDepth}`);
  const stride=width*channels,raw=zlib.inflateSync(Buffer.concat(idat)),pixels=Buffer.alloc(stride*height);
  const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;};
  for(let y=0;y<height;y++){
    const filter=raw[y*(stride+1)];
    if(filter>4)throw new Error(`Unsupported PNG filter ${filter}`);
    for(let x=0;x<stride;x++){
      const at=y*stride+x,a=x>=channels?pixels[at-channels]:0,b=y?pixels[at-stride]:0,c=y&&x>=channels?pixels[at-stride-channels]:0;
      const predict=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];
      pixels[at]=(raw[y*(stride+1)+1+x]+predict)&255;
    }
  }
  return {width,height,channels,pixels,chunks,bytes:png.length};
}

function assetChecks(){
  const image=decodePNG('assets/brand/pathos-iot-engraving.png'),{width,height,pixels}=image;
  check(width===512&&height===512&&image.channels===4,'Engraving map is power-of-two 512px RGBA for WebGL 1 mipmaps');
  check(image.bytes<16*1024,'Engraving asset stays within its 16 KiB transfer budget');
  check(!image.chunks.some(tag=>['gAMA','sRGB','iCCP'].includes(tag)),'Normal-map data has no color profile or gamma conversion metadata');
  let opaque=true,padded=true,cutPixels=0,normalPixels=0,maxDepth=0,gradientCount=0,maxGradientError=0;
  const depth=(x,y)=>pixels[(y*width+x)*4+2]/255;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4,r=pixels[at],g=pixels[at+1],b=pixels[at+2];
    opaque&&=pixels[at+3]===255;maxDepth=Math.max(maxDepth,b);if(b>0)cutPixels++;if(r!==128||g!==128)normalPixels++;
    if(x===0||y===0||x===width-1||y===height-1)padded&&=r===128&&g===128&&b===0;
    if(x>0&&y>0&&x<width-1&&y<height-1){
      const dx=.9*(depth(x+1,y)-depth(x-1,y)),dy=-.9*(depth(x,y+1)-depth(x,y-1)),len=Math.hypot(dx,dy,1);
      if(Math.hypot(dx,dy)>.02){gradientCount++;maxGradientError=Math.max(maxGradientError,Math.abs((r-128)/127-dx/len),Math.abs((g-128)/127-dy/len));}
    }
  }
  check(opaque,'Map alpha is opaque, preventing premultiplication from corrupting signed normals');
  check(padded,'Map border is exactly neutral (128,128,0,255), avoiding rectangular seams');
  check(cutPixels>4000&&cutPixels<width*height*.2&&maxDepth===255,'Engraving contains distinct bounded cuts with fully recessed floors');
  check(normalPixels>2000&&gradientCount>2000&&maxGradientError<.012,'Packed tangent normals agree with inward cavity gradients, including the image Y flip');
  for(const file of ['pathos-iot-logo.svg','pathos-iot-logo-stacked.svg','pathos-iot-mark.svg','pathos-iot-icon.svg']){
    const svg=read(`assets/brand/${file}`);
    check(svg.includes('<title>Pathos IoT</title>')&&svg.includes('#e8b021'),`${file}: supplied name and gold identity`);
    check(!/<(?:image|script|foreignObject)\b|https?:\/\/(?!www\.w3\.org)/.test(svg),`${file}: self-contained native vector`);
  }
  const stacked=read('assets/brand/pathos-iot-logo-stacked.svg');
  check(stacked.includes('M74.1 163.5L81.5 147.5L89.2 163.5')&&stacked.includes('L128 119.7L123 98.7'),'Logo retains the open triangular A and heartbeat notch from the supplied image');
  const social=decodePNG('assets/brand/pathos-iot-social.png');
  check(social.width===1200&&social.height===630,'Share card has the declared 1200 × 630 dimensions');
  const favicon=decodePNG('favicon-32.png'),apple=decodePNG('apple-touch-icon.png');
  check(favicon.width===32&&favicon.height===32&&apple.width===180&&apple.height===180,'Raster browser and home-screen icons have the required dimensions');
}

function pageChecks(){
  for(const file of ['index.html','hardware.html','privacy.html','404.html']){
    const page=read(file),logos=[...page.matchAll(/<a\b[^>]*class="[^"]*\bpathos-iot-brand\b[^]*?<\/a>/g)];
    check(/<title>[^<]*Pathos IoT/.test(page),`${file}: browser title uses Pathos IoT`);
    check(!/\bPATHOS\b/.test(page),`${file}: no stale uppercase brand in current page markup`);
    check(logos.length===(file==='index.html'?2:1),`${file}: each existing brand placement receives its vector logo`);
    for(const match of logos)check(/aria-label="Pathos IoT home"/.test(match[0])&&/<img class="brand-logo"[^>]*alt="" aria-hidden="true"/.test(match[0]),`${file}: logo link has one accessible brand name`);
    check(page.includes('href="assets/brand/pathos-iot-icon.svg"'),`${file}: new vector favicon is linked`);
    if(file!=='index.html')check(page.includes('href="brand.css"'),`${file}: auxiliary page loads responsive brand styling`);
  }
  const page=read('index.html'),source=read('prototype.js');
  check(page.includes('pathos-iot-logo-stacked.svg'),'Footer receives the supplied stacked logo composition');
  check(/og:site_name" content="Pathos IoT"/.test(page)&&/og:image" content="[^"]*\/assets\/brand\/pathos-iot-social\.png"/.test(page)&&/twitter:image" content="[^"]*\/assets\/brand\/pathos-iot-social\.png"/.test(page),'Social metadata uses the new identity and branded card');
  const faq=JSON.parse(/<script type="application\/ld\+json">([^]*?)<\/script>/.exec(page)[1]);
  check(faq.mainEntity.length===4&&faq.mainEntity[0].name==='Is Pathos IoT a medical device?','Structured FAQ name agrees with the visible brand');
  check(read('main.js').includes('_subject: `Pathos IoT:'),'Contact form subject uses Pathos IoT');
  check(read('film.js').includes("'Pathos IoT in 44 seconds'"),'Film accessibility label uses Pathos IoT');
  check(source.includes("key === 'PATHOS dashboard • inset rounded window'")&&source.includes("PATHOS_ROOT__static: ['The Pathos IoT rig'"),'Technical model lookup names remain intact while displayed hardware labels are renamed');
  check(/canvas\.addEventListener\('planetchange',\(\)=>\{dirty=true;wake\(\);\}\)/.test(read('integration.js')),'One optional-map event wakes the existing shared story scheduler');
  const {applyBrand}=require('./apply-brand.cjs');
  for(const file of ['index.html','hardware.html','privacy.html','404.html']){
    const input=read(file);check(applyBrand(input,{stylesheet:file!=='index.html'})===input,`${file}: brand transform is idempotent`);
  }
}

function harness(options={}){
  let serial=0,shaderCount=0;const calls=[],resources=[],images=[],events=[],classes=new Set(),listeners=new Map();
  const state={lost:false},constants=['VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','ARRAY_BUFFER','STATIC_DRAW','FLOAT','TEXTURE0','TEXTURE1','TEXTURE_2D','TEXTURE_WRAP_S','TEXTURE_WRAP_T','CLAMP_TO_EDGE','TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER','LINEAR','RGB','RGBA','UNSIGNED_BYTE','UNPACK_FLIP_Y_WEBGL','UNPACK_PREMULTIPLY_ALPHA_WEBGL','UNPACK_COLORSPACE_CONVERSION_WEBGL','NONE','BROWSER_DEFAULT_WEBGL','LINEAR_MIPMAP_LINEAR','TRIANGLES'];
  const gl=Object.fromEntries(constants.map((name,index)=>[name,index+1]));let unit=gl.TEXTURE0;
  const resource=kind=>{const value={kind,id:++serial};resources.push(value);calls.push(['create',value]);return value;};
  for(const kind of ['Shader','Program','Buffer','Texture']){gl[`create${kind}`]=()=>resource(kind);gl[`delete${kind}`]=value=>calls.push(['delete',value]);}
  for(const method of ['shaderSource','compileShader','attachShader','linkProgram','useProgram','bindBuffer','bufferData','enableVertexAttribArray','vertexAttribPointer','bindTexture','texParameteri','uniform1i','uniform1f','pixelStorei','generateMipmap','viewport','drawArrays'])gl[method]=(...args)=>calls.push([method,...args]);
  gl.activeTexture=value=>{unit=value;calls.push(['activeTexture',value]);};
  gl.texImage2D=(...args)=>calls.push(['texImage2D',unit,...args]);
  gl.getShaderParameter=()=>++shaderCount!==options.shaderFail;
  gl.getProgramParameter=()=>!options.linkFail;
  gl.getAttribLocation=()=>0;gl.getUniformLocation=(_,name)=>name;gl.isContextLost=()=>state.lost;
  const canvas={clientWidth:options.mobile?375:300,width:0,height:0,getContext:()=>options.noGL?null:gl,parentElement:{classList:{add:value=>classes.add(value),remove:value=>classes.delete(value)}},addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name,fn){if(listeners.get(name)===fn)listeners.delete(name);},dispatchEvent(event){events.push(event.type);listeners.get(event.type)?.(event);}};
  class FakeImage{constructor(){images.push(this);}decode(){if(images[0]===this)return options.photoFail?Promise.reject(new Error('missing stone')):Promise.resolve();return new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject;});}}
  const context=vm.createContext({Image:FakeImage,CustomEvent:class{constructor(type){this.type=type;}},matchMedia:()=>({matches:!!options.mobile}),devicePixelRatio:3,Float32Array,Uint8Array});
  vm.runInContext(read('planet.js').replace('export async function createPlanet','async function createPlanet')+'\n;globalThis.createPlanet=createPlanet;',context);
  return {gl,canvas,calls,resources,images,events,classes,listeners,state,start:()=>context.createPlanet(canvas)};
}
const callsOf=(h,name)=>h.calls.filter(call=>call[0]===name);
function freed(h,message){check(h.resources.every(resource=>h.calls.filter(call=>call[0]==='delete'&&call[1]===resource).length===1),message);}

async function lifecycleChecks(){
  const h=harness(),planet=await h.start();
  check(planet&&h.classes.has('has-webgl')&&h.images.length===2,'Working base planet returns before optional engraving is decoded');
  check(h.canvas.width===450&&h.canvas.height===450&&callsOf(h,'drawArrays').length===1,'Initial desktop rendering caps pixel ratio at 1.5');
  check(callsOf(h,'uniform1i').some(c=>c[1]==='uStone'&&c[2]===0)&&callsOf(h,'uniform1i').some(c=>c[1]==='uEngraving'&&c[2]===1),'Stone and engraving have explicit separate texture samplers');
  const initialMap=callsOf(h,'texImage2D').find(c=>c[1]===h.gl.TEXTURE1);
  check(initialMap&&Array.from(initialMap.at(-1)).join(',')==='128,128,0,255','Neutral placeholder map cannot change the unengraved planet');
  const before=callsOf(h,'drawArrays').length;
  h.images[1].resolve();await flush();
  check(h.events.filter(e=>e==='planetchange').length===1&&callsOf(h,'uniform1f').some(c=>c[1]==='uEngraved'&&c[2]===1),'Successful optional decode activates engraving and emits exactly one scheduler event');
  check(callsOf(h,'drawArrays').length===before,'Optional map adds no independent rendering loop');
  const upload=h.calls.findIndex(c=>c[0]==='texImage2D'&&c.at(-1)===h.images[1]);
  check(upload>0&&h.calls[upload][1]===h.gl.TEXTURE1&&h.calls.slice(0,upload).some(c=>c[0]==='pixelStorei'&&c[1]===h.gl.UNPACK_COLORSPACE_CONVERSION_WEBGL&&c[2]===h.gl.NONE),'Normal data uploads on texture unit 1 with color conversion disabled');
  check(callsOf(h,'generateMipmap').length===1&&callsOf(h,'pixelStorei').some(c=>c[1]===h.gl.UNPACK_COLORSPACE_CONVERSION_WEBGL&&c[2]===h.gl.BROWSER_DEFAULT_WEBGL),'Map generates one mip chain and restores color conversion state');
  planet.render(1.27,.82);
  check(callsOf(h,'uniform1f').some(c=>c[1]==='uRotation'&&c[2]===1.27)&&callsOf(h,'uniform1f').some(c=>c[1]==='uSignal'&&c[2]===.82),'Caller still controls planet rotation and signal');
  planet.destroy();const afterDestroy=h.calls.length;planet.render(2,.1);
  check(h.calls.length===afterDestroy&&h.listeners.size===0,'Destroyed planet ignores renders and removes its context listeners');
  freed(h,'Completed planet releases both textures, buffer, program, and all shader handles');

  const failed=harness(),fallback=await failed.start();failed.images[1].reject(new Error('optional map missing'));await flush();const drawBefore=callsOf(failed,'drawArrays').length;fallback.render(.7);
  check(failed.classes.has('has-webgl')&&failed.events.length===0&&!callsOf(failed,'uniform1f').some(c=>c[1]==='uEngraved'&&c[2]===1)&&callsOf(failed,'drawArrays').length===drawBefore+1,'Missing engraving retains a fully working base planet');fallback.destroy();freed(failed,'Map failure still releases every allocated WebGL resource');

  const pending=harness(),pendingPlanet=await pending.start();pendingPlanet.destroy();const pendingCount=pending.calls.length;pending.images[1].resolve();await flush();
  check(pending.images[1].src===''&&pending.calls.length===pendingCount&&pending.events.length===0,'Late map completion after destroy cannot upload or wake an obsolete canvas');freed(pending,'Destroy during optional loading frees all resources');

  const lost=harness(),lostPlanet=await lost.start();let prevented=false;lost.state.lost=true;lost.canvas.dispatchEvent({type:'webglcontextlost',preventDefault(){prevented=true;}});const lostCount=lost.calls.length;lost.images[1].resolve();await flush();lostPlanet.render(9);
  check(prevented&&!lost.classes.has('has-webgl')&&lost.calls.length===lostCount&&!lost.events.includes('planetchange'),'Context loss exposes the fallback and prevents optional upload or drawing');
  const deletedBeforeRestore=callsOf(lost,'delete').length;lost.state.lost=false;lost.canvas.dispatchEvent({type:'webglcontextrestored'});
  check(lost.events.includes('planetrestore'),'Context restoration requests reinitialization from the owning scheduler');lostPlanet.destroy();
  check(callsOf(lost,'delete').length===deletedBeforeRestore&&lost.listeners.size===0,'Destroyed lost renderer removes listeners without deleting handles already discarded by the old context');

  for(const [label,options] of [['missing WebGL',{noGL:true}],['vertex compile failure',{shaderFail:1}],['fragment compile failure',{shaderFail:2}],['link failure',{linkFail:true}],['missing base texture',{photoFail:true}]]){
    const item=harness(options);check(await item.start()===null,`${label}: optional illustration fails safely`);freed(item,`${label}: partial allocations are released`);
  }
  const phone=harness({mobile:true}),phonePlanet=await phone.start();check(phone.canvas.width===469,'Mobile rendering caps pixel ratio at 1.25');phonePlanet.lowerQuality();phonePlanet.render();check(phone.canvas.width===375,'Adaptive quality reduction applies without changing scroll behavior');phonePlanet.destroy();phone.images[1].resolve();await flush();
}

async function main(){
  assetChecks();pageChecks();await lifecycleChecks();
  console.log(`${checks-failures.length}/${checks} Pathos IoT brand, packed-map, and WebGL lifecycle checks passed.`);
  if(failures.length){for(const issue of failures)console.error(`FAIL: ${issue}`);process.exitCode=1;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
