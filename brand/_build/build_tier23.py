from lib import *
from build_tier1 import sticker, avatar
import math

# ================================================================ 07 email header
wm, wmw = wordmark_group(0, 0, 40)
for scale in (1, 2, 3):
    W, H = 208, 48
    body = (f'<rect width="{W}" height="{H}" fill="{SAND}"/>'
            f'<g transform="translate(0 4)">{wm}</g>')
    svg = svg_doc(W * scale, H * scale, body, title="OUTLYY", vb=f"0 0 {W} {H}")
    if scale == 1: save("07-email/svg/outlyy-email-header.svg", svg)
    png(None, f"07-email/outlyy-email-header@{scale}x.png", w=W * scale, h=H * scale, svg_text=svg)
    body_t = f'<g transform="translate(0 4)">{wm}</g>'
    svg_t = svg_doc(W * scale, H * scale, body_t, title="OUTLYY", vb=f"0 0 {W} {H}")
    png(None, f"07-email/outlyy-email-header-transparent@{scale}x.png", w=W * scale, h=H * scale, svg_text=svg_t)

# ================================================================ 08 voucher lettermark
def stub_path(W, H, rx, n):
    m = H / 2
    return (f"M{rx} 0H{W-rx}A{rx} {rx} 0 0 1 {W} {rx}V{m-n}A{n} {n} 0 0 0 {W} {m+n}"
            f"V{H-rx}A{rx} {rx} 0 0 1 {W-rx} {H}H{rx}A{rx} {rx} 0 0 1 0 {H-rx}"
            f"V{m+n}A{n} {n} 0 0 0 0 {m-n}V{rx}A{rx} {rx} 0 0 1 {rx} 0Z")

def lettermark(ground, ring, sun):
    W, H = 72, 64
    body = f'<path fill="{ground}" d="{stub_path(W, H, 10, 7)}"/>' + mark_at(W / 2 - 18, H / 2 - 18, 36, ring=ring, sun=sun)
    return svg_doc(W, H, body, title="OUTLYY")

def voucher_lockup(ground, ring, sun, text):
    W, H = 300, 64
    body = f'<path fill="{ground}" d="{stub_path(72, H, 10, 7)}"/>' + mark_at(18, 14, 36, ring=ring, sun=sun)
    body += f'<line x1="84" y1="10" x2="84" y2="54" stroke="{text}" stroke-width="1.5" stroke-dasharray="3 3"/>'
    g, w = wordmark_group(98, 14, 36, ring_c=text, sun_c=sun if sun != ring else text)
    body += g
    return svg_doc(W, H, body, title="OUTLYY")

for name, args in {
    "outlyy-lettermark": (INK, PAPER, SUN),
    "outlyy-lettermark-sun": (SUN, INK, PAPER),
    "outlyy-lettermark-print-black": ("#000000", "#FFFFFF", "#FFFFFF"),
}.items():
    svg = lettermark(*args); save(f"08-voucher/svg/{name}.svg", svg)
    for px in (72, 144, 288):
        png(None, f"08-voucher/png/{name}-{px}w.png", w=px, svg_text=svg)
for name, args in {
    "outlyy-voucher-lockup": (INK, PAPER, SUN, INK),
    "outlyy-voucher-lockup-print-black": ("#000000", "#FFFFFF", "#FFFFFF", "#000000"),
}.items():
    svg = voucher_lockup(*args); save(f"08-voucher/svg/{name}.svg", svg)
    for px in (300, 600, 1200):
        png(None, f"08-voucher/png/{name}-{px}w.png", w=px, svg_text=svg)

# ================================================================ 09 OG templates
def txt(s, x, y, size, color=INK, key="bricolage", **kw):
    d, adv, bb = text_path(s, key, size=size, x=x, y=y, **kw)
    return f'<path fill="{color}" d="{d}"/>', adv

def perforation(x, y1, y2, color=INK_300):
    return f'<line x1="{x}" y1="{y1}" x2="{x}" y2="{y2}" stroke="{color}" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round"/>'

def notch_card(x, y, w, h, stub_x, fill=PAPER, rx=28, n=22):
    """Ticket with notches top and bottom at the perforation line."""
    return (f'<path fill="{fill}" d="M{x+rx} {y}H{stub_x-n}A{n} {n} 0 0 0 {stub_x+n} {y}H{x+w-rx}'
            f'A{rx} {rx} 0 0 1 {x+w} {y+rx}V{y+h-rx}A{rx} {rx} 0 0 1 {x+w-rx} {y+h}H{stub_x+n}'
            f'A{n} {n} 0 0 0 {stub_x-n} {y+h}H{x+rx}A{rx} {rx} 0 0 1 {x} {y+h-rx}V{y+rx}A{rx} {rx} 0 0 1 {x+rx} {y}Z"/>')

