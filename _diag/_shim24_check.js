        // ===== shim_24（v1.0.131）：插件条自动排队引擎 + 模型选择器自适应（通用摆放逻辑）=====
        // 老总 2026-10-21 15:28 反馈：①模型选择器压发送钮 ②插件条内优化胶囊压费用明细
        //   ③提问：其他玩家装别的插件怎么办，有没有摆放逻辑。
        // 根因（2026-10-21 15:20 Chromium 实测）：
        //   语音按钮插入 tools 后 sc 起点 110→150 右移 40px；而 dsh-po-capsule 在 shim_23 里用
        //   transform 上移到插件条【但仍占 flex 布局 85px 宽】→ sc 内容宽溢出
        //   → model 247..397 压 primary 370（重叠 27px）、poCapsule 174..259 压 cmStat 227（重叠 32px）。
        // 通用摆放逻辑（不写死任何插件坐标，任意插件自适应）：
        //   ① 插件元素一律脱流（absolute），不参与输入行 flex 布局 → 模型选择器自然左移、不压发送钮
        //   ② 自动发现：输入卡顶部 40px 插件带内、非 DSH 原生前缀的元素全部纳入（不认具体插件类名）
        //   ③ 从左到右按原有视觉顺序流式排布，间距 8px，垂直中心统一对齐插件条中线
        //   ④ 超出卡片右边界自动压缩 max-width（保底 60px），绝不越界、绝不重叠
        //   ⑤ 模型选择器 max-width:100% + flex:1 1 auto → 无论前面插件多宽都不越界
        //   ⑥ 幂等：inline 值不变就不写；每 900ms 复算（插件热重载/会话切换后自动归位）
        (function () {
          if (window.top !== window) { return; }
          // DSH 原生前缀：这些是框架自身构建产物，不是第三方插件，不纳入排队
          var NATIVE = ['VERcba_', '_727C8a_', 'ank0OG_', 'CZPbNW_', 'WBG7Rq_', 'NwyCaq_', 'VYXhfG_', 'dMHGga_', 'ZiQlkq_', 'YdIzba_', 'PPCmka_', 'WYye1W_', 'bqwwaa_', 'bqwvaa_', 'z4IYsq_', 'tklpSG_', 'JZoinq_', '7aoaqW_', 'ZKHwIG_', 'dsh-mobile-', 'dsh-ios-'];
          // 已知插件类名（优先纳入，保证插件未挂载时也不报错）
          var KNOWN = ['.dcc-root', '.cm-stat-entry', '.cm-bbox', '.dsh-po-capsule'];
          var GAP = 8, PAD_L = 14, PAD_R = 12, BAND = 40, MIN_W = 60;
          var CSS = [
            // 模型选择器自适应：永不越界压发送钮（老总 15:28 第一条）
            '[class*="composerStack"] [class*="standardControls"] { min-width: 0 !important; }',
            '[class*="composerStack"] [class*="standardControls"] [class*="_trigger"] {',
            '  max-width: 100% !important;',
            '  min-width: 0 !important;',
            '  flex: 1 1 auto !important;',
            '}'
          ].join('\n');
          function isNativeCls(c) {
            for (var i = 0; i < NATIVE.length; i++) { if (c.indexOf(NATIVE[i]) === 0) { return true; } }
            return false;
          }
          function visible(el) {
            try {
              var cs = getComputedStyle(el);
              if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) { return false; }
              var r = el.getBoundingClientRect();
              return r.width > 8 && r.height > 8;
            } catch (e) { return false; }
          }
          function setImp(el, prop, val) {
            var cur = el.style.getPropertyValue(prop);
            var prio = el.style.getPropertyPriority(prop);
            if (cur !== val || prio !== 'important') { el.style.setProperty(prop, val, 'important'); }
          }
          function collect(card) {
            var out = [], seen = [];
            function grab(el) {
              if (!el || seen.indexOf(el) >= 0) { return; }
              if (!visible(el)) { return; }
              var dup = false;
              for (var k = 0; k < seen.length; k++) {
                if (seen[k].contains(el) || el.contains(seen[k])) { dup = true; break; }
              }
              if (dup) { return; }
              out.push(el); seen.push(el);
            }
            // v1.0.131b 抓取 v2：通配根类（不写死完整类名，插件热重载/小版本改后缀也抓得到）
            var dockEl = document.querySelector('[class*="composerStack"] [class*="_dock"]');
            var sels = ['.dcc-root', '[class*="dcc-root"]', '.dsh-po-capsule', '[class*="dsh-po-capsule"]',
                        '.cm-stat-entry', '[class*="cm-stat"]', '.cm-bbox', '[class*="cm-bbox"]'];
            for (var s = 0; s < sels.length; s++) {
              var cand = document.querySelectorAll(sels[s]);
              for (var c = 0; c < cand.length; c++) {
                var el = cand[c];
                // 只收会话框卡片内 / dock 内的，侧栏余额部件（cm-foot 等）不碰
                if (!(card.contains(el) || (dockEl && dockEl.contains(el)))) { continue; }
                // 通配防重：祖先若也是插件根（父子双命中），只取最外层
                var p2 = el.parentElement, skip = false;
                while (p2 && p2 !== card && p2 !== dockEl && p2 !== document.body) {
                  var pc = (p2.className || '').toString();
                  if (pc.indexOf('cm-stat') >= 0 || pc.indexOf('cm-bbox') >= 0 || pc.indexOf('dcc-root') >= 0 || pc.indexOf('dsh-po-capsule') >= 0) { skip = true; break; }
                  p2 = p2.parentElement;
                }
                if (skip) { continue; }
                grab(el);
              }
            }
            // v1.0.131b 抓取 v2：dock 全部直接子元素（费用明细 / 网关余额等挂载即入列）
            if (dockEl) {
              var kids = dockEl.children;
              for (var k2 = 0; k2 < kids.length; k2++) { grab(kids[k2]); }
            }
            // 自动发现：卡片内、插件带垂直范围内、非原生前缀、尺寸合理的独立控件
            var cr = card.getBoundingClientRect();
            var top = cr.top - 2, bot = cr.top + BAND + 2;
            var all = card.querySelectorAll('*');
            for (var i = 0; i < all.length && out.length < 10; i++) {
              var el = all[i];
              if (seen.indexOf(el) >= 0) { continue; }
              var cn = (el.className || '').toString();
              if (!cn || isNativeCls(cn)) { continue; }
              var r = el.getBoundingClientRect();
              if (r.width < 16 || r.width > 280 || r.height < 14 || r.height > 46) { continue; }
              var cy2 = r.top + r.height / 2;
              if (cy2 < top || cy2 > bot) { continue; }
              var dup = false;
              for (var k = 0; k < seen.length; k++) {
                if (seen[k].contains(el) || el.contains(seen[k])) { dup = true; break; }
              }
              if (dup) { continue; }
              out.push(el); seen.push(el);
            }
            return out;
          }
          function layout() {
            var card = document.querySelector('[class*="composerStack"] [class*="_card"]');
            if (!card) { return; }
            var cr = card.getBoundingClientRect();
            if (cr.width < 120) { return; }
            var items = collect(card);
            if (!items.length) { return; }
            items.sort(function (a, b) { return a.getBoundingClientRect().left - b.getBoundingClientRect().left; });
            var cy = cr.top + 22;          // 插件条垂直中心（背景条 top4 h36 → 中心 22）
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
              var anc = el.offsetParent || card;
              var ar = anc.getBoundingClientRect();
              setImp(el, 'left', Math.round(x - ar.left) + 'px');
              setImp(el, 'top', Math.round(cy - h / 2 - ar.top) + 'px');
              // v1.0.131b：dock 类部件（费用明细/网关）入列时顺带 inline 去底融入
              //   （真机 CSS 通道可能死亡，inline !important 优先级最高，双保险）
              var cn3 = (el.className || '').toString();
              if (cn3.indexOf('cm-stat') >= 0 || cn3.indexOf('cm-bbox') >= 0) {
                setImp(el, 'background', 'transparent');
                setImp(el, 'border', 'none');
                setImp(el, 'box-shadow', 'none');
              }
              x += w + GAP;
            }
          }
          function isDSH() {
            try {
              if (!document.getElementById('root')) { return false; }
              return !!document.querySelector('[data-mobile-nav="frame"], [class*="composerStack"], [class*="headerCorner"]');
            } catch (e) { return false; }
          }
          function injectCSS() {
            if (document.getElementById('dsh-ios-composer-fit')) { return; }
            try {
              var st = document.createElement('style');
              st.id = 'dsh-ios-composer-fit';
              st.textContent = CSS;
              document.head.appendChild(st);
            } catch (e) {}
          }
          function tick() {
            if (!isDSH()) { return; }
            injectCSS();
            try { layout(); } catch (e) {}
          }
          tick();
          setInterval(tick, 900);
        })();
