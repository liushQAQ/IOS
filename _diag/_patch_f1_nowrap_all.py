# -*- coding: utf-8 -*-
# F1 规则所有拷贝 wrap→nowrap
p = r'E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift'
data = open(p, 'rb').read()
anchor = b"'[class*=\"composerStack\"] [class*=\"VERcba_standardControls\"] > div > div {'"
cnt = data.count(anchor)
print('F1 anchor copies:', cnt)
pos = 0
idxs = []
while True:
    i = data.find(anchor, pos)
    if i < 0: break
    idxs.append(i)
    pos = i + 1
end_anchor = b"].join('\\\\n')"
total = 0
for i in idxs:
    end = data.find(end_anchor, i)
    blk = data[i:end]
    n = blk.count(b'flex-wrap: wrap !important;')
    print('copy@%d wrap rules: %d' % (i, n))
    total += n
assert total == cnt * 2, 'unexpected'
data = data.replace(b'flex-wrap: wrap !important;', b'flex-wrap: nowrap !important;')
open(p, 'wb').write(data)
d2 = open(p, 'rb').read()
print('wrap left in whole file:', d2.count(b'flex-wrap: wrap !important;'))
print('nowrap now:', d2.count(b'flex-wrap: nowrap !important;'))
print('OK')
