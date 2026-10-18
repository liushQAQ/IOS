# -*- coding: utf-8 -*-
'''把 _shims/shim_NN.js 批量正向写回 ViewController.swift 的 iosCompatShims。

逻辑：
  1. 按顺序切出 iosCompatShims 里的每一个 """...""" 块；
  2. 用 _extract_shims_env.py 同款 unescape 还原成 JS，与 _shims/shim_NN.js 逐字节比较；
  3. 只替换「不一致」的块（其余原样保留，格式一字不动）；
  4. 转义：\\ -> \\\\、\" -> \\\"；写完打印每个块的 old/new sha1。

用法：python _inject_shims.py            # 只报差异，不写
      python _inject_shims.py --apply    # 真正写入（自动备份 .bak_shims）
'''
import io, re, os, sys, shutil, hashlib

ROOT = r"E:/desktop/所有skill/deepseek-harness-ios"
SRC = os.path.join(ROOT, "DSHios/ViewController.swift")
SHIM_DIR = os.path.join(ROOT, "_shims")
APPLY = "--apply" in sys.argv


def swift_unescape(s):
    out = []
    i = 0
    while i < len(s):
        c = s[i]
        if c == '\\' and i + 1 < len(s):
            n = s[i + 1]
            if n == '\\': out.append('\\'); i += 2; continue
            if n == '"': out.append('"'); i += 2; continue
            if n == 'n': out.append('\n'); i += 2; continue
            if n == 't': out.append('\t'); i += 2; continue
            if n == 'r': out.append(''); i += 2; continue
        out.append(c); i += 1
    return ''.join(out)


def block_to_js(b):
    """与 _extract_shims_env.py 完全一致的还原逻辑"""
    raw_lines = b.split('\n')
    quoted = [re.match(r"^(\s*)'(.*)',?$", ln) for ln in raw_lines]
    if quoted and all(m or not ln.strip() for m, ln in zip(quoted, raw_lines)):
        indents = [len(m.group(1)) for m in quoted if m]
        base = min(indents) if indents else 0
        lines = []
        for m, ln in zip(quoted, raw_lines):
            lines.append('' if not m else m.group(1)[base:] + m.group(2))
        return swift_unescape('\n'.join(lines))
    return swift_unescape(b)


text = io.open(SRC, encoding="utf-8").read()
start = text.index("static let iosCompatShims: [String] = [")
end = text.index("\n    ]", start)
body = text[start:end]

pat = re.compile(r'"""\n(.*?)\n(\s*)"""', re.DOTALL)
blocks = list(pat.finditer(body))
print("blocks in swift:", len(blocks))

files = sorted(f for f in os.listdir(SHIM_DIR) if re.match(r'^shim_\d+\.js$', f))
print("shim files:", len(files))

diffs = []
for i, m in enumerate(blocks):
    name = "shim_%02d.js" % i
    fp = os.path.join(SHIM_DIR, name)
    if not os.path.exists(fp):
        print("  !! missing", name)
        continue
    cur_js = block_to_js(m.group(1))
    want_js = io.open(fp, encoding="utf-8").read()
    same = (cur_js == want_js)
    if not same:
        diffs.append((i, m, name, cur_js, want_js))
    print("  [%02d] %-12s %s  swift=%d  file=%d" % (
        i, name, "SAME" if same else "DIFF", len(cur_js), len(want_js)))

if not diffs:
    print("no diff, nothing to do")
    sys.exit(0)

print("\ndiff blocks:", [d[2] for d in diffs])
if not APPLY:
    print("dry-run only. add --apply to write.")
    sys.exit(0)

new_body = body
for i, m, name, cur_js, want_js in reversed(diffs):
    indent = m.group(2)
    esc = want_js.replace("\\", "\\\\").replace('"', '\\"')
    new_block = '"""\n' + esc + '\n' + indent + '"""'
    new_body = new_body[:m.start()] + new_block + new_body[m.end():]

new_swift = text[:start] + new_body + text[end:]
shutil.copyfile(SRC, SRC + ".bak_shims")
io.open(SRC, "w", encoding="utf-8", newline="\n").write(new_swift)
print("written OK -> backup ViewController.swift.bak_shims")
for i, m, name, cur_js, want_js in diffs:
    print("  %s  old=%s new=%s" % (name,
          hashlib.sha1(cur_js.encode()).hexdigest()[:12],
          hashlib.sha1(want_js.encode()).hexdigest()[:12]))
