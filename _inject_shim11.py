# -*- coding: utf-8 -*-
"""把 _shims/shim_11.js 正向写回 ViewController.swift 的 iosCompatShims 第 11 块。
定位方式：找包含 `window.__dshTopShift = 18;` 的那个三引号块（全局唯一）。
转义：反斜杠 -> 双反斜杠；双引号 -> 反斜杠+双引号（Swift 多行字符串合法且安全）。
写完后用 _extract_shims.py 反向抽回，逐字节比对，确保无损。
"""
import io, re, sys, os, shutil, hashlib

SRC = r"E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift"
JS = r"E:/desktop/所有skill/deepseek-harness-ios/_shims/shim_11.js"

js = io.open(JS, encoding="utf-8").read().rstrip("\n")
swift_text = io.open(SRC, encoding="utf-8").read()

start = swift_text.index("static let iosCompatShims: [String] = [")
end = swift_text.index("\n    ]", start)
body = swift_text[start:end]

# 找所有 """\\n ... \\n   \"\"\" 块，记录起止
pat = re.compile(r'"""\n(.*?)\n(\s*)"""', re.DOTALL)
blocks = list(pat.finditer(body))
print("blocks in shims:", len(blocks))

target = None
for m in blocks:
    if "window.__dshTopShift = 18;" in m.group(1):
        target = m
        break
if target is None:
    print("FATAL: 找不到含 window.__dshTopShift = 18 的块")
    sys.exit(1)

indent = target.group(2)          # 结尾 """ 的缩进
content = target.group(1)

# 反向校验：现有块能否还原出当前 shim_11.js（除缩进差异）—— 只提示，不阻断
def unescape(s):
    out = []; i = 0
    while i < len(s):
        c = s[i]
        if c == "\\" and i + 1 < len(s):
            n = s[i + 1]
            if n == "\\": out.append("\\"); i += 2; continue
            if n == '"': out.append('"'); i += 2; continue
            if n == "n": out.append("\n"); i += 2; continue
            if n == "t": out.append("\t"); i += 2; continue
            if n == "r": out.append(""); i += 2; continue
        out.append(c); i += 1
    return "".join(out)

old_js = unescape(content)
print("old block bytes:", len(old_js), " new js bytes:", len(js))
print("old sha1:", hashlib.sha1(old_js.encode()).hexdigest()[:12])
print("new sha1:", hashlib.sha1(js.encode()).hexdigest()[:12])

# 转义新内容
esc = js.replace("\\", "\\\\").replace('"', '\\"')

new_block = '"""\n' + esc + '\n' + indent + '"""'
new_body = body[:target.start()] + new_block + body[target.end():]
new_swift = swift_text[:start] + new_body + swift_text[end:]

shutil.copyfile(SRC, SRC + ".bak_shim11")
io.open(SRC, "w", encoding="utf-8", newline="\n").write(new_swift)
print("written OK, backup -> ViewController.swift.bak_shim11")
