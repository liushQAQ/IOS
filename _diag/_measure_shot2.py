from PIL import Image
import sys

def bands(px, W, x0, x1, y0, y1, cond, minc=2):
    rows = []
    for y in range(y0, y1):
        c = 0
        for x in range(x0, x1, 2):
            if cond(px[x, y]): c += 1
        rows.append((y, c))
    out, inb = [], False
    for y, c in rows:
        if c >= minc and not inb: inb, s = True, y
        elif c < minc and inb:
            inb = False; out.append((s, y))
    if inb: out.append((s, y1))
    return out

BRIGHT = lambda p: sum(p)/3 > 110
BLUE = lambda p: p[2] > 110 and p[2]-p[0] > 35 and p[2]-p[1] > 25

for f, tag in [(sys.argv[1], 'conv'), (sys.argv[2], 'plugin')]:
    im = Image.open(f).convert('RGB'); W, H = im.size; px = im.load()
    s = W / 430.0
    print(f'== {tag}  {W}x{H}')
    pt = lambda a, b: (round(a/s,1), round(b/s,1))
    # 状态栏时间文字（x 20..120pt, y 0..80pt）
    print(' 状态栏文字带:', [pt(a,b) for a,b in bands(px,W,int(20*s),int(120*s),0,int(80*s),BRIGHT)][:4])
    # 左上角图标带（x 8..46pt, y 60..260pt）
    print(' 左上图标带:', [pt(a,b) for a,b in bands(px,W,int(8*s),int(46*s),int(60*s),int(260*s),BRIGHT)][:6])
    # tab 下划线蓝（x 24..60pt, y 120..260pt）
    print(' tab 蓝带:', [pt(a,b) for a,b in bands(px,W,int(24*s),int(60*s),int(120*s),int(260*s),BLUE)][:6])
    # 全宽第一条长亮带（页面标题 h1 等）
    print(' 中部亮带:', [pt(a,b) for a,b in bands(px,W,int(150*s),int(300*s),int(60*s),int(300*s),BRIGHT)][:8])