def photo_slot(x, y, w, h, rx=20, label="[ activity photo ]", rot=0):
    lbl, adv = txt(label, 0, 0, 20, INK_400, "jakarta", wght=600)
    return (f'<g transform="rotate({rot} {x+w/2} {y+h/2})"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{SHELL}" stroke="{INK_300}" stroke-width="2" stroke-dasharray="8 8"/>'
            f'<g transform="translate({x + w/2 - adv/2} {y + h/2 + 7})">{lbl}</g></g>')

W, H = 1200, 630
STUB = 1010
# --- Activity: Sun rim, photo left, details right, mark on stub
b = f'<rect width="{W}" height="{H}" fill="{SUN}"/>' + notch_card(40, 40, 1120, 550, STUB)
b += photo_slot(72, 72, 430, 486)
st, _ = sticker(540, 96, "[CATEGORY]", SUN_100, -3, size=22)
b += st
t1, _ = txt("[Activity title,", 540, 262, 50, tracking=-0.02, opsz=48, wght=800)
t2, _ = txt("up to three lines]", 540, 322, 50, tracking=-0.02, opsz=48, wght=800)
p1, _ = txt("from ₹[PRICE] · all-in", 542, 452, 28, INK, "jakarta", wght=800)
p2, _ = txt("[rating] · [duration] · hotel pickup", 542, 498, 22, INK_600, "jakarta", wght=600)
b += t1 + t2 + p1 + p2 + perforation(STUB, 80, 550) + mark_at(STUB + 40, 270, 70)
og_a = svg_doc(W, H, b, title="OUTLYY activity OG template")
save("09-og-templates/svg/og-activity-template.svg", og_a); png(None, "09-og-templates/og-activity-template.png", w=W, h=H, svg_text=og_a)

# --- Category: Ink rim, fanned tiles right
b = f'<rect width="{W}" height="{H}" fill="{INK}"/>' + notch_card(40, 40, 1120, 550, STUB)
st, _ = sticker(96, 104, "CATEGORY", LAGOON_100, -3, size=22)
b += st
t1, _ = txt("[Category name]", 96, 300, 72, tracking=-0.025, opsz=72, wght=800)
p1, _ = txt("[N] experiences in Dubai · from ₹[PRICE]", 98, 372, 26, INK_600, "jakarta", wght=700)
b += t1 + p1
for i, (dx, rot) in enumerate([(-96, -8), (0, 0), (96, 8)]):
    cx0 = 800 + dx; cy0 = 455 + (0 if i == 1 else 18)
    b += (f'<g transform="rotate({rot} {cx0} {cy0})"><rect x="{cx0-62+5}" y="{cy0-62+5}" width="124" height="124" rx="28" fill="{INK}"/>'
          f'<rect x="{cx0-62}" y="{cy0-62}" width="124" height="124" rx="28" fill="{PAPER if i != 1 else SAND}" stroke="{INK}" stroke-width="3"/></g>')
    lbl, adv = txt("[icon]", 0, 0, 18, INK_400, "jakarta", wght=700)
    b += f'<g transform="translate({cx0 - adv/2} {cy0 + 6})">{lbl}</g>'
b += perforation(STUB, 80, 550) + mark_at(STUB + 40, 270, 70)
og_c = svg_doc(W, H, b, title="OUTLYY category OG template")
save("09-og-templates/svg/og-category-template.svg", og_c); png(None, "09-og-templates/og-category-template.png", w=W, h=H, svg_text=og_c)

# --- Collection: Sand rim, fanned photo stack
b = f'<rect width="{W}" height="{H}" fill="{SAND}"/>'
b += f'<g><path fill="{INK}" transform="translate(6 6)" d="{notch_card.__call__(40,40,1120,550,STUB).split(chr(34))[3]}"/></g>'
b += notch_card(40, 40, 1120, 550, STUB).replace('<path ', f'<path stroke="{INK}" stroke-width="3" ')
st, _ = sticker(96, 104, "COLLECTION", SUN, -3, size=22)
b += st
t1, _ = txt("[Collection", 96, 282, 64, tracking=-0.025, opsz=72, wght=800)
t2, _ = txt("title]", 96, 350, 64, tracking=-0.025, opsz=72, wght=800)
p1, _ = txt("[N] handpicked experiences", 98, 424, 26, INK_600, "jakarta", wght=700)
b += t1 + t2 + p1
b += photo_slot(560, 150, 230, 290, rot=-7, label="[photo]") + photo_slot(700, 130, 230, 290, rot=6, label="[photo]") + photo_slot(630, 170, 230, 290, rot=0, label="[photo]")
b += perforation(STUB, 80, 550) + mark_at(STUB + 40, 270, 70)
og_l = svg_doc(W, H, b, title="OUTLYY collection OG template")
save("09-og-templates/svg/og-collection-template.svg", og_l); png(None, "09-og-templates/og-collection-template.png", w=W, h=H, svg_text=og_l)

