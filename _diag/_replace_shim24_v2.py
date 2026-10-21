# -*- coding: utf-8 -*-
# shim_24 段整体替换为 v2 引擎（通配抓取 + dock 子元素 + 透明化 inline）
import sys
sys.stdout.reconfigure(encoding='utf-8')
P = r'E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift'
B = r'E:/desktop/所有skill/deepseek-harness-ios/_diag/shim24_block.txt'
CRLF = b'\r\n'

data = open(P, 'rb').read()
# shim_24 标记唯一性
n = data.count(b'shim_24')
assert n == 1, 'shim_24 marker count=%d' % n
i = data.find(b'shim_24')
j0 = data.rfind(b'"""', 0, i)
j1 = data.find(b'"""', i)
assert j0 > 0 and j1 > j0, 'quotes locate fail'
old_seg = data[j0 + 3:j1]
print('old seg bytes:', len(old_seg))

block = open(B, 'rb').read().replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
# block 尾部自带 "        })();"，补一个空行到闭引号
new_seg = CRLF + block + CRLF + CRLF

out = data[:j0 + 3] + new_seg + data[j1:]
open(P, 'wb').write(out)
tq = out.count(b'"""')
print('new size', len(out))
print('CRLF:', out.count(b'\r\n'), 'LF-only:', out.count(b'\n') - out.count(b'\r\n'), 'triple:', tq, '(even=%s)' % (tq % 2 == 0))
