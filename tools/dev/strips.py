# Montage frame strips: python3 tools/dev/strips.py <dir>
import sys
from PIL import Image, ImageDraw
D=sys.argv[1]
T={'lamp':[0.3,0.8,1.5,2.2,2.9,3.4,4.0,4.9,6.1],'string':[0.5,1.4,2.3,3.0,3.7,4.1,4.5,5.3,6.2]}
for v,times in T.items():
  for sz in ['se','i15','ipad']:
    ims=[Image.open(f'{D}/{v}-{sz}-{t:.1f}.png') for t in times]
    w,h=ims[0].size; tw=int(w*360/h)
    strip=Image.new('RGB',(tw*9+8*10,392),'#1a1715'); d=ImageDraw.Draw(strip)
    for i,(im,t) in enumerate(zip(ims,times)):
      strip.paste(im.resize((tw,360),Image.LANCZOS),(8+i*(tw+8),26)); d.text((8+i*(tw+8),8),f'{t:.1f} s',fill='#ddd')
    strip.save(f'{D}/strip-{v}-{sz}.png')
