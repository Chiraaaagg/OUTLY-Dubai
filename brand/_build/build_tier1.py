from lib import *
from PIL import Image
import io, cairosvg

# ---------------------------------------------------------------- 01 logo
variants = {
    "outlyy-logo-primary":        dict(ring_c=INK, sun_c=SUN, title="OUTLYY"),
    "outlyy-logo-primary-mono":   dict(ring_c=INK, sun_c=INK, title="OUTLYY"),
    "outlyy-logo-white":          dict(ring_c=PAPER, sun_c=SUN, title="OUTLYY"),
    "outlyy-logo-white-mono":     dict(ring_c=PAPER, sun_c=PAPER, title="OUTLYY"),
    "outlyy-logo-on-sun":         dict(ring_c=INK, sun_c=PAPER, title="OUTLYY"),
}
for name, kw in variants.items():
    svg, (w, h) = wordmark_svg(**kw)
    save(f"01-logo/svg/{name}.svg", svg)
    for width in (240, 480, 960, 1920):
        png(None, f"01-logo/png/{name}-{width}w.png", w=width, svg_text=svg)

# ---------------------------------------------------------------- 02 logomark
def mark_svg(ring, sun, spec=MARK64, size=64, bg=None, rx=0, title="OUTLYY"):
    vb = 16 if spec is MARK16 else 64
    bgr = f'<rect width="{vb}" height="{vb}" rx="{rx}" fill="{bg}"/>' if bg else ""
    return svg_doc(size, size, bgr + mark(ring=ring, sun=sun, spec=spec), title=title, vb=f"0 0 {vb} {vb}")

marks = {
    "outlyy-mark":            (INK, SUN),
    "outlyy-mark-mono":       (INK, INK),
    "outlyy-mark-white":      (PAPER, SUN),
    "outlyy-mark-white-mono": (PAPER, PAPER),
    "outlyy-mark-on-sun":     (INK, PAPER),
}
for name, (r, s) in marks.items():
    svg = mark_svg(r, s)
    save(f"02-logomark/svg/{name}.svg", svg)
    save(f"02-logomark/svg/{name}-16px.svg", mark_svg(r, s, spec=MARK16, size=16))
    for px in (64, 128, 256, 512, 1024):
        png(None, f"02-logomark/png/{name}-{px}.png", w=px, svg_text=svg)

# ---------------------------------------------------------------- 03 favicon
# icon.svg: adaptive (dark-mode ring turns white) — covers Tier 3 #17 as well.
icon_svg = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
    '<style>.r{fill:#14101F}@media (prefers-color-scheme:dark){.r{fill:#FFFFFF}}</style>'
    f'<path class="r" d="{ring_path(**{k: MARK64[k] for k in ("cx","cy","r","w")})}"/>'
    f'<circle fill="{SUN}" cx="49" cy="15" r="9"/></svg>')
save("03-favicon/icon.svg", icon_svg)
save("03-favicon/icon-light.svg", mark_svg(INK, SUN))
save("03-favicon/icon-dark.svg", mark_svg(PAPER, SUN))

def fav_png(px):
    """Raster favicons sit on a Sand tile so they survive dark tab strips."""
    if px <= 16:
        body = f'<rect width="16" height="16" rx="3.5" fill="{SAND}"/>' + mark(spec=MARK16, tx=0.9, ty=0.9, scale=0.89)
        svg = svg_doc(px, px, body, vb="0 0 16 16")
    else:
        body = f'<rect width="64" height="64" rx="14" fill="{SAND}"/>' + mark(tx=4.8, ty=4.8, scale=0.85)
        svg = svg_doc(px, px, body, vb="0 0 64 64")
    return cairosvg.svg2png(bytestring=svg.encode(), output_width=px, output_height=px)

ims = {}
for px in (16, 32, 48):
    data = fav_png(px); save(f"03-favicon/favicon-{px}.png", data)
    ims[px] = Image.open(io.BytesIO(data)).convert("RGBA")
