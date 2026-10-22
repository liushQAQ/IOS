          function fixOverlayOverflow() {
            try {
              // 🔴 性能铁律：本函数由 applySidebarInset 驱动，而后者在 MutationObserver
              //   （流式输出时每 300ms 一次）里也会跑。候选池要上百次 getComputedStyle
              //   → 必须整体节流，不能只节流单根，否则每 300ms 白扫一遍。
              var now0 = Date.now();
              if (now0 - __dshOverlayLastRun < 400) return;
              __dshOverlayLastRun = now0;
              // ===== 🔴 v1.0.122：全局横向收口（老总 2026-10-19「任何界面都超出屏幕范围」）=====
              //   之前只在「浮层根」内做 border-box 修正，主界面和表头右侧那 4px 没人管。
              //   `overflow-x: clip` 与 `hidden` 的关键区别：**clip 不创建滚动容器**，
              //   所以不会把 html/body 变成 scroll container、也不会破坏 sticky 顶栏；
              //   DSH 主界面本来就靠内部滚动容器，html 自己不滚，这条只裁横向。
              //   一次性注入 + id 去重，幂等。
              try {
                if (!document.getElementById('__dsh-xclip')) {
                  var __xs = document.createElement('style');
                  __xs.id = '__dsh-xclip';
                  __xs.textContent = 'html, body { overflow-x: clip !important; max-width: 100vw !important; }';
                  (document.head || document.documentElement).appendChild(__xs);
                }
              } catch (e) {}
              // 顶栏右侧那个「打开右侧边栏」按钮实测 right = vw + 4（430x932 / 393x852 / 375x667
              // 三种尺寸都是恒定 +4），等于永远被屏幕右缘裁掉 4px，看起来就是「界面超出屏幕」。
              // 这里按实测值把它推回来。🔴 必须用 transform: translateX 而不是 margin-right：
              //   margin-right 在 titleRow 的 flex 流里会触发整条链重排，实测 1:3 放大
              //   （加 8px 让 right 从 434 退到 410，过头 16px，按钮离右缘剩 20px）。
              //   translateX 是纯视觉位移、不进布局流、1:1 精确：实测 430 宽下
              //   ov=4 → tx=-4 → right=430 正好贴边，第 2 轮起 ov=0 不再动。
              try {
                var __hcs = document.querySelectorAll('[class*="headerCorner"]');
                for (var __hi = 0; __hi < __hcs.length; __hi++) {
                  var __hc = __hcs[__hi];
                  var __hq = __hc.getBoundingClientRect();
                  if (__hq.width < 4 || __hq.height < 4) continue;
                  var __ov = Math.round(__hq.right - window.innerWidth);
                  if (__ov > 0) {
                    var __tx = 0;
                    var __mt = getComputedStyle(__hc).transform;
                    if (__mt && __mt !== 'none') {
                      var __mp = __mt.replace(/^matrix\(|\)$/g, '').split(',');
                      __tx = parseFloat(__mp[4]) || 0;
                    }
                    __hc.style.setProperty('transform', 'translateX(' + (__tx - __ov) + 'px)', 'important');
                  }
                }
              } catch (e) {}
              var vw = window.innerWidth || 430;
              var hosts = document.querySelectorAll('[class*="overlayLayer"], body > div');
              // 🔴 候选池必须**同时包含挂载层自身**：实测设置面板的根 [class*="overlay"]
              //   就是 body > div 的直接子级（position:fixed、430 宽、全屏），
              //   只扫 children 会全部落到它的 static 子容器上，一个根都找不出来 → 修复静默失效。
              var pool = [];
              for (var hp = 0; hp < hosts.length; hp++) {
                pool.push(hosts[hp]);
                var hc = hosts[hp].children;
                for (var hq = 0; hq < hc.length; hq++) pool.push(hc[hq]);
              }
              var roots = [];
              for (var i = 0; i < pool.length; i++) {
                var c = pool[i];
                if (!c || c.nodeType !== 1) continue;
                var cs;
                try { cs = getComputedStyle(c); } catch (e) { continue; }
                if (cs.display === 'none' || cs.visibility === 'hidden') continue;
                if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
                var cr = c.getBoundingClientRect();
                if (cr.width >= vw - 2 && cr.height > 200) roots.push(c);
              }
              if (!roots.length) return;
              var now = Date.now();
              for (var k = 0; k < roots.length; k++) {
                var root = roots[k];
                if (__dshOverlayScanAt) {
                  var last = __dshOverlayScanAt.get(root) || 0;
                  if (now - last < 700) continue;
                  __dshOverlayScanAt.set(root, now);
                }
                // 先收集（只读），再统一写 —— 避免 DOM 读写交错触发反复重排
                var targets = [];
                var all = root.querySelectorAll('*');
                for (var m = 0; m < all.length; m++) {
                  var el = all[m];
                  if (el.dataset && el.dataset.dshBoxFixed === '1') continue;
                  var s;
                  try { s = getComputedStyle(el); } catch (e) { continue; }
                  if (s.display === 'none') continue;
                  var pl = parseFloat(s.paddingLeft) || 0;
                  var pr = parseFloat(s.paddingRight) || 0;
                  if (s.boxSizing !== 'content-box' || (pl + pr) <= 0) continue;
                  targets.push(el);
                }
                for (var t = 0; t < targets.length; t++) {
                  var e2 = targets[t];
                  e2.style.setProperty('box-sizing', 'border-box', 'important');
                  if (e2.dataset) e2.dataset.dshBoxFixed = '1';
                }
                // 兜底：改完还超宽的横向滚动容器（官方故意留的横滑区），一律禁横向滑
                var scrollers = root.querySelectorAll('[class*="options"], [class*="row"], [class*="section"]');
                for (var sc = 0; sc < scrollers.length; sc++) {
                  var se = scrollers[sc];
                  if (se.scrollWidth <= se.clientWidth + 2) continue;
                  var scs;
                  try { scs = getComputedStyle(se); } catch (e) { continue; }
                  if (scs.overflowX !== 'auto' && scs.overflowX !== 'scroll') continue;
                  se.style.setProperty('overflow-x', 'hidden', 'important');
                }
              }
            } catch (e) {}
          }
          // ===== 🔴 v1.0.115 二：页面内 header 被压扁，标题/按钮压住下面的卡片（老总 2026-10-18）=====
