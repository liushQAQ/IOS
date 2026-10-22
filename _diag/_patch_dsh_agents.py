# -*- coding: utf-8 -*-
# 给 DSH 全局 AGENTS.md 追加「iOS 打包 + 兼容性」章节（追加不覆盖）
import io

P = r"C:\Users\Administrator\.dsh\AGENTS.md"
data = io.open(P, "r", encoding="utf-8", newline="").read()

marker = "# AGENTS.md — DSH 全局工作区规则（本机所有 DSH 会话必读）"
assert marker in data

section = """
## 📦 iOS 打包与兼容（2026-10-21 老总令追加，DSH 有时也执行 iOS 打包，必读）

老总令原话：「不单单说记忆，要有文件支撑，切换了其他 AI 也知道如何处理，不犯同样错误」；
「重复问题不要出现——已要求处理什么问题、如何解决的，之后更新版本不要还出现」；
「iOS16-15-14 低版本和高版本兼容问题是大问题，要沉淀记忆和文档」。

1. **打包禁令（最高优先级）**：`gh workflow run` 默认禁止（曾致封号）；
   **仅老总当场明令「打包」才可触发一次**，用后恢复禁令；判成败看 `gh run list`，不能看 stdout 判空。
2. **打包前置**：回归闸门全绿 + 凭证 `_diag/gate-result.json` 随仓库提交（CI 硬校验
   `sourceHash`/`version`，改完代码必须重跑闸门）。
3. **全流程 10 步与排障表**：见 `E:\\desktop\\所有skill\\deepseek-harness-desktop\\AGENTS.md`（本目录 DSH 工作区）。
4. **权威文档（iOS 仓库 `E:\\desktop\\所有skill\\deepseek-harness-ios\\`）**：
   - `AGENTS.md` —— 防复发四铁律 + 强制流程 + 排障速查；
   - `REGRESSION.md` —— R01~R20 问题清单（症状/真因/解法/校验）+ 14 条编码铁律 + 发版 SOP；
   - `IOS_COMPATIBILITY.md` —— **iOS 14/15/16+ 兼容矩阵 + C1~C8 兼容铁律 + 发版前 10 项自检清单**
     （lookbehind 白屏 / ITP / 弹窗丢失 / JS shim 死亡 / 原生层盲区 / 老机型性能 / 巨魔安装 / 死循环连坐）。
5. **重复问题零容忍**：修完任何问题必须 ① REGRESSION.md 加 R 条目 ② 涉 iOS 版本差异的加
   IOS_COMPATIBILITY.md C 条目 ③ 发版前逐条自检 R01~R20 会不会复发。发版前第 7 项自检是硬卡口。
6. **快查红线**：① 任何 DSH 地址加载禁传 `markAsDSHService:false`（R18 原生 +59 惨案）；
   ② dsh-anywhere 改写器白名单必须含 `[`（R10 白屏惨案）；③ 改文件禁脚本文本重写（CRLF 毁档）；
   ④ 查网关/本地服务前必清代理环境变量（502/404 假象）。
"""

if "iOS 打包与兼容" not in data:
    data = data.replace(marker, marker + "\n" + section, 1)
    nl = "\r\n" if data.count("\r\n") > (data.count("\n") - data.count("\r\n")) else "\n"
    io.open(P, "w", encoding="utf-8", newline="").write(data)
    d = io.open(P, "rb").read()
    print("appended, CRLF:", d.count(b"\r\n"), "LF-only:", d.count(b"\n") - d.count(b"\r\n"), "size:", len(d))
else:
    print("already present, skip")
