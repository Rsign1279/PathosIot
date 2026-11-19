// Reuse the generated compact player on the standalone study page.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function syncHardwarePage(landing){
  const file=path.join(root,'hardware.html');
  if(!fs.existsSync(file))return false;
  const section=/<section\b[^>]*id="prototype"[^>]*>[^]*?<\/section>/;
  const match=section.exec(landing);
  if(!match||!match[0].includes('hw-experience'))throw new Error('Generated compact hardware section missing');
  let shared=match[0].replace('<h2 class="heading-2">','<h1 class="heading-2">').replace('</h2>','</h1>');
  shared=shared.replace(/href="#product"/g,'href="./#product"');
  const original=fs.readFileSync(file,'utf8');
  if(!section.test(original))throw new Error('Standalone hardware section missing');
  const result=original.replace(section,()=>shared).replace('href="prototype.css"','href="integrated.css"');
  if(result!==original)fs.writeFileSync(file,result);
  return result!==original;
}
module.exports={syncHardwarePage};
if(require.main===module){syncHardwarePage(fs.readFileSync(path.join(root,'index.html'),'utf8'));console.log('Synced the compact hardware player to the standalone study.');}
