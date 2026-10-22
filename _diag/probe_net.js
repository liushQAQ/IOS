const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const p = await c.newPage();
  const reqs = [];
  p.on('response', r => { const u = r.url(); if (u.indexOf('workspace') >= 0 || u.indexOf('api') >= 0) reqs.push(r.status() + ' ' + u.slice(0, 120)); });
  p.on('console', m => { if (m.type() === 'error') reqs.push('CONSOLE_ERR ' + m.text().slice(0, 120)); });
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(15000);
  console.log(reqs.slice(0, 40).join('\n'));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
