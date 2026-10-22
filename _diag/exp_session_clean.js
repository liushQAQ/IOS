// 🔴 干净会话页取证：关弹窗 → 进会话 → 收起抽屉 → env=59 → 截图供与真机逐条带对拍
const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_CSS = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject.css', 'utf8');
const ENV = 59;
const TO = (p, fn, arg, ms = 15000) => Promise.race([
  p.evaluate(fn, arg),
  new Promise(r => setTimeout(() => r({ __timeout: true }), ms)),
]);

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'light' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(9000);
  console.log('关弹窗1=', await TO(p, () => {
    const ok = Array.from(document.querySelectorAll('button')).find(x => (x.textContent || '').trim() === '知道了');
    if (ok) { ok.click(); return 1; } return 0;
  }));
  await p.waitForTimeout(800);
  await p.evaluate((css) => {
    window.__dshNativeStatusBar = 59;
    document.documentElement.style.setProperty('--dsh-sb-native', '59px');
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    window.__dshTopShift = 18;
    const s = document.createElement('style'); s.id = '__app_css'; s.textContent = css;
    document.head.appendChild(s);
  }, APP_CSS);
  await p.waitForTimeout(600);
  console.log('env改写1=', await TO(p, (env) => {
    let n = 0;
    document.querySelectorAll('style').forEach(st => {
      if (st.id === '__app_css') return;
      if (st.textContent.indexOf('env(safe-area-inset-top)') >= 0) {
        st.textContent = st.textContent.split('env(safe-area-inset-top)').join(env + 'px'); n++;
      }
    });
    return n;
  }, ENV));

  await TO(p, () => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(2000);
  await TO(p, () => { const ok = Array.from(document.querySelectorAll('button')).find(x => (x.textContent || '').trim() === '知道了'); if (ok) ok.click(); });
  await p.waitForTimeout(600);
  await TO(p, () => {
    const rs = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rs.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rs[1] || rs[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  await p.waitForTimeout(9000);
  console.log('关弹窗2=', await TO(p, () => {
    const ok = Array.from(document.querySelectorAll('button')).find(x => (x.textContent || '').trim() === '知道了');
    if (ok) { ok.click(); return 1; } return 0;
  }));
  await p.waitForTimeout(500);
  await TO(p, () => { const x = document.querySelector('[aria-label="收起侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1500);
  console.log('env改写2=', await TO(p, (env) => {
    let n = 0;
    document.querySelectorAll('style').forEach(st => {
      if (st.id === '__app_css') return;
      if (st.textContent.indexOf('env(safe-area-inset-top)') >= 0) {
        st.textContent = st.textContent.split('env(safe-area-inset-top)').join(env + 'px'); n++;
      }
    });
    return n;
  }, ENV));
  await p.waitForTimeout(2000);
  const m = await TO(p, () => {
    const cs = el => { try { return getComputedStyle(el); } catch (e) { return {}; } };
    const g = el => el ? Math.round(el.getBoundingClientRect().top * 10) / 10 : null;
    const frame = document.querySelector('[data-mobile-nav="frame"]');
    const tr = frame && frame.querySelector('[class*="titleRow"]');
    const hdr = frame && frame.querySelector('header');
    const cc = frame && frame.querySelector('[class*="centerCol"]');
    return {
      framePt: frame ? cs(frame).paddingTop : null,
      colTop: g(cc), colMt: cc ? cs(cc).marginTop : null,
      hdrTop: g(hdr), hdrPt: hdr ? cs(hdr).paddingTop : null,
      titleTop: g(tr), titleText: tr ? (tr.textContent || '').trim().slice(0, 16) : '',
      sbNative: getComputedStyle(document.documentElement).getPropertyValue('--dsh-sb-native'),
    };
  });
  console.log('测量=', JSON.stringify(m));
  await p.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/session_clean.png' });
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
