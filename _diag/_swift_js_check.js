const fs = require('fs');
const file = 'E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift';
const lines = fs.readFileSync(file, 'utf8').split('\n');

const fnIdx = lines.findIndex(l => l.includes('function fixOverlayOverflow()'));
if (fnIdx < 0) { console.log('❌ 找不到 fixOverlayOverflow'); process.exit(1); }

// 边界：向上找最近的单独一行 """（开），向下找最近的 """ 或 """,（闭，缩进不固定）
let start = -1;
for (let i = fnIdx; i >= 0; i--) { if (lines[i].trim() === '"""') { start = i + 1; break; } }
let end = -1;
for (let i = fnIdx; i < lines.length; i++) {
  const t = lines[i].trim();
  if (t === '""",' || t === '"""') { end = i; break; }
}
if (start < 0 || end < 0) { console.log('❌ 边界定位失败 start=' + start + ' end=' + end); process.exit(1); }
console.log('区间: ' + (start + 1) + ' ~ ' + end + '  （' + (end - start) + ' 行）');

const raw = lines.slice(start, end).join('\n');
let out = '';
for (let i = 0; i < raw.length; i++) {
  if (raw[i] === '\\' && i + 1 < raw.length) {
    const n = raw[i + 1];
    if (n === '\\') { out += '\\'; i++; continue; }
    if (n === '"') { out += '"'; i++; continue; }
    if (n === '(') { throw new Error('发现裸 \\( 插值，位置 offset ' + i); }
    out += raw[i]; continue;
  }
  out += raw[i];
}
fs.writeFileSync('_tmp_script.js', out);
try {
  new Function(out);
  console.log('✅ Swift 解析后 JS 语法 OK');
} catch (e) {
  console.log('❌ 语法错误: ' + e.message);
}
const checks = [
  ['translateX', out.includes('translateX')],
  ['matrix 正则', out.includes('matrix\\(([^)]*)\\)')],
  ['overflow-x clip', out.includes('overflow-x: clip')],
  ['__dshBleedAt 通用出血钳制', out.includes('__dshBleedAt')],
];
checks.forEach(([k, v]) => console.log((v ? '✓ ' : '✗ ') + k));
