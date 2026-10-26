/* ============================================================================
 * release_wrap.cjs — 发版收尾一键脚本（v1.0.142 复盘固化，2026-10-26）
 *   背景：本机代理对 GitHub 长连接反复掐 TLS（gh EOF / git push 300s 超时），
 *   手动逐步重试一次发版要耗几十分钟。本脚本把「触发→等待→下载→MD5→落盘→
 *   Release→清单→推送」全链固化，通道策略按实测最优：
 *     · 清单/小文件 → gh api Contents 单文件推送（实测秒成，绕开 git 通道）
 *     · Release/资产 → gh CLI + 指数退避重试（EOF 属瞬时断连，非限流）
 *     · 源码 git push → 带 GIT_HTTP_LOW_SPEED 限制（60s 快速失败，不再卡 300s）
 *   用法：
 *     node _diag/release_wrap.cjs                # 完整链（需先 commit 源码并允许 push）
 *     node _diag/release_wrap.cjs --run <id>     # 跳过触发，等指定 run
 *     node _diag/release_wrap.cjs --skip-build   # 产物已在，只做 Release+清单
 *   前置：VERSION/四处版本已同步、闸门全绿凭证已提交（脚本会硬校验，缺=拒发）。
 * ==========================================================================*/
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const REPO = 'liushQAQ/IOS';
const BRANCH = 'personal';
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

