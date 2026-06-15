"""
Regenerates zoom levels 2-5 from zoom-6 tiles by merging and downscaling.
After running this script, minNativeZoom can be removed from map.js for fast loading.

Usage:
  pip install Pillow
  python tools/retile.py
  python tools/retile.py --siptah   (for Isle of Siptah tiles)
"""

import os
import sys
import argparse
from pathlib import Path
from PIL import Image

TILE_SIZE = 256


def get_zoom6_grid_size(tiles_dir: Path) -> int:
    z6 = tiles_dir / "6"
    if not z6.exists():
        raise FileNotFoundError(f"No zoom-6 directory at {z6}")
    cols = [int(p.name) for p in z6.iterdir() if p.is_dir()]
    if not cols:
        raise ValueError("No columns found in zoom-6 directory")
    max_col = max(cols)
    rows = [int(p.stem) for p in (z6 / str(max_col)).glob("*.png")]
    max_row = max(rows)
    return max_col + 1, max_row + 1


def load_tile(tiles_dir: Path, z: int, x: int, y: int) -> Image.Image | None:
    path = tiles_dir / str(z) / str(x) / f"{y}.png"
    if not path.exists():
        return None
    return Image.open(path).convert("RGBA")


def make_tile(tiles_dir: Path, target_z: int, x: int, y: int, scale: int) -> Image.Image | None:
    """Merge scale×scale zoom-6 tiles into one tile for target_z."""
    canvas = Image.new("RGBA", (TILE_SIZE * scale, TILE_SIZE * scale), (0, 0, 0, 0))
    has_content = False

    z6_col_start = x * scale
    z6_row_start = y * scale

    for dx in range(scale):
        for dy in range(scale):
            tile = load_tile(tiles_dir, 6, z6_col_start + dx, z6_row_start + dy)
            if tile:
                canvas.paste(tile, (dx * TILE_SIZE, dy * TILE_SIZE))
                has_content = True

    if not has_content:
        return None

    return canvas.resize((TILE_SIZE, TILE_SIZE), Image.LANCZOS)


def retile(tiles_dir: Path) -> None:
    print(f"Source: {tiles_dir}")
    cols6, rows6 = get_zoom6_grid_size(tiles_dir)
    print(f"Zoom-6 grid: {cols6} columns x {rows6} rows")

    for target_z in range(5, 1, -1):
        scale = 2 ** (6 - target_z)
        num_cols = -(-cols6 // scale)  # ceil division
        num_rows = -(-rows6 // scale)

        print(f"\nZoom {target_z}: {num_cols} columns x {num_rows} rows (scale 1:{scale})")

        count = 0
        for x in range(num_cols):
            for y in range(num_rows):
                img = make_tile(tiles_dir, target_z, x, y, scale)
                if img is None:
                    continue
                out_dir = tiles_dir / str(target_z) / str(x)
                out_dir.mkdir(parents=True, exist_ok=True)
                out_path = out_dir / f"{y}.png"
                img.save(out_path, "PNG", optimize=True)
                count += 1

        print(f"  Written {count} tiles")

    print("\nDone. You can now remove minNativeZoom from map.js.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--siptah", action="store_true", help="Process Siptah tiles instead")
    args = parser.parse_args()

    root = Path(__file__).parent.parent / "public" / "assets"
    tiles_dir = root / ("tiles-siptah" if args.siptah else "tiles")
    retile(tiles_dir)
