"""Outline the site's licensed brand fonts for a portable social-preview SVG.

Development dependencies: fonttools[woff] (including Brotli).
The shipped SVG/PNG have no font or Python dependency.
"""
from pathlib import Path
from html import escape
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen

root = Path(__file__).resolve().parent.parent

def outline(filename, text, x, y, size, axes, color, tracking=0):
    font = TTFont(root / "assets" / "fonts" / filename)
    font = instantiateVariableFont(font, axes, inplace=True)
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    scale = size / font["head"].unitsPerEm
    cursor, paths = 0, []
    for character in text:
        name = cmap.get(ord(character), ".notdef")
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        path = pen.getCommands()
        if path:
            paths.append(f'<path transform="translate({cursor:.3f} 0)" d="{path}"/>')
        cursor += font["hmtx"][name][0] + tracking / scale
    label = escape(text, quote=True)
    return (f'<g aria-label="{label}" fill="{color}" transform="translate({x} {y}) '
            f'scale({scale:.7f} {-scale:.7f})">' + "".join(paths) + '</g>')

for text, y in [("Stress awareness.",229),("From the body's",304),("own signals.",379)]:
    print(outline("fraunces-latin-variable.woff2",text,568,y,61,{"wght":400,"opsz":61},"#f2ede4"))
print(outline("space-grotesk-latin-variable.woff2","PATHOS IoT · RESEARCH PROTOTYPE",570,480,14,{"wght":500},"#e8b021",1.6))
