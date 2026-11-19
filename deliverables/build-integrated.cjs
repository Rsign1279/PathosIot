/* Rebuild the integrated page without discarding the founder's original work. */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const {applyBrand}=require('./apply-brand.cjs');
const {prepareStylesheet}=require('./design-system.cjs');
const root = path.resolve(__dirname, '..');
const originalPath = path.join(__dirname, 'original-page.html');
if (!fs.existsSync(originalPath)) fs.writeFileSync(originalPath, cp.execFileSync('git', ['show', '6cfb566:index.html'], { cwd: root }));
let html = fs.readFileSync(originalPath, 'utf8');

const groups = [
  { id:'planet-understanding', label:'A world beneath the surface', number:'01', chapters:[
    ['impact','Built with people','The people who move the work forward.'],
    ['problem','Listen a little earlier','The body and the words do not always arrive together.'],
    ['solution','Meet PATHOS','One system. Several ways to understand it.'],
    ['philosophy','Signals in connection','One reading can mean many things.'],
    ['ai','Context before conclusions','From raw signals to a careful interpretation.'],
    ['sensors','Small parts. Shared purpose.','Every component has a reason to be here.']
  ]},
  { id:'planet-next-chapter', label:'The next chapter is human', number:'02', chapters:[
    ['pathos-iot','Closer to the body','The next version is still being built.'],
    ['roadmap','From here, forward','The work so far, and the questions ahead.'],
    ['workshops','Understanding is something we share','Teaching the pieces, one at a time.'],
    ['how','A minute to check in','Place. Verify. Observe.'],
    ['team','Built by a person, for people','The person behind the prototype.'],
    ['faq','Good questions. Honest answers.','A little clarity before the next conversation.']
  ]}
];
const stage = group => `<aside class="planet-stage" aria-label="${group.label}">
  <div class="orbit-object" aria-hidden="true">
    <svg class="orbit-lines" viewBox="0 0 1000 1000"><g fill="none" stroke="currentColor"><ellipse cx="500" cy="500" rx="477" ry="212" transform="rotate(-28 500 500)"/><ellipse cx="500" cy="500" rx="435" ry="322" transform="rotate(35 500 500)" stroke-dasharray="1 9"/><circle cx="500" cy="500" r="360" opacity=".25"/></g><g fill="currentColor"><circle cx="850" cy="285" r="4"/><circle cx="150" cy="712" r="3"/></g></svg>
    <div class="planet-surface"><div class="orbit-still"></div></div>
    <svg class="orbit-type" viewBox="0 0 1000 1000" aria-hidden="true"><defs><clipPath id="${group.id}-type-clip"><circle cx="500" cy="500" r="496"/></clipPath><path id="${group.id}-type-path" d="M-60 530 Q500 420 1060 530"/></defs><g clip-path="url(#${group.id}-type-clip)"><text><textPath class="orbit-type-words" href="#${group.id}-type-path" startOffset="-1000"></textPath></text></g></svg>
  </div>
  <svg class="orbit-thread" aria-hidden="true"><path class="orbit-surface-trace"/><path class="orbit-thread-path"/></svg><span class="orbit-source" aria-hidden="true"></span>
  <div class="planet-stage-caption"><span class="planet-chapter-count">01 / 06</span><h2 class="planet-chapter-title">${group.chapters[0][1]}</h2><p class="planet-chapter-note">${group.chapters[0][2]}</p></div>
</aside>`;

for (const group of groups) {
  const start = html.indexOf(`<section id="${group.chapters[0][0]}"`);
  const lastStart = html.indexOf(`<section id="${group.chapters.at(-1)[0]}"`);
  const end = html.indexOf('</section>', lastStart) + '</section>'.length;
  if (start < 0 || lastStart < start || end < lastStart) throw new Error(`Missing original chapter group ${group.id}`);
  let body = html.slice(start, end);
  group.chapters.forEach(([id,label,note],i)=>{
    body=body.replace(new RegExp(`<section id="${id}"([^>]*)>`), `<section id="${id}"$1 data-planet-chapter="${i}" data-planet-title="${label}" data-planet-note="${note}">`);
  });
  // Only decorative margin art is replaced. Charts, signal traces and scenes remain.
  body = body.replace(/\s*<canvas class="edge-art"[^>]*><\/canvas>/g, '');
  html=html.slice(0,start)+`<div class="planet-story" id="${group.id}" data-planet-story="${group.number}">\n${stage(group)}\n<div class="planet-content">\n${body}\n</div>\n</div>`+html.slice(end);
}

