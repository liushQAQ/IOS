# -*- coding: utf-8 -*-
from PIL import Image
for name in ['bottom_before.png', 'bottom_after.png']:
    im = Image.open(name).convert('RGB')
    S = im.width / 430.0
    c = im.crop((0, int(596*S), int(300*S), int(664*S)))
    c = c.resize((int(c.width*1.6), int(c.height*1.6)), Image.LANCZOS)
    c.save('zoom2_' + name)
    print('zoom2_' + name, c.size)
