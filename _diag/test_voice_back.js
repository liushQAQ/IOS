const { chromium } = require('playwright');
const fs = require('fs');
function loadCSS(f) {
  return fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/' + f, 'utf8')
    .replace(/^[\s\S]*?var CSS = \[/, '').split("].join('\\n');")[0].split('\n')
    .map(l => l.trim().replace(/^'/, '').replace(/,$/, '').replace(/'$/, ''))
    .filter(l => l && !l.startsWith('//')).join('\n');
}
// App 侧语音按钮样式（从 Swift 抽的关键部分，等价复刻）
const VOICE_CSS = `
.dsh-mobile-voice-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 50%; flex: 0 0 auto;
  border: none; background: transparent; color: #61666b; padding: 0; margin: 0 2px;
}
.dsh-mobile-voice-btn.recording { background: #4176e6; color: #fff; }
`;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(9000);
  await page.evaluate(() => {
    const bs = [...document.querySelectorAll('button')];
    let best = null;
    for (const x of bs) { const r = x.getBoundingClientRect(); if (r.top < 80 && r.left < 80 && r.width > 0) { if (!best || r.left < best._l) { x._l = r.left; best = x; } } }
    if (best) best.click();
  }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    for (const el of [...document.querySelectorAll('a,button,[role="button"],li,div')]) {
      const t = (el.innerText || '').trim();
      if (t.startsWith('Our Free Model 更新')) { el.click(); return; }
    }
  }).catch(() => {});
  await page.waitForTimeout(8000);
  for (const f of ['shim21_block.txt', 'shim22_block.txt', 'shim23_block.txt']) {
    await page.addStyleTag({ content: loadCSS(f) });
  }
  await page.addStyleTag({ content: VOICE_CSS });
  await page.waitForTimeout(600);

  const m = await page.evaluate(() => {
    // ===== 复刻 App 打补丁后的 ensureVoiceButton =====
    var tools = document.querySelector('[class*="composerStack"] [class*="_tools"]') ||
                document.querySelector('[class*="_tools"]') ||
                document.querySelector('.uWtHQG_tools');
    if (!tools) return { err: 'no-tools' };
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dsh-mobile-voice-btn';
    btn.setAttribute('title', '点击进行语音输入');
    btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>';
    var addBtn = tools.querySelector('[class*="_add"], .uWtHQG_add, [aria-label*="添加文件"]');
    if (addBtn && addBtn.nextSibling) { tools.insertBefore(btn, addBtn.nextSibling); } else { tools.appendChild(btn); }
    const r = btn.getBoundingClientRect();
    const addR = addBtn ? addBtn.getBoundingClientRect() : null;
    return {
      toolsCls: tools.className.toString(),
      addCls: addBtn ? addBtn.className.toString() : null,
      btnRect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      addRect: addR ? [Math.round(addR.x), Math.round(addR.y), Math.round(addR.width), Math.round(addR.height)] : null,
      visible: r.width > 0 && r.height > 0,
      siblings: Array.from(tools.children).map(c => (c.className || '').toString().slice(0, 24) || c.tagName)
    };
  });
  console.log(JSON.stringify(m, null, 1));
  await page.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/voice_after.png', clip: { x: 0, y: 726, width: 430, height: 206 } });
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
