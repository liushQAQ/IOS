# -*- coding: utf-8 -*-
# 修复 note 行内误入的真实 CRLF（JS 字符串内不允许真实换行）
p = r'E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift'
data = open(p, 'rb').read()
bad1 = '不再需要换行；'.encode('utf-8') + b'\r\n' + b"',"
# 直接精确构造：'...换行；<CRLF>',  →  '...换行；',
bad1 = '不再需要换行；'.encode('utf-8') + b'\r\n' + b"',"
good1 = '不再需要换行；'.encode('utf-8') + b"',"
bad2 = '造成同行 4px 离散。'.encode('utf-8') + b'\r\n' + b"',"
good2 = '造成同行 4px 离散。'.encode('utf-8') + b"',"
print('bad1:', data.count(bad1), 'bad2:', data.count(bad2))
assert data.count(bad1) == 1 and data.count(bad2) == 1
data = data.replace(bad1, good1).replace(bad2, good2)
open(p, 'wb').write(data)
d2 = open(p, 'rb').read()
print('bad left:', d2.count(bad1) + d2.count(bad2))
print('OK')
