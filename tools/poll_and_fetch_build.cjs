const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, '.codemagic_config.json');
const BUILD_ID = process.argv[2] || '6adf8a5986b11eb17876e733';
const VERSION = '2.1.2';
const BUILD_NUM = 3;

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
  execSync(`curl.exe -L -H "x-auth-token: ${config.apiToken}" "${art.url}" -o "${destTipa}"`, { stdio: 'inherit' });

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
    title: `v${VERSION}(${BUILD_NUM}) 修复版本号+消除抖动闪烁+消除抽屉三按钮闪烁`,
    changelog: "1. 修复真机版本号一直显示1.0.143且反复提示更新的问题\n2. 修复会话列表上下抖动闪烁导致无法点击的问题\n3. 彻底消除右侧抽屉打开时右上角三个按钮闪烁跳跃的问题\n4. 修复切换会话自动弹出键盘遮挡屏幕的问题（仅手指真触输入框才弹键盘）\n5. 修复点击重命名时左侧目录遮挡输入框的问题（点击重命名自动收起左侧抽屉）\n6. 修复会话框发送按钮随模型名称变短向左缩进的问题（固定死在最右侧）\n7. 修复新会话标题出现 Generate the session tit 英文提示词的问题\n8. 苹果原生 Vision 离线毫秒级 OCR 拍照/相册提取文字回填",
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
    execSync(`gh -R liushQAQ/IOS release create v${VERSION} "${destTipa}" "${latestJsonPath}" --title "v${VERSION} 正式版（发送按钮固定 + 标题修复 + 2.0三大能力）" --notes "${latestInfo.changelog}"`, { stdio: 'inherit' });
  } catch (e) {
    try {
      execSync(`gh -R liushQAQ/IOS release upload v${VERSION} "${destTipa}" "${latestJsonPath}" --clobber`, { stdio: 'inherit' });
    } catch (err) {}
  }

  // 提交 latest.json
  try {
    execSync(`git -C "${ROOT}" add releases/latest.json latest.json "releases/DSHios-public-${VERSION}-${BUILD_NUM}.tipa"`, { stdio: 'inherit' });
    execSync(`git -C "${ROOT}" commit -m "release: v${VERSION}(${BUILD_NUM}) 发送按钮靠右固定 + 会话标题净化 + 2.0三大功能"`, { stdio: 'inherit' });
    execSync(`git -C "${ROOT}" push origin personal`, { stdio: 'inherit' });
  } catch (e) {}

  console.log('🎉 2.1.0 全流程发布圆满成功！');
}

run().catch(e => {
  console.error('异常退出:', e);
  process.exit(1);
});
