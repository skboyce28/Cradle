#!/usr/bin/env python3
"""Converts the screenshots from take.mjs (tests/out/shots/*.png) into docs/screenshots/*.webp,
at the 640-pixel width the overview page and README use. Needs Pillow (pip install pillow)."""
import glob, os
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
repo = os.path.abspath(os.path.join(here, '..', '..'))
used = open(os.path.join(repo, 'docs', 'overview.html')).read() + open(os.path.join(repo, 'README.md')).read()
for src in sorted(glob.glob(os.path.join(repo, 'tests', 'out', 'shots', '*.png'))):
    name = os.path.splitext(os.path.basename(src))[0]
    if 'screenshots/' + name + '.webp' not in used:
        continue  # only the pictures the overview or README show
    im = Image.open(src).convert('RGB')
    w = 640
    im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    dst = os.path.join(repo, 'docs', 'screenshots', name + '.webp')
    im.save(dst, 'WEBP', quality=80, method=6)
    print(dst, im.size)
