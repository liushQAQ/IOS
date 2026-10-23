const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

(async () => {
  const b = await webkit.launch({ headless: true });
  for (const W of [390, 430]) {
    const p = await (await b.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA })).newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(6000);
    // 注入 iOS shim
    await p.evaluate(({ js, css }) => {
      document.documentElement.style.setProperty('--dsh-statusbar', '59px');
      document.documentElement.style.setProperty('--dsh-sb-native', '59px');
      document.documentElement.style.setProperty('--dsh-topshift', '18px');
      window.__dshNativeStatusBar = 59;
      const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
      const sc = document.createElement('script'); sc.textContent = js; document.body.appendChild(sc);
    }, { js: APP_JS, css: APP_CSS });
    await p.waitForTimeout(4000);
    // 开真实会话
    await p.evaluate(() => {
      for (const c of document.querySelectorAll('[data-slot="sidebar.workspaces"] div')) {
        const t = (c.innerText || '').trim();
        if (t && t.length < 40 && /未命名|修复6066|排队消息/.test(t)) { c.click(); return; }
      }
    });
    await p.waitForTimeout(9000);
    const r = await p.evaluate(() => {
      const box = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
      const off = document.querySelector('[class*="ofTiQG_root"]');
      const dcc = document.querySelector('.dcc-root') || document.querySelector('[class*="dcc-root"]');
      const po = document.querySelector('[class*="dsh-po-capsule"]');
      const cs = off ? getComputedStyle(off) : null;
      const out = {
        vw: innerWidth, vh: innerHeight,
        off: box(off), offTag: off ? off.getAttribute('data-dsh-modeldock') : null,
        offPos: cs ? cs.position : null, offTop: cs ? cs.top : null, offRight: cs ? cs.right : null, offZ: cs ? cs.zIndex : null, offVis: cs ? cs.visibility : null, offOpacity: cs ? cs.opacity : null,
        dcc: box(dcc), dccTag: dcc ? dcc.getAttribute('data-dsh-modeldock') : null,
        po: box(po),
      };
      // tab 行
      const tabs = [];
      for (const e of document.querySelectorAll('[role="tab"], button')) {
        const t = (e.textContent || '').trim();
        if (t === '对话' || t === '轨迹' || t === '系统监控') { const q = e.getBoundingClientRect(); if (q.width > 8) tabs.push({ t, b: box(e) }); }
      }
      out.tabs = tabs;
      // off 祖先链的 transform / filter / contain
      out.anc = [];
      let n = off;
      for (let i = 0; i < 8 && n; i++) {
        const c = getComputedStyle(n);
        if (c.transform !== 'none' || c.filter !== 'none' || c.contain !== 'none' || c.willChange !== 'auto') {
          out.anc.push({ cls: (typeof n.className === 'string' ? n.className : '').slice(0, 40), transform: c.transform, filter: c.filter, contain: c.contain, willChange: c.willChange });
        }
        n = n.parentElement;
      }
      return out;
    });
    console.log('■ ' + W + '  ' + JSON.stringify(r, null, 1));
    await p.screenshot({ path: DIR + '/_repro' + W + '.png' });
    await p.context().close();
  }
  await b.close();
})();
