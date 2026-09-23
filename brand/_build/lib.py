"""OUTLYY brand asset builder — shared geometry, fonts and helpers.

All text is converted to outlines (filled paths). No strokes in masters except
where noted (loader animation uses stroke-dashoffset by necessity).
"""
import io, math, os
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

# ---- Palette (from src/app/globals.css) -------------------------------------
INK = "#14101F"; INK_800 = "#241B3A"; INK_600 = "#574A71"; INK_400 = "#A79EB8"
INK_300 = "#CDC6D8"; INK_200 = "#E6E1EE"; INK_100 = "#F2EFF7"
SUN = "#FF6A13"; SUN_700 = "#BD4102"; SUN_100 = "#FFE6D1"; SUN_50 = "#FFF5EC"
SAND = "#FFF8F0"; PAPER = "#FFFFFF"; SHELL = "#FDF3E7"
LAGOON = "#00A6A0"; LAGOON_600 = "#008783"; LAGOON_700 = "#036A68"; LAGOON_100 = "#C9F2EE"

OUT = "/mnt/user-data/outputs/outlyy-brand"

# ---- Fonts -----------------------------------------------------------------
_FONTS = {
    "bricolage": "/tmp/claude-0/font/package/files/bricolage-grotesque-latin-opsz-normal.woff2",
    "jakarta": "/tmp/claude-0/font/pj/package/files/plus-jakarta-sans-latin-wght-normal.woff2",
    "bricolage_ext": "/tmp/claude-0/font/package/files/bricolage-grotesque-latin-ext-standard-normal.woff2",
    "jakarta_ext": "/tmp/claude-0/font/pj/package/files/plus-jakarta-sans-latin-ext-wght-normal.woff2",
}
_cache = {}

def _font(key):
    if key not in _cache:
        tt = TTFont(_FONTS[key]); tt.flavor = None
        buf = io.BytesIO(); tt.save(buf)
        _cache[key] = (tt, buf.getvalue())
    return _cache[key]

def text_path(text, key="bricolage", size=100.0, x=0.0, y=0.0, tracking=0.0, **axes):
    """Run-splitting wrapper: characters missing from the latin subset (e.g. ₹)
    are shaped with the latin-ext file of the same family."""
    cm = _font(key)[0].getBestCmap()
    runs = []
    for ch in text:
        k = key if ord(ch) in cm or key.endswith("_ext") else key + "_ext"
        if runs and runs[-1][0] == k: runs[-1][1] += ch
        else: runs.append([k, ch])
    if len(runs) == 1:
        return _text_path(text, runs[0][0], size, x, y, tracking, **axes)
    ds = []; cx = x; bb = [1e9, 1e9, -1e9, -1e9]
    for k, t in runs:
        d, adv, b = _text_path(t, k, size, cx, y, tracking, **axes)
        ds.append(d); cx += adv + tracking * size
        if b[0] < 1e8: bb = [min(bb[0], b[0]), min(bb[1], b[1]), max(bb[2], b[2]), max(bb[3], b[3])]
    return " ".join(ds), cx - x - tracking * size, tuple(bb)

