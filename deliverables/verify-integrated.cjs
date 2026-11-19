#!/usr/bin/env node
// Content-preservation and source integration audit. No dependencies or browser.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {gzipSync} = require('node:zlib');
const {prepareStylesheet}=require('./design-system.cjs');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root,name),'utf8');
const original = read('deliverables/original-page.html');
const current = read('index.html');
let checks=0;
const failures=[];
function check(ok,message){checks++;if(!ok)failures.push(message);}
const attr=(tag,name)=>new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`,'i').exec(tag)?.[1];
const hasClass=(tag,name)=>(attr(tag,'class')||'').split(/\s+/).includes(name);
const clean=html=>html.replace(/<!--[\s\S]*?-->/g,'');
function blocks(html,tag){
  const re=new RegExp(`<\\/?${tag}\\b[^>]*>`,'gi'),stack=[],result=[];
  let match;
  while((match=re.exec(html))){
    if(match[0][1]!=='/')stack.push({start:match.index,openEnd:re.lastIndex,open:match[0]});
    else{const item=stack.pop();if(item)result.push({...item,end:re.lastIndex,inner:html.slice(item.openEnd,match.index)});}
  }
  return result.sort((a,b)=>a.start-b.start);
}
const originalClean=clean(original),currentClean=clean(current);
const originalSections=blocks(originalClean,'section'),currentSections=blocks(currentClean,'section');
const sectionIds=sections=>sections.map(section=>attr(section.open,'id'));
const expectedIds=['hero','proof','film','device-tour','impact','problem','solution','philosophy','ai','sensors','prototype','product','pathos-iot','roadmap','workshops','how','team','faq','contact'];
check(JSON.stringify(sectionIds(originalSections))===JSON.stringify(expectedIds),'Baseline must contain the expected 19 original sections');
check(JSON.stringify(sectionIds(currentSections))===JSON.stringify(expectedIds),'All 19 original sections must remain in the same order');
const byId=sections=>Object.fromEntries(sections.map(section=>[attr(section.open,'id'),section]));
const before=byId(originalSections),after=byId(currentSections);
function stripEdge(html){return html.replace(/\s*<canvas\b(?=[^>]*\bclass=["'][^"']*\bedge-art\b)[^>]*>\s*<\/canvas>/g,'');}
// The owner requested a presentation-only rename. Normalize that explicit
// exception on both sides while still comparing every other byte of content.
const normalizeBrand=html=>html.replace(/\bPathos%20IoT\b/g,'PATHOS').replace(/\bPathos IoT\b/g,'PATHOS');
function normalizeMarkup(html,id){
  html=normalizeBrand(stripEdge(html));
  if(id==='hero')html=html.replace(/<span class="hero-research-status">[^]*?<\/span>/,'').replace('PATHOS explores skin conductance','PATHOS reads skin conductance');
  // Loading and progressive-enhancement attributes may change, never content.
  html=html.replace(/<video\b[^>]*>/g,tag=>tag.replace(/\s+(?:autoplay|controls)\b/g,'').replace(/\s+preload=["'][^"']*["']/g,''));
  if(id==='contact')html=html.replace(/<form\b[^>]*>/g,tag=>tag.replace(/\s+novalidate\b/g,'').replace(/\s+data-ajax-action=["'][^"']*["']/g,'').replace('action="https://formsubmit.co/ajax/','action="https://formsubmit.co/'));
  return html.replace(/>\s+</g,'><').replace(/\s+/g,' ').trim();
}
function textContent(html,id){
  html=normalizeBrand(html);
  if(id==='hero')html=html.replace(/<span class="hero-research-status">[^]*?<\/span>/,'').replace('PATHOS explores skin conductance','PATHOS reads skin conductance');
  return html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}
for(const id of expectedIds){
  if(!before[id]||!after[id])continue;
  if(id==='prototype'){
    // The approved two-mode player changes the shell and controls. Every
    // original chapter, technical caption and media reference stays intact.
    const chapters=html=>blocks(html,'article').filter(block=>hasClass(block.open,'hw-chapter')).map(block=>normalizeMarkup(block.inner,id));
    check(JSON.stringify(chapters(before[id].inner))===JSON.stringify(chapters(after[id].inner)),'Hardware: all ten original chapter bodies remain in order');
    for(const match of before[id].inner.matchAll(/\bid=["']([^"']+)["']/g))check(after[id].inner.includes(`id="${match[1]}"`),`Hardware: original control ${match[1]} remains available`);
    check(/data-hw-compact="true"/.test(after[id].inner)&&/role="tablist"/.test(after[id].inner),'Hardware: compact accessible mode controls are present');
    continue;
  }
  const oldMarkup=normalizeMarkup(before[id].inner,id),newMarkup=normalizeMarkup(after[id].inner,id);
  check(oldMarkup===newMarkup,`${id}: original DOM/content changed beyond the permitted hero, loading, form, or decorative-art edits`);
  check(textContent(before[id].inner,id)===textContent(after[id].inner,id),`${id}: original text changed or was removed`);
  // Every original heading, control, label, screenshot and data attribute is
  // covered by markup equality above; count critical collections explicitly.
}
function container(section,tag,className){return blocks(section.inner,tag).find(block=>hasClass(block.open,className));}
function count(html,re){return [...html.matchAll(re)].length;}
const partnerRows=container(after.impact,'ul','partner-rows');
check(partnerRows&&count(partnerRows.inner,/<li\b/g)===6,'All six partner entries must remain');
const partnerRoles=[...after.impact.inner.matchAll(/<p class="partner-role[^>]*>([^]*?)<\/p>/g)].map(m=>m[1]);
const oldPartnerRoles=[...before.impact.inner.matchAll(/<p class="partner-role[^>]*>([^]*?)<\/p>/g)].map(m=>m[1]);
check(JSON.stringify(partnerRoles)===JSON.stringify(oldPartnerRoles),'Partner roles and their order must remain verbatim');
const sensorRows=blocks(after.sensors.inner,'div').filter(block=>hasClass(block.open,'sensor-row')&&!hasClass(block.open,'sensor-row--head'));
check(sensorRows.length===6,'All six controller/sensor rows must remain');
check(normalizeMarkup(container(after.sensors,'dl','parts-foot')?.inner||'')===normalizeMarkup(container(before.sensors,'dl','parts-foot')?.inner||''),'Shared bus and additional rig details must remain verbatim');
check(count(container(after.roadmap,'ol','log')?.inner||'',/<li\b/g)===7,'All seven roadmap milestones must remain');
check(count(container(after.workshops,'ol','ws-list')?.inner||'',/<li\b/g)===5,'All five workshop entries must remain');
check(count(container(after.team,'ul','founder-facts')?.inner||'',/<li\b/g)===5,'All five founder facts must remain');
check(count(after.faq.inner,/<details\b/g)===4,'All four original FAQ answers must remain');
check(count(after['device-tour'].inner,/<img\b[^>]*\bclass=["'][^"']*\bscreen-shot\b/g)===4,'All four real software screenshots must remain');
check(count(after.product.inner,/<li\b[^>]*\bclass=["'][^"']*\bfl-card\b/g)===6,'All six field photographs/cards must remain');
check(count(after.prototype.inner,/<article\b[^>]*\bclass=["'][^"']*\bhw-chapter\b/g)===10,'All ten original hardware chapters must remain');

const groups=blocks(currentClean,'div').filter(block=>hasClass(block.open,'planet-story'));
const groupSections=[['impact','problem','solution','philosophy','ai','sensors'],['pathos-iot','roadmap','workshops','how','team','faq']];
check(groups.length===2,'Exactly two planet passages are required');
for(let index=0;index<groupSections.length;index++){
  const group=groups[index];if(!group)continue;
  const members=currentSections.filter(section=>section.start>group.start&&section.end<group.end);
  check(JSON.stringify(sectionIds(members))===JSON.stringify(groupSections[index]),`Planet passage ${index+1} must contain only its six requested original sections`);
  check(members.every(section=>attr(section.open,'data-planet-chapter')!==undefined),`Planet passage ${index+1} has an unmarked chapter`);
  check(!/class=["'][^"']*\bedge-art\b/.test(group.inner),`Planet passage ${index+1} still includes redundant decorative edge canvases`);
  check(/<svg\b[^>]*class=["']orbit-type["'][^>]*aria-hidden=["']true["']/.test(group.inner),`Planet passage ${index+1} must hide its decorative duplicate heading from assistive technology`);
  check(/<textPath\b[^>]*class=["']orbit-type-words["']/.test(group.inner),`Planet passage ${index+1} needs a surface text path`);
}
const scoped=currentSections.filter(section=>attr(section.open,'data-planet-chapter')!==undefined);
check(scoped.length===12,'Exactly 12 original sections must receive the planetary treatment');
for(const id of ['hero','proof','film','device-tour','prototype','product','contact'])check(!groups.some(group=>after[id].start>group.start&&after[id].end<group.end),`${id} must remain outside both planet passages`);
const sheets=[...current.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/g)].map(m=>attr(m[0],'href'));
check(JSON.stringify(sheets)===JSON.stringify(['integrated.css']),'The integrated page must request one CSS bundle');
const moduleSources=[...current.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/g)].map(m=>m[1]);
const needed=['main.js','tilt.js','field.js','play.js','story.js','film.js','hero.js','prototype-loader.js','hardware-experience.js','integration.js'];
check(JSON.stringify(moduleSources)===JSON.stringify(needed),'Original functional modules plus the scoped integration and lazy hardware loader must remain');
check(!/(?:src|href)=["'](?:\.\/)?experience\.(?:js|css)["']/.test(current),'Replacement-page experience modules must not load');
const css=read('integrated.css');
check(!/fonts\.(?:googleapis|gstatic)\.com/.test(current+css),'Integrated page must serve fonts locally');
for(const file of ['integration.css','brand.css','design-tokens.css','ui-system.css','hardware-experience.css','compact-layout.css','media-controls.css'])check(css.includes(prepareStylesheet(read(file))),`The served bundle includes the current root-relative ${file}`);
check(!/(?:^|[;{])\s*font-size\s*:[^;}]*\dpx\b/m.test(css),'Compiled text sizes must respect root text settings');
check(!/(?:^|[;{])\s*line-height\s*:[^;}]*\dpx\b/m.test(css),'Compiled text leading must grow with enlarged type');
const changedScripts=['main.js','story.js','play.js','integration.js','orbit-motion.js','prototype-loader.js','planet.js','prototype.js','hardware-quality.js','hero.js','film.js','deliverables/build-integrated.cjs'];
for(const script of changedScripts){const result=spawnSync(process.execPath,['--check',path.join(root,script)],{encoding:'utf8'});check(result.status===0,`${script}: JavaScript syntax error ${result.stderr}`);}

const pages=['index.html','hardware.html','privacy.html','404.html'];
const documents=Object.fromEntries(pages.filter(file=>fs.existsSync(path.join(root,file))).map(file=>[file,read(file)]));
const ids=Object.fromEntries(Object.entries(documents).map(([file,html])=>[file,[...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1])]));
function verifyReference(source,raw){
  if(!raw||/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(raw))return;
  const [pathname,fragment]=raw.replace(/&amp;/g,'&').split('#');
  let target=pathname?path.resolve(root,path.dirname(source),decodeURIComponent(pathname.split('?')[0])):path.join(root,source);
  if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');
  check(target.startsWith(root+path.sep),`${source}: reference escapes checkout: ${raw}`);
  check(fs.existsSync(target),`${source}: missing local reference: ${raw}`);
  if(fragment&&fs.existsSync(target)&&target.endsWith('.html')){
    const targetIds=ids[path.relative(root,target).replaceAll(path.sep,'/')]||[...fs.readFileSync(target,'utf8').matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
    check(targetIds.includes(decodeURIComponent(fragment)),`${source}: broken fragment: ${raw}`);
  }
}
for(const [file,html] of Object.entries(documents)){
  check(new Set(ids[file]).size===ids[file].length,`${file}: duplicate DOM IDs`);
  for(const match of html.matchAll(/<(?:a|link|script|img|video|source|textPath|use)\b[^>]*>/gi)){
    for(const name of ['href','src','poster','data-src','data-photo'])verifyReference(file,attr(match[0],name));
    const srcset=attr(match[0],'srcset');if(srcset)for(const candidate of srcset.split(','))verifyReference(file,candidate.trim().split(/\s+/)[0]);
  }
  for(const match of html.matchAll(/clip-path=["']url\(#([^)'"\s]+)\)["']/g))check(ids[file].includes(match[1]),`${file}: missing SVG clipping path #${match[1]}`);
}
for(const match of css.matchAll(/url\(["']?([^\s)'";]+)["']?\)/g))if(!match[1].startsWith('#'))verifyReference('integrated.css',match[1]);
check(/preload="none"/.test(after.hero.inner)&&!/\bautoplay\b/.test(after.hero.inner),'Hero video loading must remain deferred');
check(/preload="none"/.test(after.film.inner)&&!/\bautoplay\b/.test(after.film.inner),'Project film loading must remain deferred');
const loader=read('prototype-loader.js');
check(/IntersectionObserver/.test(loader)&&!/requestIdleCallback|setTimeout\s*\(/.test(loader),'Hardware loader must be visibility-gated without an unconditional idle import');
const integration=read('integration.js');
check(count(integration,/document\.createElement\('canvas'\)/g)===1,'Planet passages must share one canvas');
check(/if\(document\.hidden\)return/.test(integration)&&/if\(!settled\|\|needsMeasure\)\{dirty=true;wake\(\);\}/.test(integration)&&/if\(needsMeasure&&time-lastMeasure>=\d+\)measure\(\)/.test(integration)&&!/ambient\s*\+=|setInterval\s*\(/.test(integration),'Planet scheduling must settle after scroll or a bounded pending geometry update and stop while hidden, without an ambient idle loop');
const integrationImports=[...integration.matchAll(/^import\s+[^;]*?from\s+["']([^"']+)["'];?/gm)].map(match=>match[1]);
check(integrationImports.includes('./orbit-motion.js'),'The scroll story must load its production angular motion module');
for(const dependency of integrationImports)verifyReference('integration.js',dependency);
console.log(`${checks-failures.length}/${checks} integrated content/source checks passed.`);
console.log('Preserved collections: 19 sections; 6 partners; 6 sensor/controller rows; bus details; 7 milestones; 5 workshops; 5 founder facts; 4 FAQs; 4 software screens; 6 field cards; 10 hardware chapters.');
console.log(`CSS bundle: ${(Buffer.byteLength(css)/1024).toFixed(1)} KiB raw, ${(gzipSync(css).length/1024).toFixed(1)} KiB gzip. Source size only; browser behavior is verified separately.`);
if(failures.length){for(const issue of failures)console.error(`FAIL: ${issue}`);process.exitCode=1;}
