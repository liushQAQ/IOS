        (function () {
          if (window.__dshMobilePolish) return;
          window.__dshMobilePolish = 1;
          var LIMIT = 760;
          function nowMs() { try { return performance.now(); } catch (e) { return Date.now(); } }
          function vw() { return document.documentElement.clientWidth || window.innerWidth; }
          function vh() { return document.documentElement.clientHeight || window.innerHeight; }
          function isSmall() { return vw() <= LIMIT; }
          function S(el, k, v) { try { el.style.setProperty(k, v, 'important'); } catch (e) {} }

          // ---------- ② 「优化」与齿轮：同一行 + 同高 + 垂直中心对齐 ----------
          function alignOptGear() {
            try {
              var opt = document.querySelector('.dsh-po-btn-opt');
              var gear = document.querySelector('.dsh-po-btn-gear');
              if (!opt || !gear) return;
              var a = opt.getBoundingClientRect();
              var b = gear.getBoundingClientRect();
              if (a.width < 6 || b.width < 6) return;
              var sameRow = Math.abs(a.top - b.top) < 1.5;
              var sameH = Math.abs(a.height - b.height) < 1.5;
              // 已钉过的情况不能提前返回 —— 必须每轮复查，跟着「优化」走
              if (sameRow && sameH && opt.dataset.dshPoOk === '1' && gear.dataset.dshGearPinned !== '1') return;
              var h = Math.round(Math.max(a.height, b.height, 22));
              var list = [opt, gear];
              for (var i = 0; i < list.length; i++) {
                var el = list[i];
                S(el, 'display', 'inline-flex');
                S(el, 'align-items', 'center');
                S(el, 'justify-content', 'center');
                S(el, 'box-sizing', 'border-box');
                S(el, 'height', h + 'px');
                S(el, 'min-height', h + 'px');
                S(el, 'line-height', '1');
                S(el, 'vertical-align', 'middle');
                S(el, 'margin-top', '0');
                S(el, 'margin-bottom', '0');
              }
              // 让「胶囊」永不换行：真机反馈齿轮会掉到第二行，元凶是 opt→上溯某一层 flex-wrap:wrap，
              // 逐层压成 nowrap（限定 4 层，避免影响 composer 整体布局）
              var up = opt.parentElement;
              for (var k2 = 0; up && k2 < 4; k2++) {
                S(up, 'flex-wrap', 'nowrap');
                S(up, 'align-items', 'center');
                if (up === gear.parentElement) S(up, 'column-gap', '6px');
                up = up.parentElement;
              }
              // 复查：仍不在同一水平线（确实被换行）→ 把齿轮钉到「优化」右侧同一水平中线。
              // 必须钉「水平中线」（top 取 opt 的垂直中心 + translateY(-50%)），这才叫「上下居中对齐」。
              var a2 = opt.getBoundingClientRect();
              var b2 = gear.getBoundingClientRect();
              if (Math.abs(a2.top - b2.top) > 1.5) {
                var host = gear.offsetParent || opt.parentElement;
                if (host) {
                  var hs = null;
                  try { hs = getComputedStyle(host); } catch (x) {}
                  if (hs && hs.position === 'static') S(host, 'position', 'relative');
                  var hr = host.getBoundingClientRect();
                  S(gear, 'position', 'absolute');
                  S(gear, 'left', Math.round(a2.right - hr.left + 6) + 'px');
                  S(gear, 'top', Math.round(a2.top + a2.height / 2 - hr.top) + 'px');
                  S(gear, 'transform', 'translateY(-50%)');
                  S(gear, 'margin', '0');
                  S(gear, 'z-index', '5');
                  gear.dataset.dshGearPinned = '1';
                }
              } else if (gear.dataset.dshGearPinned === '1') {
                // 排布已恢复正常 → 撤掉之前的绝对定位，交还给 DSH 原生流式布局（避免留下僵死坐标）
                S(gear, 'position', 'static');
                S(gear, 'left', 'auto');
                S(gear, 'top', 'auto');
                S(gear, 'transform', 'none');
                S(gear, 'z-index', 'auto');
                try { delete gear.dataset.dshGearPinned; } catch (x) {}
              }
              opt.dataset.dshPoOk = '1';
            } catch (e) {}
          }

          // ---------- ③ 聊天框贴底（消除「滑到天上」）----------
          function pinComposer() {
            try {
              if (!isSmall()) return;
              var sb = document.querySelector('[class*="scrollBody"]');
              if (!sb) return;
              var seat = document.querySelector('[class*="composerSeat"]');
              if (!seat || seat.parentElement !== sb) return;
              var cs = null;
              try { cs = getComputedStyle(sb); } catch (e) { return; }
              if (cs.display.indexOf('flex') === -1) return;
              // 容器没有滚动余量 = 内容不足一屏 → 此时 sticky 失效，composer 会浮到中间
              if ((sb.scrollHeight - sb.clientHeight) > 4) return;
              var gap = Math.round(sb.getBoundingClientRect().bottom - seat.getBoundingClientRect().bottom);
              var mb = 0;
              try { mb = parseFloat(getComputedStyle(seat).marginBottom) || 0; } catch (e) {}
              if (gap > mb + 4) {
                S(seat, 'margin-top', 'auto');
                seat.dataset.dshPinned = '1';
              }
              S(sb, 'overscroll-behavior', 'contain');
            } catch (e) {}
          }

          // ---------- ④ 子智能体徽标（那个「⌄」）+ 智能体团队按钮：统一精确摆位 ----------
          // 注意：不能用固定 right 值 —— 实测这两个按钮的 offsetParent 只有 418px 宽（视口 430），
          // 固定 right 会系统性偏 12px。所以这里用「先给 0、量出真实位置、再按目标纠偏」的方式。
          function placeAbs(el, targetRight, forceWidth) {
            try {
              S(el, 'position', 'absolute');
              S(el, 'left', 'auto');
              S(el, 'top', '50%');
              S(el, 'transform', 'translateY(-50%)');
              S(el, 'margin', '0');
              S(el, 'z-index', '6');
              if (forceWidth) {
                S(el, 'width', forceWidth + 'px');
                S(el, 'min-width', '0');
                S(el, 'padding', '0');
                S(el, 'box-sizing', 'border-box');
              }
              S(el, 'right', '0px');
              var r = el.getBoundingClientRect();
              if (r.width < 2) return false;
              S(el, 'right', Math.round(r.right - targetRight) + 'px');
              return true;
            } catch (e) { return false; }
          }

          function moveAgentBadge() {
            try {
              if (!isSmall()) return;
              var header = document.querySelector('header');
              if (!header) return;
              var hw = header.getBoundingClientRect().width;
              if (hw < 300) return;
              // 标题容器收窄 28px：实测标题文字只用到 x≈293，容器到 322，收窄不影响标题显示，
              // 但能给右侧那排动作按钮让出位置（否则 430 宽下根本排不下）。
              var nav = header.querySelector('nav');
              if (nav) {
                var nr = nav.getBoundingClientRect();
                if (nr.width > 210) S(nav, 'width', '228px');
              }
              var jobs = header.querySelector('button[aria-label*="后台任务"]');
              var badge = header.querySelector('button[aria-label*="子智能体"]');
              var team = header.querySelector('button[aria-label*="智能体团队"]');
              // ---------- 🔴 老总定版（2026-10-16 20:50）：「③④ 不一样，可以两个下箭头」----------
              // 曾于 20:15 按「去掉 ④」隐藏过它，老总看清两者功能不同后确认保留 → 恢复摆位。
              // 结论：③「N 个子智能体」与 ④「N 个后台任务」是两个不同入口，两个 ⌄ 都保留、都收在标题右侧。
              // 从右往左依次摆：右侧抽屉开关(386..418) | 团队(32) | 徽标(22) | 后台任务(22) | 标题文字(止于 301)
              // 间距账（430 宽，实测）：标题文字右边界 301 → 可用到 386 共 85px，
              // 三个图标 22+22+34=78px，剩 7px 分三段 ⇒ 每段约 2px，刚好不压标题、不互压。
              if (team && team.parentElement && team.parentElement !== header) placeAbs(team.parentElement, hw - 52, 32);
              if (badge && badge.parentElement && badge.parentElement !== header) {
                if (badge.dataset.dshBadgeTight !== '1') {
                  S(badge, 'width', '22px');
                  S(badge, 'min-width', '0');
                  S(badge, 'padding', '0');
                  S(badge, 'box-sizing', 'border-box');
                  badge.dataset.dshBadgeTight = '1';
                }
                placeAbs(badge.parentElement, hw - 80, 22);
              }
              // 「8 个后台任务」在窄屏下只剩一个图标（文字早被隐藏）。它原本被标题 absolute 层压住，
              // 老总看到的就是那个「孤零零的 ⌄」——一并收到右侧同一排，并留出 3px 不压标题文字。
              if (jobs && jobs.parentElement && jobs.parentElement !== header) {
                if (jobs.dataset.dshJobsTight !== '1') {
                  S(jobs, 'width', '22px');
                  S(jobs, 'min-width', '0');
                  S(jobs, 'padding', '0');
                  S(jobs, 'box-sizing', 'border-box');
                  jobs.dataset.dshJobsTight = '1';
                }
                placeAbs(jobs.parentElement, hw - 104, 22);
              }
            } catch (e) {}
          }

          // ---------- ① 越界浮层回收 ----------
          // ⚠️ 管辖划分（关键，避免两处同时写 left/right 互相打架）：
          //   shim_00 的 installMobileLayoutWatchdog() 已负责 [role=menu|listbox|dialog] 与
          //   menu / modal / popup / dropdown / dialog / _portal_ 名单；本函数**只补它漏掉的**浮层类型。
          //   因此下面的 OVER_SEL 里刻意不含上述关键词，WD_SEL 命中则直接跳过。
          var OVER_SEL = '[role="tooltip"],'
            + '[class*="popover" i],[class*="tooltip" i],[class*="sheet" i],[class*="picker" i],'
            + '[class*="overlay" i],[class*="layer" i],[class*="floating" i],'
            + '[class*="popper" i]:not([class*="_portal_"]),'
            + '[data-radix-popper-content-wrapper],[data-floating-ui-portal],[data-popper-placement]';
          // shim_00 watchdog 管辖的名单：元素「自身」命中即跳过（防双写）
          var WD_SEL = '[role="menu"],[role="listbox"],[role="dialog"],[data-menu-material],[data-menu-surface],'
            + '[class*="menu"],[class*="modal"],[class*="popup"],[class*="dropdown"],[class*="dialog"]';

          function clampOverlays() {
            try {
              if (!isSmall()) return;
              var w = vw();
              var hgt = vh();
              if (w < 200 || hgt < 200) return;
              var cands = [];
              var seen = null;
              try { seen = new WeakSet(); } catch (e) { seen = null; }
              function push(e) {
                if (!e || e.nodeType !== 1) return;
                if (seen) { if (seen.has(e)) return; seen.add(e); }
                cands.push(e);
              }
              var list = null;
              try { list = document.querySelectorAll(OVER_SEL); } catch (e) {}
              if (list) { for (var i = 0; i < list.length; i++) push(list[i]); }
              // 浅层兜底：浮层几乎都挂在 portal 容器下（body 浅层）；深挖会白扫几千个正常元素
              (function shallow(root, depth) {
                var kids = root.children;
                for (var j = 0; j < kids.length; j++) {
                  var c = kids[j];
                  push(c);
                  if (depth > 1) shallow(c, depth - 1);
                }
              })(document.body, 7);

              var t0 = nowMs();
              var hits = null;
              var n = cands.length > 3000 ? 3000 : cands.length;
              for (var k = 0; k < n; k++) {
                // 时间预算保护：单次最多占用主线程约 30ms，剩下的交给下一轮
                if ((k & 127) === 127 && nowMs() - t0 > 30) break;
                var e = cands[k];
                if (e.closest && e.closest('[data-mobile-nav]')) continue;   // App 自身 chrome
                var isW = false;
                try { isW = e.matches(WD_SEL); } catch (x) {}
                if (isW) continue;                                          // 归 shim_00 watchdog 管
                if (e.children.length === 0) continue;                      // 空容器不是浮层
                var s = null;
                try { s = getComputedStyle(e); } catch (x) { continue; }
                if (s.position !== 'fixed' && s.position !== 'absolute') continue;
                if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') continue;
                if (s.pointerEvents === 'none') continue;
                var b = e.getBoundingClientRect();
                if (b.width < 80 || b.height < 28) continue;
                // 纵向必须与视口有交集（否则是屏外隐藏层，别去动它）
                if (b.bottom <= 8 || b.top >= hgt - 8) continue;
                // 水平方向完全在屏外（抽屉 / 右侧边栏 / 屏外隐藏层）→ 一律不碰
                if (b.right <= 8 || b.left >= w - 8) continue;
                // 未越界（留 4px 容差避开亚像素噪声）→ 不动
                if (b.left >= -4 && b.right <= w + 4) continue;
                (hits || (hits = [])).push(e);
              }
              if (!hits) return;
              // 先收集、后统一写入（避免边读边写造成布局抖动）
              for (var m = 0; m < hits.length; m++) {
                var el = hits[m];
                var r = el.getBoundingClientRect();
                if (r.left >= -4 && r.right <= w + 4) continue;
                S(el, 'box-sizing', 'border-box');
                S(el, 'max-width', (w - 16) + 'px');
                S(el, 'max-height', (hgt - 24) + 'px');
                S(el, 'overflow-y', 'auto');
                if (r.left < -4) {
                  S(el, 'left', '8px');
                  S(el, 'right', 'auto');
                } else {
                  S(el, 'right', '8px');
                  S(el, 'left', 'auto');
                }
                el.dataset.dshClamped = '1';
              }
              // 第二趟：若该浮层其实靠父级 / transform 定位（写 left/right 无效），
              // 用 margin-left 把它硬拽回视口内（margin 位移不会破坏已有 transform）。
              for (var q = 0; q < hits.length; q++) {
                var e2 = hits[q];
                if (e2.dataset.dshClamped !== '1') continue;
                var r2 = e2.getBoundingClientRect();
                var dx = 0;
                if (r2.left < -4) dx = 8 - r2.left;
                else if (r2.right > w + 4) dx = (w - 8) - r2.right;
                if (dx !== 0) S(e2, 'margin-left', Math.round(dx) + 'px');
              }
            } catch (e) {}
          }

          // ---------- 调度 ----------
          // cheap()（②③④）几乎零成本，可以每次都跑，保证 React 重建后立即复位；
          // clampOverlays() 要扫浅层候选，较重，限「每轮交互」内的次数。
          // ⚠️ runs 必须在每次点击时清零：老总是「打开 App 很久之后」才点设置→插件市场，
          //    若总次数一次性用光，弹层出现时回收逻辑已经不跑了。
          var timer = 0, runs = 0, MAX_RUNS = 10, DWELL = 600;
          function cheap() { alignOptGear(); pinComposer(); moveAgentBadge(); }
          function full() { cheap(); if (runs < MAX_RUNS) { runs++; clampOverlays(); } }
          function run() { full(); }
          function schedule() {
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () { timer = 0; run(); }, DWELL);
          }
          function boot() { cheap(); schedule(); }
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
          // 弹层多数是「点出来的」→ 点击后单独补一次，并重置 clamp 预算（保证弹层出现时它一定在跑）
          try { document.addEventListener('click', function () { runs = 0; setTimeout(schedule, 260); }, true); } catch (e) {}
          setTimeout(run, 1200);
          setTimeout(run, 3500);
          window.__dshMobilePolishRun = full;
        })();