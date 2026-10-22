const { chromium } = require('playwright');
const fs = require('fs');

function loadCSS(f) {
  return fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/' + f, 'utf8')
    .replace(/^[\s\S]*?var CSS = \[/, '')
    .split("].join('\\n');")[0]
    .split('\n')
    .map(l => l.trim().replace(/^'/, '').replace(/',$/, '').replace(/'$/, ''))
    .filter(l => l && !l.startsWith('//'))
    .join('\n');
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(9000);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    let best = null;
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.top < 80 && r.left < 80 && r.width > 0) { if (!best || r.left < best._l) { b._l = r.left; best = b; } }
    }
    if (best) best.click();
  }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('a,button,[role="button"],li,div')];
    for (const el of els) {
      const t = (el.innerText || '').trim();
      if (t.startsWith('Our Free Model 更新')) { el.click(); return; }
    }
  }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.addStyleTag({ content: loadCSS('shim21_block.txt') });
  await page.addStyleTag({ content: loadCSS('shim22_block.txt') });
  await page.waitForTimeout(900);

  const m = await page.evaluate(() => {
    const card = document.querySelector('[class*="composerStack"] [class*="_card"]');
    const cr = card.getBoundingClientRect();
    const out = { card: [Math.round(cr.x), Math.round(cr.y), Math.round(cr.width), Math.round(cr.height)], strip: [], above: [] };
    // 卡片顶部 40px（插件条区域）+ 卡片上方 40px（可能 prompt 插件在此）
    const yTop = cr.y - 40, yBot = cr.y + 42;
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) return;
      if (r.y < yTop || r.y > yBot) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return;
      const cls = (el.className || '').toString();
      const txt = (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 28);
      // 只保留"叶子级"可见控件：有文本、或是插件前缀类、或按钮
      const isPlug = /dcc-|cm-|dsh-po-|ofm_|ofTiQG|credits/i.test(cls);
      const isBtn = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button';
      const leafText = txt && !Array.from(el.children).some(c => (c.innerText || '').trim() === txt);
      if (!(isPlug || isBtn || leafText)) return;
      out.strip.push({
        cls: cls.slice(0, 46), tag: el.tagName, txt,
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        bg: cs.backgroundColor, bd: cs.borderTopWidth + ' ' + cs.borderTopColor,
        z: cs.zIndex, pos: cs.position,
        plug: isPlug
      });
    });
    // 卡片顶边以上的独立浮层（z>0 定位元素，可能 prompt 插件面板）
    document.querySelectorAll('body *').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') return;
      const r = el.getBoundingClientRect();
      if (r.width < 30 || r.height < 14) return;
      if (r.bottom < cr.y - 120 || r.top > cr.y) return;
      const cls = (el.className || '').toString();
      if (!/dcc-|cm-|dsh-po-|ofm_|prompt|po-/i.test(cls)) return;
      out.above.push({ cls: cls.slice(0, 50), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], txt: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30) });
    });
    return out;
  });
  console.log(JSON.stringify(m, null, 1));
  await page.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/strip_now.png', clip: { x: 0, y: 700, width: 430, height: 232 } });
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
