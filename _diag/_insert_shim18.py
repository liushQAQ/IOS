# -*- coding: utf-8 -*-
# shim_18 注入器 v2：块文件(UTF-8) + 二进制精确替换（CRLF 保护）
import sys
sys.stdout.reconfigure(encoding='utf-8')
P = r"E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift"
B = r"E:/desktop/所有skill/deepseek-harness-ios/_diag/shim18_block.txt"

data = open(P, 'rb').read()
block = open(B, 'rb').read().replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')  # normalize to CRLF

CRLF = b'\r\n'
anchor = (
    b"          window.__dshMobilePolishRun = full;" + CRLF +
    b"        })();" + CRLF +
    b'        """' + CRLF +
    b"    ]" + CRLF
)
assert data.count(anchor) == 1, 'anchor not unique: %d' % data.count(anchor)

# Swift 数组：前元素闭合 """ 后加逗号，再开新元素的 """
head = (
    b"          window.__dshMobilePolishRun = full;" + CRLF +
    b"        })();" + CRLF +
    b'        """' + CRLF +
    b'        ,' + CRLF +
    b'        """' + CRLF
)
tail = CRLF + b'    ]' + CRLF
out = data.replace(anchor, head + block + tail, 1)
open(P, 'wb').write(out)
print('OK new size', len(out), 'was', len(data))