def _text_path(text, key="bricolage", size=100.0, x=0.0, y=0.0, tracking=0.0, **axes):
    """Outline `text`. (x, y) is the baseline origin in px; size is font-size in px;
    tracking in em. Returns (svg path d, advance width px, (xmin, ymin, xmax, ymax) px)."""
    tt, data = _font(key)
    if key.startswith("bricolage"):
        axes = {"opsz": axes.get("opsz", 36), "wght": axes.get("wght", 800)}
    else:
        axes = {"wght": axes.get("wght", 800)}
    face = hb.Face(data); font = hb.Font(face); font.set_variations(axes)
    b = hb.Buffer(); b.add_str(text); b.guess_segment_properties()
    hb.shape(font, b, {"kern": True, "liga": False})
    gs = tt.getGlyphSet(location=axes)
    order = tt.getGlyphOrder()
    s = size / tt["head"].unitsPerEm
    trk = tracking * 1000
    cx = 0.0; cmds = []; bb = [1e9, 1e9, -1e9, -1e9]
    for info, pos in zip(b.glyph_infos, b.glyph_positions):
        name = order[info.codepoint]
        t = (s, 0, 0, -s, x + (cx + pos.x_offset) * s, y - pos.y_offset * s)
        pen = SVGPathPen(gs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
        gs[name].draw(TransformPen(pen, t))
        cmds.append(pen.getCommands())
        bp = BoundsPen(gs); gs[name].draw(TransformPen(bp, t))
        if bp.bounds:
            x0, y0, x1, y1 = bp.bounds
            bb = [min(bb[0], x0), min(bb[1], y0), max(bb[2], x1), max(bb[3], y1)]
        cx += pos.x_advance + trk
    return " ".join(cmds), (cx - trk) * s, tuple(bb)


# ---- The mark ---------------------------------------------------------------
def ring_path(cx, cy, r, w):
    """Filled outline of a 270° ring (open top-right quadrant) with round caps."""
    ro, ri, h = r + w / 2, r - w / 2, w / 2
    f = lambda v: f"{v:.3f}".rstrip("0").rstrip(".")
    return (f"M{f(cx+ro)} {f(cy)}A{f(ro)} {f(ro)} 0 1 1 {f(cx)} {f(cy-ro)}"
            f"A{f(h)} {f(h)} 0 0 1 {f(cx)} {f(cy-ri)}"
            f"A{f(ri)} {f(ri)} 0 1 0 {f(cx+ri)} {f(cy)}"
            f"A{f(h)} {f(h)} 0 0 1 {f(cx+ro)} {f(cy)}Z")

# 64-unit master: ring c(30,34) r19 w10, sun c(49,15) r9. Ink bbox 6..58.
MARK64 = dict(cx=30, cy=34, r=19, w=10, sx=49, sy=15, sr=9)
# 16-unit hinted master for 16px: heavier stroke, larger sun. Ink bbox ≈1.5..14.5
MARK16 = dict(cx=7.5, cy=8.7, r=4.6, w=2.8, sx=12.1, sy=3.7, sr=2.4)

def mark(ring=INK, sun=SUN, spec=MARK64, tx=0, ty=0, scale=1.0, sun_attrs=""):
    m = spec
    g = f'<g transform="translate({tx:.3f} {ty:.3f}) scale({scale:.5f})">' if (tx or ty or scale != 1) else "<g>"
    return (g + f'<path fill="{ring}" d="{ring_path(m["cx"], m["cy"], m["r"], m["w"])}"/>'
            f'<circle fill="{sun}" cx="{m["sx"]}" cy="{m["sy"]}" r="{m["sr"]}"{sun_attrs}/></g>')

def mark_at(box_x, box_y, box, **kw):
    """Place the 64-master so its ink bbox (6..58, 52 units) fills `box` px at (box_x, box_y)."""
    s = box / 52.0
    return mark(tx=box_x - 6 * s, ty=box_y - 6 * s, scale=s, **kw)


# ---- Wordmark ---------------------------------------------------------------
# Built in font units (1000 upm), baseline y=0, cap height 660 (Bricolage opsz36/800).
WM = dict(cx=344, cy=-330, r=266, w=156, sr=126)
WM["sx"] = WM["cx"] + WM["r"]; WM["sy"] = WM["cy"] - WM["r"]
WM_GAP = 95                  # ring edge → U ink
WM_TRACK = -0.035            # -3.5%

def wordmark_units():
    """Return (ring d, sun (cx,cy,r), letters d, bbox) in font units, baseline 0."""
    ring = ring_path(WM["cx"], WM["cy"], WM["r"], WM["w"])
    ring_right = WM["cx"] + WM["r"] + WM["w"] / 2
    # U left side-bearing at opsz36/800 = 57.7 units
    _, _, bb0 = text_path("U", size=1000)
    x0 = ring_right + WM_GAP - bb0[0]
    letters, adv, bb = text_path("UTLYY", size=1000, x=x0, tracking=WM_TRACK)
    top = WM["sy"] - WM["sr"]
    bottom = WM["cy"] + WM["r"] + WM["w"] / 2
    box = (0.0, top, bb[2], max(bottom, bb[3]))
    return ring, (WM["sx"], WM["sy"], WM["sr"]), letters, box

def wordmark_svg(ring_c=INK, sun_c=SUN, text_c=None, pad=0.0, bg=None, title="OUTLYY"):
    ring, (sx, sy, sr), letters, (x0, y0, x1, y1) = wordmark_units()
    text_c = text_c or ring_c
    vx, vy, vw, vh = x0 - pad, y0 - pad, (x1 - x0) + 2 * pad, (y1 - y0) + 2 * pad
    bgr = f'<rect x="{vx:.1f}" y="{vy:.1f}" width="{vw:.1f}" height="{vh:.1f}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vx:.1f} {vy:.1f} {vw:.1f} {vh:.1f}" '
            f'role="img" aria-labelledby="t"><title id="t">{title}</title>{bgr}'
            f'<path fill="{ring_c}" d="{ring}"/><circle fill="{sun_c}" cx="{sx}" cy="{sy}" r="{sr}"/>'
            f'<path fill="{text_c}" d="{letters}"/></svg>'), (vw, vh)

def wordmark_group(x, y_top, height, ring_c=INK, sun_c=SUN, text_c=None):
    """Wordmark placed so its full bbox (sun top → ring bottom) is `height` px tall at (x, y_top)."""
    ring, (sx, sy, sr), letters, (x0, y0, x1, y1) = wordmark_units()
    s = height / (y1 - y0)
    text_c = text_c or ring_c
    g = (f'<g transform="translate({x - x0 * s:.2f} {y_top - y0 * s:.2f}) scale({s:.5f})">'
         f'<path fill="{ring_c}" d="{ring}"/><circle fill="{sun_c}" cx="{sx}" cy="{sy}" r="{sr}"/>'
         f'<path fill="{text_c}" d="{letters}"/></g>')
    return g, (x1 - x0) * s


# ---- IO --------------------------------------------------------------------
def svg_doc(w, h, body, title=None, vb=None):
    t = f'<title>{title}</title>' if title else ""
    vb = vb or f"0 0 {w} {h}"
    role = ' role="img"' if title else ' aria-hidden="true"'
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="{vb}"{role}>{t}{body}</svg>'

def save(rel, content):
    p = os.path.join(OUT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    mode = "wb" if isinstance(content, bytes) else "w"
    with open(p, mode) as fh: fh.write(content)
    return p

def png(svg_rel, png_rel, w=None, h=None, svg_text=None):
    import cairosvg
    src = svg_text if svg_text is not None else open(os.path.join(OUT, svg_rel)).read()
    p = os.path.join(OUT, png_rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    cairosvg.svg2png(bytestring=src.encode(), write_to=p, output_width=w, output_height=h)
    return p
