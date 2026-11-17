// Faithful vector reconstruction of the owner's supplied Pathos IoT logo.
// The filled emblem preserves its P, pulse notch, rounded bow and flat stem.
const gold='#e8b021';
const markPath='M104 69H138.5C148.9 69 157.3 77.4 157.3 87.9C157.3 98.4 148.9 106.8 138.5 106.8H132.6L128 119.7L123 98.7L119.8 106.8H113.3C110.8 106.8 109.1 108.5 109.1 111V131H104V110.3C104 105.3 107.4 101.8 112.6 101.8H116.4L123.7 85L128.5 108.1L129.9 101.8H138.5C146.1 101.8 152.2 95.6 152.2 87.9C152.2 80.3 146.1 74.2 138.5 74.2H104Z';
const mark=(color=gold)=>`<path fill="${color}" d="${markPath}"/>`;
function wordmark(color=gold,muted='#9e792e',optical=false){
  return `<g fill="none" stroke="${color}" stroke-width="1.75" stroke-linecap="butt" stroke-linejoin="round"><path d="M48.5 163.5V147.8H54.2C62.2 147.8 62.2 156.3 54.2 156.3H48.5M74.1 163.5L81.5 147.5L89.2 163.5M104.7 147.8H117.4M111 147.8V163.5M134.6 147.8V163.5M146.6 147.8V163.5M134.6 155.4H146.6"/><ellipse cx="172.7" cy="155.6" rx="8" ry="7.9"/><path d="M207.5 149.3C204.9 147.2 200.1 147.2 198.4 150.1C195.8 155.1 207.9 153.8 207.9 159C207.9 164.5 199.5 164.4 197.6 161.4"/></g><g fill="none" stroke="${muted}" stroke-width=".7"><path d="M66 178.7H105M150 178.7H190"/><g${optical?' transform="translate(128 179) scale(1.35) translate(-128 -179)"':''} stroke-width=".9"><path d="M117.1 175.5V182M135.1 175.5H141.1M138.1 175.5V182"/><ellipse cx="127.4" cy="179.5" rx="2.2" ry="2.5"/></g></g>`;
}
const svg=(viewBox,body,title='Pathos IoT')=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img"><title>${title}</title>${body}</svg>\n`;
const stacked=svg('40 62 178 130',mark()+wordmark());
const horizontal=svg('0 0 224 56',`<g transform="translate(2 3) scale(.78) translate(-104 -69)">${mark()}</g><g transform="translate(61 12) scale(.96) translate(-47 -147)">${wordmark(gold,gold,true)}</g>`);
const emblem=svg('100 65 62 70',mark());
// A padded, square relief of the supplied emblem stays legible on the small
// mobile sphere. The wordmark remains in the page's navigation and footer.
const mask=svg('88 58 84 84',mark('#fff'));
const icon=(rounded=true)=>svg('0 0 96 96',`<rect width="96" height="96" rx="${rounded?20:0}" fill="#10100e"/><g transform="translate(24 20) scale(.9) translate(-104 -69)">${mark()}</g>`);
module.exports={gold,markPath,mark,wordmark,svg,stacked,horizontal,emblem,mask,icon};
