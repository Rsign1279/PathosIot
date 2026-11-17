// Presentation-only brand migration. IDs, asset URLs, links and historical
// media stay intact; the original-page baseline is never rewritten.
const siteOrigin=new URL(require('../site.config.json').origin).origin;
function applyBrand(input,{stylesheet=false}={}){
  let html=input.replace(/\bPATHOS(?=%20)/g,'Pathos%20IoT').replace(/\bPATHOS\b/g,'Pathos IoT');
  const canonical=/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/.exec(html)?.[1];
  if(canonical){const previousOrigin=new URL(canonical).origin;html=html.split(previousOrigin).join(siteOrigin);}
  const beforeLogos=html;
  html=html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/g,(whole,attrs,inside,offset)=>{
    const classValue=/\bclass="([^"]*)"/.exec(attrs)?.[1]||'';
    const classes=classValue.split(/\s+/);
    if(!classes.includes('brand')&&!classes.includes('study-brand'))return whole;
    if(!/Pathos IoT|brand-logo/.test(inside))return whole;
    if(!classes.includes('pathos-iot-brand'))attrs=attrs.replace(/\bclass="([^"]*)"/,'class="$1 pathos-iot-brand"');
    const stacked=/foot-brand/.test(beforeLogos.slice(Math.max(0,offset-160),offset));
    return `<a${attrs}><img class="brand-logo" src="assets/brand/pathos-iot-logo${stacked?'-stacked':''}.svg" alt="" aria-hidden="true" width="${stacked?178:224}" height="${stacked?130:56}"></a>`;
  });
  if(!html.includes('href="assets/brand/pathos-iot-icon.svg"'))html=html.replace(/(<link\b[^>]*rel="icon"[^>]*>)/,'$1\n    <link rel="icon" href="assets/brand/pathos-iot-icon.svg" type="image/svg+xml">');
  html=html.replace(/(content="[^"]*\/assets\/)og-image\.jpg"/g,'$1brand/pathos-iot-social.png"');
  html=html.replace(/(<meta property="og:image:alt" content=")[^"]*"/,'$1Pathos IoT emblem and wordmark. Stress awareness from the body’s own signals."');
  if(stylesheet&&!html.includes('href="brand.css"'))html=html.replace('</head>','  <link rel="stylesheet" href="brand.css">\n</head>');
  return html;
}
module.exports={applyBrand};
if(require.main===module){
  const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
  for(const page of ['hardware.html','privacy.html','404.html']){
    const file=path.join(root,page);fs.writeFileSync(file,applyBrand(fs.readFileSync(file,'utf8'),{stylesheet:true}));
  }
  console.log('Applied Pathos IoT identity to hardware, privacy and error pages.');
}
