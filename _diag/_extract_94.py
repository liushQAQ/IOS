# -*- coding: utf-8 -*-
# 从 94 版本的 Swift 源码提取 app_inject_94.js，用于 A/B 复核（判定 95 是否破坏 94 的修复）
src = open(r'E:/desktop/所有skill/deepseek-harness-ios/_diag/_vc94.swift', encoding='utf-8').read()
lines = src.split('\n')
start = next(i for i, l in enumerate(lines) if 'static let iosCompatShims' in l)
end = next(i for i in range(start+1, len(lines)) if lines[i] == '    ]')
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
out = out.replace('\\\\(', '\\(').replace('\\\\"', '\\"').replace('\\\\', '\\')
open(r'E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject_94.js', 'w', encoding='utf-8', newline='\n').write(out)
print('saved app_inject_94.js', len(out))
