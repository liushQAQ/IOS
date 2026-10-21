# -*- coding: utf-8 -*-
# v1.0.131: applyDrawerWidth 加旧前端守卫（legacy 自然宽<=310 不强制 252）
import sys
sys.stdout.reconfigure(encoding='utf-8')
P = r'E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift'
data = open(P, 'rb').read()
CRLF = b'\r\n'

old = (
    b'              var els = document.querySelectorAll(\'[class*=\\\"sidebarCol\\\"], .CZPbNW_sidebarCol\');' + CRLF +
    b'              for (var i = 0; i < els.length; i++) {' + CRLF +
    b'                var el = els[i];' + CRLF
)

new_lines = [
    b'              var els = document.querySelectorAll(\'[class*=\\\"sidebarCol\\\"], .CZPbNW_sidebarCol\');',
    b'              for (var i = 0; i < els.length; i++) {',
    b'                var el = els[i];',
    '                // v1.0.131 玩家兼容守卫：旧版 DSH 前端（抽屉自然宽 <=310，push 布局）绝不强制 252 ——'.encode('utf-8'),
    '                //   旧前端上 252(content-box) 与原生 300 打架，主内容被推出右屏裁 24pt（玩家截图实锤：'.encode('utf-8'),
    '                //   侧栏 276=252+24padding，发送钮切半；Safari 无注入 300 自然宽一切正常）。'.encode('utf-8'),
    '                //   旧前端保持原生宽 = 与 Safari 完全一致。判定每元素只做一次（缓存 flag），'.encode('utf-8'),
    '                //   自然宽取不到(0)时本轮跳过，下轮再判。新版前端(自然宽 360)照旧收敛 252。'.encode('utf-8'),
    b'                if (!el.__dshDrawerGuard) {',
    b'                  var __natW = el.getBoundingClientRect().width;',
    b'                  if (__natW > 0) el.__dshDrawerGuard = (__natW <= 310) ? 1 : 2;',
    b'                }',
    b'                if (el.__dshDrawerGuard === 1) continue;',
]
new = CRLF.join(new_lines) + CRLF

n = data.count(old)
print('anchor count:', n)
assert n == 1, 'anchor not unique'
out = data.replace(old, new, 1)
open(P, 'wb').write(out)
print('patched size', len(out))
print('CRLF:', out.count(b'\r\n'), 'LF-only:', out.count(b'\n') - out.count(b'\r\n'), 'triple:', out.count(b'"""'))
