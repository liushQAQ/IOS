# -*- coding: utf-8 -*-
"""按参数抽取注入资产（A/B 对拍用）：argv[1]=Swift 源, argv[2]=输出 js"""
import sys

srcp, outp = sys.argv[1], sys.argv[2]
src = open(srcp, encoding='utf-8').read()
lines = src.split('\n')
start = next(i for i, l in enumerate(lines) if 'static let iosCompatShims' in l)
end = next(i for i in range(start + 1, len(lines)) if lines[i] == '    ]')
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
out = '\n;\n'.join(blocks)
out = out.replace('\\\\(', '\\(').replace('\\\\"', '\\"').replace('\\\\', '\\')
open(outp, 'w', encoding='utf-8', newline='\n').write(out)
print('blocks:', len(blocks), 'chars:', len(out), '->', outp)
