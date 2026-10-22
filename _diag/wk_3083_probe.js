// wk_3083_probe.js —— Playwright WebKit 430x932 真机等价，打开 3083 验证探针上报链路
// 用法: env -u HTTP_PROXY -u http_proxy -u HTTPS_PROXY -u https_proxy node wk_3083_probe.js
const { webkit } = require('playwright');
const fs = require('fs');

const URL_TARGET = process.argv[2] || 'http://127.0.0.1:3083/';
const LOG = 'E:/desktop/所有skill/port-manager/_p16.log';

(async () => {
  // 记录日志文件打开前的字节数
  let before = 0;
  try { before = fs.statSync(LOG).size; } catch (e) {}

  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });

  await page.goto(URL_TARGET, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => errors.push('goto: ' + e.message));

  // 分阶段采样 #root 状态
  const stages = [];
  for (const ms of [2000, 4000, 8000, 8000, 10000]) {
    await page.waitForTimeout(ms);
    const s = await page.evaluate(() => {
      const r = document.getElementById('root');
      return {
        t: Math.round(performance.now()),
        root: !!r,
        kids: r ? r.children.length : -1,
        textLen: r ? (r.innerText || '').length : -1,
        htmlLen: document.documentElement.innerHTML.length,
        p16: !!window.__p16,
        ua: navigator.userAgent.slice(-40),
      };
    }).catch(() => ({ err: 1 }));
    stages.push(s);
    if (s.root && s.kids > 0) break;
  }

  await page.waitForTimeout(4000);
  await browser.close();

  // 读探针新增日志
  let delta = '';
  try {
    const txt = fs.readFileSync(LOG, 'utf8');
    delta = txt.slice(before);
  } catch (e) { delta = '(read fail ' + e.message + ')'; }

  console.log('=== 阶段采样 ===');
  stages.forEach((s) => console.log(JSON.stringify(s)));
  console.log('=== 错误(' + errors.length + ') ===');
  errors.slice(0, 12).forEach((e) => console.log(' - ' + e));
  console.log('=== 探针新增日志 ' + delta.length + 'B ===');
  console.log(delta.slice(0, 6000));
})();
