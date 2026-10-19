        (function () {
          if (window.__dshLayoutFix) { try { window.__dshLayoutFix(); } catch (e) {} return; }
          var TOP_BREATH = 6;    // 顶栏标题行与状态栏下沿之间的呼吸间距（CSS px = pt）
          // 🔴 v1.0.109：「整体 UI 从顶栏起再上移一格文字间距」（老总 2026-10-16）。
          //   v1.0.110 老总再提「顶栏还可以上移一刚文字间距」→ 12 改 24（顶栏顶 45 → 33pt）。
          //   v1.0.111 老总又提「顶栏太靠上了，下移半格文字高度」→ 24 改 18（顶栏顶 33 → 39pt）。
          //   取值与完整量测依据见 shim_11 里的 window.__dshTopShift（定义在那边，因为
          //   __dshSetStatusBar 给抽屉/面板写的是内联 padding-top，必须由它统一扣减）。
          //   这里的 18 只是「全局值还没广播过来」时的兜底，正常路径不会用到。
          var TOP_SHIFT = (typeof window.__dshTopShift === 'number') ? window.__dshTopShift : 18;
          // v1.0.105：底栏留白改为「按机型安全区自适应」= Home Indicator 安全区 + 固定呼吸间距。
          // 安全区由原生按机型下发（iPhone 全面屏 34 / iPad 全面屏 20 / 有 Home 键机型 0，
          // 见文件末尾 iOSSafeArea 对照表）；取不到时兜底 34，
          // 保证 34 + 12 = 46，与历史验证过的结果完全一致，不改变现有 iPhone 表现。
          var SAFE_BOTTOM_FALLBACK = 34;
          var BOT_BREATH_EXTRA = 12;
          function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
          function sbHeight() {
            // 优先用原生下发的真实安全区高度；其次读 CSS 变量；最后兜底 54。
            var n = num(window.__dshNativeStatusBar);
            if (n > 0) return n;
            var v = num(getComputedStyle(document.documentElement).getPropertyValue('--dsh-statusbar'));
            return v > 0 ? v : 54;
          }
          // 底栏距屏幕底部的留白（自适应）：优先原生下发的真实底部安全区，
          // 其次读 CSS 变量，最后兜底 34（全面屏 iPhone 主流值）。
          //   ⚠️ 必须用 __dshSafeAreaReady 区分「原生还没下发」和「原生下发的就是 0」——
          //      有 Home 键机型（iPhone SE / 6s~8）底部安全区**就是 0**，
          //      若按 `b > 0` 判断会把 0 当成"没值"，错误套用全面屏的 34，SE 上凭空多出 34px 空白。
          function botBreath() {
            try {
              if (window.__dshSafeAreaReady === 1 && window.__dshSafeArea) {
                var sb = window.__dshSafeArea.bottom;
                if (typeof sb === 'number' && isFinite(sb) && sb >= 0) return sb + BOT_BREATH_EXTRA;
              }
            } catch (e) {}
            var v = num(getComputedStyle(document.documentElement).getPropertyValue('--dsh-safe-bottom'));
            return (v > 0 ? v : SAFE_BOTTOM_FALLBACK) + BOT_BREATH_EXTRA;
          }
          function setP(el, prop, val) { try { el.style.setProperty(prop, val, 'important'); } catch (e) {} }
          // 取「DSH 自己的页面底色」：从底栏座位往上找第一个**不透明**的祖先底色。
          // 实测链路：composerSeat(透明) → scrollBody(透明) → centerCol(透明) → .ank0OG_root(rgb(21,21,23))。
          // 亮色主题自动拿到 DSH 的浅底，不需要我们猜颜色。
          function opaqueBg(el) {
            var bg = '';
            try { bg = getComputedStyle(el).backgroundColor || ''; } catch (e) { return ''; }
            if (!bg || bg === 'transparent') return '';
            var m = bg.match(/^rgba?\(([^)]+)\)$/);
            if (!m) return '';
            var p = m[1].split(',').map(function (s) { return parseFloat(s); });
            if (p.length >= 4 && !(p[3] >= 0.999)) return '';   // 半透明不能当底色，会继续透
            return bg;
          }
          function pageBg() {
            try {
              var n = document.querySelector('.ank0OG_composerSeat, [class*="composerSeat"]');
              for (var i = 0; n && i < 8; i++) {
                var bg = opaqueBg(n);
                if (bg) return bg;
                n = n.parentElement;
              }
            } catch (e) {}
            return 'transparent';
          }
          // 🔴 v1.0.115：只认「DSH 主顶栏」，绝不碰页面内吸顶条。
          //   老总 2026-10-18 报「打开插件按钮，弹出页面和按钮选项重叠」。
          //   真凶就在本函数的**第三候选 `document.querySelector('header')`**：
          //   插件页/设置页是**全屏浮层**，此时主顶栏（[data-phase] header / .ank0OG_header）
          //   **根本不在 DOM 里**，于是第一个 header 命中的是页面内的
          //   `<header class="u9Hv6q_pageHead">`（插件标题行）→ 被当成主顶栏做全套装校：
          //     min-height:0px（官方 auto）→ 被 flex 压成 8px；
          //     background:transparent → 滚动时卡片文字从它下面透上来；
          //     padding-top:8px / z-index / 甚至当成 col 写死 height=vh-colTop。
          //   实测（_probe_bg_which.cjs）：触发一次 __dshSetStatusBar 后该 header
          //   内联值由 `min-height:fit-content` + `rgb(21,21,23)` → `0px` + `transparent`。
          //   判据：**住在「真能纵向滚动」的祖先里 ⇒ 页面内吸顶条，不是主顶栏**。
          //   主顶栏的祖先链（centerCol overflow:hidden / frame / root）都不满足。
          function isInnerHeader(hd) {
            var n = hd.parentElement, d = 0;
            while (n && d < 12) {
              var c = null;
              try { c = getComputedStyle(n); } catch (e) { break; }
              if ((c.overflowY === 'auto' || c.overflowY === 'scroll') &&
                  n.scrollHeight > n.clientHeight + 4) return true;
              n = n.parentElement; d++;
            }
            return false;
          }
          function pickHeader() {
            var list = [];
            var a = document.querySelector('[data-phase] header');
            if (a) list.push(a);
            var b = document.querySelector('header.ank0OG_header');
            if (b) list.push(b);
            var all = document.querySelectorAll('header');
            for (var i = 0; i < all.length; i++) {
              if (list.indexOf(all[i]) < 0) list.push(all[i]);
            }
            for (var j = 0; j < list.length; j++) {
              if (!isInnerHeader(list[j])) return list[j];
            }
            return null;   // 找不到真主顶栏就什么都不做（绝不把浮层里的 header 当主顶栏）
          }
          function fixTop() {
            var header = pickHeader();
            if (!header) return;
            // 真凶就在这：[data-mobile-nav="frame"] 被 DSH 塞了 padding-top: env(safe-area-inset-top)
            // （真机 59~75px）。它只把内容整体往下推，却不缩减自身高度，
            // 于是整列比屏幕高出 75px —— 顶栏下方多一大段空白 + 输入框整块被顶出屏幕底部，
            // 两个毛病是同一个原因。这里直接清零，状态栏高度改由我们自己按真实几何预留。
            var frame = header.closest('[data-mobile-nav="frame"]');
            if (frame) {
              setP(frame, 'padding-top', '0px');
              setP(frame, 'box-sizing', 'border-box');
              setP(frame, 'overflow', 'hidden');
            }
            setP(header, 'position', 'sticky');
            setP(header, 'top', '0px');
            // 🔴 v1.0.108：顶栏 z-index 是「新建会话左上角按钮点不动」的元凶，必须分页处置。
            //    实测（2026-10-16，430x932 暗色，elementFromPoint + 真点实验）：
            //      官方原版：顶栏 z-index 是 auto（不建层叠上下文）；fab 是 position:absolute + z-index:21，
            //                且 fab 住在 DSH 自己的 [class*="overlayLayer"] 里（该层 position:absolute + z-index:20）
            //                → 官方层序 = overlayLayer(20) 在顶栏(auto)之上，**官方本来就要求 fab 压在顶栏之上**；
            //                点 fab 中心 (31,49) 命中 svg/BUTTON，抽屉正常打开（实测 sbX -150 → 0）。
            //      我们的构建：把顶栏钉成 sticky + z-index:1020，把 fab 那 38x38 整块罩住
            //                （顶栏 y57..97，fab y65..103，重叠 32px），标题行 .ank0OG_titleRow 正好盖住按钮中心
            //                → 点击被标题行吞掉，抽屉纹丝不动（实测点前点后 sbX 都是 -150）。
            //    修法：**只降顶栏，绝不动 fab**（fab 保持官方 z-index:21 —— 抬它会让它冒到各种
            //         弹出层之上，那是另一种错）。fab 可见的页面（首页/新会话页等）把顶栏压到
            //         overlayLayer 之下；会话页（fab 被 display:none 隐藏）保持历史验证过的 1020，
            //          行为一字不变。目标值动态取「overlayLayer 的 z-index - 1」，DSH 改了我们也跟着走。
            var zTarget = '1020';
            try {
              var fabEl = document.querySelector('[data-mobile-nav="fab"]');
              var fabVisible = !!fabEl && getComputedStyle(fabEl).display !== 'none' && getComputedStyle(fabEl).visibility !== 'hidden';
              if (fabVisible) {
                var ol = document.querySelector('[class*="overlayLayer"]');
                var olZ = ol ? parseInt(getComputedStyle(ol).zIndex, 10) : NaN;
                zTarget = (isFinite(olZ) && olZ > 0) ? String(Math.max(1, olZ - 1)) : '10';
              }
            } catch (e) {}
            setP(header, 'z-index', zTarget);
            setP(header, 'display', 'flex');
            setP(header, 'flex-direction', 'column');
            setP(header, 'min-height', '0px');
            setP(header, 'max-width', '100vw');
            setP(header, 'box-sizing', 'border-box');
            setP(header, 'background', 'transparent');
            // 顶栏 padding-top 必须钉成 8px：几何目标就是按「顶栏顶 + 8 = 标题行顶」算的，
            // 左右内边距仍保留 DSH 自己的 12px。
            setP(header, 'padding-top', '8px');
            // 顶部首行（36px 占位层）里住着左右两个抽屉开关，绝不可隐藏；
            // 直接把首行高度压成 0（内联 !important 能压过 DSH 样式表里的 min-height:36px），
            // 标题行随即上提到「顶栏顶 + padding-top」，而两个开关是绝对定位挂在顶栏上的，
            // 位置完全不受影响 —— 比用标题行负 margin 更确定、也不会被 React 重渲染冲掉。
            var leading = header.querySelector('.ank0OG_headerLeading, [data-conversation-header-leading], [class*="headerLeading"]');
            if (leading) {
              setP(leading, 'min-height', '0px');
              setP(leading, 'height', '0px');
              setP(leading, 'max-height', '0px');
              setP(leading, 'overflow', 'visible');
              setP(leading, 'pointer-events', 'auto');
            }
            // 几何校正（实测 → 修正）：
            // 注意两个坑：
            //   1. 不能用 offsetTop —— 顶栏的 offsetParent 是 .ank0OG_root，
            //      外层 frame 的 padding 撑不动它，测出来永远是常数，校正必然失效；
            //      必须用 getBoundingClientRect().top 拿真实视口坐标。
            //   2. 不能给 header 加负 margin —— 顶栏所在整列 .CZPbNW_centerCol 带
            //      overflow:hidden，负 margin 会把顶栏（连同左右两个抽屉开关）裁掉。
            //      正确做法是把位移加在「整列」上，列的裁剪框跟着一起上移，既不裁切，
            //      也不影响绝对定位的侧栏。
            var col = header;
            while (col && col.parentElement) {
              if (frame && col.parentElement === frame) break;
              if (col.parentElement === document.body || col.parentElement === document.documentElement) break;
              col = col.parentElement;
            }
            if (!col) col = header;
            var want = sbHeight() - 2 - TOP_SHIFT;
            var delta = want - header.getBoundingClientRect().top;
            if (Math.abs(delta) > 0.5 && Math.abs(delta) < 600) {
              var mt = num(getComputedStyle(col).marginTop);
              if (Math.abs(mt + delta) < 600) setP(col, 'margin-top', (mt + delta) + 'px');
            }
            // 钉死整列高度：列顶确定后，列高 = 视口高 - 列顶，
            // 保证底栏（吸在列底）绝不越出屏幕，同时给底栏留白打好地基。
            var vh = window.innerHeight || document.documentElement.clientHeight || 0;
            var colTop = col.getBoundingClientRect().top;
            if (vh > 0 && colTop >= 0 && colTop < vh) {
              var hpx = (vh - colTop) + 'px';
              if (col.style.height !== hpx) {
                setP(col, 'height', hpx);
                setP(col, 'max-height', hpx);
                setP(col, 'box-sizing', 'border-box');
                setP(col, 'overflow', 'hidden');
              }
            }
          }
          function fixBottom() {
            var seat = document.querySelector('.ank0OG_composerSeat, [class*="composerSeat"]');
            if (!seat) return;
            var vh = window.innerHeight || document.documentElement.clientHeight || 0;
            if (!vh) return;
            // 🔴 绝不能再用「增量公式」mb = mb + delta —— 2026-10-16 实测锁定两条致命后果：
            //   ① 键盘弹起时 vh 突变（932→592），sticky 底栏那一帧读到的 bottom 还是旧值，
            //      算出 +46 假偏差写死 margin-bottom（46→92），此后无人纠正 → 输入框一直悬空 92px。
            //   ② 更狠：会话页滚到中间时，margin-bottom 对该元素位置**毫无影响**（它不在滚动内容末端），
            //      于是每一趟校正都读回同一个 delta=+46 并再累加一次 ——
            //      实测连跑 6 趟 mb 46 → 322，而输入框位置纹丝不动；
            //      真实使用中每次滚动/流式输出引发的 DOM 变动都会触发一趟 → 
            //      **输入框会一路往天上爬**，这正是老总报的「聊天框可以一直上下滑到天上」。
            // 正解 = 幂等写入：值对了就不写，写多少次结果都一样，与滚动位置无关。
            var need = botBreath();
            var sbx = seat.parentElement;
            var room = (sbx && sbx.scrollHeight - sbx.clientHeight > 4) ? 1 : 0;
            var mb = num(getComputedStyle(seat).marginBottom);
            if (room) {
              // 有滚动余量（会话页）：用 sticky 自身的 inset 定位 —— 绝对值，天然幂等，
              // 🔴 v1.0.108「底栏床垫」—— 老总 2026-10-16 报的「会话记录翻阅，穿过聊天框模块从底部露出」。
              //    A/B 实测（同一会话页、同一滚动位置）：
              //      官方原版：seat 自己 bottom:0 贴死滚动容器底（rect y761..932），座位下沿到屏底没有任何裸区；
              //      我们的构建：seat bottom:46px → rect y638..886，886..932 这 46pt 成为**没被任何元素铺色的裸带**，
              //                滚动中的消息就从这个缝里露出来（实测座位下缘往下逐点命中 = DIV.ank0OG_scrollBody；
              //                老总实拍：「费用明细」下面那一大块就是一条完整的气泡从底部顶出来）。
              //    修法（**不改任何可见布局**）：sticky inset 由 46px 收到 0，把这 46px 改成 seat 自己的
              //    padding-bottom —— 盒子底边贴到滚动容器底、内容框仍止于原处（638..886 一寸不动），
              //    只是那 46px 由「透明」变成「DSH 页面底色」的实心垫子；再给 seat 本身补同色底，
              //    顺带盖掉座位内部残留的透光区。
              //    ⚠️ 依旧必须是幂等写入（值对了就不写），与上面「绝不增量」是同一条铁律。
              var pbg = pageBg();
              // ⚠️ 必须**保留 DSH 自己的 padding-bottom**（实测 = 2px），不能拿 need 直接顶掉它：
              //    否则内容框整体下移 2px（实测 卡片 675→677、统计条 769→771、费用条 856→858、
              //    屏幕最底部那行文字 932→934 被顶出屏），凭空多出一个 2px 位移。
              //    先记一次「DSH 原值」，之后每趟都按 need + 原值 幂等写入。
              if (seat.dataset.dshOwnPadB === undefined) {
                seat.dataset.dshOwnPadB = String(num(getComputedStyle(seat).paddingBottom));
              }
              var bedPad = need + num(seat.dataset.dshOwnPadB);
              try { document.documentElement.style.setProperty('--dsh-pagebg', pbg); } catch (e) {}
              try { document.documentElement.style.setProperty('--dsh-bed', bedPad + 'px'); } catch (e) {}
              if (seat.dataset.dshBed !== '1') seat.dataset.dshBed = '1';
              if (seat.style.bottom !== '0px') setP(seat, 'bottom', '0px');
              if (seat.style.paddingBottom !== bedPad + 'px') setP(seat, 'padding-bottom', bedPad + 'px');
              if (seat.dataset.dshBedBg !== pbg) { seat.dataset.dshBedBg = pbg; setP(seat, 'background', pbg); }
              if (mb !== 0) setP(seat, 'margin-bottom', '0px');
            } else {
              // 无滚动余量（首页/新会话页）：sticky 失效（内容不满一屏），只能用 margin 撑；
              // 此处 margin 与位置是 1:1 的，绝对赋值同样收敛安全。
              if (mb !== need) setP(seat, 'margin-bottom', need + 'px');
              if (seat.style.bottom !== '0px') setP(seat, 'bottom', '0px');
              // 床垫只属于「有滚动余量」的会话页；切到首页/新会话页要原样撤掉，
              // 用 removeProperty 交还 DSH 自己的值（不硬写 transparent，免得多留一道我们自己的痕迹）。
              if (seat.dataset.dshBed === '1') {
                delete seat.dataset.dshBed;
                delete seat.dataset.dshOwnPadB;
                try { seat.style.removeProperty('padding-bottom'); } catch (e) {}
                try { seat.style.removeProperty('background'); } catch (e) {}
                seat.dataset.dshBedBg = '';
              }
            }
          }
          function fixFab() {
            // 首页左上角目录按钮：DSH 自带规则是 top: calc(var(--dsh-statusbar,54px) - 24px)，
            // 正好压进状态栏里被切掉半截。改为状态栏下沿 + TOP_BREATH，饱满完整呈现。
            // v1.0.109：必须与 fixTop 的 TOP_SHIFT 同步上移，否则顶栏上去了、目录按钮留在原地 → 错位。
            var fabs = document.querySelectorAll('[data-mobile-nav="fab"]');
            for (var i = 0; i < fabs.length; i++) {
              setP(fabs[i], 'top', (sbHeight() + TOP_BREATH - TOP_SHIFT) + 'px');
              setP(fabs[i], 'border-radius', '8px');
              setP(fabs[i], 'background', 'var(--dsw-alias-interactive-bg-hover, rgba(125,125,125,0.16))');
            }
          }
          // 单趟：只跑一次，绝不循环。
          // 血的教训：底栏是 position:sticky 吸在滚动容器底部，在同一段同步 JS 里改完
          // margin-bottom 后立刻重测量，浏览器还没重算 sticky 位置，读到的仍是旧值，
          // 循环三次就等于把同一个偏差加了三次（46 → 92 → 138），底栏被顶到屏幕中间。
          // 必须跨帧收敛。
          function passOnce() {
            if (!document.getElementById('root')) return;
            // v1.0.109：把「整体上移量」广播成 CSS 变量，供 shim_00 / shim_11 的抽屉、面板顶部留白一起跟随。
            // documentStart 阶段 documentElement 还是 null → 必须判空（§10.3 的老坑，漏判会被 catch 吞掉）。
            try { if (document.documentElement) document.documentElement.style.setProperty('--dsh-topshift', TOP_SHIFT + 'px'); } catch (e) {}
            try { fixFab(); } catch (e) {}
            try { fixTop(); } catch (e) {}
            try { fixBottom(); } catch (e) {}
          }
          var settleTimer = null;
          function settle(left) {
            passOnce();
            if (left > 0) {
              if (settleTimer) clearTimeout(settleTimer);
              settleTimer = setTimeout(function () { settle(left - 1); }, 90);
            }
          }
          window.__dshLayoutFix = function () { settle(5); };
          // 频率闸：几何校正要读 rect（会强制重排），流式输出期间 DOM 变动极密，
          // 必须限流，绝不允许变成每帧一次重排。250ms 内最多跑一趟，页面不可见时直接跳过。
          var lastRun = 0;
          function run() {
            if (document.hidden) return;
            var now = Date.now();
            if (now - lastRun < 250) return;
            lastRun = now;
            passOnce();
          }
          run();
          if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
          window.addEventListener('load', run);
          // 🔴 resize 必须走「跨帧收敛」，不能只跑单趟 passOnce —— 与上面 fixBottom 注释是同一个坑：
          //    键盘弹出/收起会让 window.innerHeight 突变（932 → 592）。在 vh 突变那一帧，
          //    sticky 底栏的 getBoundingClientRect().bottom 读到的还是旧值，
          //    单趟的增量公式会算出 +46 的假偏差并写死 margin-bottom（46 → 92），
          //    此后再没人纠正它 —— 实测键盘弹起后 7 秒纹丝不动，输入框一直悬空 92px。
          //    改为 settle(3) 后：+50ms 内即收敛回 46px。
          //    连发保护 60ms：键盘弹出动画期间 resize 可能连发多次，交已在跑的那串 settle 收敛，
          //    避免同一瞬间堆多趟同步校正（每趟都要读 rect 强制重排）。
          var lastResizeSettle = 0;
          window.addEventListener('resize', function () {
            var now = Date.now();
            if (now - lastResizeSettle < 60) return;
            lastResizeSettle = now;
            settle(3);
          });
          window.addEventListener('orientationchange', function () { setTimeout(run, 260); });
          var ticks = 0;
          var timer = setInterval(function () { ticks++; run(); if (ticks >= 30) clearInterval(timer); }, 400);
          // SPA 切换路由/面板时自动重算；只监听子节点变化（我们只改内联样式，不会自触发）
          // 🔴 v1.0.107 修正一个「从来就没生效过」的静默缺陷：本脚本在 documentStart 执行，
          //    此刻 document.documentElement 还是 null（实测 de=false / readyState=loading），
          //    直接 observe 会抛 TypeError: parameter 1 is not of type 'Node' 并被下面的 catch 吞掉
          //    → 观察器从头到尾没装上（实测 fires=0）。必须等 documentElement 就绪再观察
          //    （shim_00 的 watchdog 早就用同样的等待模式修过，shim_11/14/15/16 当年漏了）。
          (function startObserve() {
            if (!document.documentElement) { setTimeout(startObserve, 16); return; }
            try {
              var pending = false;
              var mo = new MutationObserver(function () {
                if (pending) return;
                pending = true;
                setTimeout(function () { pending = false; run(); }, 320);
              });
              mo.observe(document.documentElement, { childList: true, subtree: true });
            } catch (e) {}
          })();
          // 点进会话/换路由时 React 会把 composerSeat 的内联样式整条抹掉（实测变成「(空)」），
          // 单等下一次 DOM 变动不保险（安静页面可以十几秒没有任何变动）→ 输入框会停在 0pt 贴着屏底。
          // 「点进会话」这条路本身就是一次点击，所以在点击后补一趟（settle 已幂等，重复触发零副作用）。
          try { document.addEventListener('click', function () { setTimeout(function () { settle(2); }, 320); }, true); } catch (e) {}
        })();