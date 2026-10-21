// 四探：长等 dock 挂载 + 全 shim 注入后的插件条最终态（会话页）
const { chromium } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag/';
function loadCSS(f) {
  return fs.readFileSync(DIR + f, 'utf8')
    .replace(/^[\s\S]*?var CSS = \[/, '').split("].join('\\n');")[0].split('\n')
    .map(l => l.trim().replace(/^'/, '').replace(/,$/, '').replace(/'$/, ''))
    .filter(l => l && !l.startsWith('//')).join('\n');
}
const ENGINE = fs.readFileSync(DIR + 'shim24_block.txt', 'utf8');

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
    if (rows.length) { rows[0].click(); return (rows[0].innerText || '').slice(0, 24).replace(/\n/g, '/'); }
    return 'no-row';
  });
  console.log('enter:', ok);
  // 等 dock 挂载，最多 90 秒
  let mounted = false;
  for (let t = 0; t < 18; t++) {
    await page.waitForTimeout(5000);
    mounted = await page.evaluate(() => { const d = document.querySelector('[class*="_dock"]'); return !!d && d.children.length > 0 && !!document.querySelector('.cm-stat-entry, .cm-bbox, [class*="cm-stat"]'); });
    if (mounted) break;
  }
  console.log('dock mounted:', mounted);
  for (const f of ['shim21_block.txt', 'shim22_block.txt', 'shim23_block.txt']) await page.addStyleTag({ content: loadCSS(f) }).catch(() => {});
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '.dsh-mobile-voice-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;flex:0 0 auto;border:none;background:transparent;color:#61666b;padding:0;margin:0 2px;}';
    document.head.appendChild(st);
    const tools = document.querySelector('[class*="composerStack"] [class*="_tools"]');
    if (tools && !tools.querySelector('.dsh-mobile-voice-btn')) {
      const btn = document.createElement('button');
      btn.className = 'dsh-mobile-voice-btn';
      btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path></svg>';
      const add = tools.querySelector('[class*="_add"]');
      if (add && add.nextSibling) tools.insertBefore(btn, add.nextSibling); else tools.appendChild(btn);
    }
  }).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: DIR + 's131_before.png', fullPage: false });
  await page.addScriptTag({ content: ENGINE }).catch(e => console.log('engine fail', e.message));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: DIR + 's131_after.png', fullPage: false });
  const m = await page.evaluate(() => {
    const g = s => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), pos: cs.position }; };
    const card = document.querySelector('[class*="composerStack"] [class*="_card"]');
    return {
      cardY: card ? Math.round(card.getBoundingClientRect().y) : null,
      cardPadTop: card ? getComputedStyle(card).paddingTop : null,
      dcc: g('.dcc-root'), po: g('.dsh-po-capsule'), stat: g('.cm-stat-entry'), bbox: g('.cm-bbox'),
      dock: g('[class*="_dock"]'), tools: g('[class*="_tools"]'),
      primary: g('[class*="composerStack"] button[class*="_primary"]'),
    };
  }).catch(e => ({ evalFail: e.message }));
  console.log(JSON.stringify(m, null, 1));
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
