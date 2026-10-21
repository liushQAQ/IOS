# -*- coding: utf-8 -*-
# 131(78) 修复对比长图 v2：composer 特写 + 整页底部区（宽度对齐 1732）
from PIL import Image, ImageDraw, ImageFont
import os

D = r'E:/desktop/所有skill/deepseek-harness-ios/_diag'
OUT = r'E:/desktop/所有skill/deepseek-harness-ios/releases'

def font(sz):
    for p in [r'C:\Windows\Fonts\msyhbd.ttc', r'C:\Windows\Fonts\msyh.ttc', r'C:\Windows\Fonts\simhei.ttf']:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, sz)
            except Exception: pass
    return ImageFont.load_default()

f_tag = font(26)
f_sub = font(17)
f_cap = font(24)

def label_bar(w, title, sub, color, bg):
    bar = Image.new('RGB', (w, 84), bg)
    d = ImageDraw.Draw(bar)
    d.text((18, 10), title, font=f_tag, fill=color)
    d.text((18, 48), sub, font=f_sub, fill=(155, 155, 160))
    return bar

def pair(imgA, imgB, tagA, tagB):
    assert imgA.width == imgB.width, (imgA.width, imgB.width)
    w = imgA.width + imgB.width + 16
    h = 84 + max(imgA.height, imgB.height) + 8
    canvas = Image.new('RGB', (w, h), (16, 16, 18))
    canvas.paste(label_bar(imgA.width, tagA[0], tagA[1], (255, 128, 128), (46, 26, 26)), (0, 0))
    canvas.paste(label_bar(imgB.width, tagB[0], tagB[1], (128, 255, 160), (22, 44, 30)), (imgA.width + 16, 0))
    canvas.paste(imgA, (0, 84))
    canvas.paste(imgB, (imgA.width + 16, 84))
    return canvas

A_c = Image.open(os.path.join(D, 'cmp_before_76_77_composer.png')).convert('RGB')
B_c = Image.open(os.path.join(D, 'cmp_after_78_composer.png')).convert('RGB')
A_f = Image.open(os.path.join(D, 'cmp_before_76_77_full.png')).convert('RGB')
B_f = Image.open(os.path.join(D, 'cmp_after_78_full.png')).convert('RGB')

# composer 特写是 860 宽（dsf2）；整页 860×1864 裁底部 640（标题+会话框）
A_fc = A_f.crop((0, A_f.height - 640, A_f.width, A_f.height))
B_fc = B_f.crop((0, B_f.height - 640, B_f.width, B_f.height))

top = pair(A_c, B_c,
    ('× 131(76)/(77)：插件条 shim 全灭', '积分胶囊挤在输入行里 · 无顶部插件条 · 模型选择器被挤没了'),
    ('✓ 131(78)：修复后', '插件条在会话框顶部一行融合排齐 · 输入行恢复原有控件'))
bot = pair(A_fc, B_fc,
    ('× 131(76)/(77) 整页（真机等同态）', 'shim_19~24 死胎：胶囊挤输入行'),
    ('✓ 131(78) 整页', '全量注入生效：顶部插件条 + 模型选择器复位'))

cap_h = 56
total = Image.new('RGB', (max(top.width, bot.width), top.height + cap_h + bot.height + 20), (16, 16, 18))
d = ImageDraw.Draw(total)
d.text((20, top.height + 16), '根因：shim_19~24 七处 join(\\n) 单反斜杠 → Swift 编译成真实换行 → JS SyntaxError → shim 静默死亡（编译照过 / 真机全灭）', font=f_cap, fill=(225, 225, 230))
total.paste(top, (0, 0))
total.paste(bot, (0, top.height + cap_h))
out = os.path.join(OUT, 'DSHios-131-78-fix-compare.png')
total.save(out)
print('saved', out, total.size)
