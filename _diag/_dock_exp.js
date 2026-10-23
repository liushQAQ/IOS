/**
 * _dock_exp.js —— 实验：把两个模型选择器（dcc-root 插件模型 / ofTiQG_root 官方模型）
 * 从会话框底部搬到顶栏下方右侧（fixed 停靠），验证：
 *  ① 被压成 12px 的官方选择器能否自然展开
 *  ② 点开的下拉菜单是贴按钮还是错位
 *  ③ 底部腾空后工具行是否更宽松
 * 不改 Swift，纯浏览器实验。
 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA });
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js }) => {
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    if (!document.getElementById('__reg_fakeenv')) {
      const fe = document.createElement('style');
      fe.id = '__reg_fakeenv';
      fe.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
      document.head.appendChild(fe);
    }
    try { (0, eval)(js); } catch (e) { console.log('INJECT_ERR ' + e); }
    window.__regTick = function () { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} try { if (window.__dshSetStatusBar) window.__dshSetStatusBar(59); } catch (e) {} };
    window.__regTick();
  }, { js: APP_JS });
  await p.waitForTimeout(2000);

  const BEFORE = await p.evaluate(() => {
    const box = (e) => { const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
    const dcc = document.querySelector('.dcc-root');
    const off = document.querySelector('[class*="ofTiQG_root"]');
    const lab = document.querySelector('[class*="ofTiQG_triggerLabel"]');
    const tools = document.querySelector('[class*="VERcba_tools"]');
    return { dcc: dcc ? box(dcc) : null, ofTiQG: off ? box(off) : null, label: lab ? box(lab) : null, tools: tools ? box(tools) : null };
  });
  console.log('BEFORE ' + JSON.stringify(BEFORE));
  await p.screenshot({ path: path.join(DIR, '_dock_before.png') });

  // ===== 施加停靠：顶栏下方右侧，两个横排 =====
  const DOCK = await p.evaluate(() => {
    const box = (e) => { const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
    const set = (el, prop, val) => { try { el.style.setProperty(prop, val, 'important'); } catch (e) {} };
    const sb = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsh-sb-native')) || 59;
    // tab 行：找「对话/轨迹/系统监控」
    const tabs = Array.from(document.querySelectorAll('button, [role="tab"]')).filter(b => /^(对话|轨迹|系统监控)$/.test((b.textContent || '').trim()));
    let cy = sb + 38, rowFound = false;
    if (tabs.length) {
      const r = tabs[0].getBoundingClientRect();
      cy = r.y + r.height / 2; rowFound = true;
    }
    const H = 28;
    const top = Math.round(cy - H / 2);
    const dcc = document.querySelector('.dcc-root');
    const off = document.querySelector('[class*="ofTiQG_root"]');
    const apply = (el) => {
      if (!el) return;
      set(el, 'position', 'fixed');
      set(el, 'z-index', '60');
      set(el, 'top', top + 'px');
      set(el, 'width', 'auto');
      set(el, 'min-width', '0');
      set(el, 'max-width', '160px');
      set(el, 'margin', '0');
      set(el, 'transform', 'none');
      set(el, 'flex', 'none');
      set(el, 'height', H + 'px');
      set(el, 'align-items', 'center');
      el.setAttribute('data-dsh-modeldock', '1');
    };
    // 先定官方（最右），再按它的宽度排插件
    if (off) {
      apply(off);
      set(off, 'right', '12px');
    }
    // 强制内部标签可见
    const lab = document.querySelector('[class*="ofTiQG_triggerLabel"]');
    const eff = document.querySelector('[class*="ofTiQG_triggerEffort"]');
    [lab, eff].forEach(x => { if (x) { set(x, 'width', 'auto'); set(x, 'max-width', '110px'); set(x, 'overflow', 'hidden'); set(x, 'white-space', 'nowrap'); set(x, 'text-overflow', 'ellipsis'); } });
    if (dcc) {
      apply(dcc);
      const ow = off ? off.getBoundingClientRect().width : 0;
      set(dcc, 'right', Math.round(12 + ow + 8) + 'px');
    }
    return {
      rowFound, cy: Math.round(cy), top,
      dcc: dcc ? box(dcc) : null, off: off ? box(off) : null,
      label: lab ? box(lab) : null, eff: eff ? box(eff) : null,
      tools: (function () { const t = document.querySelector('[class*="VERcba_tools"]'); return t ? box(t) : null; })(),
      trailing: (function () { const t = document.querySelector('[class*="VERcba_trailing"]'); return t ? box(t) : null; })(),
      card: (function () { const t = document.querySelector('[class*="VERcba_card"]'); return t ? box(t) : null; })()
    };
  });
  console.log('DOCK ' + JSON.stringify(DOCK));
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(DIR, '_dock_after.png') });

  // ===== 点开官方模型下拉，看菜单几何 =====
  const M1 = await p.evaluate(async () => {
    const box = (e) => { const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
    const off = document.querySelector('[class*="ofTiQG_trigger"]');
    if (!off) return { noTrigger: true };
    off.click();
    await new Promise(r => setTimeout(r, 900));
    const menus = Array.from(document.querySelectorAll('[role="menu"], [role="listbox"], [class*="menu"], [class*="Menu"], [class*="popover"], [class*="Popover"], [class*="dropdown"]'))
      .filter(e => { const cs = getComputedStyle(e); const q = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && q.width > 60 && q.height > 40; });
    return { menus: menus.slice(0, 5).map(e => ({ cls: (e.className || '').toString().slice(0, 50), box: box(e), pos: getComputedStyle(e).position, z: getComputedStyle(e).zIndex })) };
  });
  console.log('MENU_OF ' + JSON.stringify(M1));
  await p.screenshot({ path: path.join(DIR, '_dock_menu_of.png') });

  // 关掉菜单（点空白），再点 dcc
  await p.evaluate(() => { document.body.click(); });
  await p.waitForTimeout(600);
  const M2 = await p.evaluate(async () => {
    const box = (e) => { const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
    const d = document.querySelector('.dcc-btn') || document.querySelector('.dcc-root');
    if (!d) return { noDcc: true };
    d.click();
    await new Promise(r => setTimeout(r, 900));
    const menus = Array.from(document.querySelectorAll('body > div, [role="menu"], [role="dialog"], [class*="dcc-"]'))
      .filter(e => { const cs = getComputedStyle(e); const q = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && q.width > 60 && q.height > 40; });
    return { menus: menus.slice(0, 6).map(e => ({ cls: (e.className || '').toString().slice(0, 50), box: box(e), pos: getComputedStyle(e).position, z: getComputedStyle(e).zIndex })) };
  });
  console.log('MENU_DCC ' + JSON.stringify(M2));
  await p.screenshot({ path: path.join(DIR, '_dock_menu_dcc.png') });

  await browser.close();
})();
