// 实验：在页面脚本执行前删掉 iOS16 不存在的 API，验证是否复现 iOS 白屏
import { chromium } from 'file:///E:/desktop/%E6%89%80%E6%9C%89skill/node_modules/playwright/index.mjs';

const MODE = process.argv[2] || 'break'; // break=模拟iOS16  killx=再删更多新API
const extra = MODE === 'killx';

const init = `(() => {
  const proto = x => Object.getOwnPropertyDescriptor(x, 'x');
  try { delete Promise.withResolvers; } catch(e) {}
  if (${extra}) {
    delete Array.prototype.toSorted; delete Array.prototype.toReversed; delete Array.prototype.with;
    delete Object.groupBy; delete Map.groupBy; delete Array.fromAsync;
    delete Promise.any;
    delete globalThis.AggregateError;
  }
})()`;

const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(init);
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 110)));
await page.goto('http://192.168.215.218:8080/dsh/', { waitUntil: 'domcontentloaded', timeout: 90000 });
let txt = '';
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(4000);
  txt = await page.evaluate(() => { const r = document.getElementById('root'); return (r ? r.innerText || '' : '').trim().slice(0, 60); });
  if (/选择工作区/.test(txt) && !/Loading/.test(txt)) break;
}
console.log('=== MODE=' + MODE + '  withResolvers存在=' + await page.evaluate(() => typeof Promise.withResolvers));
console.log('渲染: ' + JSON.stringify(txt));
console.log('JS错误(' + errs.length + '): ' + (errs.slice(0, 4).join(' | ') || '(无)'));
await browser.close();
