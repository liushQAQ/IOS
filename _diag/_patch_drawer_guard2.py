# -*- coding: utf-8 -*-
# v1.0.131 守卫 v2：按定位模式判定（overlay 才强制 252），替换 v1 的宽度阈值判据
import sys
sys.stdout.reconfigure(encoding='utf-8')
P = r'E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift'
data = open(P, 'rb').read()
CRLF = b'\r\n'

old_lines = [
    b'                // v1.0.131 ',
    b'                if (!el.__dshDrawerGuard) {',
    b'                if (el.__dshDrawerGuard === 1) continue;',
]
# 用实际中文行定位整块：从注释首行到 continue 行
start_marker = '                // v1.0.131 '.encode('utf-8')
end_marker = b'                if (el.__dshDrawerGuard === 1) continue;' + CRLF
i = data.find(start_marker)
assert i > 0, 'guard block start not found'
j = data.find(end_marker, i)
assert j > 0, 'guard block end not found'
j += len(end_marker)

new_lines = [
    '                // v1.0.131 玩家兼容守卫：仅当抽屉是 overlay 定位（absolute/fixed）时才强制 252。'.encode('utf-8'),
    '                //   旧版 DSH 前端（如 172.16.0.74）抽屉是 push 布局参与者（static）—— 强制 252'.encode('utf-8'),
    '                //   会与原生宽打架，主内容被推出右屏裁 24pt（玩家截图实锤：侧栏 276=252+24'.encode('utf-8'),
    '                //   padding，发送钮切半；Safari 无注入 300 自然宽一切正常，与 iOS 版本无关）。'.encode('utf-8'),
    '                //   push 态一律跳过本轮保持原生宽；样式未加载时 position 暂为 static 同样跳过，'.encode('utf-8'),
    '                //   下轮复判。新版前端抽屉 absolute 照旧收敛 252，行为零变化。'.encode('utf-8'),
    b'                var __dshDrawerPos = "";',
    b'                try { __dshDrawerPos = getComputedStyle(el).position; } catch (e) {}',
    b'                if (__dshDrawerPos !== "absolute" && __dshDrawerPos !== "fixed") continue;',
]
new = CRLF.join(new_lines) + CRLF

out = data[:i] + new + data[j:]
open(P, 'wb').write(out)
print('patched v2 size', len(out))
print('CRLF:', out.count(b'\r\n'), 'LF-only:', out.count(b'\n') - out.count(b'\r\n'), 'triple:', out.count(b'"""'))
