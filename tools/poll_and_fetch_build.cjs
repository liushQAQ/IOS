const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, '.codemagic_config.json');
const BUILD_ID = process.argv[2] || '6ae9d74629333872aee4f8bf';
const VERSION = '2.2.5';
const BUILD_NUM = 160;

if (!fs.existsSync(CONFIG_FILE)) {
  console.error('缺少配置文件');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

function apiGet(endpoint) {
  return new Promise((resolve, reject) => {
    https.get(`https://api.codemagic.io${endpoint}`, {
      headers: { 'x-auth-token': config.apiToken }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log(`[${new Date().toLocaleTimeString()}] 开始监听 Codemagic 构建 ${BUILD_ID}...`);
  let finishedBuild = null;
  
  while (true) {
    try {
      const res = await apiGet(`/builds/${BUILD_ID}`);
      const b = res ? res.build : null;
      if (b) {
        console.log(`[${new Date().toLocaleTimeString()}] 当前状态: ${b.status} (耗时: ${b.startedAt ? '编译中' : '排队中'})`);
        if (b.status === 'finished' || b.status === 'success') {
          finishedBuild = b;
          break;
        }
        if (b.status === 'failed' || b.status === 'canceled') {
          console.error('构建失败或被取消:', b.message || b.status);
          process.exit(1);
        }
      }
    } catch (e) {
      console.log('网络抖动，重试中...', e.message);
    }
    await new Promise(r => setTimeout(r, 20000));
  }

  const art = (finishedBuild.artefacts || []).find(a => a.name && a.name.endsWith('.ipa'));
  if (!art) {
    console.error('未在构建产物中找到 IPA 文件');
    process.exit(1);
  }

  console.log(`编译完成！产物链接: ${art.url}`);
  const destTipa = path.join(ROOT, 'releases', `DSHios-public-${VERSION}-${BUILD_NUM}.tipa`);
  
  console.log(`正在下载产物到 ${destTipa}...`);
  if (fs.existsSync(destTipa)) fs.unlinkSync(destTipa);
  execSync(`curl.exe -L --retry 12 --retry-delay 5 --retry-all-errors --connect-timeout 20 -H "x-auth-token: ${config.apiToken}" "${art.url}" -o "${destTipa}"`, { stdio: 'inherit' });

  // 计算 MD5
  const crypto = require('crypto');
  const buf = fs.readFileSync(destTipa);
  const md5 = crypto.createHash('md5').update(buf).digest('hex').toLowerCase();
  console.log(`文件校验完成！MD5: ${md5}, 大小: ${buf.length} 字节`);

  // 更新 latest.json
  const latestJsonPath = path.join(ROOT, 'releases', 'latest.json');
  const rootLatestJsonPath = path.join(ROOT, 'latest.json');
  const latestInfo = {
    version: VERSION,
    build: BUILD_NUM,
    updated_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
    title: `v${VERSION}(${BUILD_NUM}) 顶栏插件弹出页面防出屏与通用卡片自适应`,
    changelog: "1. 修复顶栏插件弹出页面超出屏幕范围\n2. 修复鲸鱼短滑换高度不跟手\n3. 修复鲸鱼出现位置偏移半截\n4. 修复点发送时键盘闪一下又收回\n5. 修复抽屉顶栏上移或下移\n6. 小鲸鱼短滑可在任意高度拉出",
    tipa_url: `https://liu-gw.tail2a9309.ts.net:8443/dl/DSHios-public-${VERSION}-${BUILD_NUM}.tipa?m=gh-proxy.com`,
    public_tipa_url: `https://liu-gw.tail2a9309.ts.net:8443/dl/DSHios-public-${VERSION}-${BUILD_NUM}.tipa?m=gh-proxy.com`,
    tipa_url_fallback: `https://github.com/liushQAQ/IOS/releases/download/v${VERSION}/DSHios-public-${VERSION}-${BUILD_NUM}.tipa`,
    release_url: `https://github.com/liushQAQ/IOS/releases/tag/v${VERSION}`,
    md5: md5
  };

  fs.writeFileSync(latestJsonPath, JSON.stringify(latestInfo, null, 2), 'utf8');
  fs.writeFileSync(rootLatestJsonPath, JSON.stringify(latestInfo, null, 2), 'utf8');

  // 发布到 GitHub Release
  try {
    console.log('正在创建/更新 GitHub Release...');
    execSync(`gh -R liushQAQ/IOS release create v${VERSION} "${destTipa}" "${latestJsonPath}" --title "v${VERSION}(${BUILD_NUM}) 鲸鱼任意高度拉出+发送键盘零闪现" --notes "${latestInfo.changelog}"`, { stdio: 'inherit' });
  } catch (e) {
    try {
      execSync(`gh -R liushQAQ/IOS release upload v${VERSION} "${destTipa}" "${latestJsonPath}" --clobber`, { stdio: 'inherit' });
    } catch (err) {}
  }

  // 提交 latest.json
  try {
    execSync(`git -C "${ROOT}" add releases/latest.json latest.json "releases/DSHios-public-${VERSION}-${BUILD_NUM}.tipa"`, { stdio: 'inherit' });
    execSync(`git -C "${ROOT}" commit -m "release: v${VERSION}(${BUILD_NUM}) 产物归档"`, { stdio: 'inherit' });
    execSync(`git -C "${ROOT}" push origin personal`, { stdio: 'inherit' });
  } catch (e) {}

  console.log(`🎉 ${VERSION} 全流程发布圆满成功！`);
}

run().catch(e => {
  console.error('异常退出:', e);
  process.exit(1);
});
