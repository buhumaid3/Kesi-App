#!/usr/bin/env python3
"""Depth maps for the 2.5D effect (design doc §10).

For every place and scene photo in www/img/cases/, writes a greyscale depth map next to it
(loc_stage.webp -> loc_stage.depth.webp, white = near) and lists the photos that have one in
www/img/depth.json, which the game reads. Runs in the Codespace on the CPU, about 1-3 seconds a photo.

Model: Depth Anything V2 Small (Apache-2.0; the Base and Large models are non-commercial, so they are
not used). Downloaded once from Hugging Face on first run.

Setup, once:
    pip install --break-system-packages torch --index-url https://download.pytorch.org/whl/cpu
    pip install --break-system-packages transformers pillow
Run:
    python3 tools/make-depth.py              # every place and scene photo without a depth map
    python3 tools/make-depth.py --region 1   # one region
    python3 tools/make-depth.py --redo       # remake all
"""
import json, os, sys, glob
from PIL import Image, ImageFilter, ImageOps

ROOT = os.getcwd()
IMG = os.path.join(ROOT, 'www', 'img', 'cases')
MANIFEST = os.path.join(ROOT, 'prompts', 'manifest.json')
OUT_INDEX = os.path.join(ROOT, 'www', 'img', 'depth.json')
MODEL = os.environ.get('KESI_DEPTH_MODEL', 'depth-anything/Depth-Anything-V2-Small-hf')
WIDTH = 640  # depth maps are small: the shader only needs the shape of the scene

def arg(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None

def targets():
    region = arg('--region')
    kinds = {}
    if os.path.exists(MANIFEST):
        for row in json.load(open(MANIFEST)):
            if row.get('kind') in ('location', 'scene'):
                kinds[row['file']] = row
    out = []
    for f in sorted(glob.glob(os.path.join(IMG, '*', '*.webp'))):
        if f.endswith('.depth.webp'):
            continue
        rel = os.path.relpath(f, os.path.join(ROOT, 'www')).replace(os.sep, '/')
        if kinds and rel not in kinds:
            continue
        if not kinds and not os.path.basename(f).startswith(('loc_', 'ev_body')):
            continue
        n = int(os.path.basename(os.path.dirname(f)))
        if region and not (int(region) - 1) * 10 < n <= int(region) * 10:
            continue
        out.append((f, rel))
    return out

def main():
    todo = [(f, rel) for f, rel in targets() if '--redo' in sys.argv or not os.path.exists(f[:-5] + '.depth.webp')]
    print(f'{len(todo)} photos need a depth map.')
    if todo:
        from transformers import pipeline
        est = pipeline('depth-estimation', model=MODEL, device=-1)
        for i, (f, rel) in enumerate(todo, 1):
            im = Image.open(f).convert('RGB')
            d = est(im)['depth'].convert('L')
            # Smooth edges a little so the parallax never tears along object outlines; stretch to full range.
            d = d.resize((WIDTH, round(WIDTH * im.height / im.width)), Image.LANCZOS).filter(ImageFilter.GaussianBlur(2.2))
            d = ImageOps.autocontrast(d, cutoff=1)
            d.save(f[:-5] + '.depth.webp', 'WEBP', quality=80)
            print(f'  {i}/{len(todo)}  {rel}')
    have = sorted(rel for f, rel in targets() if os.path.exists(f[:-5] + '.depth.webp'))
    # Keep entries from other regions when only one region was run.
    old = json.load(open(OUT_INDEX)) if os.path.exists(OUT_INDEX) else []
    allp = sorted(set(old) | set(have))
    allp = [p for p in allp if os.path.exists(os.path.join(ROOT, 'www', p[:-5] + '.depth.webp'))]
    json.dump(allp, open(OUT_INDEX, 'w'), indent=0)
    print(f'{len(allp)} photos have depth. Wrote www/img/depth.json.')

if __name__ == '__main__':
    main()
