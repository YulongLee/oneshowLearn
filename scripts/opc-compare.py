"""Mechanical visual-QA contact sheet; never generates UI or illustration artwork."""
import sys
from PIL import Image, ImageOps

source = Image.open(sys.argv[1]).convert("RGB")
implementation = Image.open(sys.argv[2]).convert("RGB")
width = source.width
if implementation.width != width:
    raise SystemExit(f"Viewport mismatch: {source.size} vs {implementation.size}")
height = max(source.height, implementation.height)
canvas = Image.new("RGB", (width * 2 + 24, height), "#e6e6ed")
canvas.paste(source, (0, 0))
canvas.paste(implementation, (width + 24, 0))
canvas.save(sys.argv[3])
if len(sys.argv) > 4:
    # Same full-width hero/phase/first-content region, preserving 1:1 pixel density.
    canvas.crop((0, 90, canvas.width, 725)).save(sys.argv[4])
print(source.size, implementation.size, sys.argv[3])
