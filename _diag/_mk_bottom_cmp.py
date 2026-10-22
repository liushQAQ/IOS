# -*- coding: utf-8 -*-
from PIL import Image, ImageDraw, ImageFont

B = Image.open('bottom_before.png').convert('RGB')
A = Image.open('bottom_after.png').convert('RGB')
W, H = B.size
S = W / 430.0
top = int(596 * S)
cropB = B.crop((0, top, W, H))
cropA = A.crop((0, top, W, H))

GAP, HEAD, BOT = 56, 196, 26
outW = cropB.width * 2 + GAP
outH = HEAD + cropB.height + BOT
canvas = Image.new('RGB', (outW, outH), (12, 12, 14))
canvas.paste(cropB, (0, HEAD))
canvas.paste(cropA, (cropB.width + GAP, HEAD))

# 修复前：在右侧被裁列叠红色半透明高亮带（逻辑 x 196..252）
band = Image.new('RGBA', (int(56 * S), cropB.height), (255, 60, 60, 46))
canvas.paste(Image.alpha_composite(canvas.crop((int(196*S), HEAD, int(252*S), HEAD+cropB.height)).convert('RGBA'), band).convert('RGB'),
             (int(196*S), HEAD))
band2 = Image.new('RGBA', (int(56 * S), cropA.height), (40, 220, 120, 40))
canvas.paste(Image.alpha_composite(canvas.crop((cropB.width+GAP+int(196*S), HEAD, cropB.width+GAP+int(252*S), HEAD+cropA.height)).convert('RGBA'), band2).convert('RGB'),
             (cropB.width+GAP+int(196*S), HEAD))

d = ImageDraw.Draw(canvas)

def font(sz, bold=True):
    paths = ([r'C:/Windows/Fonts/msyhbd.ttc'] if bold else []) + [r'C:/Windows/Fonts/msyh.ttc', r'C:/Windows/Fonts/simhei.ttf']
    for p in paths:
        try: return ImageFont.truetype(p, sz)
        except Exception: pass
    return ImageFont.load_default()

fT, fS = font(50), font(31, False)
RED, GRN, GRY = (255, 92, 92), (56, 224, 132), (146, 148, 152)

def head(ox, title, color, subs):
    d.text((ox + 12, 22), title, font=fT, fill=color)
    y = 88
    for s in subs:
        d.text((ox + 12, y), s, font=fS, fill=GRY)
        y += 36

head(0, '修复前  v1.0.122', RED,
     ['时间戳「34 分」被切断', '金额「¥109.194 / ¥1.034」被切断', '「剩余 8 小时 54」「09:00 转峰」被切断'])
head(cropB.width + GAP, '修复后  v1.0.124', GRN,
     ['时间戳「35 分钟」完整', '「¥109.1948 / ¥1.0349」完整', '「剩余 8 小时 54 分」「09:00 转峰时」完整'])

line_x = int(252 * S)
for ox, color in [(0, RED), (cropB.width + GAP, GRN)]:
    d.line([(ox + line_x, HEAD), (ox + line_x, HEAD + cropB.height)], fill=color, width=4)

canvas.save('compare_bottom.png')
print('saved', canvas.size)
