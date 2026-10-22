// 🔴 假说对照实验：三种条件下的会话页标题行位置
//   A) 无 App CSS + env=0        （老沙箱基线）
//   B) 无 App CSS + env=59       （App CSS 在真机整体死亡）
//   C) 有 App CSS + env=59       （已测 = 47，正常）
const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const ENV = 59;

const MEASURE = () => {
  const cs = el => { try { return getComputedStyle(el); } catch (e) { return {}; } };
  const g = el => el ? Math.round(el.getBoundingClientRect().top * 10) / 10 : null;
  const hc = document.querySelector('[class*="headerCorner"]');
  const tr = document.querySelector('[class*="titleRow"]');
  const dhdr = document.querySelector('header.ank0OG_header') || document.querySelector('[data-phase] header');
  const hdr = hc || dhdr;
  const frame = document.querySelector('[data-mobile-nav="frame"]');
  const lead = hdr && hdr.querySelector('[class*="headerLeading"]');
  return {
    framePt: frame ? cs(frame).paddingTop : null,
    hdrTop: g(hdr), titleTop: g(tr), hdrPt: hdr ? cs(hdr).paddingTop : null,
    leadingH: lead ? cs(lead).height : null,
    colMt: (() => { const cc = document.querySelector('[class*="centerCol"]'); return cc ? cs(cc).marginTop : null; })(),
  };
};
const ENV_REWRITE = (env) => {
  let n = 0;
  document.querySelectorAll('style').forEach(st => {
    if (st.textContent.indexOf('env(safe-area-inset-top)') >= 0) {
      st.textContent = st.textContent.split('env(safe-area-inset-top)').join(env + 'px');
      n++;
    }
  });
  return n;
};

(async () => {
  const b = await webkit.launch({ headless: true });

  async function runCase(tag, withCss) {
    const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForTimeout(9000);
    if (withCss) {
      await p.evaluate(() => {
        document.documentElement.style.setProperty('--dsh-sb-native', '59px');
        const s = document.createElement('style'); s.id = '__app_css';
        s.textContent = document.getElementById('__css_src').textContent;
        document.head.appendChild(s);
      });
      await p.waitForTimeout(600);
    }
    const envR = await p.evaluate(ENV_REWRITE, ENV);
    // 进会话
    await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
    await p.waitForTimeout(2000);
    await p.evaluate(() => {
      const rs = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
      const t = rs.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rs[1] || rs[0];
      if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
    });
    await p.waitForTimeout(8000);
    const envR2 = await p.evaluate(ENV_REWRITE, ENV);
    await p.waitForTimeout(1500);
    const m = await p.evaluate(MEASURE);
    console.log('=== ' + tag + ' env改写=' + envR + '/' + envR2);
    console.log(JSON.stringify(m));
    await p.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/case_' + tag.replace(/[^a-zA-Z0-9]/g, '_') + '.png' });
    await c.close();
  }

  // 把 App CSS 藏进页面里，供 case B/C 用
  const fs = require('fs');
  const APP_CSS = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject.css', 'utf8');
  await b.close();

  // 用 addInitTag 方式太复杂，直接分两次跑：先跑无 CSS 的 A、B（同一 context 顺序跑有污染，分开跑）
  for (const withCss of [false, true]) {
    const bb = await webkit.launch({ headless: true });
    const c = await bb.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForTimeout(9000);
    const tag = withCss ? 'CSS_ON' : 'CSS_OFF';
    if (withCss) {
      await p.evaluate((css) => {
        document.documentElement.style.setProperty('--dsh-sb-native', '59px');
        const s = document.createElement('style'); s.id = '__app_css'; s.textContent = css;
        document.head.appendChild(s);
      }, APP_CSS);
      await p.waitForTimeout(600);
    }
    await p.evaluate(ENV_REWRITE, ENV);
    await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
    await p.waitForTimeout(2000);
    await p.evaluate(() => {
      const rs = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
      const t = rs.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rs[1] || rs[0];
      if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
    });
    await p.waitForTimeout(8000);
    await p.evaluate(ENV_REWRITE, ENV);
    await p.waitForTimeout(1500);
    const m = await p.evaluate(MEASURE);
    console.log('=== ' + tag + ' + env59：');
    console.log(JSON.stringify(m));
    await p.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/case_' + tag + '.png' });
    await c.close();
    await bb.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
