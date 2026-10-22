# -*- coding: utf-8 -*-
# 从 ViewController.swift 的玻璃增强 shim 里抽出 CSS 数组 → app_inject.css
src = open(r'E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift', encoding='utf-8').read()
lines = src.split('\n')
# 定位含 dsh-ios-glass-enhancement 的 shim 块
start = next(i for i, l in enumerate(lines) if 'dsh-ios-glass-enhancement' in l)
# 向上找该 shim 的 """ 开界
s = start
while lines[s].strip() != '"""':
    s -= 1
# 向下找数组范围与块闭合
arr_start = next(i for i in range(s, s + 40) if "style.textContent = [" in lines[i])
arr_end = next(i for i in range(arr_start, arr_start + 3000) if "].join" in lines[i])
block_end = next(i for i in range(arr_start, arr_start + 3000) if lines[i].strip() in ('"",', '"""'))
out = []
for l in lines[arr_start + 1:arr_end]:
    t = l.strip()
    if not (t.startswith("'") ):
        continue
    t = t[1:]
    if t.endswith("',"):
        t = t[:-2]
    elif t.endswith("'"):
        t = t[:-1]
    t = t.replace('\\"', '"').replace('\\\\', '\\')
    out.append(t)
css = '\n'.join(out)
open('app_inject.css', 'w', encoding='utf-8', newline='\n').write(css)
print('saved app_inject.css', len(css), 'lines', len(out))
