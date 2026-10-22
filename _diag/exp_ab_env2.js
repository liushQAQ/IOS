// 🔴 A/B 对照 v2：先关弹窗再进会话；测量限定 [data-mobile-nav="frame"] 内
const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_CSS = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject.css', 'utf8');
const ENV = 59;

const MEASURE = () => {
  const cs = el => { try { return getComputedStyle(el); } catch (e) { return {}; } };
  const g = el => el ? Math.round(el.getBoundingClientRect().top * 10) / 10 : null;
  const frame = document.querySelector('[data-mobile-nav="frame"]');
  if (!frame) return { frameExists: false };
  const hc = frame.querySelector('[class*="headerCorner"]');
  const tr = frame.querySelector('[class*="titleRow"]');
  const hdr = frame.querySelector('header');
  const lead = hdr && hdr.querySelector('[class*="headerLeading"]');
  const cc = frame.querySelector('[class*="centerCol"]');
  const inComposer = !!frame.querySelector('[class*="composerStack"]');
  return {
    frameExists: true, inComposer,
    framePt: cs(frame).paddingTop, frameInlinePt: frame.style.paddingTop || '',
    colTop: g(cc), colMt: cc ? cs(cc).marginTop : null,
    hdrKind: hc ? 'headerCorner' : (hdr ? 'header' : null),
    hdrTop: g(hdr), hdrPt: hdr ? cs(hdr).paddingTop : null,
    leadingH: lead ? cs(lead).height : null,
    titleTop: g(tr), titleText: tr ? (tr.textContent || '').trim().slice(0, 16) : '',
  };
};
const ENV_REWRITE = (env) => {
  let n = 0;
  document.querySelectorAll('style').forEach(st => {
    if (st.id === '__app_css') return;
    if (st.textContent.indexOf('env(safe-area-inset-top)') >= 0) {
      st.textContent = st.textContent.split('env(safe-area-inset-top)').join(env + 'px');
      n++;
    }
  });
  return n;
};
const DISMISS = () => {
  const btns = Array.from(document.querySelectorAll('button'));
  const ok = btns.find(b => (b.textContent || '').trim() === '知道了');
  if (ok) { ok.click(); return 1; }
  return 0;
};

(async () => {
  for (const withCss of [false, true]) {
    const b = await webkit.launch({ headless: true });
    const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForTimeout(9000);
    console.log((withCss ? 'CSS_ON' : 'CSS_OFF') + ' 关弹窗=' + await p.evaluate(DISMISS));
    await p.waitForTimeout(800);
    if (withCss) {
      await p.evaluate((css) => {
        window.__dshNativeStatusBar = 59;
        document.documentElement.style.setProperty('--dsh-sb-native', '59px');
        const s = document.createElement('style'); s.id = '__app_css'; s.textContent = css;
        document.head.appendChild(s);
      }, APP_CSS);
      await p.waitForTimeout(600);
    }
    console.log('  env改写(首页)=' + await p.evaluate(ENV_REWRITE, ENV));
    await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
    await p.waitForTimeout(2000);
    await p.evaluate(DISMISS); await p.waitForTimeout(500);
    await p.evaluate(() => {
      const rs = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
      const t = rs.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rs[1] || rs[0];
      if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
    });
    await p.waitForTimeout(8000);
    console.log('  关弹窗2=' + await p.evaluate(DISMISS));
    console.log('  env改写(会话页)=' + await p.evaluate(ENV_REWRITE, ENV));
    await p.waitForTimeout(1500);
    const m = await p.evaluate(MEASURE);
    console.log('  测量 ' + JSON.stringify(m));
    await p.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/case2_' + (withCss ? 'ON' : 'OFF') + '.png' });
    await c.close();
    await b.close();
  }
  console.log('\n>>> 真机实测 titleTop=114.7pt');
})().catch(e => { console.error(e); process.exit(1); });
