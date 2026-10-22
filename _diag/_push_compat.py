# -*- coding: utf-8 -*-
import io, base64, json, subprocess

p = r"E:\desktop\所有skill\deepseek-harness-ios\AGENTS.md"
data = io.open(p, "r", encoding="utf-8", newline="").read()
old = "| `交接_已知问题清单_2026-10-11.md` | 早期交接快照 | 仅考古；与 REGRESSION.md 冲突时以后者为准 |"
new = old + "\n| **`IOS_COMPATIBILITY.md`** | iOS 14/15/16+ 兼容矩阵 + C1~C8 兼容铁律 + 发版前 10 项自检 | 涉版本兼容/发版前必读 |"
assert data.count(old) == 1
data = data.replace(old, new)
nl = "\r\n" if data.count("\r\n") > (data.count("\n") - data.count("\r\n")) else "\n"
io.open(p, "w", encoding="utf-8", newline="").write(data)

def put(path, sha=None, msg=""):
    d = open(path, "rb").read()
    body = json.dumps({"message": msg, "content": base64.b64encode(d).decode(),
                       "branch": "personal", **({"sha": sha} if sha else {})})
    r = subprocess.run(["gh", "api", "-X", "PUT",
                        "repos/liushQAQ/IOS/contents/" + path, "--input", "-"],
                       input=body.encode(), capture_output=True)
    print(path, "->", "OK" if r.returncode == 0 else "FAIL", r.stderr.decode()[:150])

put("IOS_COMPATIBILITY.md", None,
    "docs: iOS 14/15/16+ 兼容性沉淀 —— 兼容矩阵 + C1~C8 兼容铁律 + 发版前 10 项自检 (老总令 2026-10-21)")
