// Compile legacy type declarations into root-relative units. Geometry and
// canvas dimensions remain pixels; browser text-size preferences can grow type.
const breakpoints=Object.freeze({mobile:640,navigation:900,wide:1100});
function prepareStylesheet(source){
  return source.replace(/(\b(?:font(?:-size)?|line-height)\s*:\s*)([^;}]+)/g,(_,property,value)=>
    property+value.replace(/(-?\d*\.?\d+)px\b/g,(_,number)=>`${Number(number)/16}rem`));
}
module.exports={breakpoints,prepareStylesheet};
