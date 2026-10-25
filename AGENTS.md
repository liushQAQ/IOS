# AGENTS.md — AI 接手本项目必读（任何 AI、任何会话，先读完本文件再动手）

> 立规：2026-10-20 老总令 ——「不单单说记忆，要有文件支撑，切换了其他 AI 也知道如何处理，不犯同样错误。」
> 本文件是仓库内的**强制入口**。与记忆/聊天记录冲突时，**以本文件与 REGRESSION.md 为准**。

---

## 0. 必读文件（按顺序）

| 文件 | 内容 | 何时读 |
|---|---|---|
| **本文** `AGENTS.md` | 铁律 + 强制流程 + 排障速查 | 动手前必读 |
| **`REGRESSION.md`** | R01~R20 问题清单（症状/真因/解法/校验）+ 编码铁律 + 发版 SOP | 修复任何问题前，先查有没有重复案例 |
| `交接_已知问题清单_2026-10-11.md` | 早期交接快照 | 仅考古；与 REGRESSION.md 冲突时以后者为准 |
| **`IOS_COMPATIBILITY.md`** | iOS 14/15/16+ 兼容矩阵 + C1~C8 兼容铁律 + 发版前 10 项自检 | 涉版本兼容/发版前必读 |
| **`PLUGIN_LAYOUT_RULES.md`** | 插件 UI 布局规范（会话框禁占区 / 六条绝对禁止 / 四个合规落点 / 四条机械自检） | **只要动到插件 UI 或 composer 区域，先读这份** |

---

## 1. 项目一句话

`DSHios` = DeepSeek Harness 桌面端（3083 dsh-anywhere 代理）的 iOS 薄壳（WKWebView）。
**改动只进 iOS App 侧（`DSHios/*.swift`，主要是 `ViewController.swift` 的 `iosCompatShims`/css 数组）；DSH 电脑端前端 100% 官方，绝不改。**

---

## 2. 五条防复发铁律（2026-10-20 / 2026-10-23 老总明令）

1. **「沙箱绿、真机错」→ 第一步做真机截图逐条带像素对拍**（找 ≥2 个独立基准条带解位移），先归因**页面层还是原生层**，绝不连改多版页面层碰运气。
   惨案：v1.0.125~129 连续四版修页面层全部打不中，真凶在原生层（R18）。
2. **页面归属标记 `isCurrentServiceDSH` 是红线**：任何 `loadURLString` 对 DSH 地址传 `markAsDSHService:false` 一律禁止；新增加载入口必须继承归属（`isCurrentServiceDSH ?? true`）或先过 `isOwnServicePage`。
   惨案：重试按钮/清缓存重载写坏标记 → DSH 页被当外部网页 → 整个 WebView 被原生下移 59pt（R18）。
3. **改代码必须重跑闸门出新凭证**（CI 硬校验 `sourceHash`/`version`）；改文件**一律二进制读写或 AI 编辑工具**——脚本文本模式会把 CRLF 转 LF 毁全文件。
4. **「整页/整块平移」类问题先查原生层**（`updateTopSafeAreaFor`、约束、contentInset、scrollView），闸门永远测不出原生位移。
5. 🔴 **插件永不占会话框、永不压缩原生按钮空间**（2026-10-23 老总令，规范见 `PLUGIN_LAYOUT_RULES.md`）：
   - 任何插件（含第三方）不许在 `composerStack` 卡片内加 UI、不许改原生容器宽度给它腾位置、不许用 `transform`「视觉上移」假装搬走（**它仍然占布局宽度**）。
   - `transform` 搬位是本项目两次真机翻车的同一根因（89→90 模型按钮悬浮、90→91 全会话框错乱），**永久禁止**。
   - 插件要 UI 只能去 `PLUGIN_LAYOUT_RULES.md` 第 3 节的四个合规落点（**P1 会话 tab 栏 = 「对话 / 轨迹 / 系统监控」那一行的右侧** / P2 卡片下方 dock / P3 面板 / P4 独立浮层）。
   - 🔴 **tab 栏是插件地盘**（老总 2026-10-23 12:01）：「轨迹 / 系统监控 就是 dsh 插件（dsh-system-monitor-plugin）生成的，不是官方原生按钮」。tab 栏由 `conversation.view` 槽的注册项渲染，插件往里放东西**不需要官方 slot**；做法是组件里 `ReactDOM.createPortal(胶囊, document.querySelector('[data-conversation-tabs]'))`，锚点只用这个 `data-*` 稳定属性，不用哈希类名。
   - 🔴 **位置归插件，App 只做兜底**：插件已能自己进 tab 栏时，shim **必须退出**（`pickers()` 返回空），否则 App 再 `fixed` 一次等于把 tablist 里的元素拽出来。92/93/94 三次翻车同一根因。原生按钮（`ofTiQG` / 权限 / 语音 / 齿轮 / 发送）**一个都不许动**，它们是会话框的整体原生部分。
   - 🔴 **会话框底排原生按钮零干预**（老总 2026-10-23 12:33 最后强调：「会话框底原生的 + 完全权限 和 模型选择按钮。不是悬浮，是和会话框一体的」）：`＋ / 完全权限 / 模型选择器 / 语音 / 齿轮 / 发送` 六个按钮**不许写 inline `position` / `transform`（哪怕 2px）/ `width` / `padding` / `margin` / `background` / `border`**。唯一允许的是 `flex:0 1 auto` 防溢出收缩；`alignComposerButtons` 已停用（它写 `translateY !important` 正是「悬浮感」来源，停用后官方 flex 实测行内离散仍为 **0px**）。闸门有机械断言 `[会话框] 原生按钮零干预`。
   - App 侧发现新插件违规：**只做清占位的隔离，不许帮它搬位**。
   - 🔴 **两端都要改**（老总 2026-10-23 明令）：「不只是说改 iOS 端，电脑端也修改在这个位置，任何自建本来占用会话框插件都改」。
     插件源码侧禁 `conversation.input.*` 全系，推荐 `conversation.session.header.actions`；
     shim 侧一旦插件自己合规，**必须同步退出**（从 `KNOWN`/`sels`/`releaseHijack` 移除），否则双方互删互插。
   - **面向玩家的长期文本**：规范必须同步出现在 App 内（设置页底部「🔴 插件布局规范（所有玩家必读）」），
     不能只写在仓库 README ——「也要告诉他们」。

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
| git push SSL handshake 失败（curl/gh 却通） | 代理节点掐 git 的 TLS 特征（2026-10-20 晚实锤，8 连败） | 重试数轮；仍败改用 gh api Contents API 单文件推送（PUT repos/<o>/<r>/contents/<path>，带 sha + branch），推完记下远端 HEAD，网络恢复后 git fetch && git reset --hard origin/personal 对齐 |

