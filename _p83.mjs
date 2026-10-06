// 测试 App 默认地址 3083（dsh-pocket）在「完全无 cookie」条件下的完整握手链
import { chromium } from 'file:///E:/desktop/%E6%89%80%E6%9C%89skill/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.route('**/*', async r => { const h = r.request().headers(); delete h.cookie; await r.continue({ headers: h }); });

const navs = [], bad = [], ws = [];
page.on('framenavigated', f => { if (f === page.mainFrame()) navs.push(f.url().slice(-30)); });
page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(-40)); });
page.on('websocket', w => { ws.push('TRY ' + w.url().slice(-20)); w.on('close', () => ws.push('CLOSE')); w.on('socketerror', e => ws.push('ERR')); });

await page.goto('http://192.168.215.218:3083/', { waitUntil: 'domcontentloaded', timeout: 90000 });
let txt = '';
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(5000);
  txt = await page.evaluate(() => {
    const r = document.getElementById('root');
    if (r && r.innerText) return r.innerText;
    return document.body ? (document.body.innerText || '') : '';
  }).then(s => s.slice(0, 80)).catch(() => '(eval失败)');
  if (/选择工作区|新会话/.test(txt) && !/Loading/.test(txt)) break;
}
console.log('=== 3083 默认地址（剥 cookie）');
console.log('渲染: ' + JSON.stringify(txt));
console.log('导航(' + navs.length + '): ' + navs.slice(0, 6).join(' -> '));
console.log('WS  : ' + (ws.join(' | ') || '(无)'));
console.log('4xx+: ' + (bad.slice(0, 6).join(' | ') || '(无)'));
await browser.close();
