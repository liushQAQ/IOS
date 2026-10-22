// 复现玩家 17 Pro (402x874, iOS 27.02) 的「App 错乱 / Safari 正常」
// 对照：A=裸 WebKit(Safari 等价)  B=裸+App 全量注入(js shim)  C=430 老总尺寸+App 注入
const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag/';
const APP_JS = fs.readFileSync(DIR + 'app_inject.js', 'utf8');
const APP_CSS = fs.readFileSync(DIR + 'app_inject.css', 'utf8');

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';

async function run(name, size, inject) {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: size.w, height: size.h },
    userAgent: UA,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const p = await ctx.newPage();
  if (inject) {
    await p.addInitScript(APP_JS).catch(() => {});
    await p.addInitScript(() => {
      window.__probeLog = [];
      window.addEventListener('error', e => window.__probeLog.push('ERR:' + e.message));
    }).catch(() => {});
  }
  try {
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 40000 });
  } catch (e) { console.log(name, 'goto fail', e.message); }
  await p.waitForTimeout(12000);
  if (inject) {
    // app_inject.css 是玻璃 shim 的 CSS 数组（由 shim JS 自注入），补一层保险
    await p.addStyleTag({ content: APP_CSS }).catch(() => {});
    await p.waitForTimeout(1500);
  }
  // 点开左侧栏（抽屉）
  await p.evaluate(() => {
    const cands = [
      'button[aria-label="打开侧边栏"]', '[data-sidebar-toggle]',
      '[class*="composerStack"] ~ * button',
    ];
    for (const s of cands) { const el = document.querySelector(s); if (el) { el.click(); return 'clicked:' + s; } }
    // 兜底：找顶栏最左的小按钮
    const bs = [...document.querySelectorAll('button')].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.width < 45 && r.top < 120 && r.left < 80; });
    if (bs.length) { bs[0].click(); return 'clicked-fallback:' + (bs[0].getAttribute('aria-label') || bs[0].className).toString().slice(0, 40); }
    return 'no-button';
  }).then(r => console.log(name, 'drawer toggle:', r)).catch(() => {});
  await p.waitForTimeout(2500);
  await p.screenshot({ path: DIR + `player_${name}.png` });
  const m = await p.evaluate(() => {
    const g = el => { if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), pos: cs.position }; };
    // 侧栏根：多种候选
    const side = document.querySelector('[class*="sidebarCol"]') || document.querySelector('[class*="bJOniG"]') ||
      [...document.querySelectorAll('div')].find(d => { const r = d.getBoundingClientRect(); return r.width > 200 && r.width < 340 && r.left <= 2 && r.height > 500; });
    const main = document.querySelector('#root > div') || document.querySelector('#root');
    const firstKids = main ? [...main.children].map(k => ({ cls: (k.className || '').toString().slice(0, 30), ...g(k) })) : [];
    return {
      innerWidth: innerWidth, docClientW: document.documentElement.clientWidth,
      sidebar: side ? { cls: (side.className || '').toString().slice(0, 40), ...g(side) } : null,
      rootKids: firstKids.slice(0, 6),
      errors: (window.__probeLog || []).slice(0, 5),
    };
  }).catch(e => ({ evalFail: e.message }));
  console.log(name, JSON.stringify(m));
  await browser.close();
}

(async () => {
  await run('A_bare_402', { w: 402, h: 874 }, false);
  await run('B_inject_402', { w: 402, h: 874 }, true);
  await run('C_inject_430', { w: 430, h: 932 }, true);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
