# -*- coding: utf-8 -*-
# 语义化兜底补丁：语音按钮注入器 + Enter 换行 + 输入框定位
# 根因：DSH 换版后 CSS Module 前缀 uWtHQG_ → VERcba_，写死哈希的 .uWtHQG_tools 永久命中 0
# 策略：语义后缀 [class*="_tools"] 优先，旧哈希保留兜底（向后兼容，幂等）
import sys
sys.stdout.reconfigure(encoding='utf-8')
P = r"E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift"
data = open(P, 'rb').read()
CRLF = b'\r\n'

def crlf(s):
    return s.replace('\r\n', '\n').replace('\n', '\r\n').encode('utf-8')

EDITS = [
    # A. 语音按钮注入：tools 容器 —— 语义后缀优先 + 旧哈希兜底（原来只有死哈希，无兜底）
    (
        "              var tools = document.querySelector('.uWtHQG_tools');",
        "              // v1.0.131：DSH 换版后 .uWtHQG_tools 永久命中 0（前缀已变 VERcba_），语音按钮因此消失。\n"
        "              // 语义后缀优先，旧哈希仅作向后兼容兜底。\n"
        "              var tools = document.querySelector('[class*=\"composerStack\"] [class*=\"_tools\"]') ||\n"
        "                          document.querySelector('[class*=\"_tools\"]') ||\n"
        "                          document.querySelector('.uWtHQG_tools');"
    ),
    # B. ＋ 按钮定位（决定语音按钮插入位置：紧邻 ＋ 之后）
    (
        "              var addBtn = tools.querySelector('.uWtHQG_add');",
        "              var addBtn = tools.querySelector('[class*=\"_add\"], .uWtHQG_add, [aria-label*=\"添加文件\"]');"
    ),
    # C. 语音识别文字回填：composer 输入框语义定位优先
    (
        "                var inputEl = document.querySelector('.uWtHQG_input') ||",
        "                var inputEl = document.querySelector('[class*=\"composerStack\"] [class*=\"_input\"]') ||\n"
        "                              document.querySelector('.uWtHQG_input') ||"
    ),
    # D. Enter 换行：单哈希条件已静默失效 → 补语义兜底
    (
        "                var input = target.closest ? target.closest('.uWtHQG_input') : null;",
        "                var input = target.closest ? (target.closest('.uWtHQG_input') || target.closest('[class*=\"composerStack\"] [class*=\"_input\"]')) : null;"
    ),
    # E. ＋ 按钮点击抑制键盘：哈希失效 → 补语义
    (
        "              if (target.closest('.uWtHQG_add') || target.closest('[data-trigger-menu]')",
        "              if (target.closest('.uWtHQG_add') || target.closest('[class*=\"_add\"]') || target.closest('[data-trigger-menu]')"
    ),
]

for old, new in EDITS:
    ob, nb = crlf(old), crlf(new)
    n = data.count(ob)
    assert n == 1, 'edit anchor count=%d for: %s' % (n, old[:40])
    data = data.replace(ob, nb, 1)
    print('OK edit:', old.strip()[:56])

open(P, 'wb').write(data)
print('new size', len(data), 'CRLF', data.count(b'\r\n'), 'LF-only', data.count(b'\n') - data.count(b'\r\n'), 'triple', data.count(b'"""'))
