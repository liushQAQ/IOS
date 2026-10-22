# -*- coding: utf-8 -*-
# 老总 2026-10-22 四条 UI 微调（shim_24 队列居中/防裁 + 模型选择器补位 + shim_25 dock 缩字）
# 二进制精确替换（CRLF 保持），每处断言恰好 1 次命中。
import sys

P = r"E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift"
data = open(P, "rb").read()
orig_len = len(data)

def rep(old, new, tag):
    global data
    b_old = old.replace("\n", "\r\n").encode("utf-8")
    b_new = new.replace("\n", "\r\n").encode("utf-8")
    n = data.count(b_old)
    if n != 1:
        print("FAIL [%s]: count=%d" % (tag, n))
        sys.exit(1)
    data = data.replace(b_old, b_new)
    print("OK [%s]" % tag)

# ── 改动 1：GAP 8 → 14（间隔更远，居中后视觉均衡）──
rep(
    "var GAP = 8, PAD_L = 14, PAD_R = 12, BAND = 40, MIN_W = 60;",
    "var GAP = 14, PAD_L = 14, PAD_R = 12, BAND = 40, MIN_W = 60;",
    "GAP14",
)

# ── 改动 2：两段式布局（量宽 → 居中 → 间距收缩 → 右缘绝不裁末项）──
rep(
"""            var cy = cr.top + 22;          // 插件条垂直中心（背景条 top4 h36 → 中心 22）
            var maxRight = cr.right - PAD_R;
            var x = cr.left + PAD_L;
            for (var i = 0; i < items.length; i++) {
              var el = items[i];
              setImp(el, 'position', 'absolute');
              // 清掉 shim_23 遗留的 transform 位移（脱流后 left/top 全权接管，叠加会漂 85px）
              setImp(el, 'transform', 'none');
              var r = el.getBoundingClientRect();
              var w = r.width, h = r.height;
              if (x + w > maxRight) { w = Math.max(MIN_W, maxRight - x); setImp(el, 'max-width', w + 'px'); }
""",
"""            var cy = cr.top + 22;          // 插件条垂直中心（背景条 top4 h36 → 中心 22）
            var maxRight = cr.right - PAD_R;
            // 老总 2026-10-22 四条微调 #1/#4：两段式布局——先全部脱流量宽，再整体水平居中；
            //   总宽超限时间距从 14px 逐级收缩到 4px，末项右缘绝不越过卡片右缘（费用明细不再被裁掉）
            var ws = [];
            for (var i0 = 0; i0 < items.length; i0++) {
              setImp(items[i0], 'position', 'absolute');
              // 清掉 shim_23 遗留的 transform 位移（脱流后 left/top 全权接管，叠加会漂 85px）
              setImp(items[i0], 'transform', 'none');
              ws.push(items[i0].getBoundingClientRect().width);
            }
            var sumW = 0;
            for (var i1 = 0; i1 < ws.length; i1++) { sumW += ws[i1]; }
            var n = items.length, avail = cr.width - PAD_L - PAD_R, gap = GAP;
            var total = sumW + GAP * (n - 1);
            if (total > avail && n > 1) { gap = Math.max(4, (avail - sumW) / (n - 1)); total = sumW + gap * (n - 1); }
            var x = cr.left + Math.max(PAD_L, (cr.width - total) / 2);
            for (var i = 0; i < items.length; i++) {
              var el = items[i];
              var r = el.getBoundingClientRect();
              var w = r.width, h = r.height;
              if (x + w > maxRight) { w = Math.max(MIN_W, maxRight - x); setImp(el, 'max-width', w + 'px'); }
""",
    "TWOPASS",
)

# ── 改动 3：步进用动态 gap ──
rep("x += w + GAP;", "x += w + gap;", "STEPGAP")

# ── 改动 4：模型选择器向右补位（引擎量到发送钮左缘 -10px，只放不收）──
rep(
"""              x += w + gap;
            }
          }
          function isDSH() {
""",
"""              x += w + gap;
            }
            // 老总 2026-10-22 微调 #2：模型选择器向右补位填满空洞（量到发送钮左缘-10px，只放不收、绝不压钮）
            try {
              var tg = document.querySelector('[class*="composerStack"] [class*="standardControls"] [class*="_trigger"]');
              var prim = document.querySelector('[class*="composerStack"] [class*="_primary"]');
              if (tg && prim && visible(tg) && visible(prim)) {
                var tr = tg.getBoundingClientRect(), pr = prim.getBoundingClientRect();
                var want = Math.round(pr.left - tr.left - 10);
                if (want > tr.width + 2 && want > 120 && want < 320) { setImp(tg, 'width', want + 'px'); }
              }
            } catch (e) {}
          }
          function isDSH() {
""",
    "TRIGGROW",
)

# ── 改动 5：模型选择器解除 100%/150px 限宽（引擎已精确控宽，max-width 会压过 inline width）──
rep(
"""            '[class*="composerStack"] [class*="standardControls"] [class*="_trigger"] {',
            '  max-width: 100% !important;',
            '  min-width: 0 !important;',
            '  flex: 1 1 auto !important;',
            '}'
""",
"""            '[class*="composerStack"] [class*="standardControls"] [class*="_trigger"] {',
            '  max-width: none !important;',
            '  min-width: 0 !important;',
            '  flex: 0 0 auto !important;',
            '}'
""",
    "TRIGMAXW",
)

# ── 改动 6：shim_25 dock 缩字 11px + 行距收紧 + padding 收紧（一行多放、不再截断）──
rep(
"""            '  row-gap: 2px !important;',
            '}',
""",
"""            '  row-gap: 1px !important;',
            '  font-size: 11px !important;',
            '  line-height: 1.35 !important;',
            '}',
            '[class*="composerStack"] [class*="dock"]:not([class*="sm-"]) * {',
            '  font-size: 11px !important;',
            '  line-height: 1.35 !important;',
            '}',
""",
    "DOCKFONT",
)

rep(
    "'  padding: 3px 10px 5px !important;',",
    "'  padding: 2px 10px 4px !important;',",
    "DOCKPAD",
)

open(P, "wb").write(data)
print("done: %d -> %d bytes (+%d)" % (orig_len, len(data), len(data) - orig_len))
