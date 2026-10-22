# -*- coding: utf-8 -*-
# 排队消息行叠印修复：css 数组追加 + shim_26 加 fixQueueDock
import io, sys

P = r'E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift'
data = open(P, 'rb').read()
orig_len = len(data)

def rep(old, new, tag):
    global data
    b_old = old.encode('utf-8')
    b_new = new.encode('utf-8')
    n = data.count(b_old)
    assert n == 1, '%s anchor count=%d' % (tag, n)
    data = data.replace(b_old, b_new)
    print('OK', tag)

# ── 1) css 数组追加 QueueDock 单行截断规则 ──
old1 = (
    "            '  min-width: 0 !important;',\r\n"
    "            '  overflow: hidden !important;',\r\n"
    "            '  text-overflow: ellipsis !important;',\r\n"
    "            '  white-space: nowrap !important;',\r\n"
    "            '}'\r\n"
    "          ].join('\\\\n');"
)
new1 = (
    "            '  min-width: 0 !important;',\r\n"
    "            '  overflow: hidden !important;',\r\n"
    "            '  text-overflow: ellipsis !important;',\r\n"
    "            '  white-space: nowrap !important;',\r\n"
    "            '}',\r\n"
    "            // ── 排队消息行（QueueDock）防叠印：预览单行省略号，长文字绝不折行 ──\r\n"
    "            '[data-queue-dock] [class*=\"_row\"] {',\r\n"
    "            '  flex-wrap: nowrap !important;',\r\n"
    "            '  min-width: 0 !important;',\r\n"
    "            '}',\r\n"
    "            '[data-queue-dock] [class*=\"_preview\"], [data-queue-dock] [class*=\"_preview\"] * {',\r\n"
    "            '  min-width: 0 !important;',\r\n"
    "            '  max-width: 100% !important;',\r\n"
    "            '  overflow: hidden !important;',\r\n"
    "            '  white-space: nowrap !important;',\r\n"
    "            '  text-overflow: ellipsis !important;',\r\n"
    "            '}',\r\n"
    "            '[data-queue-dock] [class*=\"_preview\"] {',\r\n"
    "            '  flex: 1 1 auto !important;',\r\n"
    "            '}'\r\n"
    "          ].join('\\\\n');"
)
rep(old1, new1, 'css-array')

# ── 2) shim_26 加 fixQueueDock 函数（插在 boot 之前） ──
old2 = (
    "          function boot() {\r\n"
    "            installCss();\r\n"
    "            fixOnce();\r\n"
    "            setTimeout(fixOnce, 1200);"
)
new2 = (
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
rep(old2, new2, 'shim26-func')

# ── 3) interval 里也补 fixQueueDock ──
old3 = "          setInterval(function () { installCss(); fixOnce(); }, 3000);\r\n        })();"
new3 = "          setInterval(function () { installCss(); fixOnce(); fixQueueDock(); }, 3000);\r\n        })();"
rep(old3, new3, 'shim26-interval')

if b'\r\n' not in data[:2000]:
    print('FATAL: CRLF lost')
    sys.exit(1)
open(P, 'wb').write(data)
print('written, %d -> %d bytes' % (orig_len, len(data)))
