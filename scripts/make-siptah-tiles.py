"""
Нарезает MapSipta.jpg на тайлы для Leaflet CRS.Simple
Формат: public/assets/tiles-siptah/{z}/{x}/{y}.png
Структура идентична Exiled Lands:
  zoom 2: 4x4   (1024x1024 px)
  zoom 3: 8x8   (2048x2048 px)
  zoom 4: 16x16 (4096x4096 px)
  zoom 5: 32x32 (8192x8192 px)
  zoom 6: 63x63 (16128x16128 px)
"""

import os
import sys
from PIL import Image

TILE_SIZE   = 256
BG_COLOR    = (10, 8, 6)        # --bg-deep: #0a0806
MAP_MARGIN  = 0.05              # 5% отступ от края канваса

ZOOM_CONFIG = {
    2: (4,  1024),
    3: (8,  2048),
    4: (16, 4096),
    5: (32, 8192),
    6: (63, 16128),
}

def create_tiles(src_path, out_dir):
    src = Image.open(src_path).convert('RGB')
    src_w, src_h = src.size
    print(f"Source: {src_w}x{src_h}")

    for zoom in sorted(ZOOM_CONFIG):
        grid, canvas_px = ZOOM_CONFIG[zoom]
        print(f"Zoom {zoom}: {grid}x{grid} tiles ({canvas_px}x{canvas_px}px) ...", end=" ", flush=True)

        # Масштаб с отступом
        available = canvas_px * (1.0 - MAP_MARGIN * 2)
        scale = min(available / src_w, available / src_h)
        new_w, new_h = int(src_w * scale), int(src_h * scale)

        resized = src.resize((new_w, new_h), Image.LANCZOS)

        # Центрировать на канвасе с фоном --bg-deep
        canvas = Image.new('RGB', (canvas_px, canvas_px), BG_COLOR)
        ox = (canvas_px - new_w) // 2
        oy = (canvas_px - new_h) // 2
        canvas.paste(resized, (ox, oy))

        # Нарезка: x = колонка (слева направо), y = строка (сверху вниз)
        for col in range(grid):
            col_dir = os.path.join(out_dir, str(zoom), str(col))
            os.makedirs(col_dir, exist_ok=True)
            for row in range(grid):
                left   = col * TILE_SIZE
                top    = row * TILE_SIZE
                tile   = canvas.crop((left, top, left + TILE_SIZE, top + TILE_SIZE))
                tile.save(os.path.join(col_dir, f"{row}.png"), 'PNG')

        total = grid * grid
        print(f"{total} tiles OK")

    print("Done.")

if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else 'MapSipta.jpg'
    dst = sys.argv[2] if len(sys.argv) > 2 else 'public/assets/tiles-siptah'
    create_tiles(src, dst)