# ================================================================ 10 empty states
ICONS = {  # 24-grid, 2px ink line work (drawn for OUTLYY)
    "heart":   '<path d="M12 20s-7-4.4-7-9.6A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.4C19 15.6 12 20 12 20z"/>',
    "ticket":  '<path d="M3.5 7.5h17v3a1.8 1.8 0 0 0 0 3v3h-17v-3a1.8 1.8 0 0 0 0-3z"/><path d="M14.5 8v8" stroke-dasharray="1.6 2.4"/>',
    "chat":    '<path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-7l-4 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5z"/><path d="M8 10h8M8 13h5"/>',
    "search":  '<circle cx="10.5" cy="10.5" r="5.5"/><path d="M15 15l5 5"/>',
    "sliders": '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    "bag":     '<path d="M5.5 8.5h13l-1 11h-11z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
    "cloud":   '<path d="M7.5 18.5a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17.4 9a4.8 4.8 0 0 1-.4 9.5z"/><path d="M4 4l16 16"/>',
    "bell":    '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    "calendar":'<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8.5 3.5v3M15.5 3.5v3"/>',
    "camera":  '<path d="M4 8.5h3.5l1.5-2.5h6l1.5 2.5H20v10H4z"/><circle cx="12" cy="13.2" r="3.2"/>',
    "compass": '<circle cx="12" cy="12" r="8"/><path d="M14.8 9.2l-1.6 4-4 1.6 1.6-4z"/>',
    "star":    '<path d="M12 4.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2-4.6-2.5-4.6 2.5.9-5.2L4.5 10l5.2-.7z"/>',
    "wallet":  '<path d="M4.5 7.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-14z"/><path d="M4.5 7.5l10-3v3"/><circle cx="16" cy="13.5" r="1"/>',
    "wifi":    '<path d="M3.5 9.5a12 12 0 0 1 17 0M6.5 12.5a8 8 0 0 1 11 0M9.5 15.5a3.7 3.7 0 0 1 5 0"/><circle cx="12" cy="18.5" r=".8"/>',
}
SCENES = {
    "saved":         ("calendar", "heart", "star"),
    "bookings":      ("calendar", "ticket", "camera"),
    "inquiries":     ("ticket", "chat", "compass"),
    "search":        ("compass", "search", "ticket"),
    "filters":       ("star", "sliders", "wallet"),
    "cart":          ("ticket", "bag", "heart"),
    "offline":       ("wifi", "cloud", "chat"),
    "notifications": ("chat", "bell", "calendar"),
}
def tile(cx, cy, size, rot, icon, sun=False, fill=PAPER):
    s = size; x, y = cx - s / 2, cy - s / 2
    g = (f'<g transform="rotate({rot} {cx} {cy})">'
         f'<rect x="{x+4}" y="{y+4}" width="{s}" height="{s}" rx="{s*0.26:.1f}" fill="{INK}"/>'
         f'<rect x="{x}" y="{y}" width="{s}" height="{s}" rx="{s*0.26:.1f}" fill="{fill}" stroke="{INK}" stroke-width="2.5"/>'
         f'<g transform="translate({cx - s*0.28:.2f} {cy - s*0.28:.2f}) scale({s*0.56/24:.4f})" fill="none" stroke="{INK}" '
         f'stroke-width="{2*24/(s*0.56)*1.25:.3f}" stroke-linecap="round" stroke-linejoin="round">{ICONS[icon]}</g>')
    if sun:
        g += f'<circle cx="{x+s-10}" cy="{y+10}" r="{s*0.105:.1f}" fill="{SUN}" stroke="{fill}" stroke-width="3"/>'
    return g + "</g>"

