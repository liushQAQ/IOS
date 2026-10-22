# -*- coding: utf-8 -*-
# TRIGGROW 升级：同步加宽左侧对齐的祖先容器，防 v1.0.127 fixComposerClamp 按父宽钳回
import sys

P = r"E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift"
data = open(P, "rb").read()

old = """            // 老总 2026-10-22 微调 #2：模型选择器向右补位填满空洞（量到发送钮左缘-10px，只放不收、绝不压钮）
            try {
              var tg = document.querySelector('[class*="composerStack"] [class*="standardControls"] [class*="_trigger"]');
              var prim = document.querySelector('[class*="composerStack"] [class*="_primary"]');
              if (tg && prim && visible(tg) && visible(prim)) {
                var tr = tg.getBoundingClientRect(), pr = prim.getBoundingClientRect();
                var want = Math.round(pr.left - tr.left - 10);
                if (want > tr.width + 2 && want > 120 && want < 320) { setImp(tg, 'width', want + 'px'); }
              }
            } catch (e) {}
"""
new = """            // 老总 2026-10-22 微调 #2：模型选择器向右补位填满空洞（量到发送钮左缘-10px，只放不收、绝不压钮）
            //   必须同步加宽左侧对齐的非 button 祖先容器，否则 v1.0.127 fixComposerClamp
            //   会按「trigger 越出父容器」把 max-width 钳回 100% 父宽，补位失效。
            try {
              var tg = document.querySelector('[class*="composerStack"] [class*="standardControls"] [class*="_trigger"]');
              var prim = document.querySelector('[class*="composerStack"] [class*="_primary"]');
              if (tg && prim && visible(tg) && visible(prim)) {
                var tr = tg.getBoundingClientRect(), pr = prim.getBoundingClientRect();
                var want = Math.round(Math.min(pr.left - tr.left - 10, cr.right - tr.left - 8));
                if (want > tr.width + 2 && want > 120 && want < 340) {
                  var el2 = tg, guard2 = 0;
                  while (el2 && el2 !== card && guard2 < 6) {
                    var r2 = el2.getBoundingClientRect();
                    var btn2 = (el2.tagName === 'BUTTON' || el2.getAttribute('role') === 'button');
                    if (!btn2 && r2.width < want && Math.abs(r2.left - tr.left) < 4) { setImp(el2, 'width', want + 'px'); }
                    el2 = el2.parentElement; guard2++;
                  }
                  setImp(tg, 'width', want + 'px');
                  setImp(tg, 'max-width', 'none');
                }
              }
            } catch (e) {}
"""
b_old = old.replace("\n", "\r\n").encode("utf-8")
b_new = new.replace("\n", "\r\n").encode("utf-8")
n = data.count(b_old)
if n != 1:
    print("FAIL count=%d" % n); sys.exit(1)
data = data.replace(b_old, b_new)
open(P, "wb").write(data)
print("OK TRIGGROW2 (+%d bytes)" % (len(data) - (len(data) - len(b_new) + len(b_old))))