// Preserve the original pinned Blender stage and shot layout. Adaptive mode
// controls sit above it; optional playback controls stay in its original bar.
const hardwareStart=html.indexOf('<section id="prototype"');
const hardwareEnd=html.indexOf('</section>',hardwareStart)+'</section>'.length;
if(hardwareStart<0||hardwareEnd<hardwareStart)throw new Error('Original hardware study missing');
let hardware=html.slice(hardwareStart,hardwareEnd);
hardware=hardware.replace('class="prototype"','class="prototype hw-experience" data-hw-renderer="guided"');
let chapterIndex=0;
hardware=hardware.replace(/<article class="hw-chapter[^\"]*"/g,tag=>tag+` data-hw-current="${chapterIndex++===0}"`);
hardware=hardware.replace('id="hwHud" aria-live="polite"','id="hwHud" aria-live="off"');
hardware=hardware.replace('Loading the 3D model…','Preparing the guided visual…');
hardware=hardware.replace('Back to the film','Back to walkthrough');
hardware=hardware.replace('<a class="hw-skip" href="#product">Skip to the build &darr;</a>','<a class="hw-skip" href="#product" aria-label="Skip to the build"><span class="hw-skip-label">Skip to the build &darr;</span><span class="hw-skip-short" aria-hidden="true">Skip</span></a>');
hardware=hardware.replace('<div class="hw-track" id="hwTrack">', `<div class="wrap hw-mode-heading">
  <div class="hw-mode-tabs" role="tablist" aria-label="Hardware viewing mode">
    <button type="button" role="tab" id="hwGuidedTab" aria-selected="true" aria-controls="hwExperiencePanel" tabindex="0" data-hw-mode="guided">Guided Visual</button>
    <button type="button" role="tab" id="hw3DTab" aria-selected="false" aria-controls="hwExperiencePanel" tabindex="-1" data-hw-mode="3d">3D Walkthrough</button>
  </div>
  <p class="hw-mode-note" id="hwModeNote" role="status" aria-live="polite">Scroll to explore the guided visual, or choose the live 3D view.</p>
</div>
<div id="hwExperiencePanel" role="tabpanel" aria-labelledby="hwGuidedTab">
<div class="hw-track" id="hwTrack">`);
hardware=hardware.replace('<span class="hw-clock"', `<button type="button" class="hw-play" id="hwPlay" aria-label="Play walkthrough"><span id="hwPlayIcon" aria-hidden="true"></span><span id="hwPlayText">Play</span></button>
<button type="button" class="hw-scroll" id="hwScroll" aria-pressed="true">Scroll</button>
<span class="hw-clock"`);
hardware=hardware.replace('</section>','</div>\n</section>');
html=html.slice(0,hardwareStart)+hardware+html.slice(hardwareEnd);

html=html.replace(/    <link rel="preconnect" href="https:\/\/fonts\.[^\n]+\n/g,'');
html=html.replace(/    <link href="https:\/\/fonts\.googleapis[^\n]+\n/g,'');
html=html.replace(/    <link rel="stylesheet" href="(?:styles|prototype|field|play|story|system|film|flow|editorial)\.css">\r?\n/g,'');
html=html.replace('    <script type="importmap">', '    <link rel="preload" href="assets/fonts/figtree-latin-variable.woff2" as="font" type="font/woff2" crossorigin>\n    <link rel="preload" href="assets/fonts/eb-garamond-latin-400.woff2" as="font" type="font/woff2" crossorigin>\n    <link rel="stylesheet" href="integrated.css">\n\n    <script type="importmap">');
html=html.replace('<body>', '<body class="integrated-page">');
html=html.replace('<div class="menu" id="navLinks">','<button class="planet-motion" id="planetMotion" type="button" aria-pressed="false" aria-label="Pause the planet animation"><span aria-hidden="true">Ⅱ</span><span class="planet-motion-label">Pause planet</span></button>\n            <div class="menu" id="navLinks">');
html=html.replace(/<video class="hero-video"([^>]*)autoplay ([^>]*)preload="auto"/, '<video class="hero-video"$1$2preload="none"');
html=html.replace(/<video class="film-video"([^>]*)autoplay ([^>]*)preload="auto"/, '<video class="film-video"$1$2preload="none" controls');
// The native video controls already include a timeline; omit the old extra bar.
html=html.replace(/\s*<div class="film-scrub"[^>]*><span id="filmScrub"><\/span><\/div>/,'');
html=html.replace('PATHOS reads skin conductance, heart rhythm, skin temperature and motion,','PATHOS explores skin conductance, heart rhythm, skin temperature and motion,');
html=html.replace('with under $25 of parts.','with under $25 of parts. <span class="hero-research-status">Research prototype · Body sensors in development for MVP 2.</span>');
html=html.replace('<form class="contact-form" id="contactForm" action="https://formsubmit.co/ajax/rsignsv1279@gmail.com" method="post" novalidate>', '<form class="contact-form" id="contactForm" action="https://formsubmit.co/rsignsv1279@gmail.com" data-ajax-action="https://formsubmit.co/ajax/rsignsv1279@gmail.com" method="post">');
const importerStart=html.indexOf('    <script type="module">',html.indexOf('src="hero.js"'));
const importerEnd=html.indexOf('</script>',importerStart)+9;
if(importerStart<0)throw new Error('Original hardware importer missing');
html=html.slice(0,importerStart)+'    <script type="module" src="prototype-loader.js"></script>\n    <script type="module" src="hardware-experience.js"></script>\n    <script type="module" src="integration.js"></script>\n    <noscript><style>.planet-motion{display:none}.planet-story{display:block}.planet-stage{display:none}.planet-content{width:100%;max-width:1000px;margin:auto}.planet-content [data-reveal]{opacity:1;transform:none}</style></noscript>'+html.slice(importerEnd);
html=applyBrand(html);
fs.writeFileSync(path.join(root,'index.html'),html);
require('./sync-hardware-page.cjs').syncHardwarePage(html);

const sheets=['styles.css','prototype.css','field.css','play.css','story.css','system.css','film.css','flow.css','editorial.css','integration.css','brand.css','design-tokens.css','ui-system.css','compact-layout.css','hardware-experience.css','media-controls.css'];
const css=sheets.map(name=>`\n/* ${name} */\n`+prepareStylesheet(fs.readFileSync(path.join(root,name),'utf8'))).join('\n');
fs.writeFileSync(path.join(root,'integrated.css'),css);
console.log(`Restored all 19 original sections. Scoped the planet to ${groups.reduce((n,g)=>n+g.chapters.length,0)} requested sections in two passages. One CSS request; ${Buffer.byteLength(css)} bytes before compression.`);
