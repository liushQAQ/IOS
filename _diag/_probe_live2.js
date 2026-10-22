const { webkit } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:3083/?password=Liu326766@', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);
  // 强拆计费弹窗（内嵌渲染：按文本爬高度<600 的祖先）
  await page.evaluate(() => setInterval(() => {
    const nodes = [...document.querySelectorAll('div,h1,h2,p,span')].filter(e => e.children.length === 0 && /计费兼容提醒/.test(e.textContent || ''));
    const roots = new Set();
    nodes.forEach(n => {
      let top = n;
      while (top.parentElement && top.parentElement !== document.body && top.parentElement.getBoundingClientRect().height < 600) top = top.parentElement;
      roots.add(top);
    });
    roots.forEach(r => { try { r.remove(); } catch (e) {} });
  }, 250));
  await page.waitForTimeout(1000);
  // 选工作区
  const ws = await page.evaluate(() => {
    const dd = [...document.querySelectorAll('div,button,span')].find(e => /选择工作区/.test(e.textContent || '') && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 60);
    if (dd) { dd.click(); return true; } return false;
  });
  console.log('ws dropdown:', ws);
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const opt = [...document.querySelectorAll('div,li,[role="option"]')].filter(e => e.children.length <= 3 && /mobil/i.test(e.textContent || '') && e.getBoundingClientRect().height > 15 && e.getBoundingClientRect().height < 60);
    const o = opt.sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)[0];
    if (o) o.click();
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '_lv_0ws.png' });
  // 搜索会话
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === '搜索会话'); if (b) b.click(); });
  await page.waitForTimeout(1200);
  await page.keyboard.type('公网暴露');
  await page.waitForTimeout(2000);
  const opened = await page.evaluate(() => {
    const items = [...document.querySelectorAll('div,li,a')].filter(e => /公网暴露安全检查/.test(e.textContent || '') && e.getBoundingClientRect().height > 15 && e.getBoundingClientRect().height < 100);
    const it = items.sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)[0];
    if (it) { it.click(); return true; } return false;
  });
  console.log('session opened:', opened);
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const c = [...document.querySelectorAll('button')].find(b => /收起侧边栏|关闭/.test(b.getAttribute('aria-label') || '')); if (c) c.click(); });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: '_lv_1session.png' });
  const st = await page.evaluate(() => {
    const flow = document.querySelector('[data-slot="conversation.chat.flow"]');
    return { hasFlow: !!flow, running: !!flow && /深度求索中|搜索|运行/.test(flow.textContent || ''), queue: !!document.querySelector('[data-queue-dock]') };
  });
  console.log('state:', JSON.stringify(st));
  if (!st.hasFlow) { await browser.close(); return; }
  // 排队一条
  const f = await page.evaluate(() => { const e = document.querySelector('[contenteditable="true"], textarea'); if (e) e.focus(); return !!e; });
  console.log('focus:', f);
  if (f) {
    await page.keyboard.type('几何化验专用排队消息，稍后删除，请忽略这条内容不参与任何真实对话', { delay: 5 });
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: '_lv_2queue.png' });
  // 注入 App 侧（86 同款）
  await page.addStyleTag({ content: fs.readFileSync('app_inject.css', 'utf8') });
  await page.evaluate(fs.readFileSync('app_inject.js', 'utf8')).catch(e => console.log('[js err]', String(e).slice(0, 150)));
  await page.waitForTimeout(4000);
  await page.screenshot({ path: '_lv_3inject.png' });
  // 全量几何
  const geo = await page.evaluate(() => {
    const out = { siblings: [], fee: [], goal: [] };
    const qd = document.querySelector('[data-queue-dock]');
    if (qd) {
      const pr = qd.parentElement;
      out.parent = { cls: (pr.className || '').toString().slice(0, 60), tag: pr.tagName };
      [...pr.children].forEach(ch => {
        const r = ch.getBoundingClientRect();
        out.siblings.push({ cls: (ch.className || '').toString().slice(0, 60), y: Math.round(r.y), h: Math.round(r.height), x: Math.round(r.x), w: Math.round(r.width), txt: (ch.textContent || '').trim().slice(0, 25) });
      });
    }
    document.querySelectorAll('div,span,button').forEach(el => {
      const t = (el.textContent || '').trim();
      const r = el.getBoundingClientRect();
      if (!r.height || !r.width) return;
      if (/^费用明细$/.test(t) && r.height < 50) out.fee.push({ cls: (el.className || '').toString().slice(0, 60), tag: el.tagName, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
      if (/_6qvijW_/.test((el.className || '').toString()) && r.height > 0) out.goal.push({ cls: (el.className || '').toString().slice(0, 40), y: Math.round(r.y), h: Math.round(r.height) });
    });
    out.fee = out.fee.slice(0, 6); out.goal = out.goal.slice(0, 6);
    return out;
  });
  console.log(JSON.stringify(geo, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
