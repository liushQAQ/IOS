import io, sys

P = 'E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift'
data = open(P, 'rb').read()

OLD_TAIL = b"          setInterval(function () { apply(); }, 3000);\r\n        })();\r\n\"\"\"\r\n    ]\r\n"
cnt = data.count(OLD_TAIL)
print('anchor count:', cnt)
if cnt != 1:
    print('ABORT: anchor not unique')
    sys.exit(1)

BODY = r"""        // ===== shim_26（v1.0.131 build 81）：会话消息流「长文本行叠印」自愈 =====
        // 老总 2026-10-22 10:04 真机截图：运行中会话的步骤行（思考/读取/搜索文件内容）长摘要 wrap
        // 成多行后，行距塌到约 10px < 字号 13px，多行文字互相咬合叠印；短摘要单行不受影响。
        // 已排除：①官方 CSS 本身设计为单行 nowrap（summary 类 white-space:nowrap + ellipsis）；
        //        ②代理层实际下发的 JS/CSS 与磁盘原版逐字一致；③App 侧 25 个 shim 与 460 行 CSS
        //        均不碰消息流；④沙箱静态复现（官方 17 块 CSS + 真 DOM 结构 + 430px + App CSS 注入）
        //        行高 24px 全正常、不复现。
        // 定案：只在真机运行态出现（会话页渲染进程过载 / 流式重绘），页面层无法稳定复现，
        //      故改为通用自愈——扫描会话流内「含直接文本 且 computed line-height < 字号*1.12」的元素，
        //      按 1.5 倍字号补回行高。正常行 20px/13px 零命中、零外观变化；只救被压塌的行。
        //      幂等：命中后打 data-dsh-lh 标记，不再重复处理（前端换版重建 DOM 时自动重扫）。
        // 附带两条无害兜底：
        //   ① 关掉 TextShimmer 装饰副本层（[data-shimmer-text]::after 用 content:attr 复制全文，
        //      真机上副本层定位一旦失效就与正文叠印；关掉只损失流式扫光动画，正文不受影响）；
        //   ② 禁用 iOS 自动字号（text-size-adjust），防止 WebView 自行放大字体而 CSS 行高不跟。
        (function () {
          if (window.__dshLineFix) { return; }
          window.__dshLineFix = 1;
          var MAX_SCAN = 1500;
          var MIN_RATIO = 1.12;
          var TARGET_RATIO = 1.5;
          function hasOwnText(el) {
            var nodes = el.childNodes;
            for (var i = 0; i < nodes.length; i++) {
              var n = nodes[i];
              if (n.nodeType === 3 && n.nodeValue && n.nodeValue.replace(/\\s+/g, '').length > 1) { return true; }
            }
            return false;
          }
          function fixOnce() {
            var flow = document.querySelector('[data-slot="conversation.chat.flow"]');
            if (!flow) { return; }
            var els = flow.querySelectorAll('span, div, p, li, a, code, strong, em');
            var hits = 0;
            for (var i = 0; i < els.length && hits < MAX_SCAN; i++) {
              var el = els[i];
              if (el.getAttribute('data-dsh-lh') === '1') { continue; }
              if (!hasOwnText(el)) { continue; }
              var cs = null;
              try { cs = getComputedStyle(el); } catch (e) { continue; }
              if (!cs || cs.display === 'none' || cs.visibility === 'hidden') { continue; }
              var fs = parseFloat(cs.fontSize);
              var lh = parseFloat(cs.lineHeight);
              if (!fs || !isFinite(fs) || fs < 10) { continue; }
              if (!isFinite(lh) || lh <= 0) { continue; }
              if (lh >= fs * MIN_RATIO) { continue; }
              try {
                el.style.setProperty('line-height', Math.round(fs * TARGET_RATIO) + 'px', 'important');
                el.setAttribute('data-dsh-lh', '1');
                hits++;
              } catch (e) {}
            }
            if (hits > 0) { window.__dshLineFixHits = (window.__dshLineFixHits || 0) + hits; }
          }
          function installCss() {
            if (document.getElementById('dsh-ios-linefix')) { return; }
            try {
              var st = document.createElement('style');
              st.id = 'dsh-ios-linefix';
              st.textContent = '[data-shimmer-text]::after { content: none !important; }'
                + 'html, body { -webkit-text-size-adjust: 100% !important; text-size-adjust: 100% !important; }';
              document.head.appendChild(st);
            } catch (e) {}
          }
          function boot() {
            installCss();
            fixOnce();
            setTimeout(fixOnce, 1200);
            setTimeout(fixOnce, 4000);
          }
          if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', boot); } else { boot(); }
          window.addEventListener('load', boot);
          setInterval(function () { installCss(); fixOnce(); }, 3000);
        })();
"""

NEW_TAIL = ("          setInterval(function () { apply(); }, 3000);\r\n        })();\r\n\"\"\",\r\n\"\"\"\r\n"
            + BODY.replace("\n", "\r\n") + "\"\"\",\r\n    ]\r\n").encode('utf-8')

data2 = data.replace(OLD_TAIL, NEW_TAIL, 1)
open(P, 'wb').write(data2)
print('written, old', len(data), 'new', len(data2), 'delta', len(data2)-len(data))
