# -*- coding: utf-8 -*-
# shim_25 插入 v2：shim_24 闭合顶格加逗号，shim_25 顶格开闭（不改变既有剥缩进行为）
p = r'E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift'
data = open(p, 'rb').read()

anchor = b'\r\n"""\r\n    ]\r\n'
i = data.find(anchor)
assert i > 0, 'array tail not found'
assert b'})();' in data[i-200:i], 'unexpected tail context'

L = []
L.append('\r\n')
L.append('""",\r\n')            # shim_24 闭合 + 逗号（顶格，不缩进 → 不触发剥取）
L.append('"""\r\n')             # shim_25 开界
L.append('        // ===== shim_25（v1.0.131 build 79）：会话框下方统计 dock 区 —— 主题面板化 + 防溢出 =====\r\n')
L.append('        // 老总 2026-10-22 01:27 实机截图：运行中/结束后，会话卡下方的统计 dock（ueqFMa 轮次/tok pill、\r\n')
L.append('        // sm-dock CPU/内存、cm-session-cost 本会话费用、cm-corner 网关 pill）直接悬在页面底色上，\r\n')
L.append('        // 暗黑下 CPU 数值是浅色主题的深蓝 --sm-accent(#2470d8) 几乎看不清；主题反复切换后同样出现。\r\n')
L.append('        // 实测（2026-10-22 01:40 Chromium 430×932 复现）：VERcba_dock 在卡片正下方 flex wrap，\r\n')
L.append('        //   子项 = ueqFMa_pill(轮次) + sm-root(CPU/内存) + cm-session-cost(本会话) + cm-corner(网关 pill)，\r\n')
L.append('        //   运行结束统计仍驻留；内容 4 行时 dock 高约 110px，底缘顶到屏幕。\r\n')
L.append('        // 定案三件事：\r\n')
L.append('        //   ① dock 容器挂 DSH 主题面板底（--dsw-alias-* 自动跟主题，切换即时生效，暗黑深色面板不再悬浮）；\r\n')
L.append('        //   ② sm 插件变量整体映射到 DSH 主题变量（不再赌 body[data-ds-dark-theme] 是否被前端正确设置）；\r\n')
L.append('        //   ③ max-height 收口 + 纵向可滚，极端多行时不再溢出屏幕。\r\n')
L.append('        (function () {\r\n')
L.append('          if (window.top !== window) { return; }\r\n')
L.append('          var CSS = [\r\n')
L.append('            \'[class*="composerStack"] [class*="dock"]:not([class*="sm-"]) {\',\r\n')
L.append('            \'  background: var(--dsw-alias-bg-layer-1, rgba(127,127,127,0.14)) !important;\',\r\n')
L.append('            \'  border-radius: 12px !important;\',\r\n')
L.append('            \'  margin: 2px 10px 6px !important;\',\r\n')
L.append('            \'  padding: 3px 10px 5px !important;\',\r\n')
L.append('            \'  box-sizing: border-box !important;\',\r\n')
L.append('            \'  max-height: 126px !important;\',\r\n')
L.append('            \'  overflow-y: auto !important;\',\r\n')
L.append('            \'  -webkit-overflow-scrolling: touch !important;\',\r\n')
L.append('            \'  row-gap: 2px !important;\',\r\n')
L.append('            \'}\',\r\n')
L.append('            \'[class*="composerStack"] .sm-root {\',\r\n')
L.append('            \'  --sm-text-primary: var(--dsw-alias-label-primary, #e9effb) !important;\',\r\n')
L.append('            \'  --sm-text-secondary: var(--dsw-alias-label-secondary, #b5c3dc) !important;\',\r\n')
L.append('            \'  --sm-text-tertiary: var(--dsw-alias-label-tertiary, #8595b1) !important;\',\r\n')
L.append('            \'  --sm-accent: #5b9bff !important;\',\r\n')
L.append('            \'  --sm-hover: rgba(91,155,255,0.12) !important;\',\r\n')
L.append('            \'  --sm-active: rgba(91,155,255,0.2) !important;\',\r\n')
L.append('            \'  --sm-surface: var(--dsw-alias-bg-layer-1, #10151d) !important;\',\r\n')
L.append('            \'  --sm-card: var(--dsw-alias-bg-layer-2, #1a2130) !important;\',\r\n')
L.append('            \'  --sm-border: var(--dsw-alias-border-l1, #33456a) !important;\',\r\n')
L.append('            \'  --sm-border-strong: var(--dsw-alias-border-l1, #5a7099) !important;\',\r\n')
L.append('            \'}\'\r\n')
L.append("          ].join('\\\\n');\r\n")
L.append('          function isDSH() {\r\n')
L.append('            try {\r\n')
L.append('              if (!document.getElementById(\'root\')) { return false; }\r\n')
L.append('              return !!document.querySelector(\'[data-mobile-nav="frame"], [class*="composerStack"], [class*="headerCorner"]\');\r\n')
L.append('            } catch (e) { return false; }\r\n')
L.append('          }\r\n')
L.append('          function apply() {\r\n')
L.append('            if (!isDSH()) { return; }\r\n')
L.append('            if (document.getElementById(\'dsh-ios-dock-theme\')) { return; }\r\n')
L.append('            try {\r\n')
L.append('              var st = document.createElement(\'style\');\r\n')
L.append('              st.id = \'dsh-ios-dock-theme\';\r\n')
L.append('              st.textContent = CSS;\r\n')
L.append('              document.head.appendChild(st);\r\n')
L.append('            } catch (e) {}\r\n')
L.append('          }\r\n')
L.append('          apply();\r\n')
L.append('          setInterval(function () { apply(); }, 3000);\r\n')
L.append('        })();\r\n')
L.append('"""\r\n')             # shim_25 闭合（顶格）
L.append('    ]\r\n')

shim25 = ''.join(L).encode('utf-8')
# 安全断言：内容里除 join 的双写 \\n 外不允许任何单反斜杠
import re
singles = [m for m in re.finditer(rb'\\[a-z]', shim25) if shim25[max(0,m.start()-1):m.start()] != b'\\']
print('非双写单反斜杠:', len(singles))
assert len(singles) == 0, 'escaping trap!'
new = data[:i] + shim25 + data[i + len(anchor):]
open(p, 'wb').write(new)
print('inserted, new size:', len(new))
