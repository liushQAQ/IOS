const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

const APP_CSS = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject.css', 'utf8')
  // 去掉我的注释包装行
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');

const SIZES = process.argv[2] === 'all'
  ? [{ w: 430, h: 932, sb: 59 }, { w: 393, h: 852, sb: 54 }, { w: 375, h: 667, sb: 20 }]
  : [{ w: 430, h: 932, sb: 59 }];

function scan() {
  const vw = innerWidth;
  const out = [];
  document.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const q = el.getBoundingClientRect();
    if (q.width < 1 || q.height < 1) return;
    const ro = Math.round((q.right - vw) * 10) / 10;
    const lo = Math.round((0 - q.left) * 10) / 10;
    if (ro <= 0.6 && lo <= 0.6) return;
    out.push({
      tag: el.tagName,
      cls: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').slice(0, 36),
      label: el.getAttribute('aria-label') || '',
      pos: cs.position, z: cs.zIndex,
      x: Math.round(q.x * 10) / 10, w: Math.round(q.width * 10) / 10, right: Math.round(q.right * 10) / 10,
      ro, lo, text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20),
    });
  });
  out.sort((a, b2) => b2.ro - a.ro);
  const de = document.documentElement;
  return { vw, docCW: de.clientWidth, docSW: de.scrollWidth, bodySW: document.body.scrollWidth, list: out };
}

function show(tag, r) {
  console.log('\n### ' + tag + '  vw=' + r.vw + '  docCW=' + r.docCW + ' docSW=' + r.docSW + ' bodySW=' + r.bodySW + '  越界元素=' + r.list.length);
  r.list.slice(0, 22).forEach(o => console.log(
    '  R+' + o.ro + (o.lo > 0.6 ? ' L+' + o.lo : '') + ' ' + o.pos + ' z=' + o.z +
    ' x=' + o.x + ' w=' + o.w + ' right=' + o.right + '  ' + o.tag +
    (o.label ? '[' + o.label + ']' : '') + '.' + o.cls + (o.text ? ' "' + o.text + '"' : '')));
}

(async () => {
  const b = await webkit.launch({ headless: true });
  for (const S of SIZES) {
    const c = await b.newContext({ viewport: { width: S.w, height: S.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(9000);

    // 1) 注入 App 的 CSS + CSS 变量（真机才有）
    await p.evaluate(({ css, sb }) => {
      document.documentElement.style.setProperty('--dsh-statusbar', sb + 'px');
      document.documentElement.style.setProperty('--dsh-topshift', '18px');
      const s = document.createElement('style'); s.id = '__app_css'; s.textContent = css;
      document.head.appendChild(s);
    }, { css: APP_CSS, sb: S.sb });
    await p.waitForTimeout(1200);
    show('[' + S.w + 'x' + S.h + '] App CSS 注入后（未跑 1.0.122 JS 修复）', await p.evaluate(scan));
    await p.screenshot({ path: 'repro_' + S.w + '_nocssfix.png' });

    // 2) 跑 1.0.122 的 Swift JS 修复
    await p.evaluate(() => {
      try {
        if (!document.getElementById('__dsh-xclip')) {
          const xs = document.createElement('style'); xs.id = '__dsh-xclip';
          xs.textContent = 'html, body { overflow-x: clip !important; max-width: 100vw !important; }';
          (document.head || document.documentElement).appendChild(xs);
        }
      } catch (e) {}
      try {
        const hcs = document.querySelectorAll('[class*="headerCorner"]');
        for (let i = 0; i < hcs.length; i++) {
          const hc = hcs[i]; const q = hc.getBoundingClientRect();
          if (q.width < 4 || q.height < 4) continue;
          const ov = Math.round(q.right - window.innerWidth);
          if (ov > 0) {
            let tx = 0; const mt = getComputedStyle(hc).transform;
            if (mt && mt !== 'none') { const mp = mt.replace(/^matrix\(|\)$/g, '').split(','); tx = parseFloat(mp[4]) || 0; }
            hc.style.setProperty('transform', 'translateX(' + (tx - ov) + 'px)', 'important');
          }
        }
      } catch (e) {}
    });
    await p.waitForTimeout(900);
    show('[' + S.w + 'x' + S.h + '] 跑完 1.0.122 修复后', await p.evaluate(scan));
    await p.screenshot({ path: 'repro_' + S.w + '_fixed.png' });
    await c.close();
  }
  await b.close();
})();
