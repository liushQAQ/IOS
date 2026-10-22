# -*- coding: utf-8 -*-
# ① dock 直取子元素加尺寸过滤（宽/高面板绝不入列，防 shim_25 面板被拽散）
# ② 放置循环改为「保底预留」式钳制：后续每项预留 MIN_W+4，末项绝不越过卡片右缘
import sys

P = r"E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift"
data = open(P, "rb").read()

def rep(old, new, tag):
    global data
    b_old = old.replace("\n", "\r\n").encode("utf-8")
    b_new = new.replace("\n", "\r\n").encode("utf-8")
    n = data.count(b_old)
    if n != 1:
        print("FAIL [%s] count=%d" % (tag, n)); sys.exit(1)
    data = data.replace(b_old, b_new)
    print("OK [%s]" % tag)

rep(
"""            if (dockEl) {
              var kids = dockEl.children;
              for (var k2 = 0; k2 < kids.length; k2++) { grab(kids[k2]); }
            }
""",
"""            if (dockEl) {
              var kids = dockEl.children;
              for (var k2 = 0; k2 < kids.length; k2++) {
                // 老总 2026-10-22 微调 #4 防线：宽面板（如系统监控 sm-root）/高面板绝不入列，
                //   只允许 pill 级（<=280x46）统计件上带，防止 shim_25 dock 面板被拽散
                var kr = kids[k2].getBoundingClientRect();
                if (kr.width > 280 || kr.height > 46) { continue; }
                grab(kids[k2]);
              }
            }
""",
    "DOCKFILTER",
)

rep(
"""            for (var i = 0; i < items.length; i++) {
              var el = items[i];
              var r = el.getBoundingClientRect();
              var w = r.width, h = r.height;
              if (x + w > maxRight) { w = Math.max(MIN_W, maxRight - x); setImp(el, 'max-width', w + 'px'); }
""",
"""            for (var i = 0; i < items.length; i++) {
              var el = items[i];
              var r = el.getBoundingClientRect();
              var w = r.width, h = r.height;
              // 保底预留式钳制：给后续每项留 MIN_W+4，本项只用到「刚好够后面」的上限，
              //   保证末项也完整落在卡片右缘内（费用明细绝不再被挤出去）
              var reserve = (items.length - i - 1) * (MIN_W + 4);
              var cap = maxRight - x - reserve;
              if (cap < MIN_W) { cap = MIN_W; }
              if (w > cap) { w = cap; setImp(el, 'max-width', w + 'px'); }
""",
    "RESERVECLAMP",
)

open(P, "wb").write(data)
print("done")
