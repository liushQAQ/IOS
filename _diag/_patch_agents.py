# -*- coding: utf-8 -*-
import io

p = r"E:\desktop\所有skill\deepseek-harness-ios\AGENTS.md"
data = io.open(p, "r", encoding="utf-8", newline="").read()
old = "*最后更新：2026-10-20 · v1.0.130(74) · 老总真机验收通过*"
line1 = "> 🤝 本规程对 **DSH 侧 AI 同样生效**：DSH 有时也执行 iOS 打包（老总 2026-10-21 令），"
line2 = "> 交接卡副本已放 DSH 工作区 E:\\desktop\\所有skill\\deepseek-harness-desktop\\AGENTS.md，双方必须遵守同一套禁令与流程。"
new = line1 + "\n" + line2 + "\n" + old
assert data.count(old) == 1
nl = "\r\n" if data.count("\r\n") > data.count("\n") - data.count("\r\n") else "\n"
io.open(p, "w", encoding="utf-8", newline="").write(data.replace(old, new.replace("\n", nl)))
d = io.open(p, "rb").read()
print("patched, CRLF:", d.count(b"\r\n"), "LF-only:", d.count(b"\n") - d.count(b"\r\n"))
