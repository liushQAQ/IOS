# -*- coding: utf-8 -*-
src = open(r'E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift', encoding='utf-8').read()
lines = src.split('\n')
start = next(i for i, l in enumerate(lines) if 'static let iosCompatShims' in l)
end = next(i for i in range(start+1, len(lines)) if lines[i] == '    ]')  # 数组闭合行（动态定位，不写死行号）
blocks = []
i = start
while i < end:
    if lines[i].strip() == '"""':
        j = i + 1
        buf = []
        while j < end:
            t = lines[j].strip()
            if t == '""",' or t == '"""':
                break
            buf.append(lines[j])
            j += 1
        blocks.append('\n'.join(buf))
        i = j + 1
        continue
    i += 1
print('blocks:', len(blocks), 'chars:', sum(len(b) for b in blocks))
out = '\n;\n'.join(blocks)
# Swift 多行字符串转义逆运算
out = out.replace('\\\\(', '\\(').replace('\\\\"', '\\"').replace('\\\\', '\\')
open('app_inject.js', 'w', encoding='utf-8', newline='\n').write(out)
print('saved app_inject.js', len(out))
