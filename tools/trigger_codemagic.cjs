const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, '.codemagic_config.json');

if (!fs.existsSync(CONFIG_FILE)) {
  console.error('❌ 缺少 .codemagic_config.json 配置文件');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

function apiRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(`https://api.codemagic.io${endpoint}`, {
      method,
      headers: {
        'x-auth-token': config.apiToken,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          resolve(json);
        } catch (e) {
          resolve(raw);
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  console.log('🚀 正在调用 Codemagic API 触发构建...');
  const startRes = await apiRequest('POST', '/builds', {
    appId: config.appId,
    workflowId: config.workflowId,
    branch: 'personal'
  });

  if (!startRes || !startRes.buildId) {
    console.error('❌ 触发构建失败:', startRes);
    process.exit(1);
  }

  const buildId = startRes.buildId;
  console.log(`✅ 已成功创建构建任务: ${buildId} (机型: Mac mini M2)`);
  console.log('⏳ 正在等待构建完成...');

  let buildData = null;
  while (true) {
    await new Promise(r => setTimeout(r, 15000));
    const statusRes = await apiRequest('GET', `/builds/${buildId}`);
    const b = statusRes ? statusRes.build : null;
    if (!b) continue;

    console.log(`   状态: ${b.status} | 时长: ${b.startedAt ? '编译中' : '排队中'}`);
    if (b.status === 'finished' || b.status === 'success') {
      buildData = b;
      break;
    }
    if (b.status === 'failed' || b.status === 'canceled') {
      console.error(`❌ 构建终态失败: ${b.status}`, b.message || '');
      process.exit(1);
    }
  }

  console.log('🎉 编译成功！产物信息:', buildData.artefacts);
}

main().catch(err => {
  console.error('❌ 执行异常:', err.message);
  process.exit(1);
});
