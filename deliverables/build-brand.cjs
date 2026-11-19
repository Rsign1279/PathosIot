#!/usr/bin/env node
// Optional asset build. Checked-in assets need no dependencies at runtime.
// Install @resvg/resvg-js in ../brand-tools (outside this buildless site), or
// provide it on NODE_PATH, then run node deliverables/build-brand.cjs.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),cp=require('node:child_process');
let Resvg;try{({Resvg}=require('@resvg/resvg-js'));}catch{({Resvg}=require(path.resolve(__dirname,'../../brand-tools/node_modules/@resvg/resvg-js')));}
const art=require('./brand-art.cjs'),root=path.resolve(__dirname,'..'),out=path.join(root,'assets/brand');
fs.mkdirSync(out,{recursive:true});
const write=(name,data)=>fs.writeFileSync(path.join(out,name),data);
write('pathos-iot-logo.svg',art.horizontal);write('pathos-iot-logo-stacked.svg',art.stacked);write('pathos-iot-mark.svg',art.emblem);write('pathos-iot-engraving.svg',art.mask);write('pathos-iot-icon.svg',art.icon());
const render=(svg,size)=>new Resvg(svg,{fitTo:{mode:'width',value:size},font:{loadSystemFonts:false}}).render();
const icons=[16,32,48].map(size=>({size,png:render(art.icon(),size).asPng()}));
fs.writeFileSync(path.join(root,'favicon-32.png'),icons[1].png);
fs.writeFileSync(path.join(root,'apple-touch-icon.png'),render(art.icon(false),180).asPng());
const ico=Buffer.alloc(6+icons.length*16);ico.writeUInt16LE(1,2);ico.writeUInt16LE(icons.length,4);
let offset=ico.length;
icons.forEach(({size,png},i)=>{const at=6+i*16;ico[at]=size;ico[at+1]=size;ico.writeUInt16LE(1,at+4);ico.writeUInt16LE(32,at+6);ico.writeUInt32LE(png.length,at+8);ico.writeUInt32LE(offset,at+12);offset+=png.length;});
fs.writeFileSync(path.join(root,'favicon.ico'),Buffer.concat([ico,...icons.map(item=>item.png)]));

// Exact Euclidean distance transform. The signed edge distance forms an
// inward-cut bevel; its gradient becomes a tangent-space relief normal.
function distance(binary,width,height,feature){
  const data=new Float64Array(width*height),line=new Float64Array(Math.max(width,height)),v=new Int32Array(line.length),z=new Float64Array(line.length+1),result=new Float64Array(line.length);
  const solve=n=>{
    let k=0;v[0]=0;z[0]=-Infinity;z[1]=Infinity;
    for(let q=1;q<n;q++){let s=((line[q]+q*q)-(line[v[k]]+v[k]*v[k]))/(2*(q-v[k]));while(s<=z[k]){k--;s=((line[q]+q*q)-(line[v[k]]+v[k]*v[k]))/(2*(q-v[k]));}v[++k]=q;z[k]=s;z[k+1]=Infinity;}
    k=0;for(let q=0;q<n;q++){while(z[k+1]<q)k++;result[q]=(q-v[k])**2+line[v[k]];}
  };
  for(let x=0;x<width;x++){for(let y=0;y<height;y++)line[y]=binary[y*width+x]===feature?0:1e12;solve(height);for(let y=0;y<height;y++)data[y*width+x]=result[y];}
  for(let y=0;y<height;y++){for(let x=0;x<width;x++)line[x]=data[y*width+x];solve(width);for(let x=0;x<width;x++)data[y*width+x]=result[x];}
  return data;
}
const size=512,maskImage=render(art.mask,size),pixels=maskImage.pixels;
if(maskImage.width!==size||maskImage.height!==size)throw new Error('Engraving mask must be square');
const binary=Uint8Array.from({length:size*size},(_,i)=>pixels[i*4+3]>=128?1:0);
const outside=distance(binary,size,size,0),inside=distance(binary,size,size,1),depth=new Float32Array(binary.length);
for(let i=0;i<depth.length;i++){let d=Math.sqrt(outside[i])-Math.sqrt(inside[i]);d-=Math.sign(d)*.5;const t=Math.min(1,Math.max(0,(d+.35)/2.55));depth[i]=t*t*(3-2*t);}
const normal=Buffer.alloc(size*size*4);
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=y*size+x,hx=-1.8*(depth[y*size+Math.min(size-1,x+1)]-depth[y*size+Math.max(0,x-1)])*.5,hy=-1.8*(depth[Math.min(size-1,y+1)*size+x]-depth[Math.max(0,y-1)*size+x])*.5;
  const length=Math.hypot(hx,hy,1);
  normal[i*4]=Math.round(128+127*(-hx/length));normal[i*4+1]=Math.round(128+127*(hy/length));normal[i*4+2]=Math.round(depth[i]*255);normal[i*4+3]=255;
}
// RG = signed tangent XY normal (neutral128); B = cavity depth; A opaque.
// Opaque data avoids alpha-premultiplication corrupting the neutral normals.
let crcTable;
function crc(buffer){if(!crcTable)crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});let c=0xffffffff;for(const b of buffer)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(type,data){const tag=Buffer.from(type),body=Buffer.concat([tag,data]),length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(data.length);sum.writeUInt32BE(crc(body));return Buffer.concat([length,body,sum]);}
function png(width,height,rgba){const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;const raw=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)rgba.copy(raw,y*(width*4+1)+1,y*width*4,(y+1)*width*4);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);}
write('pathos-iot-engraving.png',png(size,size,normal));
const socialType=cp.execFileSync(process.env.PATHOS_PYTHON||'python',['deliverables/social-type.py'],{cwd:root,encoding:'utf8'});
const social=art.svg('0 0 1200 630',`<metadata>Typography: Fraunces and Space Grotesk, outlined from the site's licensed local fonts.</metadata><rect width="1200" height="630" fill="#10100e"/><ellipse cx="300" cy="315" rx="245" ry="235" fill="none" stroke="#8e792e" opacity=".16"/><g transform="translate(42 55) scale(2)">${art.mark()+art.wordmark()}</g><path d="M570 439H1086" stroke="#c5ad7e" opacity=".35"/>${socialType}`);
write('pathos-iot-social.svg',social);
write('pathos-iot-social.png',new Resvg(social,{fitTo:{mode:'width',value:1200},font:{loadSystemFonts:false}}).render().asPng());
console.log('Built faithful Pathos IoT vectors, favicon set, share card, and 512px packed engraving relief.');
console.log('Engraving map: '+fs.statSync(path.join(out,'pathos-iot-engraving.png')).size+' bytes.');
