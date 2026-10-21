// 复现脚本：触发一次运行 → 抓 dock 统计部件真实 DOM → 主题切换复现
const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(DIR + '/app_inject.js', 'utf8');

const KW = ['tok/s', 'CPU', '本会话', '网关', '缓存命中', '轮'];

async function dumpParts(p, label) {
  const r = await p.evaluate(() => {
    const KW = ['tok/s', 'CPU', '本会话', '网关', '缓存命中', '轮'];
    const out = [];
    const seen = new Set();
    const all = document.querySelectorAll('[class*="composerStack"] *, [class*="dock"] *, [class*="sm-"], [class*="cm-"], [class*="bbox"]');
    all.forEach(e => {
      const t = (e.textContent || '');
      if (!KW.some(k => t.includes(k))) return;
      const q = e.getBoundingClientRect();
      if (q.width < 8 || q.height < 4) return;
      if (seen.has(e)) return; seen.add(e);
      const cs = getComputedStyle(e);
      out.push({
        tag: e.tagName, cls: (e.className || '').toString().slice(0, 52),
        txt: t.replace(/\s+/g, ' ').trim().slice(0, 56),
        y: Math.round(q.y), x: Math.round(q.x), w: Math.round(q.width), h: Math.round(q.height),
        disp: cs.display, pos: cs.position, color: cs.color, bg: cs.backgroundColor,
        fs: cs.fontSize, transform: cs.transform === 'none' ? 'none' : 'T',
      });
    });
    out.sort((a, b) => a.y - b.y || a.x - b.x);
    return out;
  });
  console.log('--- ' + label + ' --- 命中 ' + r.length);
  for (const e of r) console.log(JSON.stringify(e));
  return r.length;
}

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.route(/\.(woff2?|ttf|otf)(\?.*)?$/i, r => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js }) => {
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    if (!document.getElementById('__reg_fakeenv')) {
      const fe = document.createElement('style');
      fe.id = '__reg_fakeenv';
      fe.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
      document.head.appendChild(fe);
    }
    try { (0, eval)(js); } catch (e) {}
    window.__regTick = function () { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} try { if (window.__dshSetStatusBar) window.__dshSetStatusBar(59); } catch (e) {} };
    window.__regTick();
  }, { js: APP_JS });
  await p.waitForTimeout(2000);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[1] || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  for (let i = 0; i < 10; i++) {
    await p.waitForTimeout(3000);
    if (await p.evaluate(() => !!document.querySelector('.cm-stat-entry, .dcc-root'))) break;
  }
  await p.waitForTimeout(1500);
  // 关弹窗
  for (let i = 0; i < 5; i++) {
    const rect = await p.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button, [role="button"], div')).filter(e => (e.textContent || '').trim() === '知道了' && e.getBoundingClientRect().width > 10);
      if (!els.length) return null;
      const r = els[els.length - 1].getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!rect) break;
    await p.mouse.click(rect.x, rect.y);
    await p.waitForTimeout(1000);
  }
  // 收起抽屉（否则挡住输入框）
  await p.evaluate(() => { const x = document.querySelector('[aria-label="收起侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1200);
  // 输入并发送
  const ta = await p.evaluate(() => {
    const el = document.querySelector('[class*="composerStack"] textarea, [class*="composerStack"] [contenteditable="true"]');
    return !!el;
  });
  console.log('输入框存在:', ta);
  if (ta) {
    await p.click('[class*="composerStack"] textarea, [class*="composerStack"] [contenteditable="true"]');
    await p.type('[class*="composerStack"] textarea, [class*="composerStack"] [contenteditable="true"]', '只答一个数字别运行命令：1+1=?', { delay: 20 });
    await p.waitForTimeout(800);
    // 点发送
    await p.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('[class*="composerStack"] button, [class*="composerStack"] [role="button"]'));
      const send = btns.find(b => /发送|send/i.test(b.getAttribute('aria-label') || ''));
      if (send) send.click();
    });
    console.log('已发送，轮询 dock 部件…');
    let last = 0;
    for (let i = 0; i < 60; i++) {
      await p.waitForTimeout(2500);
      await p.evaluate(() => { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} });
      const n = await dumpParts(p, '运行中 t+' + (i * 2.5) + 's');
      if (n > 0 && i % 4 === 0) {
        try { await p.screenshot({ path: DIR + '/run_' + i + '.png', timeout: 8000 }); } catch (e) {}
      }
      if (n > 0) last = n;
      // 运行结束判据：连续多次为 0 且之前出现过
      if (last > 0 && n === 0 && i > 8) { console.log('部件已消失（运行结束）'); break; }
    }
    // 运行结束后：主题反复切换
    console.log('=== 主题切换复现 ===');
    for (let round = 1; round <= 3; round++) {
      await p.emulateMedia({ colorScheme: 'light' }); await p.waitForTimeout(2000);
      await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(2000);
      await p.evaluate(() => { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} });
      const n = await dumpParts(p, '切换后 round ' + round);
      try { await p.screenshot({ path: DIR + '/toggle_' + round + '.png', timeout: 8000 }); } catch (e) {}
    }
  }
  await b.close();
})();
