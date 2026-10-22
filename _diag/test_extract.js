/* 闸门场景 F 抽取逻辑单测（与 regression.js 中实现逐字一致） */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const swiftLines = fs.readFileSync(path.join(DIR, '..', 'DSHios', 'ViewController.swift'), 'utf8').split(/\r?\n/);
const unesc = (s) => s.replace(/\\\\/g, '\\').replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
let probe = null;
for (let i = 0; i < swiftLines.length && !probe; i++) {
  if (swiftLines[i].trim() !== '"""') continue;
  if (!/v1\.0\.129 整页滚动锁/.test(swiftLines.slice(Math.max(0, i - 30), i).join('\n'))) continue;
  const buf = [];
  for (let j = i + 1; j < swiftLines.length; j++) {
    const t = swiftLines[j].trim();
    if (t === '"",') { probe = unesc(buf.join('\n')); break; }
    buf.push(swiftLines[j]);
  }
}
console.log(probe ? 'OK ' + probe.length + 'B' : 'EXTRACT FAIL');
if (probe) {
  try { new Function(probe); console.log('parse OK'); } catch (e) { console.log('parse FAIL: ' + e.message); }
}
