# -*- coding: utf-8 -*-
# shim_22 注入器：块文件(UTF-8) + 二进制精确替换（CRLF 保护）
import sys
sys.stdout.reconfigure(encoding='utf-8')
P = r"E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift"
B = r"E:/desktop/所有skill/deepseek-harness-ios/_diag/shim22_block.txt"

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

# Swift 数组：前元素闭合 """ 后加逗号行，再开新元素的 """
head = (
    b"          setInterval(function () { apply(); }, 3000);" + CRLF +
    b"        })();" + CRLF + CRLF +
    b'        """' + CRLF +
    b'        ,' + CRLF +
    b'        """' + CRLF
)
tail = CRLF + b'    ]' + CRLF
out = data.replace(anchor, head + block + tail, 1)
open(P, 'wb').write(out)
print('OK new size', len(out), 'was', len(data))
print('CRLF:', out.count(b'\r\n'), 'LF-only:', out.count(b'\n') - out.count(b'\r\n'), 'triple:', out.count(b'"""'))
