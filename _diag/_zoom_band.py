# -*- coding: utf-8 -*-
from PIL import Image, ImageDraw, ImageFont
for name in ['bottom_before.png', 'bottom_after.png']:
    im = Image.open(name).convert('RGB')
    S = im.width / 430.0
    # 逻辑 y 650..700, x 0..260
    c = im.crop((0, int(650*S), int(262*S), int(706*S)))
    c = c.resize((c.width*2, c.height*2), Image.LANCZOS)
    c.save('zoom_' + name)
    print(name, '->', 'zoom_' + name, c.size)