---

## 5. 版本与发版记录

版本台账（R01~R20 每问题的版本归属）、CI run 号、tipa md5 —— 全在 **REGRESSION.md 第六、八节**。
发布产物：`releases/`（全历史保留，严禁覆盖）；在线清单：`releases/latest.json`（App 内检测更新读它）。
统计网关源码：`E:\desktop\所有skill\dsh-stat\stat_server.py`（9071，Tailscale Funnel 8443 对外）。

🔴 **顶栏 / 会话框布局铁律（2026-10-23 老总令，永久）**：
1. **顶栏每多一个模块，必须重新分配一次宽度**。凡是「给谁让位」的留白，一律走
   `--dsh-head-right` 这类**实测变量 + 兜底默认值**，严禁写死像素（`right: 96px` 这类
   在「今天刚好」之后必然翻车 —— 右侧一加「智能体团队 / 任务运行中」就压住标题）。
2. **两个互相推导的宽度变量必然死锁**。右侧模块的上限必须独立给定（现为 30vw），
   不许写成 `calc(var(--dsh-head-right) - Npx)`（实测四档恒差 14px 重叠，无解）。
3. **横向排列的模块先 `nowrap`，再谈省略**。`white-space: normal` 的 flex 子项被压缩时
   不是出省略号，而是**竖排**（「轨迹」「系统监控」被压成两行就是这个）。
4. 会话框底排原生按钮（＋ / 完全权限 / 模型 / 语音 / 齿轮 / 发送）**零干预**：
   禁止 inline `position`/`transform`/`width`/`padding`/`margin`。闸门有机械断言。
5. 🔴 **几何校正的短路条件，绝不能用「目标值未变」当判据**（v1.0.131(96) 血案）。
   目标是常数（`want = sb-2-shift` 恒 27）时条件恒真 → 短路永久命中 →
   把首帧（往往是加载中途的脏数据）焊成永久状态。95 因此把顶栏锁死在 -12。
   判据必须是**实测残差**（"现在对不对"），不是"我想要的变没变"。
6. 🔴 **「不跳」和「自愈」必须同时成立，唯一正解是「不清属性 + 增量补偿」**：
   ```js
   var target = curMt + (want - cur);              // 在现有 margin 上补残差
   if (Math.abs(target - curMt) <= 0.5) return;    // 已对齐 → 一个属性都不碰
   ```
   禁止 `removeProperty` 后再量（94 每轮这么干 → 裸奔帧 → 整页上下跳）；
   禁止按「目标未变」直接 return（95 这么干 → 位置焊死）。
7. **改完必须同条件 A/B 对照**（94 vs 95 vs 96 同一浏览器、同一操作序列）。
   单看"有没有重叠"会漏掉位置偏移 —— 这次就是靠 `titleRow.y` 的 35 vs -4 那 39px 揪出来的。
详见 `REGRESSION.md` R27 / R28 / R29、`PLUGIN_LAYOUT_RULES.md`。

---

> 🤝 本规程对 **DSH 侧 AI 同样生效**：DSH 有时也执行 iOS 打包（老总 2026-10-21 令），
> 交接卡副本已放 DSH 工作区 E:\desktop\所有skill\deepseek-harness-desktop\AGENTS.md，双方必须遵守同一套禁令与流程。
*最后更新：2026-10-25 · v1.0.140(待打包) R43 抽屉按钮/顶栏六犯根治（真凶=R41 补丁自身：屏外簇平移幽灵按钮 + stripChrome 不透明底色盖死顶栏 + 负 margin 无裁剪保护；四件套=屏外容器零平移/底色透明/顶栏活命自愈/拉力封顶）· v1.0.139(109) 已发（R42 启动预热）· 🔴 网关 dsh-anywhere 缓存补丁因真机黑屏已回滚（_pcf=121b 击穿恢复；根因「双 URL 缓存混载」待复现，重上前必须过混载免疫验证）；R41 抽屉出屏五犯/顶排高度锁定/防闪烁见 1.0.138(108)；1.0.138(108) / 1.0.137(106) 均保留不动*
