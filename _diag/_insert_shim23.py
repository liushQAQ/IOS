# -*- coding: utf-8 -*-
# shim_23 注入器 v2：块文件(UTF-8) + 二进制精确替换（CRLF 保护）
# 教训修正：tail 自带新元素闭合 """（shim_22 插入时漏过，triple 奇数事故）
import sys
sys.stdout.reconfigure(encoding='utf-8')
P = r"E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift"
B = r"E:/desktop/所有skill/deepseek-harness-ios/_diag/shim23_block.txt"

data = open(P, 'rb').read()
block = open(B, 'rb').read().replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')  # normalize to CRLF

CRLF = b'\r\n'
anchor = (
    b"          setInterval(function () { apply(); }, 3000);" + CRLF +
    b"        })();" + CRLF + CRLF +
    b'        """' + CRLF +
    b"    ]" + CRLF
)
n = data.count(anchor)
assert n == 1, 'anchor not unique: %d' % n

tq = data.count(b'"""')
assert tq % 2 == 0, 'pre-insert triple odd: %d' % tq

head = (
    b"          setInterval(function () { apply(); }, 3000);" + CRLF +
    b"        })();" + CRLF + CRLF +
    b'        """' + CRLF +
    b'        ,' + CRLF +
    b'        """' + CRLF
)
# tail 自带新元素闭合 """（v2 关键修正）
tail = CRLF + b'        """' + CRLF + b'    ]' + CRLF
out = data.replace(anchor, head + block + tail, 1)
open(P, 'wb').write(out)
tq2 = out.count(b'"""')
print('OK new size', len(out), 'was', len(data))
print('CRLF:', out.count(b'\r\n'), 'LF-only:', out.count(b'\n') - out.count(b'\r\n'), 'triple:', tq2, '(even=%s)' % (tq2 % 2 == 0))
