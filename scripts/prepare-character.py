"""Remove exterior checkerboard and normalize generated poses into equal cells."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

source, output, rows = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(source).convert('RGB')
rgb = np.asarray(im).astype(np.int16)
neutral = (rgb.max(2) - rgb.min(2) <= 10) & (rgb.max(2) >= 110)
mask = Image.fromarray(np.where(neutral, 0, 1).astype('uint8'))
ImageDraw.Draw(mask).rectangle((0, 0, im.width-1, im.height-1), outline=0)
ImageDraw.floodfill(mask, (0, 0), 2)
mask = Image.fromarray(np.where(np.asarray(mask) == 2, 0, 255).astype('uint8'))
# Clear neutral checkerboard slivers trapped between strands near the silhouette.
# Keep enclosed eyes, ear tufts and pale clothes away from this narrow border.
edge = np.asarray(mask.filter(ImageFilter.MinFilter(11))) == 0
residue = edge & (rgb.max(2) - rgb.min(2) <= 18) & (rgb.min(2) > 165)
atlas = Image.new('RGBA', (384*4, 384*rows))
for i in range(rows*4):
    x, y = int((i%4+.5)*im.width/4), int((i//4+.5)*im.height/rows)
    if mask.getpixel((x,y)) != 255:
        raise ValueError(f'Pose {i} center does not intersect character')
    component = mask.copy()
    ImageDraw.floodfill(component, (x,y), 128)
    alpha = Image.fromarray(np.where(np.asarray(component) == 128, 255, 0).astype('uint8'))
    bounds = alpha.getbbox()
    hair_border = residue.copy()
    hair_border[int(bounds[1] + (bounds[3] - bounds[1]) * .55):] = False
    alpha = Image.fromarray(np.where(hair_border, 0, np.asarray(alpha)).astype('uint8'))
    # Remove the contaminated outer pixel and soften alpha only, not the artwork.
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(.45))
    bounds = alpha.getbbox()
    part = im.copy(); part.putalpha(alpha); part = part.crop(bounds)
    # The old blur mixed opaque checkerboard RGB back into translucent edges.
    # Decontaminate neutral hair-edge colors without shrinking the silhouette.
    pixels = np.asarray(part).copy()
    colors = pixels[:, :, :3].astype(np.float32)
    border = np.asarray(part.getchannel('A').filter(ImageFilter.MinFilter(13))) < 240
    head_fraction = .72 if i in (4, 5, 8, 9, 10) else .55
    border[int(part.height * head_fraction):] = False
    luminance = colors.mean(2)
    contaminated = border & (pixels[:, :, 3] > 0) & (colors.max(2)-colors.min(2) < 35) & (luminance > 95)
    local_dark = np.clip(np.asarray(part.convert('RGB').filter(ImageFilter.MinFilter(9))).mean(2), 65, 90)
    ratio = np.minimum(1, local_dark / np.maximum(1, luminance))
    pixels[:, :, :3] = np.where(contaminated[:, :, None], colors * ratio[:, :, None], colors).astype('uint8')
    part = Image.fromarray(pixels)
    if part.width > 352 or part.height > 352:
        part.thumbnail((352,352), Image.Resampling.LANCZOS)
    atlas.alpha_composite(part, (i%4*384+(384-part.width)//2, i//4*384+368-part.height))
atlas.save(output)
preview = Image.new('RGBA', atlas.size, '#f5f1e8'); preview.alpha_composite(atlas)
preview.convert('RGB').resize((768,192*rows)).save(str(Path(output).with_suffix('.preview.jpg')))
print(output, atlas.size)
