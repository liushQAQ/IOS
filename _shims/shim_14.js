        (function () {
          if (window.__dshMobileFit) return;
          window.__dshMobileFit = 1;
          var LIMIT = 760;
          // 故意藏在屏外的浮层不参与标记，避免把抽屉/菜单误判成溢出
          var SKIP = /rightbar|drawer|Drawer|portal|Portal|overlay|Overlay|popover|Popover|menu|Menu|tooltip|Tooltip|lightbox|Lightbox|dialog|Dialog|modal|Modal/;
          var CSS = '@media (max-width: ' + LIMIT + 'px) {'
            + 'html,body{max-width:100% !important;overflow-x:clip !important}'
            + '[data-dsh-fit="1"],pre,code,kbd,samp,textarea,'
            + '[class*="_text_"],[class*="_fileLink"],[class*="_filePath"],[class*="_path"],'
            + '[class*="_summary"],[class*="_rowText"],[class*="_rowSub"],[class*="_rowDesc"],'
            + '[class*="_desc"],[class*="_tips"],[class*="_hint"],[class*="_error"]{'
            + 'overflow-wrap:anywhere !important;word-break:break-word !important;'
            + 'min-width:0 !important;max-width:100% !important}'
            + 'pre,[class*="_text_"],[class*="_summary"]{white-space:pre-wrap !important}'
            + '[class*="header"],[class*="Header"],[class*="row"],[class*="Row"],'
            + '[class*="body"],[class*="Body"],[class*="content"],[class*="Content"],'
            + '[class*="col"],[class*="Col"],[class*="_main"],[class*="_inner"]{min-width:0 !important}'
            + '[data-dsh-fit="1"] *{overflow-wrap:anywhere !important}'
            + '}';
          function injectCss() {
            try {
              if (document.querySelector('style[data-dsh-mobile-fit]')) return;
              var st = document.createElement('style');
              st.setAttribute('data-dsh-mobile-fit', '1');
              st.textContent = CSS;
              (document.head || document.documentElement).appendChild(st);
            } catch (e) {}
          }
          // ===== v1.0.106 性能重写（老总反馈「切换会话几乎没响应」）=====
          // 旧实现两个致命点：
          //   ① 「边扫边 setAttribute」——每写一个属性就把布局打脏，下一个 getBoundingClientRect()
          //      又强制整页重排（布局抖动）。首页约 400 节点无所谓，会话页实测 9344 个节点 →
          //      单次 mark() 冷调用实测：1x CPU 1291ms（longtask 峰值 1366ms）、
          //      6x CPU 14820ms（longtask 峰值 15624ms）—— 这就是「切换会话几乎没响应」。
          //   ② 触发器是「整文档 MutationObserver（260ms 去抖）+ 600ms×30 次轮询」——
          //      切换会话时 DOM 连续大变更，mark 被连续叫起，卡顿叠加。
          // 现改为：
          //   ① 只扫「直接含文字节点」的叶子元素（真正会溢出的是文字盒），跳过绝大多数布局包装层，
          //      实测待测元素从 9344 降到 2052；再对 pre/code/img/video/canvas/table 等无文字
          //      子节点的原生标签兜底放行，避免漏掉代码块与媒体。
          //   ② 按时间预算切片：每片最多占用主线程约 8ms 就交还（用 rAF 摊到多帧），
          //      任何单帧都不会产生长任务，主线程始终能响应触摸。
          //   ③ 先收集 hits、扫完再统一写入（消除布局抖动，这是最大的一笔开销）。
          //   ④ 不再逐元素 getComputedStyle（display:none 的元素 rect 本就是 0，用尺寸判断足够）。
          //   ⑤ 触发改为「DOM 安静 600ms 后」的停留式去抖 + 执行次数硬上限，取消 600ms×30 轮询。
          // A/B 实测（同一会话页 9344 节点，残留越界元素两边同为 38 = 修复效果等价）：
          //   单次同步阻塞  1x: 1291ms → 33ms     6x: 14820ms → 102ms
          //   longtask 峰值 1x: 1366ms → 167ms    6x: 15624ms → 796ms
          var BUDGET = 8;     // 每片最多占用主线程毫秒数
          var DWELL = 600;    // DOM 安静多久后才开始扫（停留式去抖）
          var MAX_RUNS = 8;   // 全生命周期最多执行次数
          var HARD_CAP = 40000; // 尺寸保护：节点数异常膨胀时放弃（正常会话页 ~9k）
          var NATIVE = /^(PRE|CODE|KBD|SAMP|TEXTAREA|IMG|VIDEO|CANVAS|SVG|TABLE|INPUT|SELECT)$/;

          var raf = window.requestAnimationFrame || function (f) { setTimeout(f, 16); };

          function scan() {
            try {
              if (window.innerWidth > LIMIT) return;
              var vw = document.documentElement.clientWidth || window.innerWidth;
              var all = document.querySelectorAll('body *:not([data-dsh-fit])');
              var n = all.length;
              if (!n || n > HARD_CAP) return;
              var hits = [];
              var i = 0, probed = 0, frames = 0;
              function now() { try { return performance.now(); } catch (x) { return Date.now(); } }
              function slice() {
                frames++;
                var t0 = now();
                try {
                  for (; i < n; i++) {
                    var e = all[i];
                    var cn = (typeof e.className === 'string') ? e.className : '';
                    if (cn && SKIP.test(cn)) continue;
                    // 只关心「直接含文字节点」的元素（真正会溢出的文字盒）；
                    // 少数无文字子节点的原生媒体/代码标签兜底放行。
                    if (!NATIVE.test(e.tagName)) {
                      var hasText = false;
                      for (var c = e.firstChild; c; c = c.nextSibling) {
                        if (c.nodeType === 3) { hasText = true; break; }
                      }
                      if (!hasText) continue;
                    }
                    probed++;
                    var r = e.getBoundingClientRect();
                    // display:none / visibility:hidden 的元素尺寸为 0，一并跳过
                    if (r.width < 8 || r.height < 4) continue;
                    if (Math.round(r.right - vw) > 2) hits.push(e);
                    else if (e.scrollWidth > e.clientWidth + 4 && e.clientWidth > 60) hits.push(e);
                    if ((i & 31) === 31 && now() - t0 > BUDGET) { i++; break; }
                  }
                } catch (x) {}
                window.__dshFitStat = { total: n, probed: probed, frames: frames, hits: hits.length };
                if (i < n) { raf(slice); return; }
                // 扫完统一写入：一次重排搞定，杜绝逐元素写属性导致的抖动
                for (var k = 0; k < hits.length; k++) {
                  try { hits[k].setAttribute('data-dsh-fit', '1'); } catch (x) {}
                }
              }
              slice();
            } catch (err) {}
          }

          var timer = 0, runs = 0;
          function schedule() {
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () { timer = 0; run(); }, DWELL);
          }
          function run() {
            if (runs >= MAX_RUNS) return;
            runs++;
            scan();
          }
          function boot() { injectCss(); schedule(); }
          if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
          else boot();
          window.addEventListener('load', boot);
          window.addEventListener('resize', schedule, { passive: true });
          window.addEventListener('orientationchange', function () { setTimeout(schedule, 300); });
          // 🔴 v1.0.107 修正一个「从来就没生效过」的静默缺陷：本脚本在 documentStart 执行，
          //    此刻 document.documentElement 还是 null（实测 de=false / readyState=loading），
          //    直接 observe 会抛 TypeError: parameter 1 is not of type 'Node' 并被下面的 catch 吞掉
          //    → 观察器从头到尾没装上（实测 fires=0）。必须等 documentElement 就绪再观察
          //    （shim_00 的 watchdog 早就用同样的等待模式修过，shim_11/14/15/16 当年漏了）。
          (function startObserve() {
            if (!document.documentElement) { setTimeout(startObserve, 16); return; }
            try { new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
          })();
          // 首屏只补两次（旧实现 600ms×30 = 连跑 18 秒，是切换会话卡顿的主因之一）
          setTimeout(run, 1500);
          setTimeout(run, 5000);
          window.__dshMobileFitMark = scan;
        })();