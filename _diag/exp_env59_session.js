// 🔴 会话页 env=59 复现实验（真机截图全是会话页，首页复现不了）
const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_CSS = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject.css', 'utf8');
const ENV = 59;

const MEASURE = () => {
  const cs = el => { try { return getComputedStyle(el); } catch (e) { return {}; } };
  const g = el => el ? Math.round(el.getBoundingClientRect().top * 10) / 10 : null;
  // 会话页顶栏候选：headerCorner / titleRow / data-phase header
  const hc = document.querySelector('[class*="headerCorner"]');
  const tr = document.querySelector('[class*="titleRow"]');
  const dhdr = document.querySelector('header.ank0OG_header') || document.querySelector('[data-phase] header');
  const hdr = hc || dhdr;
  const frame = document.querySelector('[data-mobile-nav="frame"]');
  const tabs = Array.from(document.querySelectorAll('button, [role="tab"]')).find(e => (e.textContent || '').trim() === '对话');
  const chain = [];
  for (let n = hdr, d = 0; n && d < 12; n = n.parentElement, d++) {
    const c = cs(n);
    chain.push({ tag: n.tagName, cls: String(n.className || '').slice(0, 34), top: g(n), pt: c.paddingTop, mt: c.marginTop, pos: c.position });
  }
  return {
    frameExists: !!frame,
    framePt: frame ? cs(frame).paddingTop : null,
    frameInlinePt: frame ? frame.style.paddingTop || '' : null,
    hdrKind: hc ? 'headerCorner' : (dhdr ? 'ankHeader' : null),
    hdrTop: g(hdr), hdrPt: hdr ? cs(hdr).paddingTop : null,
    hdrInlinePt: hdr ? hdr.style.paddingTop || '' : null,
    colTop: (() => { let n = hdr; while (n && n.parentElement) { const f = n.parentElement.closest ? n.parentElement.closest('[data-mobile-nav="frame"]') : null; if (n.parentElement === (f || document.body)) { const cc = Array.from(n.parentElement.children).find(x => String(x.className).indexOf('centerCol') >= 0); return cc ? g(cc) : null; } n = n.parentElement; } return null; })(),
    titleTop: g(tr),
    tabTop: g(tabs),
    sbNative: getComputedStyle(document.documentElement).getPropertyValue('--dsh-sb-native'),
    chain,
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

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(9000);

  // App 注入（真机时序：文档级 CSS + 变量；JS shim 在真机已证实死亡，这里不注入）
  await p.evaluate(({ css, sb, shift }) => {
    window.__dshNativeStatusBar = sb;
    document.documentElement.style.setProperty('--dsh-sb-native', sb + 'px');
    document.documentElement.style.setProperty('--dsh-statusbar', sb + 'px');
    window.__dshTopShift = shift;
    const s = document.createElement('style'); s.id = '__app_css'; s.textContent = css;
    document.head.appendChild(s);
  }, { css: APP_CSS, sb: ENV, shift: 18 });
  await p.waitForTimeout(1000);

  // env → 59（首页阶段）
  const r1 = await p.evaluate(ENV_REWRITE, ENV);
  console.log('首页 env 改写 style 数:', r1);

  // 进会话（Our Free Model 更新）
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(2000);
  await p.evaluate(() => {
    const rs = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rs.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rs[1] || rs[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  await p.waitForTimeout(8000);

  // 会话页后再做一次 env 改写（React 可能重挂样式）
  const r2 = await p.evaluate(ENV_REWRITE, ENV);
  await p.waitForTimeout(1500);
  const m = await p.evaluate(MEASURE);
  console.log('会话页 env 改写 style 数:', r2);
  console.log(JSON.stringify(m, null, 1));
  console.log('\n>>> 复现 titleTop(pt) =', m.titleTop === null ? '?' : (m.titleTop / 3).toFixed(1), ' tabTop(pt) =', m.tabTop === null ? '?' : (m.tabTop / 3).toFixed(1));
  console.log('>>> 真机实测：titleTop=114.7pt, tab行≈150pt');
  await p.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/env59_session.png' });
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
