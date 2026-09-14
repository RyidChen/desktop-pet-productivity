"""User-authorized checkerboard removal; preserve the generated source unchanged."""
from pathlib import Path
import sys
import numpy as np
from PIL import Image, ImageDraw

source, output = map(Path, sys.argv[1:3])
im = Image.open(source).convert('RGB')
rgb = np.asarray(im).astype(np.int16)
# Flood only neutral background reachable from outside; enclosed details stay opaque.
neutral = (rgb.max(2) - rgb.min(2) <= 10) & (rgb.max(2) >= 110)
barrier = Image.fromarray(np.where(neutral, 0, 1).astype('uint8'))
ImageDraw.Draw(barrier).rectangle((0, 0, im.width - 1, im.height - 1), outline=0)
ImageDraw.floodfill(barrier, (0, 0), 2)
alpha = Image.fromarray(np.where(np.asarray(barrier) == 2, 0, 255).astype('uint8'))
for cell in range(4):
    bounds = (round(cell * im.width / 4), 0, round((cell + 1) * im.width / 4), im.height)
    part = alpha.crop(bounds)
    ImageDraw.floodfill(part, (part.width // 2, part.height // 2), 128)
    alpha.paste(Image.fromarray(np.where(np.asarray(part) == 128, 255, 0).astype('uint8')), bounds)
im.putalpha(alpha)
im.save(output)
print(im.mode, im.size, 'transparent pixels', int((np.asarray(alpha) == 0).sum()))
