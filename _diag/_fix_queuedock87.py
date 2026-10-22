# -*- coding: utf-8 -*-
# 87 修复：
# 1) 撤销 86 的 fixQueueDock（margin-bottom:0 破坏官方贴层设计 → 插件跑位/模型行错位）
# 2) 真凶：官方 QueueDock panel :before 用无前缀 backdrop-filter 做毛玻璃，
#    iOS<=16 WKWebView 只认 -webkit-backdrop-filter → 毛玻璃失效 → 底层 GoalBar 透视 = 叠印
#    修法：补 -webkit- 前缀 + panel 兜底同色不透明背景
import sys

P = r'E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift'
data = open(P, 'rb').read()

def rep(old, new, tag, must=1):
    global data
    b_old = old.encode('utf-8')
    b_new = new.encode('utf-8')
    n = data.count(b_old)
    assert n == must, '%s anchor count=%d' % (tag, n)
    data = data.replace(b_old, b_new)
    print('OK', tag)

# ── 1) 删除 fixQueueDock 函数体（连注释一起），恢复 boot 原样 ──
old1 = (
    "          // 排队 dock 与相邻 dock（如目标进度条）叠印自愈：官方 QueueDock 的 dock 有\r\n"
    "          // 负 bottom margin（设计上贴住下一层），当后面还跟了别的 dock 时两层直接叠印，\r\n"
    "          // 检测到相邻可见 dock 就取消该负 margin（打 data-dsh-qfix 标记幂等）。\r\n"
    "          function fixQueueDock() {\r\n"
    "            var qd = document.querySelector('[data-queue-dock]');\r\n"
    "            if (!qd) { return; }\r\n"
    "            var nx = qd.nextElementSibling;\r\n"
    "            var nxDock = false;\r\n"
    "            while (nx) {\r\n"
    "              var r = null;\r\n"
    "              try { r = nx.getBoundingClientRect(); } catch (e) { break; }\r\n"
    "              if (r && r.height > 0) {\r\n"
    "                nxDock = /_dock/.test(nx.getAttribute('class') || '');\r\n"
    "                break;\r\n"
    "              }\r\n"
    "              nx = nx.nextElementSibling;\r\n"
    "            }\r\n"
    "            var cur = qd.getAttribute('data-dsh-qfix');\r\n"
    "            if (nxDock && cur !== '1') {\r\n"
    "              try { qd.style.setProperty('margin-bottom', '0px', 'important'); } catch (e) {}\r\n"
    "              qd.setAttribute('data-dsh-qfix', '1');\r\n"
    "            } else if (!nxDock && cur === '1') {\r\n"
    "              try { qd.style.removeProperty('margin-bottom'); } catch (e) {}\r\n"
    "              qd.setAttribute('data-dsh-qfix', '0');\r\n"
    "            }\r\n"
    "          }\r\n"
    "          function boot() {\r\n"
    "            installCss();\r\n"
    "            fixOnce();\r\n"
    "            fixQueueDock();\r\n"
    "            setTimeout(fixOnce, 1200);"
)
new1 = (
    "          function boot() {\r\n"
    "            installCss();\r\n"
    "            fixOnce();\r\n"
    "            setTimeout(fixOnce, 1200);"
)
rep(old1, new1, 'remove-fixQueueDock')

# ── 2) interval 撤掉 fixQueueDock 调用 ──
old2 = "          setInterval(function () { installCss(); fixOnce(); fixQueueDock(); }, 3000);\r\n        })();"
new2 = "          setInterval(function () { installCss(); fixOnce(); }, 3000);\r\n        })();"
rep(old2, new2, 'interval-revert')

# ── 3) css 数组：排队条毛玻璃 -webkit- 前缀 + panel 兜底（86 的预览单行规则保留） ──
old3 = (
    "            '[data-queue-dock] [class*=\"_preview\"] {',\r\n"
    "            '  flex: 1 1 auto !important;',\r\n"
    "            '}'\r\n"
    "          ].join('\\\\n');"
)
new3 = (
    "            '[data-queue-dock] [class*=\"_preview\"] {',\r\n"
    "            '  flex: 1 1 auto !important;',\r\n"
    "            '}',\r\n"
    "            // ── 排队条叠印真凶：官方 panel:before 毛玻璃只写了无前缀 backdrop-filter，\r\n"
    "            // iOS<=16 WKWebView 只认 -webkit-backdrop-filter → 模糊失效 → 底层 GoalBar 透视。\r\n"
    "            // 补前缀恢复官方「叠层+毛玻璃」设计；panel 再兜底一层同色背景双保险。\r\n"
    "            '[data-queue-dock] [class*=\"_panel\"]:before {',\r\n"
    "            '  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter, blur(20px)) !important;',\r\n"
    "            '  backdrop-filter: var(--dsw-menu-backdrop-filter, blur(20px)) !important;',\r\n"
    "            '}',\r\n"
    "            '[data-queue-dock] [class*=\"_panel\"] {',\r\n"
    "            '  background: var(--dsw-specific-menu, rgba(30, 30, 32, 0.86)) !important;',\r\n"
    "            '  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter, blur(20px)) !important;',\r\n"
    "            '  backdrop-filter: var(--dsw-menu-backdrop-filter, blur(20px)) !important;',\r\n"
    "            '}'\r\n"
    "          ].join('\\\\n');"
)
rep(old3, new3, 'css-frost-fix')

if b'\r\n' not in data[:2000]:
    print('FATAL: CRLF lost')
    sys.exit(1)
open(P, 'wb').write(data)
print('written ok')
