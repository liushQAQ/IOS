from PIL import Image
import sys
DARK = lambda p: sum(p)/3 < 130
def bands(px,W,x0,x1,y0,y1,minc=2):
    out, inb, s = [], False, 0
    for y in range(y0,y1):
        c = sum(1 for x in range(x0,x1,2) if DARK(px[x,y]))
        if c>=minc and not inb: inb,s=True,y
        elif c<minc and inb: inb=False; out.append((s,y))
    if inb: out.append((s,y1))
    return out
for f,tag in [(sys.argv[1],'conv(会话页)'),(sys.argv[2],'plugin(插件详情)')]:
    im=Image.open(f).convert('RGB'); W,H=im.size; px=im.load(); s=W/430.0
    pt=lambda a,b:(round(a/s,1),round(b/s,1))
    print(f'== {tag}')
    print('  状态栏带(x20-120pt):', [pt(a,b) for a,b in bands(px,W,int(20*s),int(120*s),0,int(90*s))][:4])
    print('  左上图标带(x8-52pt):', [pt(a,b) for a,b in bands(px,W,int(8*s),int(52*s),int(30*s),int(300*s))][:8])
    print('  标题带(x120-300pt):', [pt(a,b) for a,b in bands(px,W,int(120*s),int(300*s),int(30*s),int(300*s))][:8])
    print('  左列内容(x8-60pt, y150-600pt):', [pt(a,b) for a,b in bands(px,W,int(8*s),int(60*s),int(150*s),int(600*s))][:8])