for name, (a, c, d) in SCENES.items():
    body = (f'<ellipse cx="160" cy="176" rx="118" ry="10" fill="{INK}" opacity=".06"/>'
            + tile(98, 110, 76, -8, a) + tile(222, 110, 76, 8, d) + tile(160, 96, 92, 0, c, sun=True))
    save(f"10-empty-states/outlyy-empty-{name}.svg", svg_doc(320, 200, body))
    png(None, f"10-empty-states/png/outlyy-empty-{name}@2x.png", w=640, h=400, svg_text=svg_doc(320, 200, body))

# ================================================================ 11 verified supplier badge
def arc_text(s, cx, cy, r, size, color, top=True, track=0.18, key="jakarta", wght=800):
    glyphs = []
    for ch in s:
        d, adv, _ = text_path(ch, key, size=size, wght=wght)
        glyphs.append((d, adv + (size * track if ch != " " else size * track)))
    L = sum(a for _, a in glyphs) - size * track
    span = L / r; acc = 0; out = ""
    for d, adv in glyphs:
        a_c = acc + (adv - size * track) / 2
        if top:
            th = -math.pi / 2 - span / 2 + a_c / r; rot = math.degrees(th) + 90
        else:
            th = math.pi / 2 + span / 2 - a_c / r; rot = math.degrees(th) - 90
        px, py = cx + r * math.cos(th), cy + r * math.sin(th)
        w0 = adv - size * track
        out += (f'<g transform="translate({px:.2f} {py:.2f}) rotate({rot:.2f}) translate({-w0/2:.2f} 0)">'
                f'<path fill="{color}" d="{d}"/></g>')
        acc += adv
    return out

def serrated(cx, cy, R, r, n):
    pts = []
    for i in range(n * 2):
        a = i * math.pi / n; rr = R if i % 2 == 0 else r
        pts.append(f"{cx + rr*math.cos(a):.2f} {cy + rr*math.sin(a):.2f}")
    return "M" + " L".join(pts) + "Z"

def seal(ground=LAGOON_700, text=PAPER, sub=LAGOON_100):
    b = f'<path fill="{ground}" d="{serrated(80, 80, 77, 71, 56)}"/>'
    b += f'<circle cx="80" cy="80" r="63" fill="none" stroke="{sub}" stroke-width="1.4" stroke-dasharray="2.5 3"/>'
    b += arc_text("VERIFIED SUPPLIER", 80, 80, 45.5, 11.5, text, top=True)
    b += arc_text("OUTLYY", 80, 80, 54, 10, sub, top=False, track=0.35)
    b += f'<circle cx="80" cy="82" r="23" fill="{PAPER}"/>' + mark_at(80 - 14.5, 82 - 14.5, 29)
    return b
sv = svg_doc(160, 160, seal(), title="Verified supplier")
save("11-badges/outlyy-verified-supplier.svg", sv)
for px in (64, 128, 256, 512):
    png(None, f"11-badges/png/outlyy-verified-supplier-{px}.png", w=px, h=px, svg_text=sv)
sv_m = svg_doc(160, 160, seal(ground="#000000", text="#FFFFFF", sub="#FFFFFF").replace(f'fill="{SUN}"', 'fill="#000000"').replace(f'fill="{INK}"', 'fill="#000000"'), title="Verified supplier")
save("11-badges/outlyy-verified-supplier-mono.svg", sv_m)
# Inline chip (24px tall) for cards
chip_txt, adv = txt("Verified supplier", 30, 16.5, 12.5, LAGOON_700, "jakarta", wght=800)
cw = 30 + adv + 10
chip = (f'<rect x=".75" y=".75" width="{cw-1.5:.1f}" height="22.5" rx="11.25" fill="{LAGOON_100}" stroke="{LAGOON_700}" stroke-width="1.5"/>'
        f'<path fill="{LAGOON_700}" d="{serrated(13, 12, 8.6, 7.4, 12)}"/>'
        f'<path d="M9.4 12.2l2.4 2.3 4-4.4" fill="none" stroke="{PAPER}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' + chip_txt)
chip_svg = svg_doc(round(cw), 24, chip, title="Verified supplier", vb=f"0 0 {cw:.1f} 24")
save("11-badges/outlyy-verified-supplier-chip.svg", chip_svg)
png(None, "11-badges/png/outlyy-verified-supplier-chip@2x.png", w=round(cw) * 2, svg_text=chip_svg)

