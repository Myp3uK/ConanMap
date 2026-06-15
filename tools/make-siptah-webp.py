"""
Re-slices Isle of Siptah tiles directly from the source PNG into WebP,
zoom levels 2-4 (max native grid 16x16 = source resolution).

Keeps the SAME layout as the original slicer (5% margin, centered, same
canvas sizes) so the existing marker calibration stays valid. The only
change is the letterbox background colour, set to the site theme bg so the
border around the non-square Siptah map blends in instead of looking black.

Usage:  python tools/make-siptah-webp.py
"""

import shutil
from pathlib import Path
from PIL import Image

SRC    = Path("E:/ConanTests/ConanMap/maps/siptah.png")
OUT    = Path(__file__).parent.parent / "public" / "assets" / "tiles-siptah"
TILE   = 256
MARGIN = 0.05                 # 5% margin each side (matches original calibration)
BG     = (0x14, 0x18, 0x1f)   # --bg-page #14181f, blends with the map background
ZOOM   = {2: (4, 1024), 3: (8, 2048), 4: (16, 4096)}

src = Image.open(SRC).convert("RGB")
sw, sh = src.size
print(f"Source: {sw}x{sh}")

for z, (grid, canvas) in ZOOM.items():
    avail = canvas * (1.0 - MARGIN * 2)
    scale = min(avail / sw, avail / sh)
    nw, nh = int(sw * scale), int(sh * scale)
    resized = src.resize((nw, nh), Image.LANCZOS)

    cv = Image.new("RGB", (canvas, canvas), BG)
    cv.paste(resized, ((canvas - nw) // 2, (canvas - nh) // 2))

    zdir = OUT / str(z)
    if zdir.exists():
        shutil.rmtree(zdir)
    for col in range(grid):
        cdir = zdir / str(col)
        cdir.mkdir(parents=True, exist_ok=True)
        for row in range(grid):
            tile = cv.crop((col * TILE, row * TILE, col * TILE + TILE, row * TILE + TILE))
            tile.save(cdir / f"{row}.webp", "WEBP", quality=85, method=6)

    print(f"zoom {z}: {grid * grid} tiles")

print("Done.")
