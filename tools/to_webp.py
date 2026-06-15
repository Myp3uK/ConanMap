"""
Converts PNG tiles to WebP to reduce file size and speed up first load.

Usage:
  pip install Pillow
  python tools/to_webp.py              # both maps
  python tools/to_webp.py --exiled     # Exiled Lands only
  python tools/to_webp.py --siptah     # Siptah only
  python tools/to_webp.py --quality 90 # adjust lossy quality (default 85)
  python tools/to_webp.py --delete-png # remove PNGs after conversion
"""

import argparse
from pathlib import Path
from PIL import Image


def convert_dir(tiles_dir: Path, quality: int, delete_png: bool) -> None:
    pngs = list(tiles_dir.rglob("*.png"))
    if not pngs:
        print(f"  No PNG files found in {tiles_dir}")
        return

    print(f"  {len(pngs)} files in {tiles_dir.name}/")
    done = 0
    saved = 0

    for png_path in pngs:
        if not png_path.exists():
            continue  # already deleted by a concurrent run
        webp_path = png_path.with_suffix(".webp")
        if webp_path.exists():
            if delete_png:
                png_path.unlink(missing_ok=True)
            done += 1
            continue  # already converted

        orig_size = png_path.stat().st_size

        with Image.open(png_path) as img:
            img.save(webp_path, "WEBP", quality=quality, method=6)

        new_size = webp_path.stat().st_size
        saved += orig_size - new_size

        if delete_png:
            png_path.unlink(missing_ok=True)

        done += 1
        if done % 200 == 0:
            print(f"    {done}/{len(pngs)}...")

    print(f"  Done: {done} files, saved {saved / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--exiled", action="store_true")
    parser.add_argument("--siptah", action="store_true")
    parser.add_argument("--quality", type=int, default=85)
    parser.add_argument("--delete-png", action="store_true")
    args = parser.parse_args()

    root = Path(__file__).parent.parent / "public" / "assets"

    dirs = []
    if args.siptah and not args.exiled:
        dirs = [root / "tiles-siptah"]
    elif args.exiled and not args.siptah:
        dirs = [root / "tiles"]
    else:
        dirs = [root / "tiles", root / "tiles-siptah"]

    for d in dirs:
        if not d.exists():
            print(f"Skipping {d.name}/ (not found)")
            continue
        convert_dir(d, args.quality, args.delete_png)