function sh(cmd, opt = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, HTTPS_PROXY: '', HTTP_PROXY: '', https_proxy: '', http_proxy: '' }, ...opt }).trim();
}
// gh 带退避重试：EOF/5xx 属代理瞬断，重试即可；4xx 直接抛（真错误）
function ghRetry(cmd, tries = 6) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return sh(cmd); } catch (e) {
      lastErr = e;
      const msg = String(e.stdout || '') + String(e.stderr || '') + String(e.message || '');
      if (/HTTP 4\d\d|error checking|gh:.*\b4\d\d\b/i.test(msg) && !/EOF/.test(msg)) throw e;
      const wait = Math.min(30000, 3000 * Math.pow(1.6, i));
      console.log(`  [retry ${i + 1}/${tries}] ${msg.split('\n')[0].slice(0, 80)} …等 ${(wait / 1000).toFixed(0)}s`);
      execSync(`powershell -NoProfile -Command "Start-Sleep -Milliseconds ${wait}"`);
    }
  }
  throw lastErr;
}
function md5(p) { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex'); }

(async () => {
  const ver = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  console.log(`== 发版收尾 v${ver} ==`);

  // 0. 硬前置：凭证全绿且与现场源码一致（防「没跑闸门就打包」）
  const gate = JSON.parse(fs.readFileSync(path.join(ROOT, '_diag', 'gate-result.json'), 'utf8'));
  if (!gate.ok) throw new Error('闸门未全绿，禁止发版');
  const live = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'DSHios', 'ViewController.swift'))).digest('hex');
  if (gate.sourceHash !== live) throw new Error(`凭证过期: 凭证${gate.sourceHash.slice(0, 12)} ≠ 现场${live.slice(0, 12)}`);
  if (gate.version !== ver) throw new Error(`凭证版本 ${gate.version} ≠ VERSION ${ver}`);
  console.log(`  凭证 OK (${gate.pass}绿/${gate.fail}红 src=${gate.sourceHash.slice(0, 12)})`);

  // 1. 触发构建（老总授权后才跑本脚本）
  let runId = val('--run');
  if (!runId && !has('--skip-build')) {
    ghRetry(`gh workflow run build-ipa.yml --repo ${REPO} --ref ${BRANCH}`);
    console.log('  已触发 workflow_dispatch');
    execSync('powershell -NoProfile -Command "Start-Sleep -Seconds 10"');
    // Windows shell 会把 --jq 表达式拆坏（select 被当命令），改为取 JSON 自己解析
    const listRaw = ghRetry(`gh run list --repo ${REPO} --workflow build-ipa.yml --limit 3 --json databaseId,status`);
    const list = JSON.parse(listRaw);
    const cur = list.find(r => r.status !== 'completed') || list[0];
    runId = cur ? String(cur.databaseId) : null;
    if (!runId) throw new Error('未找到在途 run，用 --run <id> 指定');
  }
  let buildNum = null, dlDir = path.join(ROOT, '_dl_wrap');

  if (!has('--skip-build')) {
    // 2. 轮询完成
    console.log(`  等待 run ${runId} …`);
    for (;;) {
      const j = JSON.parse(ghRetry(`gh run view ${runId} --repo ${REPO} --json status,conclusion,displayTitle`));
      if (j.status === 'completed') {
        if (j.conclusion !== 'success') throw new Error('构建失败: ' + j.conclusion + ' → gh run view ' + runId + ' --log');
        break;
      }
      execSync('powershell -NoProfile -Command "Start-Sleep -Seconds 15"');
    }
    const log = ghRetry(`gh run view ${runId} --repo ${REPO} --log`);
    const m = log.match(/Version: (\d+\.\d+\.\d+) (\(\d+\))/);
    buildNum = m ? m[2].replace(/[()]/g, '') : null;
    console.log(`  构建成功 build=${buildNum}`);
    // 3. 下载
    fs.rmSync(dlDir, { recursive: true, force: true });
    fs.mkdirSync(dlDir, { recursive: true });
    ghRetry(`gh run download ${runId} --repo ${REPO} -D _dl_wrap`);
    const sub = fs.readdirSync(dlDir).find(d => fs.statSync(path.join(dlDir, d)).isDirectory());
    const tipaSrc = path.join(dlDir, sub || '', 'DSHios-public-unsigned.tipa');
    if (!fs.existsSync(tipaSrc)) throw new Error('产物缺 tipa');
    fs.copyFileSync(tipaSrc, path.join(ROOT, 'releases', `DSHios-public-${ver}-${buildNum}.tipa`));
    fs.copyFileSync(tipaSrc, path.join(ROOT, `DSHios-public-${ver}-${buildNum}.tipa`));
    fs.cpSync(dlDir, 'E:/desktop/所有skill/backup/dsh-ios-ci-' + buildNum + '-artifacts', { recursive: true });
    fs.rmSync(dlDir, { recursive: true, force: true });
  } else {
    buildNum = val('--build');
    if (!buildNum) throw new Error('--skip-build 需配 --build <n>');
  }

  const tipa = path.join(ROOT, 'releases', `DSHios-public-${ver}-${buildNum}.tipa`);
  const sum = md5(tipa);
  console.log(`  产物 ${path.basename(tipa)} MD5=${sum}`);

  // 4. GitHub Release（资产已在 Release 的以 --skip 容忍）
  const notes = val('--notes') || `${ver} 发布`;
  try { ghRetry(`gh release create v${ver} "${tipa.replace(/\\/g, '/')}" --repo ${REPO} --title "v${ver} (Build ${buildNum})" --notes "${notes.replace(/"/g, '\\"')}"`); }
  catch (e) { if (!/already exists|release.*exist/i.test(String(e.message))) throw e; console.log('  Release 已存在，跳过'); }

  // 5. latest.json（双份）—— 走 gh api Contents，实测比 git push 稳
  const latest = {
    version: ver, build: Number(buildNum),
    updated_at: new Date(Date.now() + 8 * 3600e3).toISOString().replace('T', ' ').slice(0, 19),
    title: val('--title') || `v${ver}(${buildNum})`,
    changelog: notes,
    tipa_url: `https://liu-gw.tail2a9309.ts.net:8443/dl/DSHios-public-${ver}-${buildNum}.tipa?m=gh-proxy.com`,
    public_tipa_url: `https://liu-gw.tail2a9309.ts.net:8443/dl/DSHios-public-${ver}-${buildNum}.tipa?m=gh-proxy.com`,
    tipa_url_fallback: `https://github.com/${REPO}/releases/download/v${ver}/DSHios-public-${ver}-${buildNum}.tipa`,
    release_url: `https://github.com/${REPO}/releases/tag/v${ver}`,
    md5: sum
  };
  const lj = JSON.stringify(latest, null, 2) + '\n';
  fs.writeFileSync(path.join(ROOT, 'releases', 'latest.json'), lj, 'utf8');
  fs.writeFileSync(path.join(ROOT, 'latest.json'), lj, 'utf8');
  const b64 = Buffer.from(fs.readFileSync(path.join(ROOT, 'releases', 'latest.json'))).toString('base64');
  let remoteSha = '';
  try { remoteSha = ghRetry(`gh api "repos/${REPO}/contents/releases/latest.json?ref=${BRANCH}" --jq .sha`); } catch (e) { remoteSha = ''; }
  const bodyFile = 'E:/desktop/所有skill/backup/_ghapi_body.json';
  fs.writeFileSync(bodyFile, JSON.stringify({ message: `release: latest.json -> v${ver}(${buildNum}) [via gh-api]`, content: b64, sha: remoteSha || undefined, branch: BRANCH }), 'utf8');
  ghRetry(`gh api -X PUT "repos/${REPO}/contents/releases/latest.json" --input "${bodyFile.replace(/\//g, '/')}" --jq .commit.sha`);
  console.log('  线上清单已更新（gh api Contents）');

  // 6. 本地归档提交 + git push（60s 快速失败；失败不阻断——线上清单/Release 已就位）
  try {
    sh('git add ' + path.join('releases', `DSHios-public-${ver}-${buildNum}.tipa`) + ' releases/latest.json latest.json');
    sh(`git commit -m "release: v${ver}(${buildNum}) 产物落盘 + latest.json (MD5 ${sum.slice(0, 8)})"`);
  } catch (e) { console.log('  本地提交跳过: ' + String(e.message).split('\n')[0]); }
  try {
    sh(`git push origin ${BRANCH}`, { env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_HTTP_LOW_SPEED_LIMIT: '1000', GIT_HTTP_LOW_SPEED_TIME: '60' } });
    console.log('  git push OK');
  } catch (e) {
    console.log('  ⚠️ git push 失败（代理掐 TLS，不影响手机更新）：远端清单/Release 已就位，稍后网络恢复再 git push 对齐即可');
  }
  console.log(`\n== 完成 v${ver}(${buildNum}) MD5=${sum} ==`);
  console.log('   线上验证: curl https://gh-proxy.com/https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/releases/latest.json');
})().catch(e => { console.error('FATAL: ' + e.message); process.exit(1); });
