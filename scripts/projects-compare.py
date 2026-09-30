"""Mechanical source/render region comparison, not artwork generation."""
from pathlib import Path
from PIL import Image

folder = Path(__file__).resolve().parents[1] / 'docs/design/projects-qa'
source = Image.open(folder / 'reference.png').convert('RGB')
render = Image.open(folder / 'final-1312.png').convert('RGB')
regions = {'cards': (195, 455, 1045, 830), 'hero': (195, 170, 1045, 445)}
for name, region in regions.items():
    a, b = source.crop(region), render.crop(region)
    comparison = Image.new('RGB', (a.width * 2 + 20, a.height), '#e6e6ed')
    comparison.paste(a, (0, 0))
    comparison.paste(b, (a.width + 20, 0))
    comparison.save(folder / f'detail-{name}.png')
