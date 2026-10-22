# 量老总截图：状态栏底、顶栏图标带、tab 下划线的物理 y 坐标（pt）
from PIL import Image
import sys
for f in sys.argv[1:]:
    im = Image.open(f).convert('RGB')
    W, H = im.size
    px = im.load()
    scale = W / 430.0  # 物理px → pt（iPhone 逻辑宽 430）
    print(f'== {f.split(chr(92))[-1]}  {W}x{H}  scale={scale:.2f}')
    # 1) 从上往下找每一段“亮内容行”（暗色主题下亮像素=文字/图标）
    import collections
    rows = []
    for y in range(0, min(H, 900)):
        bright = 0
        for x in range(0, W, 4):
            r, g, b = px[x, y]
            if (r + g + b) / 3 > 120:
                bright += 1
        rows.append(bright)
    # 输出亮行带
    bands = []
    inb = False
    for y, b in enumerate(rows):
        if b > 3 and not inb:
            inb = True; start = y
        elif b <= 3 and inb:
            inb = False; bands.append((start, y))
    if inb: bands.append((start, len(rows)))
    print('亮行带(pt):', [(round(a/scale,1), round(b_/scale,1)) for a, b_ in bands[:14]])
    # 2) 找蓝色 tab 下划线（对话 tab 高亮蓝）
    bluess = []
    for y in range(0, min(H, 900)):
        cb = 0
        for x in range(0, W//2, 3):
            r, g, b = px[x, y]
            if b > 120 and b - r > 40 and b - g > 30:
                cb += 1
        if cb > 2:
            bluess.append(y)
    if bluess:
        print('蓝色元素带(pt):', round(bluess[0]/scale,1), '..', round(bluess[-1]/scale,1))