# ================================================================ 12 agent avatar frame
def frame(size, status="online", initials=None):
    # 112-unit design grid; photo circle r40 at (56,58)
    stroke = {96: 5, 48: 7, 32: 9}.get(size, 5)
    sun_c = SUN if status == "online" else INK_400
    b = ""
    if initials:
        b += f'<circle cx="56" cy="58" r="40" fill="{SUN_100}"/>'
        d, adv, bb = text_path(initials, "bricolage", size=30, wght=800, opsz=36)
        b += f'<g transform="translate({56 - adv/2:.2f} 69)"><path fill="{SUN_700}" d="{d}"/></g>'
    b += f'<path fill="{INK}" d="{ring_path(56, 58, 47, stroke)}"/>'
    b += f'<circle cx="89.2" cy="24.8" r="{9 + stroke*0.3:.1f}" fill="{sun_c}" stroke="{SAND}" stroke-width="3"/>'
    return svg_doc(size, size, b, vb="0 0 112 112", title=None)
for size in (96, 48, 32):
    for st in ("online", "away"):
        s = frame(size, st); save(f"12-agent-avatar/outlyy-agent-frame-{size}-{st}.svg", s)
        png(None, f"12-agent-avatar/png/outlyy-agent-frame-{size}-{st}@2x.png", w=size * 2, h=size * 2, svg_text=s)
ex = frame(96, "online", initials="RK")
save("12-agent-avatar/example-initials-96.svg", ex)
png(None, "12-agent-avatar/png/example-initials-96@2x.png", w=192, h=192, svg_text=ex)

# ================================================================ 13 loader
m = MARK64
loader = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Loading">
<style>
.o{{fill:none;stroke:{INK};stroke-width:10;stroke-linecap:round;stroke-dasharray:90;stroke-dashoffset:90;animation:o 1.4s cubic-bezier(.22,1,.36,1) infinite}}
.s{{fill:{SUN};transform-origin:49px 15px;transform:scale(0);animation:s 1.4s cubic-bezier(.34,1.56,.64,1) infinite}}
@keyframes o{{0%{{stroke-dashoffset:90}}55%,100%{{stroke-dashoffset:0}}}}
@keyframes s{{0%,50%{{transform:scale(0)}}70%{{transform:scale(1.18)}}85%,100%{{transform:scale(1)}}}}
@media (prefers-reduced-motion:reduce){{.o{{animation:none;stroke-dashoffset:0}}.s{{animation:p 1.6s ease-in-out infinite;transform:none}}}}
@keyframes p{{0%,100%{{opacity:1}}50%{{opacity:.45}}}}
</style>
<path class="o" d="M49 34A19 19 0 1 1 30 15"/><circle class="s" cx="49" cy="15" r="9"/></svg>'''
save("13-loader/outlyy-loader.svg", loader)
save("13-loader/outlyy-loader-white.svg", loader.replace(f"stroke:{INK}", f"stroke:{PAPER}"))

# ================================================================ 14 404
b = f'<path d="M24 190H456" stroke="{INK}" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 12"/>'
b += f'<path fill="{INK}" d="{ring_path(150, 118, 58, 26)}"/>'
b += f'<path d="M222 70c40-22 92-18 128 18c18 18 28 42 40 70" fill="none" stroke="{INK_300}" stroke-width="3" stroke-linecap="round" stroke-dasharray="5 9"/>'
b += f'<circle cx="392" cy="162" r="26" fill="{SUN}"/>'
b += f'<path d="M360 190c9 0 15-4 18-9M424 190c-6 0-11-3-14-7" stroke="{INK}" stroke-width="3" stroke-linecap="round" fill="none"/>'
b += f'<path d="M378 150l-4-3M406 150l4-3" stroke="{INK}" stroke-width="2.5" stroke-linecap="round"/>'
b += f'<circle cx="182" cy="86" r="4" fill="{INK_300}"/><circle cx="198" cy="76" r="3" fill="{INK_300}"/>'
nf = svg_doc(480, 220, b)
save("14-404/outlyy-404.svg", nf); png(None, "14-404/png/outlyy-404@2x.png", w=960, h=440, svg_text=nf)

# ================================================================ 15 social avatars
for plat, px in (("instagram", 1080), ("x", 400), ("linkedin", 400), ("master", 1080)):
    s = avatar(px)
    save(f"15-social/svg/outlyy-avatar-{plat}-{px}.svg", s)
    png(None, f"15-social/outlyy-avatar-{plat}-{px}.png", w=px, h=px, svg_text=s)
s = avatar(1080, ground=INK, ring=PAPER, sun=SUN)
save("15-social/svg/outlyy-avatar-ink-1080.svg", s); png(None, "15-social/outlyy-avatar-ink-1080.png", w=1080, h=1080, svg_text=s)
print("tier2/3 done")
