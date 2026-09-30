"""Mechanical QA image assembly only; no creation or editing of design artwork."""
from pathlib import Path
from PIL import Image, ImageDraw

folder = Path(__file__).resolve().parents[1] / 'docs/design/personal'
pages = ['notes', 'favorites', 'achievements', 'community']
for page in pages:
    source = Image.open(folder / f'{page}-reference.png').convert('RGB')
    render = Image.open(folder / f'{page}-1536-final.png').convert('RGB')
    assert source.size == render.size == (1536, 1024), (page, source.size, render.size)
    result = Image.new('RGB', (3092, 1048), '#e9e9ef')
    ImageDraw.Draw(result).text((12, 6), 'Reference | Implementation (isolated QA records)', fill='#333')
    result.paste(source, (0, 24)); result.paste(render, (1556, 24))
    result.save(folder / f'{page}-comparison.png')
sheet = Image.new('RGB', (1536, 1024), '#eeeef5')
for index,page in enumerate(pages):
    image = Image.open(folder / f'{page}-1536-final.png').convert('RGB')
    image.thumbnail((768,512))
    sheet.paste(image, ((index%2)*768,(index//2)*512))
sheet.save(folder / 'desktop-contact.png')
mobile = Image.new('RGB', (1560, 870), '#eeeef5')
for index,page in enumerate(pages):
    image = Image.open(folder / f'{page}-390-final.png').convert('RGB')
    assert image.size == (390,844), (page,image.size)
    mobile.paste(image,(index*390,26))
    ImageDraw.Draw(mobile).text((index*390+10,6),page,fill='#222')
mobile.save(folder / 'mobile-contact.png')
