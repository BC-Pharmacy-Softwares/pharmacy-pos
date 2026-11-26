#!/usr/bin/env python3
"""
make_icon.py — build electron-app/icon.ico from the brand artwork.

The source artwork is a rounded square on a WHITE background. A Windows icon
needs the area OUTSIDE that rounded square to be transparent, or the corners
show as white blocks on a dark taskbar. So:

  1. crop to the artwork,
  2. flood from the edges to find the white that is OUTSIDE the rounded square
     (the white figure inside the logo is not connected to the edge, so it stays),
  3. feather that boundary so the corners are not jagged,
  4. pad to a perfect square,
  5. write a real multi-size ICO including a 256x256 frame — electron-builder
     fails without one (CLAUDE.md gotcha 7).

Usage:  python3 make_icon.py <source.png> <out.ico>
"""
import sys
from collections import deque
from PIL import Image

SIZES = [16, 32, 48, 64, 128, 256]
WHITE_CUT = 235   # min(r,g,b) above this counts as "background white"
FRINGE_LO = 180   # feathering window for the boundary pixels
FRINGE_HI = 255


def build(src_path, out_path):
    im = Image.open(src_path).convert("RGB")

    # 1. crop to the artwork (anything that is not background white)
    px = im.load()
    w, h = im.size
    bbox = Image.eval(im, lambda v: 0).convert("L")  # placeholder, replaced below
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if min(r, g, b) < WHITE_CUT:
                mp[x, y] = 255
    bbox = mask.getbbox()
    if not bbox:
        raise SystemExit("source looks entirely blank")
    im = im.crop(bbox)
    w, h = im.size
    px = im.load()

    # 2. flood from the border through background-white pixels
    outside = [[False] * w for _ in range(h)]
    q = deque()

    def consider(x, y):
        if 0 <= x < w and 0 <= y < h and not outside[y][x]:
            r, g, b = px[x, y]
            if min(r, g, b) > WHITE_CUT:
                outside[y][x] = True
                q.append((x, y))

    for x in range(w):
        consider(x, 0); consider(x, h - 1)
    for y in range(h):
        consider(0, y); consider(w - 1, y)
    while q:
        x, y = q.popleft()
        consider(x + 1, y); consider(x - 1, y)
        consider(x, y + 1); consider(x, y - 1)

    # 3. alpha, with the boundary feathered by how white each pixel is
    out = Image.new("RGBA", (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if outside[y][x]:
                op[x, y] = (r, g, b, 0)
                continue
            touching = any(
                0 <= x + dx < w and 0 <= y + dy < h and outside[y + dy][x + dx]
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
            )
            a = 255
            if touching:
                m = min(r, g, b)
                if m > FRINGE_LO:
                    t = (m - FRINGE_LO) / (FRINGE_HI - FRINGE_LO)
                    a = int(round(255 * (1 - t)))
            op[x, y] = (r, g, b, a)

    # 4. pad to a perfect square
    side = max(w, h)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(out, ((side - w) // 2, (side - h) // 2))

    # 5. write the ICO
    frames = [sq.resize((s, s), Image.LANCZOS) for s in SIZES]
    frames[-1].save(out_path, format="ICO",
                    sizes=[(s, s) for s in SIZES],
                    append_images=frames[:-1])
    print(f"wrote {out_path}  from {side}x{side}  frames {SIZES}")


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2])
