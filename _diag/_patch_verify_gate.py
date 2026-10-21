# -*- coding: utf-8 -*-
# v1.0.131: verify_gate 锚点白名单扩展 —— headerCorner 与 pageHead 同为会话页死循环连坐类
import sys
sys.stdout.reconfigure(encoding='utf-8')
P = r'E:/desktop/所有skill/deepseek-harness-ios/_diag/verify_gate.py'
d = open(P, 'rb').read()
CRLF = b'\n'  # 该文件为 LF（CI python3 跑）

old = (
    b'    if dead:\n'
    b'        # v1.0.129'
)
assert d.count(old) == 1, 'start anchor %d' % d.count(old)
i = d.find(old)
j = d.find(b'print("::warning::pageHead', i)
assert j > 0, 'end anchor'
k = d.find(b'\n', j) + 1

new = (
    b'    if dead:\n'
    b'        # v1.0.129\uff1apageHead \u53ea\u5728\u63d2\u4ef6\u5217\u8868\u9875\u5b58\u5728\u3002\u4f1a\u8bdd\u9875\u6b7b\u5faa\u73af \u2192 \u63d2\u4ef6\u9875\u8fdb\u4e0d\u53bb \u2192 \u8be5\u951a\u70b9\u53d6\u4e0d\u5230\u6837\u3002\n'
    b'        # v1.0.131\uff1a\u540c\u4e3a\u61d2\u6302\u8f7d\u951a\u70b9\u7684 headerCorner\uff08\u4f1a\u8bdd\u9875\u9876\u89d2\uff09\u4e5f\u4f1a\u88ab\u540c\u4e00\u6b7b\u5faa\u73af\u8fde\u5750\uff08\u96f6\u6ce8\u5165\u88f8\u9875\u9762\u540c\u6837\u590d\u73b0\uff0c\n'
    b'        # Chromium \u76f4\u8fde\u5bf9\u7167\u786e\u8ba4 DOM \u5728\uff09\u3002\u653e\u884c\u6761\u4ef6\u6536\u7d27\u4e3a\uff1adead \u5168\u90e8\u5c5e\u4e8e\u767d\u540d\u5355\u4e14 blocked \u91cc\u9010\u4e2a\u6709\u5bf9\u5e94\u767b\u8bb0\uff1b\n'
    b'        # \u5176\u5b83\u4efb\u4f55\u951a\u70b9\u5931\u6548\u7167\u6837\u786c\u62d2\uff08\u90a3\u662f\u771f\u7684 DSH \u6539\u7248\u3001\u8865\u4e01\u9759\u9ed8\u5931\u6548\uff09\u3002\n'
    b'        allow = {"pageHead", "headerCorner"}\n'
    b'        blk_txt = " ".join([str(x) for x in (g.get("blocked") or [])])\n'
    b'        if not (set(dead) <= allow and all(a in blk_txt for a in dead)):\n'
    b'            die("\u5173\u952e\u951a\u70b9\u5931\u6548\uff1a%s" % ", ".join(dead))\n'
    b'        print("::warning::\u951a\u70b9\u65e0\u6cd5\u53d6\u6837\uff08\u4f1a\u8bdd\u9875\u6b7b\u5faa\u73af\u8fde\u5750\uff0cblocked \u5df2\u767b\u8bb0\uff09\uff1a" + ", ".join(dead))\n'
)
out = d[:i] + new + d[k:]
open(P, 'wb').write(out)
print('patched', len(out))
import subprocess
r = subprocess.run([r'C:/Users/Administrator/.workbuddy/binaries/python/versions/3.13.12/python.exe', P], capture_output=True, text=True, cwd=r'E:/desktop/所有skill/deepseek-harness-ios')
print('local verify:', r.returncode)
print(r.stdout[-600:])
print(r.stderr[-300:] if r.stderr else '')
