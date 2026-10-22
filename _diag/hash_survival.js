// 哈希类名存活率体检：App 里写死的 102 个哈希类名，在当前 DSH 版本里还剩几个能命中
const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const NAMES = JSON.parse(fs.readFileSync('_hashlist.json', 'utf8'));
const CSS = fs.readFileSync('app_inject.css', 'utf8');

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(8000);

  const clamp = () => document.querySelectorAll('[class*="sidebarCol"]').forEach(el => {
    el.style.setProperty('width', '252px', 'important');
    el.style.setProperty('min-width', '252px', 'important');
    el.style.setProperty('max-width', '252px', 'important');
  });
  await p.evaluate(({ css }) => {
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  }, { css: CSS });
  await p.waitForTimeout(400);
  await p.evaluate(clamp);

  // 收集三个状态下的 DOM：主页 / 抽屉打开 / 设置面板
  const collect = async () => p.evaluate(() => {
    const all = new Set();
    document.querySelectorAll('*').forEach(el => {
      const cn = el.getAttribute('class');
      if (cn) cn.split(/\s+/).forEach(x => { if (x) all.add(x); });
    });
    return Array.from(all);
  });

  const home = await collect();
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(clamp);
  const drawer = await collect();
  // 打开账号菜单（齿轮/账号行）
  await p.evaluate(() => {
    const t = document.querySelector('[class*="trigger"], [class*="settingsArea"] button, [class*="accountRow"]');
    if (t) t.click();
  });
  await p.waitForTimeout(1200);
  const menu = await collect();

  const live = new Set([...home, ...drawer, ...menu]);
  const alive = NAMES.filter(n => live.has(n));
  const dead = NAMES.filter(n => !live.has(n));

  console.log('DSH 版本 DOM 类名总数: ' + live.size);
  console.log('App 写死哈希类名: ' + NAMES.length);
  console.log('  仍能命中 (alive): ' + alive.length);
  console.log('  已失效 (dead)  : ' + dead.length + '   ← 这些补丁现在全是空转');
  console.log('\n--- 仍然有效的 ---');
  alive.forEach(n => console.log('  OK  ' + n));
  console.log('\n--- 已失效的（补丁静默归零）---');
  dead.forEach(n => console.log('  DEAD ' + n));

  await b.close();
})();
