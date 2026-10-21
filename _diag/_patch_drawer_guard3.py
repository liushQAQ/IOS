# -*- coding: utf-8 -*-
# v1.0.131 抽屉守卫 v3：只收敛自然宽 >320 的抽屉（真机新版 360.3）；旧版/Linux 前端
# 自然宽 ~300 一律零干预（含 CSS 规则整块 html:not(.dshfw-drawer-native) 前缀豁免）。
# 依据：玩家 131(76) 复测「一模一样」—— 其抽屉同为 overlay 定位，v2 position 判据放行了 252。
import sys
sys.stdout.reconfigure(encoding='utf-8')
P = r'E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift'
d = open(P, 'rb').read()
CRLF = b'\r\n'

# ---------- 1) JS: applyDrawerWidth 守卫 v2 -> v3 ----------
# 用守卫 v2 注释首行定位（文件字节里中文为 UTF-8 实体字符）
marker_start = '                // v1.0.131 玩家兼容守卫：仅当抽屉是 overlay 定位（absolute/fixed）时才强制 252。'.encode('utf-8')
n = d.count(marker_start)
assert n == 1, 'guard v2 start count=%d' % n
i = d.find(marker_start)
end_marker = b"                if (__dshDrawerPos !== \"absolute\" && __dshDrawerPos !== \"fixed\") continue;" + CRLF
j = d.find(end_marker, i)
assert j > 0, 'guard v2 end'
j += len(end_marker)

new_js = CRLF.join([
    '                // v1.0.131b 守卫 v3：只收敛「自然宽 >320」的抽屉（老总真机新版自然宽 360.3，×0.70=252）。'.encode('utf-8'),
    '                //   旧版 / Linux 版前端自然宽 ~300（占屏 70%，本来就不超老总阈值），且其主区宽度'.encode('utf-8'),
    '                //   按 300 自洽预留 —— 强写 252 必然错位 24pt 裁切主内容（玩家 131(76) 复测'.encode('utf-8'),
    '                //   「一模一样」实锤：其抽屉同为 overlay 定位，v2 的 position 判据拦不住）。'.encode('utf-8'),
    '                //   v3 一律按宽度判：≤320 不碰（内联与 CSS 规则都豁免，html 加 dshfw-drawer-native'.encode('utf-8'),
    '                //   类让样式表同权豁免）；>320 照旧收敛 252，老总真机视觉零变化。'.encode('utf-8'),
    '                //   宽度 <200 视为样式未加载完成，本轮不判定不写入，下轮复判。'.encode('utf-8'),
    b'                var __dshDrawerOurs = el.style.getPropertyValue("width") === DRAWER_W + "px" &&',
    b'                    el.style.getPropertyPriority("width") === "important";',
    b'                if (!__dshDrawerOurs) {',
    b'                  var __natW = el.getBoundingClientRect().width;',
    b'                  if (__natW < 200) continue;',
    b'                  if (!(__natW > 320)) {',
    b'                    if (el.style.getPropertyValue("width")) {',
    b'                      el.style.removeProperty("width");',
    b'                      el.style.removeProperty("min-width");',
    b'                      el.style.removeProperty("max-width");',
    b'                    }',
    b'                    try { document.documentElement.classList.add("dshfw-drawer-native"); } catch (e) {}',
    b'                    continue;',
    b'                  }',
    b'                }',
]) + CRLF

d = d[:i] + new_js + d[j:]

# ---------- 2) CSS: sidebarCol 主块选择器加 html:not(.dshfw-drawer-native) 前缀 ----------
old_css = (
    b"            '[class*=\\\"sidebarCol\\\"],'" + CRLF +
    b"            '.CZPbNW_sidebarCol {'" + CRLF
)
n2 = d.count(old_css)
assert n2 == 1, 'css anchor count=%d' % n2
new_css = (
    b"            'html:not(.dshfw-drawer-native) [class*=\\\"sidebarCol\\\"],'" + CRLF +
    b"            'html:not(.dshfw-drawer-native) .CZPbNW_sidebarCol {'" + CRLF
)
d = d.replace(old_css, new_css, 1)

open(P, 'wb').write(d)
print('patched v3 size', len(d))
print('CRLF:', d.count(b'\r\n'), 'LF-only:', d.count(b'\n') - d.count(b'\r\n'), 'triple:', d.count(b'\"\"\"'))