ims[48].save(os.path.join(OUT, "03-favicon/favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)],
             append_images=[ims[16], ims[32]])

# ---------------------------------------------------------------- 04 app icons
def app_icon(px, maskable=False, rounded=False):
    # Full-bleed Sand. Maskable: mark ink fits inside the 40% radius safe circle.
    frac = 0.46 if maskable else 0.60
    box = px * frac
    bg = f'<rect width="{px}" height="{px}" rx="{px*0.22 if rounded else 0}" fill="{SAND}"/>'
    return svg_doc(px, px, bg + mark_at((px - box) / 2, (px - box) / 2, box))

for name, px, kw in [("apple-touch-icon", 180, {}), ("icon-192", 192, {"rounded": True}),
                     ("icon-512", 512, {"rounded": True}), ("icon-512-maskable", 512, {"maskable": True})]:
    svg = app_icon(px, **kw); save(f"04-app-icons/svg/{name}.svg", svg)
    png(None, f"04-app-icons/{name}.png", w=px, h=px, svg_text=svg)

manifest = """{
  "name": "OUTLYY — Dubai experiences",
  "short_name": "OUTLYY",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#FFF8F0",
  "theme_color": "#FFF8F0",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
"""
save("04-app-icons/manifest.webmanifest", manifest)

# ---------------------------------------------------------------- stickers (shared)
def sticker(x, y, label, fill, rot, size=26, pad_x=22, pad_y=14, text_c=INK, border=3, shadow=4):
    d, adv, bb = text_path(label, "jakarta", size=size, wght=800)
    w = adv + 2 * pad_x; h = size * 0.74 + 2 * pad_y
    cxp, cyp = x + w / 2, y + h / 2
    tx, ty = x + pad_x, y + pad_y + size * 0.74
    d2, _, _ = text_path(label, "jakarta", size=size, x=tx, y=ty, wght=800)
    return (f'<g transform="rotate({rot} {cxp:.1f} {cyp:.1f})">'
            f'<rect x="{x+shadow}" y="{y+shadow}" width="{w:.1f}" height="{h:.1f}" rx="6" fill="{INK}"/>'
            f'<rect x="{x}" y="{y}" width="{w:.1f}" height="{h:.1f}" rx="6" fill="{fill}" stroke="{INK}" stroke-width="{border}"/>'
            f'<path fill="{text_c}" d="{d2}"/></g>'), w

# ---------------------------------------------------------------- 05 default OG
W, H = 1200, 630
body = f'<rect width="{W}" height="{H}" fill="{SAND}"/>'
wm, wmw = wordmark_group(88, 118, 104)
body += wm
l1, _, _ = text_path("Things to do in Dubai,", "bricolage", size=62, x=90, y=346, tracking=-0.02, opsz=48, wght=700)
l2, _, _ = text_path("priced in rupees.", "bricolage", size=62, x=90, y=420, tracking=-0.02, opsz=48, wght=700)
body += f'<path fill="{INK}" d="{l1} {l2}"/>'
sub, _, _ = text_path("WhatsApp support in about 30 minutes · no fees added at checkout", "jakarta", size=24, x=92, y=500, wght=600)
body += f'<path fill="{INK_600}" d="{sub}"/>'
s1, _ = sticker(820, 150, "Pay by UPI", SUN, 5)
s2, _ = sticker(870, 262, "Jain & pure-veg", LAGOON_100, -4)
s3, _ = sticker(800, 376, "Hotel pickup", PAPER, 3)
body += s1 + s2 + s3
# Big decorative ring bleeding off the bottom-right corner (one sun only → no sun here)
body += f'<path fill="{SUN_100}" d="{ring_path(1130, 640, 150, 58)}"/>'
og = svg_doc(W, H, body, title="OUTLYY — things to do in Dubai, priced in rupees")
save("05-og/svg/og-default.svg", og)
png(None, "05-og/og-default.png", w=W, h=H, svg_text=og)

# ---------------------------------------------------------------- 06 WhatsApp
def avatar(px, ground=SUN, ring=INK, sun=PAPER):
    box = px * 0.50  # ink inside the circle crop with generous margin
    return svg_doc(px, px, f'<rect width="{px}" height="{px}" fill="{ground}"/>' +
                   mark_at((px - box) / 2, (px - box) / 2, box, ring=ring, sun=sun), title="OUTLYY")
wa = avatar(640)
save("06-whatsapp/svg/outlyy-whatsapp-640.svg", wa)
png(None, "06-whatsapp/outlyy-whatsapp-640.png", w=640, h=640, svg_text=wa)
wa_ink = avatar(640, ground=INK, ring=PAPER, sun=SUN)
save("06-whatsapp/svg/outlyy-whatsapp-640-ink.svg", wa_ink)
png(None, "06-whatsapp/outlyy-whatsapp-640-ink.png", w=640, h=640, svg_text=wa_ink)
print("tier1 done")
