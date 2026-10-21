# -*- coding: utf-8 -*-
# F1 块 flex-wrap wrap → nowrap（v1.0.131(78)，二进制精确替换）
p = r'E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift'
data = open(p, 'rb').read()
start = data.find(b"'[class*=\"composerStack\"] [class*=\"VERcba_standardControls\"] > div > div {'")
assert start > 0, 'F1 anchor not found'
end_anchor = b"].join('\\\\n')"
end = data.find(end_anchor, start)
assert end > start, 'F1 end not found'
blk = data[start:end]
n = blk.count(b'flex-wrap: wrap !important;')
print('wrap count in F1 block:', n)
assert n == 2, 'expect exactly 2 wrap rules'
newblk = blk.replace(b'flex-wrap: wrap !important;', b'flex-wrap: nowrap !important;')
# 注释追加说明
mark = "'   静止态（无状态按钮）内容一行装得下，wrap 不触发，布局零变化。',".encode('utf-8')
assert data.count(mark) == 1, 'comment anchor not unique: %d' % data.count(mark)
note = ("'   v1.0.131(78)：shim_21 已把优化胶囊挪上插件条，standardControls 不再需要换行；\r\n',\r\n"
        "            '   393/375 宽下 wrap 反而把模型选择器压到第二 flex 行（+8px）造成同行 4px 离散。\r\n',\r\n"
        "            '   定案改回 nowrap（配合 overflow:hidden 收口，绝不用 margin 推回）。',").encode('utf-8')
data2 = data[:start] + newblk + data[end:]
data2 = data2.replace(mark, mark + b'\r\n            ' + note, 1)
open(p, 'wb').write(data2)
d3 = open(p, 'rb').read()
seg = d3[start:start + len(newblk) + 2000]
print('nowrap in F1 region:', seg.count(b'flex-wrap: nowrap'))
print('wrap left in F1 region:', seg.count(b'flex-wrap: wrap'))
print('OK')
