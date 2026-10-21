// 五探：App 全量 shim（app_inject.js，与真机等价）注入会话页
const { chromium } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag/';
const APP_JS = fs.readFileSync(DIR + 'app_inject.js', 'utf8');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(9000);
  await page.evaluate(() => { const bs=[...document.querySelectorAll('button')]; let best=null; for(const x of bs){const r=x.getBoundingClientRect(); if(r.top<80&&r.left<80&&r.width>0){if(!best||r.left<best._l){x._l=r.left;best=x;}}} if(best)best.click(); }).catch(()=>{});
  await page.waitForTimeout(2000);
  await page.evaluate(() => { for(const el of [...document.querySelectorAll('a,button,[role="button"],li,div')]){const t=(el.innerText||'').trim(); if(t.startsWith('Our Free Model 更新')){el.click();return;}} }).catch(()=>{});
  await page.waitForTimeout(6000);
  const ok = await page.evaluate(() => {
    const bad = ['插件', '设置', '新会话', '插件市场', '自动化任务', '记忆系统', '工作区', '更多', '会话列表'];
    const rows = [...document.querySelectorAll('[class*="sessionRow"], [class*="Row"], li, [role="button"]')].filter(e => {
      const r = e.getBoundingClientRect(); const t = (e.innerText || '').trim();
      return r.width > 150 && r.height > 30 && r.height < 90 && r.left < 260 && r.top > 100 && t.length > 6 && !bad.some(b => t === b || t.startsWith(b));
    });
    if (rows.length) { rows[0].click(); return (rows[0].innerText || '').slice(0, 20).replace(/\n/g, '/'); }
    return 'no-row';
  });
  console.log('enter:', ok);
  await page.waitForTimeout(10000);
  // 全量 App 注入（真机等价）
  await page.evaluate(APP_JS).catch(e => console.log('inject fail', e.message.slice(0, 120)));
  await page.waitForTimeout(5000);
  await page.screenshot({ path: DIR + 'full131_after.png', fullPage: false });
  const m = await page.evaluate(() => {
    const g = s => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), pos: cs.position }; };
    const card = document.querySelector('[class*="composerStack"] [class*="_card"]');
    const dock = document.querySelector('[class*="_dock"]');
    return {
      cardY: card ? Math.round(card.getBoundingClientRect().y) : null,
      cardPadTop: card ? getComputedStyle(card).paddingTop : null,
      voice: g('.dsh-mobile-voice-btn'),
      dcc: g('.dcc-root'), po: g('.dsh-po-capsule'), stat: g('.cm-stat-entry'), bbox: g('.cm-bbox'),
      dockChildren: dock ? dock.children.length : -1,
      dockKids: dock ? [...dock.children].slice(0, 6).map(e => ({ cls: (e.className || '').toString().slice(0, 30), y: Math.round(e.getBoundingClientRect().y) })) : null,
      tools: g('[class*="_tools"]'), primary: g('[class*="composerStack"] button[class*="_primary"]'),
    };
  }).catch(e => ({ evalFail: e.message }));
  console.log(JSON.stringify(m, null, 1));
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
