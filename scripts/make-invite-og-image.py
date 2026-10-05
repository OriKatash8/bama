#!/usr/bin/env python3
"""
Regenerates legal-site/static/og-invite.png, the card WhatsApp (and others) show when an
invite link is pasted: the BAMA wordmark from legal-site/static/logo.webp, centred on the
app's pale gradient, 1200x630 (the 1.91:1 link-preview shape). A PNG on purpose: WhatsApp
does not reliably render WebP preview images, and the wordmark is transparent, so it needs
a background of ours. Generic by design; the page cannot name the community.

    python3 scripts/make-invite-og-image.py        (needs Pillow)
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "legal-site" / "static"
W, H = 1200, 630
TOP, BOTTOM = (228, 224, 245), (208, 224, 248)  # the app's background gradient, top to bottom

bg = Image.new("RGB", (W, H))
px = bg.load()
for y in range(H):
    t = y / (H - 1)
    row = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
    for x in range(W):
        px[x, y] = row

logo = Image.open(STATIC / "logo.webp").convert("RGBA")
target_w = 760  # ~1.08x of the 701px source: sharp enough, and well clear of the edges
logo = logo.resize((target_w, round(logo.height * target_w / logo.width)), Image.LANCZOS)
bg.paste(logo, ((W - logo.width) // 2, (H - logo.height) // 2), logo)

out = STATIC / "og-invite.png"
bg.save(out, optimize=True)
print(f"wrote {out} ({out.stat().st_size // 1024} KB, {W}x{H})")
