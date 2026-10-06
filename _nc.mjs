// 真·无 cookie 模拟：拦截所有请求剥掉 cookie 头（复刻 iOS Safari/WKWebView 对 http://纯IP 不存 cookie）
import { chromium } from 'file:///E:/desktop/%E6%89%80%E6%9C%89skill/node_modules/playwright/index.mjs';

const TARGETS = [
  ['A 外网47027', 'http://cn-hk-bgp-4.ofalias.net:47027/dsh/?password=Liu326766%40'],
  ['B 局域网8080', 'http://192.168.215.218:8080/dsh/'],
];

const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

for (const [label, url] of TARGETS) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.route('**/*', async route => {
    const h = route.request().headers();
    delete h.cookie;
    await route.continue({ headers: h });
  });
  const ws = [], bad = [];
  page.on('websocket', w => { ws.push('OPEN ' + w.url().slice(-24)); w.on('socketerror', e => ws.push('ERR ' + e)); w.on('close', () => ws.push('CLOSE')); });
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(-46)); });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  let txt = '';
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(5000);
    txt = await page.evaluate(() => { const r = document.getElementById('root'); return (r ? r.innerText || '' : '').trim().slice(0, 90); });
    if (/选择工作区|新会话/.test(txt) && !/Loading/.test(txt)) break;
  }
  console.log('\n=== ' + label + '（剥 cookie）');
  console.log('渲染: ' + JSON.stringify(txt));
  console.log('WS  : ' + (ws.join(' | ') || '(无)'));
  console.log('4xx+: ' + (bad.length ? bad.slice(0, 5).join(' | ') : '(无)'));
  await ctx.close();
}
await browser.close();
