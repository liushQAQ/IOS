# AGENTS.md — AI 接手本项目必读（任何 AI、任何会话，先读完本文件再动手）

> 立规：2026-10-20 老总令 ——「不单单说记忆，要有文件支撑，切换了其他 AI 也知道如何处理，不犯同样错误。」
> 本文件是仓库内的**强制入口**。与记忆/聊天记录冲突时，**以本文件与 REGRESSION.md 为准**。

---

## 0. 三份必读文件（按顺序）

| 文件 | 内容 | 何时读 |
|---|---|---|
| **本文** `AGENTS.md` | 铁律 + 强制流程 + 排障速查 | 动手前必读 |
| **`REGRESSION.md`** | R01~R20 问题清单（症状/真因/解法/校验）+ 编码铁律 + 发版 SOP | 修复任何问题前，先查有没有重复案例 |
| `交接_已知问题清单_2026-10-11.md` | 早期交接快照 | 仅考古；与 REGRESSION.md 冲突时以后者为准 |

---

## 1. 项目一句话

`DSHios` = DeepSeek Harness 桌面端（3083 dsh-anywhere 代理）的 iOS 薄壳（WKWebView）。
**改动只进 iOS App 侧（`DSHios/*.swift`，主要是 `ViewController.swift` 的 `iosCompatShims`/css 数组）；DSH 电脑端前端 100% 官方，绝不改。**

---

## 2. 四条防复发铁律（2026-10-20 v1.0.130 定案，老总明令）

1. **「沙箱绿、真机错」→ 第一步做真机截图逐条带像素对拍**（找 ≥2 个独立基准条带解位移），先归因**页面层还是原生层**，绝不连改多版页面层碰运气。
   惨案：v1.0.125~129 连续四版修页面层全部打不中，真凶在原生层（R18）。
2. **页面归属标记 `isCurrentServiceDSH` 是红线**：任何 `loadURLString` 对 DSH 地址传 `markAsDSHService:false` 一律禁止；新增加载入口必须继承归属（`isCurrentServiceDSH ?? true`）或先过 `isOwnServicePage`。
   惨案：重试按钮/清缓存重载写坏标记 → DSH 页被当外部网页 → 整个 WebView 被原生下移 59pt（R18）。
3. **改代码必须重跑闸门出新凭证**（CI 硬校验 `sourceHash`/`version`）；改文件**一律二进制读写或 AI 编辑工具**——脚本文本模式会把 CRLF 转 LF 毁全文件。
4. **「整页/整块平移」类问题先查原生层**（`updateTopSafeAreaFor`、约束、contentInset、scrollView），闸门永远测不出原生位移。

其余编码铁律（禁哈希类名、禁单点补丁、禁 margin 推回、JS 正则 `\(` 双写等 14 条）见 **REGRESSION.md 第四节**。

---

## 3. 强制流程（跳步 = 打包被 CI 拒）

```
改代码（Swift 二进制读写/编辑工具，严禁脚本文本重写）
  → python _diag/_extract_js.py && node --check _diag/app_inject.js   # 若改了注入代码
  → node _diag/regression.js                                          # 闸门，需 3083 在线
  → 全绿写 _diag/gate-result.json（凭证）
  → 逐文件 git add（禁目录通配）→ commit + push
  → CI「Verify regression gate」硬校验 → 打包
```

- 闸门环境前置：DSH Desktop 必须在线（3083），**只能计划任务拉起** `Start-ScheduledTask -TaskName "DSHDesktop-Launch"`（沙箱内直接启动一律被回收）。
- 跑任何本地 HTTP/Playwright 化验前**必清代理环境变量**（否则 127.0.0.1 全 404/502，把代理污染误判成服务挂了）。
- 打包：**禁 `gh workflow run`，仅老总当场明令才可例外一次，用后恢复禁令**（曾封号）。

---

## 4. 排障速查

| 症状 | 定位 | 处置 |
|---|---|---|
| 真机乱但沙箱全绿 | 原生层（铁律 1/4） | 真机截图逐条带对拍 → 查 `updateTopSafeAreaFor`/归属标记 |
| 整页/整块平移 N pt | 原生 `webViewTopConstraint`/contentInset | 查归属标记是否被写坏（R18） |
| 下载网关 502 | dshstat(9071) 死了 | `Start-ScheduledTask -TaskName "DSH-Stat-Server"`（R20） |
| 3083 无响应 | DSH Desktop 挂了 | `Start-ScheduledTask -TaskName "DSHDesktop-Launch"`，等 15~20 秒 |
| CI exit 65 | Swift 多行字符串 JS `\(` 转义 | 双写 `\\(` 或不用正则（REGRESSION.md 铁律 8） |
| CI 校验凭证被拒 | 凭证过期/sourceHash 不符 | 重跑闸门 |
| 会话页 evaluate 挂死 | DSH 前端死循环（连坐，非 App 回归） | 闸门已有 30s 哨兵 + 18 分钟看门狗；重启 DSH（指纹会变） |

---

## 5. 版本与发版记录

版本台账（R01~R20 每问题的版本归属）、CI run 号、tipa md5 —— 全在 **REGRESSION.md 第六、八节**。
发布产物：`releases/`（全历史保留，严禁覆盖）；在线清单：`releases/latest.json`（App 内检测更新读它）。
统计网关源码：`E:\desktop\所有skill\dsh-stat\stat_server.py`（9071，Tailscale Funnel 8443 对外）。

---

*最后更新：2026-10-20 · v1.0.130(74) · 老总真机验收通过*
