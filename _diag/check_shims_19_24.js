// 定向校验 shim_19~24：提取各 shim 所在 """ 块，Swift 反转义后 node --check
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift', 'utf8');
const lines = src.split(/\r?\n/);
// 1. 找出所有 """ 块
let blocks = [], cur = null;
for (let i = 0; i < lines.length; i++) {
  const t = lines[i].trim();
  if (t === '"""' || t === '""",') {
    if (cur === null) cur = { start: i + 1, body: [] };
    else { cur.end = i + 1; blocks.push(cur); cur = null; }
    continue;
  }
  if (cur !== null) cur.body.push(lines[i]);
}
// 2. 找 shim_19~24 标记所在块
const targets = ['shim_19', 'shim_20', 'shim_21', 'shim_22', 'shim_23', 'shim_24'];
let fail = 0;
for (const name of targets) {
  let ln = -1;
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(name + '（')) { ln = i; break; }
  if (ln < 0) { console.log(`❌ ${name}: 标记未找到`); fail++; continue; }
  const blk = blocks.find(b => ln + 1 >= b.start && ln + 1 <= b.end);
  if (!blk) { console.log(`❌ ${name}: 不在任何 """ 块内 (L${ln + 1})`); fail++; continue; }
  // Swift 逐字符反转义
  const js = blk.body.join('\n');
  let out = '';
  for (let i = 0; i < js.length; i++) {
    const c = js[i];
    if (c === '\\' && i + 1 < js.length) {
      const n = js[i + 1];
      if (n === 'n') { out += '\n'; i++; }
      else if (n === 't') { out += '\t'; i++; }
      else if (n === '"') { out += '"'; i++; }
      else if (n === '\\') { out += '\\'; i++; }
      else if (n === '(') { out += '\\('; i++; }
      else { out += c; }
    } else out += c;
  }
  try {
    new vm.Script(out);
    console.log(`✅ ${name}: 块 L${blk.start}~${blk.end} (${blk.body.length} 行) 语法 OK`);
  } catch (e) {
    fail++;
    console.log(`❌ ${name}: 块 L${blk.start}~${blk.end} — ${e.message}`);
  }
}
// 3. 验证反转义后 join 调用形态
const m = src.match(/join\('\\\\n'\)/g);
console.log('Swift 源码中 join(\'\\\\n\') 出现次数:', m ? m.length : 0);
console.log(fail === 0 ? '=== shim_19~24 全部通过 ===' : `=== ${fail} 个失败 ===`);
process.exit(fail === 0 ? 0 : 1);
