# DSH iOS 适配 · 问题清单与防复发校验规程

> 立规：2026-10-20 老总令 —— 「重复修复重复问题，那意义在哪里？要列个问题清单：已解决、如何解决、下个版本要校验有没有出现重复问题。」
> **本文件是发版必读。每次出包前，必须照「三、校验 SOP」跑一遍。**

---

## 一、为什么老问题会反复出现（根因，实测不是猜测）

DSH 是第三方闭源前端，我们只能在 App 侧靠注入 CSS/JS 打补丁。**补丁绑在什么东西上，决定了它会不会复发。**

实测（2026-10-20，`_diag/hash_authority.js`）：

| 项目 | 实测值 |
|---|---|
| App 里写死的 CSS Module 哈希类名 | **102 个** |
| 当前 DSH 版本前端资源里**仍存在**的 | 40 个 |
| 当前 DSH 版本前端资源里**彻底消失**的 | **62 个（≈61%）** |

判定方法是扫「实际加载的 CSS + JS 文本」（20.6 MB）而不是某一刻的 DOM —— 只要类名在资源文本里彻底不存在，任何页面状态都救不回来。**六成补丁一直在空转，而且不报任何错。**

所以「修过又复发」= **三层原因叠加**：

1. **锚点层**：补丁写死哈希类名（`ank0OG_headerCorner`、`uWtHQG_add`、`CZPbNW_sidebarCol`…），DSH 每次换版哈希整体漂移 → 选择器静默失效、修复归零。
2. **方法层**：只做单点补丁（1.0.122 仅把顶栏那一个按钮推回 8px），DSH 换个元素就复发。
3. **流程层**：没有发版前机械校验，修没修好、有没有复发全靠老总肉眼发现 —— **复发成本全压在使用者身上**。

**治本三件事**（v1.0.124 起全部落地）：锚点换不变量 → 补丁通用化 → 建立回归闸门。

---

## 二、问题清单（已解决 · 根因 · 解法 · 校验断言）

状态：✅ 已解决并纳入闸门 / ⚠️ 已解决但未纳入闸门（需人工核对）

| # | 症状（老总原话） | 真因 | 解法 | 校验断言（regression.js） |
|---|---|---|---|---|
| R01 | 「打开左侧侧边栏，文字超出侧边栏宽度」 | 抽屉被 App 压到 252px，DSH 内部仍按原生 280px 排布 → 90 个元素右界越界被 `overflow:hidden` 硬裁 | 逐层 `max-width:100%` + `min-width:0` + 单行省略号 | `[抽屉] 内部零出血` |
| R02 | 「设置按钮超出侧边栏范围」 | 齿轮原先以账号行右界 `ar.right`(270) 为基准，超出抽屉 252 | 改以「账号行右界」与「抽屉右界」中**更靠内**者为基准（v1.0.9） | `[齿轮] 位置在抽屉内` |
| R03 | 「底栏重叠一堆」 | 底栏吸底块右界 280 > 抽屉 252；横向溢出 30 个元素 | 同 R01 | `[底栏] 不超抽屉右界` + `[底栏] 子块零重叠` |
| R04 | 会话框按钮（圆圈 / 方框 / + 号 / 发送大圆钮）不居中 | ① 写死哈希类名 `uWtHQG_add` / `ank0OG_composerSeat`，换版后命中数 **0**；② DSH 原生给发送大圆钮加 `transform: translateY(-2px)`（computed = `matrix(1,0,0,1,0,-2)`）；③ 按钮内边距不等 `2px 6px 3px` | `[class*="composerStack"]` 通用锚点 + 强制 `transform:none` + `padding:0` + 运行期按**中位数**对齐 | `[会话框] N 个按钮中心齐平`（离散 ≤ 0.6px） |
| R05 | 抽屉打开时「设置」点不开（v1.0.124 新增） | DSH 自带费用计量浮层 `.cm-peak-alert`（`position:fixed` / `z-index:9999` / 宽 406px）间歇出现，盖住齿轮 —— 实测 `elementFromPoint` 命中的是 `cm-peak-alert-actions` 而非齿轮 | 抽屉打开期间临时收起该浮层，抽屉关掉立刻还原 | `[齿轮] 中心点可命中自身` |
| R06 | 「任何界面都超出屏幕范围」 | 单点补丁只管一个按钮 | 全页通用钳制：遍历 ≤3000 元素，凡 `right > vw+0.5` 且左边在屏内，一律 `translateX` 推回；**六条安全线**防误伤 | `[主页] 零横向出血` + `[抽屉] 页面零出血` + `[主页] 无横向滚动` |
| R07 | 「装着新版还是溢出」 | 钳制只由 MutationObserver 驱动，页面静止时一次都不跑 | 加 3 秒兜底定时器（只装一次） | 闸门内 `openDrawer` 刻意等 3.4s 跨过定时器再断言 |
| R08 | 设置面板顶部被顶栏盖住 | 顶栏钉 `z-index:1020` > 浮层宿主 1000 | 会话页改 999；有浮层时取 `overlayLayer.zIndex - 1` | 暂未纳入（人工核对） |
| R09 | 预设快捷链接「删除直接报错」 | 删掉预设后 `load()` 又把它补回来 → `deleteRows` 与数据条数不符 → UIKit 抛 `invalid number of rows` | 墓碑机制（删掉的默认条目记进 UserDefaults，补齐时跳过）+ `reloadData` 兜底 + 空态提示 | 暂未纳入（Swift 单测/手点） |
| R10 | iOS 16.3 白屏 | DSH vendor 含 RegExp lookbehind，需 iOS 16.4+ | 电脑端 `proxy.mjs` 通用 lookbehind 改写器（App 侧只探测不改写） | 暂未纳入（需在 16.3 真机） |
| R11 | 9009 等自建网页不能上下滑 | DSH 专用「钉高」补丁越界命中仪表盘 | `fixTop()` 加 `#root` 页面类型守卫 | 暂未纳入 |
| R12 | 顶栏被状态栏压住 | 状态栏高度下发给页面时误除 `UIScreen.scale`，59pt 被缩成 20px | CSS 像素在 `width=device-width` 下等于 pt，不再除 | 暂未纳入 |
| R13 | 「底部模型用量那些重叠」（费用明细 / CPU / 内存 / 会话费用 / 下载 / token 环挤成一行互相盖，真机实拍 CPU 的 CP 被盖） | 插件 dock（`VERcba_dock`）是 `flex/row/nowrap/center` 一行容器，几个插件（cost-meter、系统监控）的部件总宽一超 396px 就互相压 | `[class*="composerStack"] [class*="dock"]` 允许 `flex-wrap:wrap` + 行距 3px | `[dock] 插件行可换行` + `[dock] 部件零重叠` |
| R14 | 插件页左上角「打开目录」按钮压住页面标题、且点不动 | ① fab 挂在 `overlayLayer(z=20)` 里，自身 z 出不了该 context，被 `pageHead(z=999)` 盖住（elementFromPoint 命中页头而非 fab）；② fab(14..52) 与 h1(36..190) 相交 | 页头标题右移 `padding-left:56px` 让位 + 页头降 z 到 19（官方桌面层序：浮层在页头之上） | `[插件页] fab 中心可命中自身` + `[插件页] fab 不压页面标题` |
| R15 | 顶栏离状态栏一大截（标题 y≈122，应 ≈47，差值正好 59） | `fixTop()` 只在找到 `<header>` 时才清 frame 的 `padding-top:env(safe-area-inset-top)`（59px）；一旦某类页面没有 header，59px 无人清，整页下坠 | 新增 `fixTopChrome()` 兜底硬钳制：有 frame 就清 padding、有 centerCol 就把列顶校到 `sbHeight-2-TOP_SHIFT`（幂等绝对值），挂 applySidebarInset + 3 秒定时器 | `[主页] 零横向出血` 间接覆盖；页面类型扩展后补专项断言 |

> 说明：R08~R12 之所以「暂未纳入」，是因为闸门当前跑在 3083 单页面 + 无键盘/无真机低版本环境。
> **下一步补齐方向**：设置面板开合、快捷链接增删改、键盘弹起三态。

---

### R16 顶栏离 iOS 状态栏一大截（v1.0.126 根治）——⚠️ 结论已被 v1.0.130 推翻，见 R18
- 症状：真机会话页顶栏整体下坠，老总：「中间可以停一台航母」。
- 取证：像素级对拍老总截图 vs 沙箱 —— tab 下划线真机 172pt vs 沙箱 113pt，差 58.6pt ≈ 恰好一个状态栏 59。
- 真因（v1.0.126 判定，**只对了一半**）：代理层 dsh-anywhere 给 `[data-mobile-nav="frame"]` 写 `padding-top: env(safe-area-inset-top)`（真机 59 / 沙箱 0）。
- 解法（保留，是必要非充分）：① 代理层删除该规则（dsh-anywhere `1e4c83c`）；② App fixTopChrome 遍历全部 frame 清 padding + margin 改「清-量-设绝对差」幂等算法。
- 校验：闸门 prep 永久注入同款 `padding-top:59px !important` 模拟真机；断言 `[主页]/[会话页] 顶栏顶=39`。
- 🔴 **v1.0.130 复盘**：env padding 只是表象之一，**真正的本源在原生层**（见 R18）——修完 126~129 四版页面层问题依旧，因为谁也没去对拍「页内布局本身对不对」。

### R17 插件详情页「返回」按钮被 fab 压住（v1.0.126 根治）
- 症状：老总：「打开插件按钮，侧边栏和返回按钮还是遮挡」。
- 真因：详情页没有 `<header>` 也没有 pageHead（实测 hdrTop=null），fixTop/fixPageHeadFab 全部提前 return，整页零修复；返回行（x=24..406 y=67..83）被 `[data-mobile-nav="fab"]`（x=14..52 y=47..85）压住左端 28x16。
- 解法：避让做进 fixFab（与 fixFabRows 抢 top 会互相刷掉）—— fab 与顶区全宽行按钮重叠时下移到该行下方 8px。实测 fabTop 47→91，零重叠；列表页布局不变。
- 校验：闸门新增场景 D（进详情页）+ 断言 `[详情页] fab 不压顶区全宽行`。

### R18 顶栏离状态栏「越来越宽」——真凶在原生层（v1.0.130 根治，老总 23:47 真机确认闭环）
- 症状：v1.0.126~129 连修四版，顶栏离状态栏还是一大截，老总：「越来越宽了？？这个解决不了？？？」「不单单说记忆，要有文件支撑，切换了其他 AI 也知道如何处理」。
- 🔴 **决定性取证方法（必学）**：把老总真机截图（1290×2796）与沙箱截图做**逐条带像素对拍**，找 ≥2 个独立基准条带解位移 —— 标题 +59.7 / Tab 文字 +59.3 / Tab 下划线 +61.0，三带位移一致且页内相对布局与沙箱分毫不差 → **整个 WKWebView 被原生层整体下移 59pt，页面层（CSS/JS/env）彻底无辜**。
- 🔴 **教训：125~129 四版全在修页面层，全部打不中** —— 闸门跑在浏览器里，原生层（`webViewTopConstraint` / contentInset / scrollView 位移）**永远测不出**。凡「沙箱绿、真机错」且表现为「整页/整块平移」，第一步查原生约束与归属判据，绝不连改多版页面层碰运气。
- 真凶：`isCurrentServiceDSH` 被写坏成 `false`。污染路径两条：
  ① `retryTapped()` 重试按钮无条件 `loadURLString(current, markAsDSHService: false)` —— 冷启动 PC 未就绪 → 报错页 → 老总点重试 → **重试的对象明明就是 DSH 地址**，归属却被改成 false；
  ② `clearWebCacheAndReload()` 清缓存重载同样写死 false（旧注释还谎称「重载不改变页面归属判定」）。
  → `isOwnServicePage()` 返 false → `updateTopSafeAreaFor()` 把 `webViewTopConstraint.constant = view.safeAreaInsets.top(59)` → 整页下移。
- 连坐：归属 false 期间 `startWhiteScreenDiagnostics()` 白屏诊断直接 return —— 这解释了历史上「sampleRoot 诊断时灵时不灵」。
- 修复 4 处（commit `863930d`）：① retryTapped 继承归属（`isCurrentServiceDSH ?? true`）；② clearWebCacheAndReload 同修；③ `isOwnServicePage` 加 1.8 条：`host == dshServiceHost` 优先于生命周期标记并**自愈掰回 true**；④ `updatePageScrollLock` 收到页内探针 `dshPage=true` 时强制 constraint=0 + 掰正标记（与滚动锁共用「只认页内 DOM」判据，外部网页/9009 仪表盘零影响）。
- 校验：真机截图对拍（方法如上）；闸门加不了原生断言（见「已知边界」），此问题靠**方法与铁律**防复发。
- 🔴 **铁律：任何 `loadURLString` 调用绝不允许对 DSH 地址传 `markAsDSHService:false`**；新增加载入口必须继承归属（`isCurrentServiceDSH ?? true`）或先用 `isOwnServicePage` 判定。

### R19 服务列表缺排序（v1.0.130 交付，commit `6b32de7`）
- 症状：老总：「没有编辑，排序，上移下移最前末尾」。
- 解法：`ServiceStore.move(from:to:)` 持久化；每行右侧 ⇅ 排序 + ✎ 编辑并排按钮；点 ⇅ 或**长按行 0.45s** 弹 actionSheet（上移/下移/移到最前/移到末尾/编辑，首行/末行自动收敛不可用项）。
- 防崩：刷新一律 `reloadData`（与删除同哲学，**绝不增量 moveRow**，杜绝 invalid number of rows 崩溃）。
- 校验：人工手点（原生 UI，闸门够不着）。

### R20 下载网关 502（运维，2026-10-20 晚实锤）
- 症状：`https://liu-gw.tail2a9309.ts.net:8443/dl/*` 全部 502，无 `Server: dshstat` 头。
- 排障链：8443 是 **Tailscale Funnel**（tailscaled 自监听）→ `tailscale serve status` 查后端 → `https://...:8443 → http://127.0.0.1:9071` → `netstat -ano | findstr 9071` 无监听 = dshstat 统计网关死了。
- 解法：`Start-ScheduledTask -TaskName "DSH-Stat-Server"` 拉起（2026-10-20 实测有效）。源码 `E:\desktop\所有skill\dsh-stat\stat_server.py`。
- 🔴 **两个坑**：① 查网关前**必须清代理环境变量**（本地 curl 带代理 → 127.0.0.1/Tailscale 全变 502 假象，这次就中招）；② `DSH-Stat-Keepalive` 曾 9 分钟没自动拉活，原因未明 —— keepalive 失效时手动拉起，别干等。

### R21 DSH「Failed to load plugins」假恢复模式（DSH 侧运维，2026-10-21 01:11 实锤闭环）
- 症状：iOS App 内 DSH 页顶横幅 `Failed to load plugins`，报 `@local/dsh-our-free-model-composer-credits-live: import failed` + `two revs: c96d4e94… / 3d86ce78…`，提示 Open Recovery Mode —— **不是真恢复模式**。
- 根因：当晚 01:13 把 composer-credits 从 A 方案（-live 私有目录热挂载）切换成公开版部署（删了 `profiles/desktop/dsh-our-free-model-composer-credits-live/`，cordis.patch.yml 只留公开版条目），但 **DSH Desktop 进程没重启**（20:11 启动，早于切换）→ 服务器仍按旧模块表发旧 rev bundle（import 已删除的 -live 文件）+ 新 rev bundle（公开版）同时执行 → `duplicate factory registration for "dsh-our-free-model-composer-credits" (bundle executed twice without invalidate?)` → boot 报 1 entry did not activate。
- 定位链：`node --check` 插件源码（OK，排除源码坏）→ grep cordis.patch.yml 现行 vs `.bak-guard-*` 备份（发现 `-live` 注册只在备份里）→ Playwright 清代理实测 3083 抓到 duplicate factory 实锤 → 核对进程 StartTime（20:11）早于 patch 变更（01:13）。
- 解法：杀 DSH Desktop 全部进程 → `Start-ScheduledTask -TaskName "DSHDesktop-Launch"` → 20 秒后 3083 重监听 → 复测 **0 错误、插件面板正常加载**。
- 🔴 **铁律**：凡改动 `profiles/desktop` 下的插件注册（部署/回滚/切换方案/删目录），**必须重启 DSH Desktop**（只走计划任务）；热改 patch 文件不重启 = 新旧 rev 混跑，手机端必现「Failed to load plugins」假恢复模式。App 侧处置：等 DSH 侧重启完，刷新页面即可；若横幅残留用清缓存&重载（v1.0.130 起该入口已继承 DSH 归属，安全）。

### R22 会话页时间线「标题超过两行就互相重叠」（v1.0.131 shim_18 根治）
- 症状：老总 2026-10-21 02:06 截图——对话页时间线（思考/运行命令/工具调用行）标题文本折成两行后，第二行以更浅颜色溢出行盒、压到下一行；单行省略的行完全正常。
- 根因链（四证据闭环）：
  1. 时间线行行盒被 `contain:size layout; height:24px`（ReasoningRow.module.css）**定死高度**；
  2. 行内文字用 TextShimmer 渲染，running 时额外渲染一层「装饰副本」（`span[inert]`，浅灰 `--dsw-alias-label-shimmer` 色——**与截图第二行颜色更浅吻合**）；
  3. ReasoningRow 给 TextShimmer 传的是**字符串** → 副本文字经 `[data-shimmer-text]::after{content:attr(...)}` 渲染，**::after 的继承链（decoration→sweep→highlight→text）上无任何 white-space:nowrap → 副本折行**（真实内容链全程 nowrap+ellipsis 永不折；Playwright webkit 复刻实测副本折行 sweepScrollH 38>20 实锤）；
  4. 副本层靠 `overflow:clip`（iOS<16 不支持）+ `mask-image` + transform 动画裁剪——iOS WebKit 合成层上该组合失效 → 折出来的第二行溢出 24px 行盒压到下一行。
- 排查史（教训）：复刻件在最新 WebKit 不复现（引擎差异）→ 直连 3083 会话页 evaluate 永久挂起（WebKitWebProcess 冻死，R21 指纹仍在）→ 改用 addInitScript+sendBeacon「注入即外传」只抢到 1 帧 → 最终靠**静态逐层拆 DSH 前端 bundle**（dsh-client-ui-chat/primitives 的 module.css + JSX）定案。杀动画 CSS 救不了冻死；3081 有鉴权不能直连。
- 修法（shim_18，进 `DSHios/ViewController.swift` iosCompatShims）：iOS 上整层禁用装饰副本 `span[data-shimmer] > span[inert]{display:none!important}`（只损失扫光动画，顺带减轻合成负担）+ 副本文字 `[data-shimmer-text]{white-space:nowrap!important}` 双保险 + `span[data-shimmer]` 内 `_label/_summaryText/_summary` 兜底钳制。**全用 React 稳定属性锚定，零 CSS Module 哈希类名（6.5 铁律）**；带 isDSH 判据 + 3s 定时器兜底。
- 🔴 **方法论沉淀**：①「真机有、复刻无」时先怀疑**引擎版本差异**（overflow:clip/mask/contain 全是 iOS 版本敏感点）；②会话页 evaluate 冻死是常态，诊断要靠「页面内自采集+外传」或纯静态拆 bundle；③TextShimmer 类「装饰副本」组件是幽灵文字/叠行的高发源——凡见「第二行颜色更浅的重叠文本」先查装饰副本层。

### R23 插件占用会话框 / 压缩原生按钮（v1.0.131 build 89→92 三次翻车，2026-10-23 立规）

- **症状谱**（同一根因的三种表现，全部真机才现）：
  1. 模型选择按钮飞离会话框成悬浮按钮，点击菜单错位重叠（build 89→90 老总报障）；
  2. 会话框所有按钮位置错乱重叠「没眼看」，新建会话模型按钮直接消失（build 90→91 老总两张截图）；
  3. 官方模型选择器只剩 5px 宽、文字标签 0 宽 = 「模型按钮不见了」（build 91→92 老总报障）。
- **根因（三处叠加，全是布局劫持）**：
  1. `dsh-po-capsule`（第三方优化插件）被写 `transform: translate(24px, -85px)` —— **只改绘制位置，仍占工具行 85px 布局宽度**；
  2. `VERcba_standardControls` 被写 `padding-right: 48px` 硬扣工具行宽度；
  3. shim_24 排队引擎把 `dcc-root` / `cm-*` 全部 `position:absolute` + inline `!important` 抢位。
- **为什么闸门测不出**：沙箱**没装** `dsh-po-capsule`，插件元素不存在 → 撑爆工具行的现象永远复现不了。这是本项目「沙箱绿、真机错」最典型的盲区（第二次踩）。
- **修法（build 91）**：三块 shim 全部停注入、引擎 `layout()` 下线、新增 `releaseHijack()` / `releaseCard()` 幂等清旧装机 inline 残留，**布局全权交回 DSH 官方原生 flex**；`fixComposerClamp` 保留（越界安全网，幂等）。
- **修法（build 92，模型按钮最终落点）**：`dcc-root` + `ofTiQG_root` 用 `fixed` 停靠到「顶栏下方 tab 行右侧」（`shim_27`），官方最右、插件在左；fixed 后脱离 flex 压缩，标签自然展开（实测 0 → 110px）；退让逻辑：先量 tab 右缘，放不下整体下移一行；下拉菜单用 `fixMenus()` 每 tick 钉回按钮下方 6px（实测原本跑到 y=413，按钮在 y=83）。
- **🔴 永久规范（老总 2026-10-23 令）**：见 **`PLUGIN_LAYOUT_RULES.md`** ——
  任何插件**永不占用会话框位置、永不压缩原生按钮空间**；禁止用 `transform`「视觉上移」假装搬走（仍占布局宽度）；插件 UI 只能落在四个合规落点（顶栏 tab 行右侧 / 卡片下方 dock / 面板 / 独立浮层）。
  App 侧发现新插件违规：**只做清占位的隔离，不许帮它搬位**。
- **闸门防线**：静态断言 `GATE.modelPickerGuard`（4 条）+ `GATE.modelDockGuard`（3 条），共 75 绿 0 红。

### R24 插件源码侧迁到会话头部 + iOS 长期规范页（v1.0.131 build 93，2026-10-23）

- **背景（老总原话）**：「你明白没有，这个不只是说改 iOS 端。是电脑端口也修改在这个位置。任何自建本来占用会话框插件都改」
  「还有个提示词优化插件，也是占用会话框呀」「在 iOS App 那个地方长期文本显示规范……必须回到顶部 tab 栏，
  如何规范。也要告诉他们。通用性任何玩家都适合。」
- **为什么 shim 改不彻底**：shim 只能在 App 侧「视觉上」清占位，插件下一版又会挤回来，
  且其他玩家装的 App 没这段 shim 就完全没保护。**必须从插件源码侧改 slot**，两端同时生效。
- **电脑端实测（迁移前）**：`conversation.input.left` 挂积分胶囊、`conversation.input.right` 挂优化胶囊；
  `ofTiQG_root` 宽 **5px**、`triggerLabel` 宽 **0**。
- **迁移三件套**：
  | 插件 | 旧 slot | 新 slot / 配置 | 版本 |
  |---|---|---|---|
  | `dsh-our-free-model-composer-credits` | `conversation.input.left` | `conversation.session.header.actions` | 1.1.0→1.2.0 |
  | `dsh-prompt-optimizer` | `conversation.input.right` | `conversation.session.header.actions` | 1.4.7→1.5.0 |
  | `dsh-connect-workbuddy` | `creditPosition: composer` | `creditPosition: stats`（落到 `conversation.composer.dock`） | 配置项 |
- **迁移后实测**：`rightInner = []`（右半工具行腾空）、`ofTiQG` 恢复 **206px**、`triggerLabel` **123px**；
  头部 4 元素（智能体团队 93 / 优化 85 / 创造模式 68 / 积分 104）**零重叠零出屏**（1440·1280·1024 三档，30 绿）；
  优化功能回归实测：打字 → 点优化 → **10.18s 草稿 9 字 → 219 字写回**（证明 header slot 同样提供 `useInput`/`inputActions`）。
- **🔴 新发现的坑（必须记住）**：
  1. `conversation.session.header.actions` **只在有会话时声明**。新会话空态 `conversation.session` 子节点为 0，
     slot 不存在 → 空态验证会误判「插件注册成功但不渲染」，第一次跑 `_host_verify` 就是 12 红假警。
     **验证必须先点开真实会话。**
  2. `[data-slot]` 元素带 `style="display: contents"`，`getBoundingClientRect()` **恒为 0**，量几何必须取子元素。
  3. `conversation.input.model` 是 single slot，第二个注册者会抛
     `single slot "conversation.input.model.label" already has a registration at priority 0`；
     `dsh-model-search-live` 用 `priority:-1` 接管替换官方（合规），`dsh-connect-workbuddy` 的 ModelLabel 撞车（历史问题，不影响布局）。
  4. `inject` 里读 `remote.session` 等在部分上下文缺失 → `slot entry crashed`，接管型插件必须防御。
- **iOS 侧同步退出（关键）**：插件自己合规后，shim 必须停止接管它，否则双方互删互插。
  `dsh-po-capsule` 从 `KNOWN` 抓取表、`sels` 抓取表、`releaseHijack()` 三处移除
  （`releaseHijack` 会清它展开态的 width/flex/display）。
  注：`grab()` 原本就有 `card/blockEl/dockEl` 包含判据，头部元素抓不到，但留着等于埋雷。
- **iOS 长期规范页**：设置页底部新增 `🔴 插件布局规范（所有玩家必读）` →
  `PluginLayoutRulesViewController`（8 张卡片，随 App 分发、永久常驻）。
  老总要求「也要告诉他们」——装 App 的玩家不看 GitHub，规范必须出现在玩家一定看得到的地方。
- **闸门防线**：本轮改动后 `regression.js` **75 绿 0 红**（凭证 `src=e023819fa377`）；
  新增 `_diag/_host_verify.js`（电脑端 30 绿）、`_po_probe.js` / `_po_func2.js` / `_po_narrow.js`（优化胶囊位置+功能+窄屏）。

### R25 原生模型按钮被 App 侧搬走 → 真机整块消失（v1.0.131 build 93 紧急修复）

- **症状（老总 2026-10-23 11:36 真机三张截图）**：「模型选择按钮呢，直接不见了。这不是原生按钮吗？？？」
  有会话页面上，会话框底排只剩 `+ / 麦克风 / 权限 / 发送`，**模型选择器完全消失**；
  新会话空态下 `gemini-3.8-flas…` 掉到页面最底部单独一行。
- **根因**：92 版 `shim_27` 把**原生** `ofTiQG_root` 一起 `position:fixed` 到顶栏 tab 行，
  真机上被搬出可视区/被压制。**原生按钮根本不该由 App 侧搬位** —— 这是把自己定的规范
  （「原生按钮零干预」）自己违反了。
- **同时暴露的位置理解错误**：`conversation.session.header.actions` 是**标题行**
  （`mobil` / 会话名那一行），不是老总要的「对话 / 轨迹 / 系统监控」tab 行。
  tab 行 `_727C8a_tabs`（实测 `[300,50,1112,25]`，三个 tab 按钮只占 x=308/370/432，
  右侧全空）**没有任何官方 slot**。
- **修法（build 93）**：
  1. `pickers()` 只返回插件（`dcc` / `po`），**`ofTiQG` 彻底退出**停靠、`widenLabel`、`restore`、`fixMenus`；
  2. 插件 `fixed` 到 tab 行右侧：`top = tabBtnCenterY - 14`，从右往左排，`right:12` 起；
  3. **取不到 tab 行一律 `restore()`**（不搬），让插件留在自己的 `header.actions`；
  4. 宽度不够等比压缩（底线 56px），靠省略号收尾。
- **验证**：`_diag/_tabdock_sim.js`（人造 tab 行，430/393/375）**42 绿 0 红**：
  原生模型按钮 `y=817/737/697` 在会话框内、`tag=null` 零干预；
  dcc/po `y=83` 与 `tabY=83` 同行、不压 tab、不出屏、互不重叠。
  `_diag/_repro93.js`（注入当前 shim）原生按钮 `[146,729,172,28] position:relative` 归位。
  闸门 `regression.js` **75 绿 0 红**（`src=36b88e2e3847`）。
- **长期教训**：插件可以搬，**原生按钮一个像素都不许动**。以后凡是想 `fixed`/`transform`
  某个原生元素，先问「这是官方的还是插件的」——官方的就停手。
  tab 行没 slot 是官方限制，只能 App 侧 fixed 插件，且必须有「取不到就不动」的分支。

#### R25.1 第二真凶：`releaseHijack` 清插件外观 → 积分胶囊 / 优化胶囊一起消失

- **症状（老总 2026-10-23 12:5x 追问）**：「积分胶囊，还有个提示词优化插件呢，。」
  原生按钮回来了，但**两个插件自己也没了**。
- **根因（两条叠加）**：
  1. `releaseHijack()` 的清单里含 `[class*="dcc-root"]` / `[class*="dsh-po-capsule"]` /
     `.cm-stat` 等，**每个 tick** 都去清它们的 `display / height / background / border /
     box-shadow / margin / padding`；
  2. `dockOne()` 只写定位属性，**从不写回 `display`** → `display` 被抹成空串后，
     `inline-flex` 的胶囊塌成 0 高、背景边框全丢，插件不会重渲染补回 → 真机整块消失。
  3. 另有 `releaseDccRoot()` 按 `el.style.cssText` 判据，会把插件**自己写的 inline 一并清掉**
     （display / background / border / height）。
- **修法（build 93 第二轮）**：
  1. `DOCK_PROPS` 收窄到 **9 个定位属性**：
     `position / left / right / top / bottom / z-index / transform / max-width / overflow`；
  2. `dockOne()` 只写定位（+ `max-width` / `overflow` 防压缩溢出），
     **不再写** `height / width / flex / align-items / padding / margin`；
  3. `releaseHijack()` 的 `sels` 移除 `.dcc-root` / `[class*="dcc-root"]` /
     `.dsh-po-capsule` / `[class*="dsh-po-capsule"]`，只剩 `[data-dsh-pos] / .cm-stat-entry /
     [class*="cm-stat"] / .cm-bbox / [class*="cm-bbox"]`；
  4. `releaseDccRoot()` **整函数停用成空壳**（`return;`，保留函数防调用点报错）。
- **验证**：`_diag/_tabdock_style.js` **26 绿 0 红** —— 停靠后
  dcc `{"display":"flex","bg":"rgb(238, 238, 255)","radius":"12px","pad":"0px 10px","h":26,"border":"1px"}`，
  撤销后 `{"display":"inline-flex","pos":"static","tag":null}` 完整还原。
  `_tabdock_sim.js` 仍 **42 绿 0 红**（375 档 dcc `[242,84,89,26]`、po `[321,84,42,26]`）。
- **长期教训**：**位置归 App，外观归插件**。`position:fixed` 会把 `inline-flex` 计算成 `flex`，
  这是 CSS 规范行为不算破坏；但如果 App 侧顺手去「清样式」，就会把插件自己画的东西删掉。
  以后想清某个元素的样式，先问「这个属性是定位还是外观」——外观一律不碰。

### R26 会话 tab 栏的归属真相：它是插件地盘，胶囊应该自己 Portal 进去（v1.0.131 build 94）

- **我错在哪**：前面几版一直断定「tab 行没有任何官方 slot，插件放不进去，只能 App 侧 `fixed`」，
  于是写了 shim_27 用 `position:fixed` 把胶囊搬到 tab 行右侧。这套做法依赖坐标计算、
  宽度压缩、溢出裁剪，脆弱且两端不一致。
- **老总 2026-10-23 12:01 纠正（原话）**：「你放屁。对话 轨迹 系统监控，旁边可以放。
  **轨迹 系统监控 就是 dsh 插件（dsh-system-monitor-plugin）生成的啊，不是官方原生按钮**。
  所以积分胶囊和提示词插件按钮！也可以做到放这里啊。原生会话框任何按钮都不要动，
  不是悬浮的！是会话框一个整体的原生。」
- **源码真相**（`@deepseek-ai/dsh-client-ui-conversation/lib/client.js`）：
  ```jsx
  <div role="tablist" data-conversation-tabs="" class={styles.tabs}>
    {tabs.map(v => <button role="tab" class={styles.tab}>{v.label}</button>)}
  </div>
  ```
  `tabs` 来自 `slots.entries("conversation.view")` —— 每个注册项一个 tab。
  「对话」= 官方 ui-conversation、「轨迹」= 官方 ui-trajectory、
  **「系统监控」= 第三方插件 `dsh-system-monitor-plugin`**（它 `slots.inject("conversation.view")`
  注册了 `order:30` 的第 3 个 view）。
  容器 `display:flex; gap:36px; padding-left:8px; grid-column:1/-1`，三个 tab 只占左端
  约 180px，**右侧全是空 flex 空间**。显示条件 `showTabs = !hideChrome && tabs.length > 1`。
- **修法（两端一起改，这次是插件侧主导）**：
  1. 插件 `dsh-our-free-model-composer-credits` v1.3.0 / `dsh-prompt-optimizer` v1.6.0：
     注册位留在 `conversation.session.header.actions`（降级位），组件里
     `ReactDOM.createPortal(capsule, document.querySelector('[data-conversation-tabs]'))`。
     锚点用**稳定语义属性** `data-conversation-tabs`，不用哈希类名。
  2. CSS：`[data-conversation-tabs] > .dcc-root { align-self:center; flex:none; margin-left:-14px; }`
     —— tab 栏默认 `align-items:stretch` 会把 24px 胶囊拉满整行。
  3. iOS `shim_27` 的 `pickers()` **改为返回 `{dcc:null, po:null}`**：
     App 侧不再搬任何插件，插件自己就在正确位置，再 `fixed` 一次等于把 tablist 里的元素
     拽出来。原生 `ofTiQG` 依旧零干预。
- **实测（电脑端会话态，原配置 developerTools:false）**：
  | 档位 | tab 栏 | 优化胶囊 | 积分胶囊 | 原生模型选择器 |
  |---|---|---|---|---|
  | 1440 | `[300,50,1112,26]` 对话@308/轨迹@370/系统监控@432 | `[506,50,85,26]` parent=tabs | `[613,51,108,24]` parent=tabs | `[874,833,303,28]` relative |
  | 1280 | `[300,50,952,26]` | `[506,50,85,26]` | `[613,51,108,24]` | `[763,733,303,28]` relative |
  | 1024 | `[300,50,696,26]` | `[506,50,85,26]` | `[613,51,108,24]`（自动压到 75 宽） | `[632,701,303,28]` relative |
  三档各 **13 绿 0 红**：parent 是 tablist、`align-self=center`、与 tab 零重叠、不出屏、
  `docSW == vw`、会话框内零插件元素、原生按钮 303px 全宽未被动过。
  截图 `_diag/_enter_session.png` 肉眼可见：`对话 | 轨迹 | 系统监控 | ✨优化 ⚙ | Lobster · —`。
- **长期教训**：
  1. 判断「某区域能不能放插件」，先查**谁渲染了它**。tab 行是 `conversation.view` 渲染的，
     那就天然是插件共用区；不要因为「没有 `[data-slot]` 元素」就断定放不了。
  2. **位置应该由插件自己争取**，App 侧 `fixed` 只是没有更好的办法时的临时手段。
     插件能把东西放进正确容器时，App 必须退出（否则两边打架，92/93/94 三次折腾同一根因）。
  3. 找锚点优先找 `data-*` 语义属性（`data-conversation-tabs` / `data-queue-dock`），
     CSS Module 哈希前缀（`ank0OG_` / `_727C8a_`）换版即失效。

#### R26.1 胶囊左右次序 + 原生按钮「不是悬浮」（build 94 收尾）

- **老总 12:28**：「积分胶囊和提示词插件更换位置，因为提示词插件点击优化后会弹出更长的菜单，
  会遮挡后面的插件。」→ 原来顺序是 `系统监控 | 优化 | 积分`，优化点开后从 85px 长到 238px，
  把右边的积分胶囊挤开/盖住。**改为 `order:1`（积分）/ `order:2`（优化）**，
  优化排最右，展开只往右侧空白长，遮挡结构上不可能发生。
  实测 1440：积分 `x=506`、优化 `x=603`（右），闸门 14 绿 0 红。
- **老总 12:33**：「会话框底原生的 + 完全权限 和 模型选择按钮。**不是悬浮，是和会话框一体的**。」
  → 核查发现 `alignComposerButtons()` 每 tick 给 `composerStack` 里每个 button 写
  `transform: translateY(±Npx) !important` 去硬拉中线。**这一掰就把原生按钮掰出了官方基线**，
  视觉上就像浮在会话框上。另外还有一条 `standardControls _trigger { max-width:150px }`
  在给原生模型按钮硬限宽。
- **修法**：
  1. `alignComposerButtons()` **停用成空壳**（`return;`，保留函数防调用点报错）。
  2. 删除「模型选择器限宽 150px」整条 CSS 规则。
  3. 只保留 `flex:0 1 auto` + `min-width:0` + `ellipsis`（允许收缩防溢出，不产生位移）
     与 `fixComposerClamp()`（只在已越界时钳回，幂等）。
- **反证**：停用后闸门 `[会话框] N 个按钮按行中心齐平` 仍为 **行内最大离散 0px**
  （2 行 / 3 行三档全绿）—— 证明官方 flex 本来就排得齐，之前的 transform 完全是多余的。
- **新增机械断言**：`[会话框] 原生按钮零干预（无 inline position/transform，不是悬浮）`
  —— 逐个数会话框内非插件按钮的 inline `position`/`transform`，写一个就红。
  插件元素按类名前缀（`dcc-` / `dsh-po` / `cm-stat` / `cm-bbox`）排除。

### R27 顶栏「每个模块定宽、互不重叠」：标题 × 智能体团队 × 任务运行中（v1.0.131 build 94）

- **老总 13:38 真机截图**：「顶部智能体团队，如果会话有新建子 agent，显示转圈圈 +
  智能体后台任务运行中，和现有的顶栏标题重叠。主要是手机屏幕不够宽，重叠在一起了。
  **规范每个模块的宽度，不重叠**。」并明令「**纳入以后不要重复产生**」。
- **实测取证**（393 移动布局，进真实会话后 dump）：
  | 元素 | rect | 说明 |
  |---|---|---|
  | `titleRow` | `[96,8,285,36]` | 右缘 381 |
  | `crumbs`(nav) | `[150,10,135,32]` | **pos=absolute**，右缘 285 |
  | `headerUtilities` | `[282,12,79,28]` | 左缘 282 |
  → **标题右缘 285 > 右侧模块左缘 282 = 重叠 3px**；往 utilities 塞一个真机同款
  「⭕ 任务运行中」94px 徽标后，**重叠扩大到 105px**，与老总截图完全一致。
  tab 行同时被压：`button[role="tab"]` 计算样式 `white-space: normal`，压缩即竖排
  （老总截图「轨/迹」「系统监/控」各占两行）。
- **根因两处，都在 App 自己的 shim 里**：
  1. `[data-phase] header [class*="crumbs"] { position:absolute; left:54px; right:96px }`
     —— 右预留 96px 是当年按固定值拍的，右侧一长（智能体团队 + 任务运行中）就压上去。
  2. 同一文件又强制 `button[aria-label*="智能体团队"] { min-width: max-content }`
     —— 右侧模块永不收缩，只会更宽。
- **修法（三条，缺一即红）**：
  1. 右预留改 `right: var(--dsh-head-right, 96px)`、`max-width: calc(100% - 54px - var(--dsh-head-right, 96px))`；
     `--dsh-head-right` 由新增 `fixHeaderFit()` **实测**右侧模块真实左缘反推（含 6px 间隙），
     JS 死时退回 96px（= 今天行为，不退化）。
  2. 右侧模块独立上限 **30vw**（`headerUtilities`），与标题右预留**解耦**。
     ⚠️ 踩坑：一开始把右侧宽度写成 `calc(var(--dsh-head-right) - 6px)` 与标题互相推导，
     形成死循环 —— **四档视口实测恒差 14px 重叠**，数学上无解。必须各自独立。
  3. tab 行：容器 `flex-wrap:nowrap`；`button[role="tab"]` 改 `flex:0 0 auto` +
     `white-space:nowrap`（永不竖排）；非 tab 子元素 `flex:0 1 auto; min-width:0`；
     窄屏（≤560）`gap: 36 → 12px` 并把插件胶囊的 `margin-left:-14px` **清零**
     （gap 一收窄，负边距就变成负间距，实测重叠 2px）。
- **实测结论**（四档，每档都塞 94px 假徽标的最苛刻场景）：
  | 视口 | BEFORE | AFTER 标题宽 | 重叠 | 竖排 |
  |---|---|---|---|---|
  | 430 | 重叠 105px | 113px | 0 | 0 |
  | 393 | 重叠 105px | 87px | 0 | 0 |
  | 375 | 重叠 105px | 74px | 0 | 0 |
  | 320 | 重叠 62px | 36px | 0 | 0 |
- **新增机械断言**（`regression.js` 断言 9d，三条）：
  `[顶栏] 标题右预留走 --dsh-head-right 实测` /
  `[顶栏] 右侧模块限宽 30vw` / `[顶栏] tab 行永不竖排`。
- **长期教训**：
  1. **顶栏每多一个模块，就必须重新分配一次宽度** —— 固定像素预留（96px）在
     「今天刚好」之后就一定翻车，凡是「让位」类留白一律走实测变量 + 兜底默认值。
  2. 两个互相推导的宽度变量必然死锁（14px 恒定重叠），**上限必须独立给定**。
  3. `white-space: normal` 的 flex 子项被压缩时不是出省略号，而是**竖排**——
     任何横向排列的模块必须先 `nowrap`，再谈省略。

### R28 上滑/切会话时整页错位几秒再跳回：事后校正的过渡态破绽（v1.0.131 build 95）

- **老总 16:00 反馈**：「顶栏和会话框上滑，或者打开新会话，读取旧会话几秒钟，
  会整体错误，加载完毕再跳回来正常位置，啥原因？」
- **根因：几何校正全是「事后校正」，过渡态必有一帧错值。**
  1. `fixTopChrome()` 每轮**无条件**「清 `margin-top` → 重量 `getBoundingClientRect().top`
     → 再写 `want - cur`」。清掉与写回之间**必然存在一帧无 margin**。
     上滑 / 切会话时 MutationObserver 与 3 秒兜底被高频触发 → 肉眼就是整页上下跳，
     直到目标值不再变化才停。
  2. `fixHeaderFit()` 在切会话瞬间右侧模块尚未挂载（宽 0）→ 旧逻辑回落 `96px`
     → 标题先铺满顶栏 → 数据读完、utilities 出现 → 又缩回 `216px`。
- **修法（两条「过渡态绝不动」守卫）**：
  1. `fixTopChrome`：`want` 与 `window.__dshMtWant` 相同且本元素 `dataset.dshMt==='1'`
     → **直接 return，一个属性都不碰**（稳态零写入）。元素被 React 重建或 want 真变了才校正一次。
  2. `fixHeaderFit`：`right ≤ 0`（测不到右侧模块）→ **沿用上次值 return**，绝不回落 96px。
     注意「测不到 = 右侧没东西 = 标题可以宽」，逻辑自洽，不会永久不写（实测四档均正常写入）。
- **取证方法**：沙箱打开的是裸 DSH 页，**没有 App 注入层**，必须先把
  `_diag/app_inject.js`（从 Swift 提取的真身）`addScriptTag` 注进去，再模拟原生下发
  `__dshNativeStatusBar=47 / __dshTopShift=18`，然后每 120ms 采样序列（`_jit_probe.js`）。
  会话态实测 `colTop=27` 恒定、`--dsh-head-right=216px`，证明稳态无误、问题只在过渡态。
- **95 真身复核**（`_gate95_recheck.js`，直接注入真身 shim、非手抄副本）：
  430/393/375/320 四档 `--dsh-head-right` 分别为 237/216/206/176px，标题宽 123/107/99/74px，
  **重叠 0、竖排 0、tab 宽恒 [26,26,52]** —— 95 的守卫没有破坏 94 的修复。
- **长期教训**：
  1. **凡是「清属性 → 重量 → 再写」的校正，都必须加稳态短路**（目标未变则零写入）。
     上滑、切会话、读旧会话都是高频触发源，中间那一帧必然被眼睛看到。
  2. **校正函数在目标缺失时不要回落默认值**，要沿用上次值 —— 回落就是「先错后跳」。
  3. 沙箱切会话是瞬时的（数据已缓存），复现不出真机「读几秒」的中间态，
     这类问题**只能靠代码结构定因 + 老总真机验收**。
- **新增机械断言**（`regression.js` 断言 9d 另两条）：
  `[顶栏] 校正稳态零写入` / `[顶栏] 标题右预留过渡态沿用上次值`。

### R29 95 反向翻车：稳态短路把顶栏永久锁死在加载中途那一帧（v1.0.131 build 96 根治）

- **发现经过**：95 发版后用 A/B 同条件复核（`_ab94_95.js`：同一浏览器、同一套页面操作，
  分别注入 94 / 95 真身 bundle）。四档重叠与竖排都是 0（两者一致），
  但 **`titleRow` 的 y 坐标 94 是 35、95 是 -4，差了 39px** —— 顶栏被顶进状态栏。
- **取证**（`_mt_why.js`，直接 dump `centerCol` 的 rect + 内联 margin + 标记位）：

  | | col 实测 top | inline margin | 判定 |
  |---|---|---|---|
  | 94 | **27** | 空（每轮清→量→对齐→不写） | ✅ 正确 |
  | 95 | **-12** | `-12px` **锁死**，T1 与 T2(+4s) 一模一样 | 🔴 顶栏缩进状态栏 |

- **根因：短路条件判的是「目标值没变」，而目标值是个常数。**
  `want = sb - 2 - shift` = `47 - 2 - 18` = **27 恒成立**，
  95 的短路 `col.dataset.dshMt==='1' && |__dshMtWant - want| < 0.5` 因此**恒真**——
  一旦首轮（页面还在加载、天然位置是 39）算出 `d = 27 - 39 = -12` 并写下，
  之后**永远命中短路，位置再也不自愈**。加载完成后天然位置变成 0，
  叠加那 -12px，顶栏就永久停在 -12。
  94 的「每轮清了重测」虽然会跳，但至少能收敛到 27；95 为了不跳，把位置**焊死**了。
- **修法（96）**：**增量补偿**，两头都不要。

  1. 删掉 `col.style.removeProperty('margin-top')` —— 这是 94 裸奔帧的唯一源头，
     96 全程**不清任何属性**。
  2. 短路条件从「want 没变」改成「**实测残差为 0**」：
     ```js
     var cur    = col.getBoundingClientRect().top;              // 带现有 margin 的实测位置
     var curMt  = parseFloat(col.style.marginTop) || 0;         // 现有 margin（React 重建后为 0）
     var target = curMt + (want - cur);                         // 在现有 margin 上补残差
     if (Math.abs(target - curMt) <= 0.5) return;               // 已对齐 → 一个属性都不碰
     setPI(col, 'margin-top', target + 'px');
     ```
     数学依据：天然位置 `n = cur - curMt`，要 `n + target = want` → `target = curMt + (want - cur)`。
- **效果**：天然位置加载中 39、加载完 0 都无所谓——实测 top 恒等于 27。
  `_mt96_verify.js` 对照实测（430×932，进会话 → 上滑 14 帧 → 切会话 14 帧）：

  | | 静止 | 上滑 14 帧波动 | 切会话 14 帧波动 | 结束 |
  |---|---|---|---|---|
  | 94 | 27 | 0.0px | 0.0px | 27 |
  | 96 | **27** | **0.0px** | **0.0px** | **27** |

  96 与 94 稳态位置完全一致（无新位移），且过程中零波动；95 是 -12。
- **长期教训**：
  1. 🔴 **短路条件绝不能用「目标值未变」当判据**——目标是常数时条件恒真，
     等于把首帧（往往是加载中途的脏数据）焊成永久状态。
     判据必须是**实测残差**（"现在对不对"），不是"我想要的东西变没变"。
  2. 🔴 **「消除跳变」和「保持自愈」不能只取一个**：清了重测会跳、锁死不跳但会错。
     唯一正解是**不清属性 + 增量补偿**——既没有裸奔帧，又能逐轮收敛。
  3. 改完必须**同条件 A/B 对照**（94 vs 95 vs 96 同一浏览器同一操作序列），
     单看"有没有重叠"会漏掉位置偏移；这次就是靠 `titleRow.y` 的 39px 差才揪出来的。
- **新增机械断言**（`regression.js` 断言 9d 三条，缺一即红）：
  `[顶栏] 校正稳态零写入（已对齐就不碰任何属性）` /
  `[顶栏] 顶栏位置走增量补偿（target = curMt + (want - cur)）` /
  `[顶栏] 校正绝不清 margin（bundle 内 removeProperty('margin-top') 出现次数必须为 0）`。

### R30 顶栏「1个后台任务运行中」与智能体团队按钮重叠 + 底栏稳态常驻（v1.0.131 build 96 根治）

- **老总 17:38 实锤截图**：「看看顶栏，文字1个后台任务运行中和智能体按钮 重叠。」
- **根因：绝对定位硬编码（`placeAbs`）的恶果。**
  1. `moveAgentBadge()` 假定后台任务永远只有 22px 窄图标，调用 `placeAbs(team.parentElement, hw - 52, 32)` 将智能体团队用 `position: absolute; right: ...` 强行钉死在右侧 52px。
  2. 但任务真实运行时，DSH 渲染的是完整状态组件「**1 个后台任务运行中**」（宽度 152px）。该组件自然向右延伸，正好与钉死在右侧的智能体团队重叠，「运行中」三字被智能体图标正面骑脸。
  3. `fixBottom()` 在读旧会话等请求的 2 秒内因 `room == 0` 把底部 padding-bottom 扒掉、回包后再装回，引发会话框错位颠簸；同时原生层未关闭外层 `isScrollEnabled`，导致整页仍可被拖拽上滑。
- **修法**：
  1. **解除顶栏绝对定位**：撤销 `moveAgentBadge()` 中对 `team` / `badge` / `jobs` 的 `placeAbs` 暴力钉死，统一恢复为 `position: static` 的流式排列。各模块在 `headerActions` 内作为 flex 项自然顺排，物理上绝对零重叠，左侧标题通过 `fixHeaderFit` 自动避让整组宽度。
  2. **底栏稳态常驻**：`fixBottom()` 在处于会话态或建立过床垫时保持常驻稳态，无论内容是否满一屏，底部 padding-bottom 均恒定存在，彻底抹平读旧会话数据请求期间的上下颠簸。
  3. **原生滚动彻底锁死**：`updatePageScrollLock` 确认 DSH 页面后设置 `sv.isScrollEnabled = !shouldLock`，从手势层杜绝整页被手指拖拽上滑。

### R31 顶栏智能体团队与后台任务动态绝对排位（不抢位、不重叠）+ 弹窗说明左对齐（v1.0.131 build 97 根治）

- **老总 19:27 反馈（实锤截图 1-2）**：「退回95版本，更严重。你自己看看截图1-2。更加重叠错乱了！！！你干什么？ 然后更新说明和关于这里123456靠左对齐。」
- **真实病因深度剖析**：
  1. **智能体团队有双重写入者**：`shiftAgentButtonRight()`（旧版写死 `right:44px`）与 `moveAgentBadge()` 并存。只改其一会导致另一条代码继续将智能体暴力钉在 44px。在 96 中盲目尝试将智能体改回 static 时，由于父容器是 DSH 的动态结构，导致智能体跑到了屏幕最左侧（x=62），直接压到了左侧标题正上方！
  2. **绝对定位的唯一正解是「按实测宽度动态串联排位」**：
     - 最右侧抽屉开关占用 `38px`（到 `hw - 42`）；
     - 智能体团队固定放置在 `hw - 46`（坐标大约 x=358）；
     - 后台任务指示器：动态测量其实测渲染宽度 `jw`，严格落位在 `hw - 48 - jw`（若任务宽 152px 则落位在 230px，若宽 32px 则落位在 350px），**两两之间永远保持 6px~8px 安全间隙，物理上彻底隔开，无论任务文字长短绝对无法重叠**！
     - 标题右侧预留由 `fixHeaderFit` 自动测量后推导 `--dsh-head-right`，保证标题文字在到达后台任务前优雅省略。
  3. **关于页与更新说明居中问题**：系统原生 `UIAlertController` 的 message 标签默认是 `textAlignment = .center`，导致序号 123456 变成了中间参差不齐的锯齿排版。通过 `alignAlertMessageLeft` 递归视图树将包含多行/符号的标签设置为 `.left`，实现完美靠左对齐。

### R32 后台任务胶囊被 32×32 规则钳制 + 胶囊车位公式漂移 + 标题预留盲区（v1.0.132 build 101 根治，2026-10-24）

- **症状（老总 2026-10-24 反馈）**：97 基线上按钮顺位全部正确，但后台任务运行时「转圈圈 + 1 个后台任务运行中」文本与「智能体团队」按钮重叠；标题长时也会压住胶囊。
- **🔴 本条修正 R31 的一个错误结论**：R31 写的「`hw - 48 - jw` 动态串联排位两两永不重叠」**不成立** —— 该公式让胶囊右缘随宽度漂移：jw 小（转圈圈 28~32px）时右缘落在 hw-76~80，压住子智能体徽标车位 [hw-94,hw-72] 并啃到团队按钮 [hw-78,hw-46]；jw 大（满文本 130px+）时整颗胶囊被推到标题区正上方。
- **根因链（四处叠加，探针 `_diag/_probe_r23_trace.js` 逐 tick 实锤：wrapper 恒 32px / right:72px 五个 tick 纹丝不动）**：
  1. **真凶 · 32×32 图标按钮统一规则漏排除**（v1.0.83 遗留）：`[data-phase] header [class*="titleRow"] button:not(打开目录)…:not(智能体团队)` 一律 `width:32px !important; min-width:32px !important`——排除名单**没有「后台任务」**。该规则特异性极高，压过 97 版胶囊自己的 `width:auto !important`（Build 97 里从未生效过）→ 真机胶囊被硬钳 32×32，`「1 个后台任务运行中」`文字 span（nowrap）从按钮右侧裸溢出，糊在徽标/团队按钮上。
  2. **测量死循环**：`moveAgentBadge` 用 `placeAbs` 把胶囊 wrapper 宽度冻结在上一帧测量值；按钮在冻结宽度内被裁/溢出后，`getBoundingClientRect` 每次都量回冻结值 → jw 永不更新，wrapper 永不重排。
  3. **车位公式漂移**：见上，`hw-(48+jw)` 随 jw 双向漂移。
  4. **fixHeaderFit 盲区**：只量流内 `headerUtilities`；胶囊/团队/徽标 wrapper 被 `placeAbs` 绝对定位后 utilities 塌缩为 0，兜底只量到 32px 车位 → `--dsh-head-right` 回落 96px → 标题伸进胶囊正下方。
- **修法（build 101，全部在 `DSHios/ViewController.swift`）**：
  1. 32×32 规则排除名单补 `:not([aria-label*="后台任务"])`（两条 titleRow 选择器都补）——不做此排除，下方一切胶囊宽度约束全部无效；
  2. `moveAgentBadge` 胶囊分支：测量前先解冻 wrapper（`width:auto`，同一 JS 任务内量完即写回，零中间帧零抖动）→ 量自然宽度 → 钳 40vw 上限 → **右缘恒定 `hw-102`**（= 徽标左缘 hw-94 再保 8px），胶囊只向左伸展，徽标出现/消失不跳位；
  3. `fixHeaderFit` 改「全量候选取最左缘」：utilities + headerActions + 胶囊/团队/徽标 wrapper 一并实测（只认右半区 left>rb.left+40），预留 = rb.right - 最左缘 + **8px** 间隙；上限从 55vw 收紧为 `vw-132`（恰好盖住 40vw 胶囊车位，同时标题最少剩 ~70px）；「过渡态沿用上次值」守卫原样保留。
  4. 按钮级最后防线：胶囊 `max-width:40vw !important + overflow:hidden + text-overflow:ellipsis` + 子 span 同步钳制——**JS 死亡时文本也绝不越过按钮边界**；数字「1」在 375~430 全档完整显示。
- **闸门防线**：`regression.js` 断言 9e（`GATE.jobCapsuleGuard`）4 条特征钉死；探针 `_probe_r23_jobscap.js`（430/393/375 三档、冷挂载+文本变长两场景）对拍胶囊×团队/徽标/标题全部零重叠、8px 间隙成立。⚠️ 探针场景 B1 的 32px「重叠」是人为把 aria-label 改成 `●` 的假象——官方组件 aria-label 恒为「N 个后台任务运行中」（`dsh-client-ui-jobs` 的 countLabel），不存在该状态。
- **方法论沉淀**：①「写入者自己量自己」的绝对定位必须先解冻再测量，否则测量值被上一次写入锁死；②高特异性统一规则（v1.0.83 32×32）新增受控元素时**必须检查排除名单**——胶囊在 97 版里写的 `width:auto !important` 从未生效过就是被它压死的；③绝对定位元素会让流内容器塌缩，凡是「量容器反推预留」的逻辑必须把绝对定位子元素一并纳入候选。
- **🔴 R32b 追加（2026-10-24 真机复检，build 102 候选）**：老总双截图实锤「标题在只剩省略号/展开完全两态间高频横跳」。根因：DSH 流式输出每 ~300ms 重渲染一次，胶囊 wrapper 被打回流内一帧（内联样式清零），当拍 utilities 实测矩形被瞬时态污染（430 档量出 378px→顶格 298，标题只剩 62px），下一拍 shim 冻回绝对定位又量回 249px——两个值逐拍互写（探针 `_diag/_probe_r33_flicker.js` 节点级重挂载复现 62↔111px）。终版修法：**胶囊在场时标题预留「单一真值」化**——只由恒定车位算术 `Math.round(rb.right)-(Math.round(hw2)-102-jobsW)+8` 决定（jobsW 由 moveAgentBadge 持久化在 `window.__dshJobsW`），utilities 流内矩形只在无胶囊时采信；胶囊消失须三拍确认（`__dshJobsMiss≥3`）防瞬时卸载闪落闪涨；写入侧吞 ≤4px 亚像素抖动。⚠️ **防抖教训**：曾试「预留变小须双拍确认」，持续流式下瞬时值反复把确认计数清零，防抖失效甚至把坏值锁死（探针实测 reserve 卡死 298）——**周期性污染源面前，防抖治标，唯一真值才治本**。闸门新增防横跳断言（R32 组 5 条，全量 90 绿/0 红），探针 430/393 重挂载场景全程单值。
- **🔴 R32c 追加（同日老总双截图 10:39:53/55，build 102 候选）**：截图实锤**第二个横跳源**——会话流式输出中**并无后台任务胶囊**，标题仍在「老总...」（62px）/「老总， 我已经完全按照您的指」（~250px）间跳。根因：React 重挂载把 headerActions（智能体团队容器）打回流内、被流式内容挤压到左端（left≈124 → 预留顶格 298），下一拍 shim 冻回又量回 96。修法：**流内矩形一律不采信**——候选必须 `getComputedStyle().position === 'absolute'`（即已被 moveAgentBadge 冻结的稳定态），流内帧 right=0 → 过渡态守卫「沿用上次值」，横跳死。探针阶段 3（无胶囊+团队容器节点级重挂载）reserve 单值 96 稳定。

### R33 会话图片「放大查看」预览层秒消失（老总口称「图片闪退」，v1.0.132(102) 根治，2026-10-24）

- **症状**：会话中点图片放大，预览层瞬间消失（「图片闪退」）。**App 不退、无任何崩溃日志**——老总先发来的 .ips 是 1.0.123(62) 时代 10-19 的侧滑删除崩溃（该问题 1.0.124 墓碑机制已修，与本症无关），据此确认本症不走崩溃通道。
- **根因（探针 `_diag/_probe_r34_lightbox.js` 实锤，官方组件源码 + style 写入序列双证据）**：
  1. 官方预览层 = `dsh-client-ui-primitives` 的 **ImageLightbox**：body-portal 上的 `div.backdrop[role=dialog][aria-modal][aria-label=图片预览]`，**尺寸靠 `inset:0` 四边锚定**，内部 stage/mask（mask 挂 `onMouseDown=onClose`）+ img + close 全是 absolute（不撑父高）；
  2. backdrop 命中 shim_00 watchdog 管辖名单（`[role="dialog"]`），挂载后 **4ms 内**被 `adjustElement` 手术：`max-width:410 + max-height:912 + left:10px + top:70px + right/bottom:auto` —— 四边锚定被改成 top+left+auto，**塌缩成 5×0 像素隐形**（探针实测 rect [10,70,5,0]）；
  3. 用户视角 = 预览层「闪退/打不开」，App 活着无日志，逐字吻合。
- **修法**：watchdog `adjustElement` 开头整层豁免「含 img 的 modal dialog」（`el.matches('[role="dialog"][aria-modal="true"]') && el.querySelector('img')` → return）——灯箱自带完整视口几何，关闭按钮另有 CSS 钉位兜底（v1.0.131 既有块），双指缩放手势由 pinch shim 提供，零接触。
- **验证**：修复后 backdrop 恢复 `inset:0px` 全屏、watchdog 零接触（style 写入序列仅剩无害的 touch-action/overflow）、**点遮罩关闭通道完好**；闸门新增 `[图片预览·R33]` 断言（91 绿/0 红）。
- **方法论沉淀**：①「App 活着但界面元素秒消失」≠ 崩溃，别去翻 .ips——先查 shim 对该组件 DOM 的每一次 style 写入（MutationObserver 抓写入序列是定位这种案的利器）；②watchdog/clamp 这类「越界浮层回收」逻辑对**靠四边锚定（inset:0）定位的全屏官方组件**是天然炸弹——锚定被改成 top+left+auto 后子元素撑不起尺寸，秒变 0×0；凡 role=dialog 全屏层必须先验豁免。

### R35 右侧抽屉「顶栏闪烁 + 功能按钮下移 + 关闭后抽屉按钮出屏」三症状（v1.0.134(103) 根治，2026-10-24）

- **症状**（老总真机截图 + 描述）：①右抽屉打开瞬间顶栏闪烁一下；②打开后顶栏几个功能按钮下移两个位置；③关闭抽屉回到主会话后，右侧抽屉开关按钮超出屏幕右缘。
- **根因**：DSH 前端自己会写 `--dsh-statusbar` 且真机实测 75（偏大 18~22px）。React 重挂载面板/抽屉节点时首帧直读它 → 面板 padding-top 偏大 → 内容整体下沉（闪烁 + 按钮下移 + 侧栏子菜单下沉同根）。出屏是第二条线：防出屏 bleed 补偿只在自身扫描周期跑，React 重挂载抽屉按钮后补偿全丢 → 出屏空窗。
- **修法**：①三处面板 padding-top 公式与固定浮层 top 改优先读原生专属 `--dsh-sb-native`（原生下发、DSH 写不动，重挂载首帧即正确），JS 未下发时退回旧变量兜底；②新增 `syncDrawerGeometry()` 挂进 syncPanelNav 300ms 常驻环：右栏/侧栏内联 padding-top 幂等校正（值不对才写）+ 抽屉按钮防出屏「只补不清」补位（已有补偿交给 bleed guard，防「写→回屏→判不溢→清→再写」自振荡，_r35b_run4 实证）。
- **验证**：闸门新增 `[抽屉·R35]` 两条断言（原生变量优先公式 ×2 + 浮层 top、几何守恒环 + 防出屏补位），删任一即红。

### R36 左侧目录按钮与二级子菜单重叠 → 整排隐藏 + 边缘手势操控（v1.0.134(103) 根治，2026-10-24）

- **症状**（老总 2026-10-24 拍板）：左侧目录按钮与打开后的子菜单重叠，历史靠「下移子菜单按钮位置」避让，很别扭。
- **老总方案**：完全隐藏左侧目录按钮；屏幕左缘从左往右滑打开目录、从右往左滑关闭；子菜单页同样左滑返回上一页，最大退到会话主界面、不能再退；偏移遮挡的二级子菜单恢复原位。
- **修法**：①目录/侧边栏开关按钮整排隐藏 —— A/B 实证（_diag 逐属性对拍）`visibility:hidden` 与 `pointer-events:none` 都会弄哑 DSH 开关的程序化 click（React 合成事件过滤这两类目标），`display:none` 真机又赢不过 DSH 侧 (0,3,1) 高特异性规则，唯一全胜组合 = **盒子压 0 + overflow:hidden + opacity:0**（视觉消失、无命中热区、click 通道无损）；②新增 `setupDshEdgeGestures` 手势单例：左缘 ≤32px 右滑 ≥56px 开目录，任意位置左滑 ≥56px 依次「关目录 → 关右侧面板 → 子页返回」（都不命中就不动，主会话页无返回钮天然钳制）；输入框/contenteditable、横向滚动容器、纵向位移占比过大一律放行；WKWebView allowsBackForwardNavigationGestures=false，与系统边缘返回手势零冲突。
- **🔴 连带不变量更替（断言 7）**：v1.0.125 旧断言「插件页左上角 fab 可见可点」作废 —— R36 后 fab 必须**隐藏但元素还在**（插件页 pageHead 族无任何「返回」按钮，`_probe_r36_pluginpage.js` 实测 backCands=[]，fab 元素是手势 `openDir()` 在这类页面的唯一 click 载体，删元素=插件页死锁）；fab 运行时可见 = 隐藏规则被 DSH 特异性压过 = 红。
- **验证**：闸门新增 `[手势·R36]` 两条断言（0-size 组合在且无 visibility/pointer-events/display:none 回潮、手势单例 + 开合链在）+ 断言 7 更替（fab 隐藏态 + 手势通道元素在），删任一即红。

### R35b 文件工作区顶栏仍下移 + 返回后抽屉按钮仍出屏（v1.0.135(104) 根治，2026-10-24）

- **症状**（老总装 103 后二轮报障）：①打开右侧抽屉进文件工作区，顶栏按钮还是下移；②返回主会话后右侧抽屉按钮还是超出屏幕范围；③左滑手势「整个左侧屏幕都有效，不单单是顶部区域」（见 R36b）。
- **根因**（两条漏点，均有探针实证）：①R35 只让自己的公式改读 `--dsh-sb-native`，但 **DSH 自有规则（文件工作区/停靠面板头部等）仍直读 `--dsh-statusbar`** —— DSH 会在抽屉/工作区切换等时机把它重写回偏大的 75，读它的元素整体下移 16~22px，R35 的面板公式治不到别人的规则；②防出屏补位旧逻辑 `if (curN === 0)` 只补「无位移的初次出屏」，而真机按钮会**带着 DSH 自写的 translateX(-10) 出屏**，恰恰落在旧逻辑盲区。
- **修法**：①新增 `setupDshStatusBarGuard` 值守卫 —— MutationObserver 盯 html/body 的 style 属性变化，在**微任务里回写**（先于浏览器渲染，肉眼零闪）+ 300ms 兜底环；值等于原生实测（`__dshNativeStatusBar`/`--dsh-sb-native`）才放行，原生变量未下发的纯浏览器环境整段静默；②防出屏补位改**增量收敛**：解析 transform 里全部 translateX 求和为 curN，只要「现视觉右缘」越出 vw-2 就写 `translateX(curN - over)`（在现有位移上叠加差值，精确收敛到 vw-2），无溢出一律不碰（不与 DSH/bleed guard 抢写），写值前比对天然幂等；选择器补 `[data-sidebar-right-toggle]` 兜底；③顺带重锚：面板开合检测改按 `[data-sidebar-right-open="true"]` 属性找载体（防 DSH 再换版哈希类失效），闸门环境补 `--dsh-sb-native` 下发仿真（此前缺失，守卫在闸门里是静默的）。
- **验证**：`_probe_r35b_verify.js` 三项实测 —— 硬写 75px 后自动回写 59px ✅；带 +50px 位移强推出屏后精确收敛 `translateX(-2px)`、右缘=vw-2 ✅；清试验位移后稳态不振荡 ✅。闸门新增 `[抽屉·R35b]` 两条行为断言（会话页活体：硬写 75 必须被回写 / 带 50px 位移强推必须被拉回 vw-2 且不过拉）+ 值守卫代码在位断言。

### R36b 左滑手势全屏误触发 → 双方向收窄左缘 32px（v1.0.135(104) 根治，2026-10-24）

- **症状**（老总 2026-10-24 原话）：「左侧屏幕左滑右滑手势。是整个左侧屏幕都有效。不单单是顶部区域。」—— R36 的「左滑关目录/关面板/返回」是全屏任意位置都触发（右滑开目录虽限左缘但整条左缘竖条全高响应），真机横滑扫内容就误关误返。
- **修法**：RTL 分支加左缘闸 `if (dx < 0 && sx <= EDGE)`，与 LTR 开目录同一条 32px 竖条；防误触豁免（输入框/横向滚动容器/纵向大幅位移）不变；主会话页无返回钮的天然钳制不变。
- **验证**：`_probe_r35b_verify.js` 合成触摸四连 —— 屏中左滑(200→110)目录关态无动作 ✅、左缘右滑(16→110)开目录 ✅、**目录开着时屏中左滑不误关** ✅、左缘左滑(16→-70)关闭 ✅。闸门 `[手势·R36]` 断言追加 `if (dx < 0 && sx <= EDGE)` 在位锚点，回潮即红。

### R36c 插件页死胡同：全屏无返回钮、任何手势都退不出去（v1.0.135(104) 根治，2026-10-24）

- **症状**（老总 2026-10-24 三次报障）：打开左侧目录 → 插件，进入后全屏，任何手势都无法返回；按钮全被 R36 藏了，页面自己又没有返回钮 —— 彻底死胡同。
- **根因**（探针 `_probe_r36c_plugin.js` 双实证）：①插件页整页根 `SECTION.g9WTEG_page` 自带 `overflow-x: auto/scroll` —— 手势防误触的「横向滚动容器放行」豁免把落点其上的**所有**滑动掐死（真机触点命中它；此前闸门/探针用 document 直发合成事件绕过了命中检测，所以没露馅 —— 沙箱绿、真机死的又一案例）；②该页 `backCands=[]`，goBack() 必扑空，RTL 链路到头等于没修。
- **修法**：①`inHScroll` 加整页级容器豁免 —— 近全宽（≥0.9vw）且近全高（≥0.6vh）的滚动容器只是页面壳，不算横向滚动区；真横滚部件（代码块/轮播/tab 条）高度远小于整页，照旧豁免；②左滑链路改四连兜底：`关目录 → 关右侧面板 → goBack() → 都扑空就 openDir()` —— 任何页面必有出口，严禁死胡同。
- **验证**：真命中目标（elementFromPoint 派发、复刻真机 e.target）三连 —— 插件页左缘右滑开目录 ✅、屏中左滑不误触 ✅、**左缘左滑扑空后自动拉开目录（逃生兜底）** ✅。闸门 `[手势·R36]` 断言追加四连兜底与整页豁免锚点（`if (goBack()) return;` / `if (!isDirOpen()) openDir();` / `r0.width >= vw * 0.9 && r0.height >= vh * 0.6`），回潮即红。
- **教训**：手势类豁免逻辑必须用**真命中目标**（elementFromPoint）做沙箱验证，document 直发合成事件会绕过 e.target 相关豁免，造成「沙箱绿、真机死」。

### R37 会话框 + 号弹层「闪退」：回合运行中点 + 秒死（v1.0.136(105) 根治，2026-10-24）

- **症状**（老总 2026-10-24 装机 104 后报障）：点击会话框 + 号，弹出的选择框「闪退」——出现即秒关，无声无息。
- **根因**（取证链 `_probe_r37_console/_r37_stack/_probe_r37_idle` 三连实锤）：**会话回合运行期间（AI 流式输出中）会话被「写句柄」持有**，+ 弹层打开瞬间的命令目录预热拉取 `commands/list` 被服务端以 `session/writer-held` 拒绝（dsh-api-session-controller resume → SessionAlreadyOwnedError），前端 `[ui-input-trigger] source "command" candidates failed` 后把弹层状态直接置回 `open:false`（reducer 路径，不经过任何关闭回调，所以挂关闭回调钩子零命中、focus/hover 保活全无效）。**空闲会话对照实测弹层全程存活（150/400/1000/1600ms 四采样全 true）** —— 与注入脚本无关（不注入 JS 同样秒死），属 DSH 前端在「回合运行中点 +」场景的原生行为，桌面端同样存在。
- **排除项**：几何/焦点/hover（保活四策略全灭）、网络（RPC 走页面包装器够不到的通道，`_probe_r37_transport` fetch/xhr 计数双零）、我们的 JS/CSS（无注入对照同样死）。
- **修法**（页面层兜底，锚定语义属性 `data-trigger-menu` + `[data-composer-overlay]` 作用域，禁哈希类；**判据只用时机**——签名对照实证失败关闭与合法 dismiss 关闭的 set 参数完全同形（都是 `open:false, hit:null, groups:[]`），groups/textLen/内容判定全是烟雾弹）：沿 fiber 找弹层 store 包装 `set`，**`open:true` 后 200ms 内、且开层后无任何用户 pointerdown/Escape 的 `open:false` 一律判定伪关闭吞掉**（失败关闭实测 25~65ms——弹层还没渲染出来人类不可能响应；合法 dismiss 实测 900ms+，隔着物理鸿沟）；吞掉后 600ms 仍无 menuitem/option 内容就注入「回合运行中，指令目录暂不可用」提示行（`data-dsh-cmd-hint`）；generation 需同代（见过 open:true 才校验）、弹层保持打开、点外部正常关闭。
- **验证**：`_probe_r37_debug` 四段——路由级拦截复刻 writer-held（该 RPC 走页面层 fetch/XHR 包装器够不到的通道，只能在网络层拦）→ 弹层存活 + 提示行 ✅；点外部正常关闭 ✅；解除拦截恢复打开 ✅；再关闭 ✅。`_probe_r37_idle` 空闲会话对照四采样全存活 ✅。闸门新增 `[弹层·R37]` 三条行为断言（拦截下存活出提示 / 点外部正常关闭 / 解除后恢复打开）+ 源锚点，回潮即红。
- **教训**：①「弹层闪退」先分「App 退」还是「元素消失」——无崩溃日志 + App 存活 = Web 层秒拆；②关闭回调钩子零命中 ≠ 没有关闭，reducer 直改状态的路径不经过回调，要沿 fiber 钩 store.set；③ **open:true 发生在 React 挂载之前**（状态变更先于渲染）——挂载时才装的包装器必然错过本层 open:true，openedAt 必须用挂载时刻兜底、generation 同代校验只在「见过 open:true」后生效（否则 metaGen=undefined 一票否决永不生效）；④ RPC 传输层可能走页面包装器够不到的通道（worker/iframe），页面层 fetch/XHR 拦截方案先验证通道再动手，验证手段用 Playwright 路由级拦截（网络层，worker 也逃不掉）；⑤ 弹层骨架自带 chrome 按钮/骨架文本（实测 33ms 即有 1 button + 3 字符），任何「内容空判定」都会被骨架误判——时机判据是唯一可靠信号。

### R38 抽屉按钮出屏三犯：补位函数动画期误伤面板内部按钮（v1.0.136(105) 根治，2026-10-24）

- **症状**（老总 2026-10-24 装机 104 后报障）：左缘手势已好，但「打开右侧抽屉，关闭后右侧抽屉按钮超出屏幕范围，还是没有解决」——R35b 二犯后第三犯。
- **根因**（探针 `_probe_r37_recon` 现行抓获）：R35b 增量补位有两条毒路。①**选择器第三项 `[data-sidebar-right-toggle]` 不限定 header**，`querySelector` 按文档序取先者——面板开合动画中途抓到「面板内部的开关按钮」当成出屏元素，在现有位移上累减溢出量，实测写出 **`translateX(-448px)`**，动画结束后「无溢出一律不碰」的幂等守卫让巨量负位移**永久滞留**（面板收起钮落到 x=-56 飞出左屏，中途态被 `_r37_b_full.log` 拍获：独立 toggle rect=[1274,51]）；②React 重挂载/布局中途测量，把动画中间态当稳态补偿。v1.0.122 全局收集器有 120px 上限排除嫌疑，-448px 唯一来源即 syncDrawerGeometry。
- **修法**（五铁律全重写）：①只认 `header button[aria-label="打开/收起右侧边栏"]`，面板内部按钮一律不碰；②补偿量永远从「基准位」（视觉位 − 现有位移）重算，DSH 自写位移并入基准考量，不再在现有位移上累减——动画漂移不被误补偿、陈旧补偿天然自愈；③稳态门：几何与上一拍全等（`__dshStableKey`）才动手，动画/重挂载中途一律旁观；④48px 幅值上限（32px 按钮永远不需要更大补偿）；⑤面板内部按钮残留的旧毒位移（|tx|>64）就地清除自愈——104 真机已中毒的按钮装上新版即恢复。
- **验证**：`_probe_r37_recon` 复跑终态按钮在屏内（rect=[396,47,32,32]）✅。闸门新增 `[抽屉·R38]` 行为断言（-448px 中毒态必须被基准位重算拉回屏内 vw-2）+ 五铁律源锚点（header 限定 + 旧选择器第三项禁入 + baseRight 重算 + __dshStableKey + Math.min(over,48) + __staleSels 自愈），回潮即红；`[抽屉·R35b]` 行为断言同步改 header 限定（旧断言选择器带第三项，一直在面板内按钮上自嗨，假绿）。
- **教训**：①`querySelector('A, B, C')` 按文档序不按选择器序——多选择器取元素时必须让所有候选**语义同域**（都限 header），否则哈希属性候选会抢走真身；②「无溢出不碰」式幂等守卫治不了「自己写错的巨量值」——补偿类逻辑必须有幅值上限 + 稳态门 + 基准位重算三件套，动画期测量一律不采信；③修「按钮出屏」连犯三次的根子是每次只堵当轮症状——R38 一次性重写并把五铁律钉进闸门源锚点。

### R39 抽屉按钮出屏四犯 + 文件工作区下移三犯：DSH 毒写三路径全数击穿旧守卫（v1.0.137(106) 根治，2026-10-25）

- **症状**（老总 1.0.136(105) 真机验收）：「+号弹层闪退」修复了；但「打开右侧抽屉到文件工作区，按钮还是下移。返回后右侧抽屉按钮还是超出屏幕范围。未解决」。
- **根因**（毒写 A/B 对拍 `_probe_r39_poison` 三模式沙箱实测，首次完整复现真机症状 + 老总真机截图对拍 `IMG_9153/9154`）：
  - **P2 整段覆写**：DSH 以 `setAttribute('style',…)` 整段写 html —— 把 `--dsh-sb-native`/`--dsh-topshift` 连带抹掉、只留自己的 `--dsh-statusbar:75px`。旧守卫 `nativeVal()` 仅有的两个来源（window 变量未下发 + `--dsh-sb-native` 被抹）双双失效时直接 bail，75 永久滞留；实测顶栏/右栏列垫/目录按钮/抽屉开关**全体精确 +16pt（=75−59）**——真机「按钮下移两个位置」实锤。
  - **P3 深层容器写**：DSH 把 75 写在工作区/面板根容器（真机有、沙箱无——env(safe-area)=0 时 DSH 不触发该路径，故历版沙箱全绿而真机翻车），旧守卫只盯 html/body 两层，子树全体 +16pt 完全不设防。
  - **救援两条腿残**：①48px 补偿上限——顶栏出现「1 个后台任务」胶囊等模块时 flex 横向溢出可超 48（老总图一：开关只露 2/3），旧上限把按钮留在屏外拉不回；②全等稳态门——胶囊文字周期变宽让按钮坐标每拍抖 1~2px，`__dshStableKey` 全等比较永不满足 → 救援**永不触发**。这是「真机出屏、沙箱正常」的环境差异根源。
- **修法**（守卫 v2 + 救援 v2，`DSHios/ViewController.swift`）：守卫 ①记忆冻结 `__dshSbMemory`（首次拿到原生值即冻结在 JS 侧，两来源全灭也认得）；②`fixLevel` 三变量全恢复（sb / sb-native / topshift 成组回写）；③观察范围扩到全子树（`fixDeep`：任何元素内联 `--dsh-statusbar` ≠ 原生值就地回写）。救援 ④上限 48→160、精确收敛 vw-2（基准位重算不累加，动画帧误读至多存活一拍）；⑤稳态门改模糊 ±2px（连续两拍，宽度仍全等——宽度变了就是换元素，必须重新观察）。
- **验证**：`_probe_r39_poison` 三模式毒写后 700ms 内全部恢复基线零位移（headerTop 39 / sb 59 / native 59 / ts 18 / colPad 47 / 目录按钮 top 63 全对齐）✅；`_probe_r39_rescue` 四场景——relative+left 55px 真实出屏拉回 right=428=vw-2（旧 48 上限会留 7px 屏外）✅、±2px 持续抖动下收敛 ✅、解除后补偿清零回 -2px 基态 ✅、面板内 -448px 旧毒自愈 ✅。闸门新增 `[抽屉·R39]` 三条行为断言（整段覆写三变量恢复零位移 / 深层毒写就地回写 / >48px 出屏拉回）+ 守卫 v2 源锚点（`__dshSbMemory`+`fixDeep`+subtree）；R38 源锚点同步换 v2 形态（模糊稳态门 + 160 上限）。
- **教训**：①「守卫只修一个变量」防不住「覆写抹掉全部变量」——成组变量（sb/sb-native/topshift）必须成组恢复；②守卫的记忆必须冻结在 JS 侧，CSS 侧任何值都可能被下一次写干掉；③稳态门用「全等」是把抖动环境误当动画环境——动画要挡的是大幅中途态（宽度变化/大幅位移），±2px 文字抖动必须在门内放行；④补偿上限要对着「真实布局能溢出多少」定（后台任务胶囊 ≈ 105px），不是对着「按钮自己多大」定。

### R40 多终端「占用」提示 + 电脑跑手机不同步：订阅断链无前台恢复路径（v1.0.137(106) 根治同步丢失，2026-10-25）

- **症状**（老总 2026-10-24 定性**重大故障**）：①电脑打开会话提示「当前会话已被占用（error.sessionInUse）」无法输入指令；②电脑端会话运行（转圈），手机端不转圈、不显示内容、不同步。
- **根因**（DSH Desktop 侧 node_modules 源码考古，证据全带文件行号）：
  - **占用提示**：后端 `session/writer-held`（`dsh-api-session-controller` 把 `SessionAlreadyOwnedError` 转 RemoteError；写句柄由 `dsh-agent-loop` 的 `persistence.open(id,"write")` 打开并持有到 Agent 存活期结束）。锁**刻意无过期**（`dsh-session-persistence-jsonl` lease 注释 "deliberately no expiry"；Windows 为命名内核信号量，持有进程退出内核才放）。**官方无任何 takeover/抢占 RPC**（全包 grep 零命中），UI 三处（会话输入/模型选择两包）全部只弹 toast 即止。
  - **同步丢失**：订阅走 `/api/remote.mux` WebSocket（RPC + 事件流复用同一 mux）；前端 `ConnectionController` 的退避重连全靠 setTimeout 驱动，唯一的外部重连开关是 `window "online"` 事件（`watchBrowserNetwork` 只挂 online/offline 两个监听，**零 visibilitychange 处理**）。WKWebView 后台挂起 JS → 回前台只能等最后一个退避 timer 自然到期（最长 10s），若正停在「等待网络恢复」分支则**永远卡死**——手机停在旧订阅上静止，就是「电脑转圈、手机不动」。
- **修法**（iOS 壳侧，零碰官方宿主 `C:\Program Files\DSH Desktop`）：`appDidBecomeActive` 注入调 `__dshForegroundResync()`——合成 `online` 事件**正中官方重连开关**（`setNetworkAvailable(true)` → attempt=0、abort 当代连接、立即重连），3s 后仍 visible 再补发一次；隐藏 <5s 的秒切自动跳过（连接多半还活着，不打扰）。长后台（>90s，Swift 侧计时）`__dshLongBgResync()`：补发 online 后 1.5s `location.reload()` 冷恢复（官方语义：刷新/重连只从持久事件重建会话，不丢数据）。
- **「占用提示」定性（重要）**：写句柄锁无过期是官方设计（保护运行中回合不被偷走）。**iOS 壳侧无法也不应绕过**；根治方向是 profile 层自有插件「空闲让出」（turn 结束 + 空闲 N 秒 → 主动 dispose Agent 释放写句柄 → 另一端下次 claim 即成功）——插件与桌面主进程同进程、可操作 Agent 生命周期。**列入后续版本单独做**：需独立测试环境（DSH_HOME 沙箱副本 + 双客户端对打），不能在老总正在用的 DSH 上热插未验证插件。本轮 R40 交付的是方向②根治：手机回前台订阅即时恢复、电脑跑的手机立刻能看到。
- **验证**：`__dshForegroundResync()` 双派发实测（online 事件计数=2，含 3s 补发）✅。闸门新增 `[多端·R40]` 行为断言（双派发 + 长后台冷恢复入口在）+ 源锚点（`setupForegroundResync`/`__dshForegroundResync`/`__dshLongBgResync`/dispatchEvent online）。
- **教训**：①跨端「不同步」先查传输层恢复路径（谁触发重连、后台挂起后谁负责踢醒），别先怀疑业务层；②官方已有恢复开关（online 事件）时**复用它**，零对抗、零新状态机，比自建重连协议稳；③「锁无过期」类设计要么让持有方让出（同进程插件）、要么换新会话（reuse→createMinted 官方降级路径），绕锁都是死路。

### R41 开始页/抽屉面板「抽屉按钮被挤出屏拉不回」五犯 + 面板顶栏下移 + 开合闪烁（v1.0.138(108) 根治，2026-10-25）

- **症状**（老总 1.0.137(105→106) 真机两张截图实证，16facbd3/0dfa19e7）：开始页（抽屉→工作区入口）顶栏最右抽屉按钮**被屏幕右缘截断**（x≈805+/828，只露一角），面板顶栏比会话页标题行低 ~22pt（下移）；「拉不回来」。
- **根因**（沙箱注入复现 + 老总截图逐像素对拍）：与状态栏变量、transform 中毒**均无关**——顶栏那条是 **DSH 标签条**（`_tabStrip_`，对话/轨迹/系统监控/开始 每个都是标签），功能钮簇（`_stripChrome_`：退出全屏+收起右侧边栏）排在标签后面；**标签一多整簇被推入 pane 的 `overflow-x:hidden` 裁剪区**（沙箱注入 4 标签即复现：簇 right 超屏 843px，物理不可滚动拉不回）。抽屉面板内还有同构的第二条标签条（`inPanel:true`），同样会挤。此路径页面级守卫（R35~R39）全部无覆盖——按钮根本没出 header，出的是标签条的裁剪区。
- **修法**（R41 簇级钳制 + R41b 同高对齐 + R41c 挂载即矫，全部收编进 `syncDrawerGeometry`）：① 每拍遍历**所有**顶带（top<140）内可见的 `_stripChrome_` 簇，凡自然右缘越出 `vw-4` 即整簇 `translateX` 拉回（**簇级单值重算**：每拍从基准位重算、绝不累加、≤1200 上限——R38 的 -448 类中毒在数学上不可复发；绝不逐按钮平移，否则三钮全部堆叠同一车位）；无溢出即撤销旧补偿。② CSS 同时给 `_stripChrome_` 挂 sticky+底色（pane 无浏览器认定滚动溢出时 sticky 惰性无害；pane 有真实溢出时 sticky 实测生效——两机制互补双保险）。③ R41b（老总拍板「要和会话页一样高度」）：标签条内容行（chrome 按钮行）比会话页内容行（header 顶+8）低超 3pt 即上拉齐平，绝对值单拍重算（不累加防振荡），拉力记 `data-dsh-strip-pull-n`；对齐目标取自会话页自身→同高传递安全（会话页不压状态栏则开始页必不压）；Δ<40 门槛保会话页标签行永不误伤。④ R41c（老总报「一闪一闪一会高一会低」）：childList 观察器在**渲染前微任务**里对新增面板/列/标签条节点立即跑全量矫正——React 重挂载首帧即正确，300ms 环只做兜底，闪烁根除。
- **验证**：标签条 min-width 强制 680px（屏 414）复现出屏：簇被推至 [607..675] 超屏 261px（=老总 137 真机形态）→ 修复版拉回 [336..410]=vw-4 ✅；高度对齐：会话页内容行 36pt = 开始页正常 36pt = 开始页强制压低 30px 后仍 36pt（`_r41_align_compare.png` 三格红线拼图核验）✅；修复前/后 A/B 对比图 `_r41_cmp_before/after_*.png` 已交老总过目。闸门新增 `[标签条·R41]` 行为断言（margin-left 800px 强推簇出屏 → 必须 1.3s 内拉回 vw-2 内、解除后复原）+ 源锚点（stripChrome 遍历 + data-dsh-strip-clamp + data-dsh-strip-pull-n + tabHostHeader + __dshMountGuard 挂载即矫）。
- **教训**：①「按钮出屏」第五犯才挖到真相：**同一排按钮不一定是同一个容器**——顶栏那条是标签条不是 header，页面级守卫修不到裁剪区里的元素；先问「这个按钮住在哪个容器、容器怎么裁剪」再谈位移；②overflow:hidden 的裁剪区元素**永远拉不回**，必须把元素移出裁剪路径（平移回可视区）；③「面板内按钮不碰」铁律要精确化——禁的是**动画期累减**式写入，簇级单值重算（基准位每拍重算+上限+无累加）数学上不可能复现 -448 类中毒，可安全用于面板内；④注入式复现（撑宽标签条）是对拍真机「元素数量差异」类故障的唯一沙箱手段；⑤补偿公式必须**绝对值单拍**，写成「旧值+残差」必振荡（R41b 第一版实锤，R38 同款教训）；⑥新逻辑块必须落进**周期函数体内**——落在顶层只跑一次，「验证通过」可能是别处代跑的假象（R41 第一版结构错位实锤）；⑦开/关类闪烁 = 挂载帧与纠正帧的时差，「挂载即矫（微任务）」是唯一根治法，300ms 环只能兜底。

### R42 冷启动慢：每次全量拉 5.7MB UI（v1.0.139(109) 根治·固化缓存提速，2026-10-25）

- **症状**（老总令「UI 固化提速」）：App 每次冷启动从网关全量加载 DSH 前端——实测 **62 请求 / 5.7MB**，其中 **4.8MB 是两个 `/plugins/??…&rev=` 插件 UI 聚合包**、432KB 核心 JS。老总方案探讨「UI 冻结进 App 包」——工程结论：**固化「缓存」而不是冻结「版本」**（DSH 前后端同版本耦合，冻结 UI = 每次 DSH 升级手机变砖等 App 发版；缓存 = 既秒开又自动跟新）。
- **修法（两层，老总划定边界：DSH 原生不动，只动 dsh-anywhere 插件 + App）**：
  - **网关插件层**（`C:\Users\Administrator\.dsh\profiles\desktop\node_modules\dsh-anywhere\lib\proxy.mjs`，已部署）：新增 `ANYWHERE_IMMUTABLE_CC='public, max-age=604800'` + 指纹判定 `isImmutableAssetUrl`（`[?&](rev|v)=指纹` 或哈希文件名），在三个出口（JS 改写 / 压缩 / 最终透传）把带指纹资源从 `no-cache, must-revalidate` 升级为 7 天强缓存；入口 HTML 保持 no-store；插件既有 ETag/304 协商保留（窗口过后照常协商）。取 7 天而非 1 年：插件自身会改写部分 JS（插画瘦身/lookbehind 兜底），改写逻辑升级后最坏 7 天自愈；DSH 换版即换 rev → 天然全量刷新。**备份**：`E:\desktop\所有skill\backup\dsh-anywhere.proxy.mjs.bak-cache-20261025`。**生效**：DSH Desktop 全量重启（⚠️ 计划任务对运行中实例是空操作，且残留实例会卡死新实例单例握手——必须 taskkill 全部实例后再拉计划任务）。
  - **App 侧 R42**（AppDelegate `PrewarmHelper.warmServiceConnection`）：进程拉起最早时机对服务源 HEAD 热身（ephemeral、4s 超时、不落缓存、失败静默）——唤醒 Funnel 隧道 + TLS 会话票据复用，WebView 首请求握手近零成本。
- **验证**（3083 直连实测；全链 Funnel→9060 port-manager→3083→3081，9060 段读码确认不剥 cache-control、其 `&_pcf=121a` 缓存击穿为常量版本号与强缓存天然兼容）：批量插件包/哈希资产响应头 `public, max-age=604800` ✅；热载三个聚合包（4.8MB）**全部 0KB 命中**、仅剩动态 API ~0.2MB ✅。⚠️ 假阴坑：reload 抢在首载响应落盘前会 miss（时序竞态，正常使用无此问题）；跨加载资源条目顺序会变，URL 对比必须排序后比。
- **教训**：①提速先实测「钱花在哪」——4.8MB 聚合包占 84%，先抓大头；②凡前后端同版本耦合的系统，**指纹 URL + 长新鲜期缓存**是唯一既快又自动跟版的解，冻结版本必死；③两套缓存机制（插件的 immutable 与 port-manager 的 _pcf 击穿）靠「常量版本号」天然兼容——主动击穿走 _pcf，被动跟随走 rev；④DSH Desktop 重启铁律：**先 taskkill 全部再拉计划任务**，残留实例卡死单例握手会让 3083 永不监听（本次实锤）。

- **🔴 回滚记录（2026-10-25 晚，最高优先级教训）**：补丁部署当晚老总真机**黑屏**（两张截图：深色空屏仅状态栏）。处置：proxy.mjs 已从备份回滚（`dsh-anywhere.proxy.mjs.bak-cache-20261025`）+ DSH 全量重启 + port-manager `_pcf` 121a→121b 全量击穿手机缓存（强制重开 App 即恢复）。**根因初判**：immutable 强缓存 × 网关 URL 改写（HTML 带 `_pcf=121a` 而 JS 动态 import 用原始 `?rev=` URL——同一文件两套 URL 两个独立缓存条目）× DSH 重启（插件热重载可能改内容）三者组合下，手机侧**版本混载**（部分资源旧缓存、部分新拉）→ 模块系统错配 → 黑屏。沙箱 3083 全程正常（无缓存遗留）证明是纯客户端缓存态问题。**铁律新增**：凡走 URL 改写的网关链路，禁止对同一资源存在「带改写参数/不带参数」两套可缓存 URL；缓存补丁重新上线前必须先复现「混载」场景并证明免疫。

### R43 右侧边栏按钮/整条顶栏「超出屏幕」六犯：R41 补丁自身成了遮挡源与幽灵按钮源（v1.0.140(110) 根治，2026-10-25）

- **症状**（老总 2026-10-25 20:41 真机两张截图，1290×2796 原图逐像素取证）：
  - 图一（开始页）：**整条顶栏只剩一条 5pt 残影**——罗盘图标/「开始」标签/右侧三个功能钮（分栏·退出全屏·收起右侧边栏）都只在 y=192~207px（=64~69pt）露出一条横切片，其余位置**纯白 255/255/255**（逐行取最小像素证明是硬裁切，不是淡化）；其中 x=1204~1244（401~415pt）那条正是**右侧边栏按钮**。
  - 图二（会话页）：顶栏正常，但右缘 x≥1230、y=1393~1444（465~481pt）有**一枚淡紫圆环按钮被右缘切掉**。
- **根因（沙箱复现，两条独立缺陷，都在 R41 补丁自己身上）**：
  - ① **幽灵按钮**：`syncDrawerGeometry` 的 R41 簇级钳制遍历**全页** `[class*="stripChrome"]`。抽屉收起时整个右侧面板停在 x≈vw+22（430 档实测 452），面板内簇自然右缘 ≈880 → 被判「越界 450」→ 整簇 `translateX(-450~-880px)` + `z-index:9` 拖进可视坐标（实测被拖到 [352..424]，正是真机 x=401 那条）。**屏外容器里的元素被拖进屏幕**，这就是「按钮超出屏幕/拉不回」的幽灵来源。
  - ② **遮挡源**：R41 给 `[class*="stripChrome_"]` 挂了 `background: var(--dsh-pagebg, rgb(21,21,23))` + `padding-left:6px` + 负向 box-shadow（本意「叠在标签上防穿透」）。该底色**不透明**，在开始页那条标签行（=整条顶栏）上会把其下内容整块盖住 —— 暗色下沙箱实测渲染成**纯黑块**，浅色下 `--dsh-pagebg` 解析为白即「顶栏整条消失只剩残影」。
  - ③ **帮凶**：R41b 的 `margin-top: -Npx` 上拉对**裁剪容器**内的行无保护（父容器 `overflow-x:hidden` 会把 overflow-y 也算成 auto），一旦拉过量就把整行推出父容器被硬裁成一条残影；旧上限 `Math.min(80, …)` 对「量错元素」的情形毫无防护。
- **修法（R43 四件套，全部落在 `syncDrawerGeometry` 周期函数体内）**：
  - ① **屏外容器零平移**：遍历时先做祖先链可见性判定 —— 任一祖先整块越过视口右缘（`rect.left >= innerWidth`）即判隐藏态，`continue` 并清掉该簇历史补偿；
  - ② **簇底色改 `transparent`**（sticky + right:4px + z-index 保留，可见可点不受影响），遮挡源归零；
  - ③ **顶栏活命自愈**：每拍复查所有带 `data-dsh-strip-clamp` / `data-dsh-strip-pull-n` 的元素，凡实测越出父容器边框（=会被 overflow 裁）立即撤回本补丁写入 —— **任何自家补丁都不允许把顶栏藏起来**；
  - ④ **拉力三重封顶**：单次 ≤24px（对齐是微调，要拉几十 px 必然量错元素）+ 父容器为裁剪容器时不得超过「行顶到父容器顶」的可用余量 + 算不出安全值就不动。
  - ⑤ **「打开后一闪一闪」根治（老总同日追问，主会话页）**：闪烁源就是**自家补丁的微调**——R39 救援在开合动画收尾后 1~2 拍才写一个 2~4px 位移，肉眼即一次跳变；而真机顶栏里「后台任务胶囊文字周期变宽 + 智能体团队计数跳动」又让模糊稳态门可能**永远不满足**，救援无限等待、按钮留在屏外。两条补丁：**6px 死区**（位移 <6px 一律不写，代价是按钮最多允许越界 4px，肉眼不可辨）+ **700ms 超时兜底**（连续 700ms 仍在屏外即无条件按基准位重算写一次）；并把 `header` 纳入 R41c 的**挂载即矫**选择器 —— 会话切换/抽屉开合引发 header 重挂时，救援在**首帧渲染前**落地，不再有「先渲染偏低一帧再纠正」的跳变。
- **验证**（沙箱 430×932 / dsf3 / sb=59 / 浅色，`_diag/_probe_r41_home.cjs`）：修复前收起态面板内簇被写 `translateX(-880px)`+`z-index:9`，开始页顶栏右上出现不透明块；修复后该簇内联样式**全空**（零平移），开始页顶栏「🧭开始 + 分栏 + 退出全屏 + 收起右侧边栏」四件**完整可见**（`_r41_drawer_430.png` 对拍），右缘越界元素 0，`tabHostHeader` 不再需要上拉（自然位 47 = 目标位 47）。闪烁量化（`_diag/_probe_r43_session.cjs` 每 40ms 采样）：静置期 1 个几何签名；点开后 1 个；点收后 **2 个签名**（`btn.left 398→396` + 多出 `translateX(-2px)`）—— 这 2px 迟写就是「一闪」的实证；6px 死区后不再写。闸门新增 `[顶栏·R43]` + `[抽屉·R43]` 两条行为断言（屏外簇零平移 / 可见簇零不透明底色 / 行不出父容器；2px 不写 + 40px 抖动下 700ms 兜底拉回 vw-2）+ 源锚点（`__visC` / `__heals` / `__cap` / `background: transparent` / `__dshOverSince` / `__diffN >= 6` / `__mtSel = 'header, `）。
- **教训**：①**「修复自己成为新故障源」是本项目第六次踩同一个坑** —— 补丁每次只盯症状不设「不许造成次生灾害」的不变量，所以必须给补丁本身加护栏（活命自愈）；②凡遍历全页选择器的补丁，**先判可见性再动手**，屏外容器（收起面板/隐藏列）的元素拥有完全真实的几何，会被误判成「越界」；③「防穿透」类不透明底色是危险操作 —— 它和被修元素同属一个 stacking context，一旦位置算错就是整块遮挡，能用透明/描边就不要用实底；④负 margin 上拉在裁剪容器里等于「把内容推出可见区」，必须对着父容器余量封顶。

### R44 开→关抽屉回会话页「抽屉按钮出屏约 1/3」七犯：DSH 滞留位移骗过基准位救援（v1.0.141(111) 根治，2026-10-25）

- **症状**（老总 23:19/23:23 两张真机顶栏对比图逐像素实证）：新进会话页按钮完整（右缘距屏 45px/3x=15pt）；点右侧抽屉按钮进「开始/文件」顶栏（仍闪一下）→ 再点回主会话，**同一按钮右半截被切**（图标深色列宽 33px vs 完整 42px，出屏约 1/3）。
- **根因**（沙箱连拍取证 `_probe_r44_cycle` / `_probe_r44_boss`，用老总同一条会话复现）：关抽屉后 DSH 在 `headerCorner` 上补写**自己的** `translateX(-8px)` 且长期滞留不撤 → 按钮**视觉**右缘被顶到 vw（贴死屏缘，svg 描边被容器裁掉右角）。而 R38 铁律②的救援按「基准位=视觉位−现有位移」重算，认为自然位合法（over≤0）→ **永不介入**。铁律②防住了「动画期误补偿」，防不住「动画早已结束、DSH 位移长期滞留」——这是它的盲区。
- **修法（R44 视觉位救援，收编进 `syncDrawerGeometry` 开关按钮段）**：仅在**抽屉关闭态**（rightbarCol / `[data-sidebar-right-open]` 实测仍在视口右外）且**视觉越界 >4px 连续 ≥1200ms**（开合动画 ~300ms，持续滞留必非动画帧）才出手：把总位移整体重算（含 DSH 那份）`transform = curN − visOver` 拉回 vw-2，单值不累加、幂等、回屏即清零计时。动画期与抽屉开启态双重闸住，R38 铁律①②④全部保留不破。
- **验证**：boss 会话（「同步DSH iOS打包更新」，顶栏=标题+后台任务胶囊+团队+按钮，与真机同构）沙箱实测：修复后基线 `right=428=vw-2、tf=translateX(-10px)`（救援接管后稳定值），全程无贴边帧；普通会话页开合循环 right 恒 428。闸门 `[抽屉·R44]` 行为断言（给 headerCorner 注入 +12px 滞留位移 → 按钮视觉右缘必须 2.5s 内回 vw-2 内，撤除后不过拉 vw-14）+ 源锚点（`__dshVisSince`/`__visOver`/`__wantTotal`/`__drawerClosed`）。
- **教训**：①**基准位救援必须配视觉位兜底**——「自然位合法」不等于「视觉位合法」，第三方（DSH）滞留位移会把合法自然位推成非法视觉位；②沙箱复现要用**真机同一条数据**（标题长度/胶囊数量决定顶栏拥挤度），老总这条会话正是「1 个后台任务」长标题形态，普通会话根本复现不出；③「闪烁」与「出屏」可能是同一写入方的两个相位（DSH 补写 -8px 那一帧=闪，滞留不撤=出屏）。

### R45 抽屉按钮出屏八犯 → 代码重构：唯一守卫「自然位清零模型」（v1.0.142(112) 根治，2026-10-26）

- **症状**（老总 1.0.141 真机复验：开→关抽屉回会话页，按钮仍出屏约 1/3；指令「认真看看这个按钮逻辑，代码重构」）：R44 视觉救援在真机没兜住。
- **根因（审计结论）**：这个按钮身上压着 **R35b/R38/R39/R43⑤/R44 五层救援补丁**，每层各有一套门限（增量补偿/基准位/模糊稳态门/6px 死区/700ms/1200ms 计时器/态豁免/位移上限），互相踩位、互相遮蔽——**每一个门限都是一个漏网口**，补丁摞补丁的救援在真机上永远防不住下一个相位组合。八犯的直接机制：R44 出手后 DSH 撤掉它自己的 headerCorner 滞留位移，我方补偿没跟着撤 → 按钮被自家补偿过拉左移（沙箱复现：撤除注入后 tf 滞留 -42px）。
- **重构（唯一守卫，`syncDrawerGeometry` 开关按钮段整段替换，五层补丁全删）**：
  - **不变量**：按钮**视觉**完整可见——right ≤ vw−2 且 left ≥ 0（自然位实测恰贴边=DSH 原生设计，图标内缩 4px 描边不裁）。
  - **自然位清零模型**：natural = 视觉位 − 自身全部位移。natural 健康 → **目标位移=0，撤销一切 transform**（含 -448 类旧毒与 DSH 滞留位移——自然位本来就在屏内，清零才是回位；「钉到近边」正是前几版过拉的根源）；natural 右溢 → 目标 = (vw−2) − naturalRight；左溢 → 目标 = −naturalLeft。目标≠当前位移且差量**连续两拍（±2px）稳定** → 整体写入目标值（绝不累加）。
  - 祖先（headerCorner）被 DSH 写的滞留位移计入 natural 一起解，我方用自身 transform 补差——它何时撤、撤多少都不影响收敛。两拍稳定门挡掉开合动画（~300ms 视觉位剧变）误伤。**无死区、无计时器、无态豁免、无位移上限。**
- **验证**（沙箱 430×932，`_probe_r44_boss` 真机同构会话 + 闸门 `[抽屉·R45]`）：基线 right=428=vw-2；注入 headerCorner +30px 滞留 → 1.5s 内拉回 428（tf=-40px 含 DSH 自身 -8px 一起解）；撤除注入 → 收敛回最小补偿 -2px，**不过拉、无残留**；-448px 旧毒 → 清零回自然位 428 ✅。R35b/R38/R39 行为断言全部按新语义改造通过；源锚点新增「旧门限字样不许回潮」负断言（`__dshOverSince`/`__dshVisSince`/`__diffN >= 6` 出现即红）。
- **教训**：①**同一对象上的救援补丁超过两层就必须重构**——五层救援互相遮蔽，任何一层的门限都是别人的漏网口，「再补一层」是死路；②救援的终态必须**可撤销**：出手时写多少、环境恢复后就要撤多少，把补偿当永久资产必然过拉；③「清零回自然位」优于「钉到限值」——自然位是 DSH 原生设计意图，救援只负责把非法自然位拉回合法，不负责重新摆位；④闸门断言要测**行为不变量**（视觉位∈健康带），不测实现细节（谁写的位移、写了几次）。

### R46 文案规范：更新说明/关于最大化精简 + 序号对齐 + 靠左 + 纳入打包前校验（v1.0.142(112)，2026-10-26）

- **要求**（老总令：「前面版本要求了，更新说明和关于要尽量最大化精简，不要长篇大论。排序1-2-3-4-5-6等等，序号对齐。很多地方，页面的说明文案都要更新，靠左对齐，这个要纳入打包前校验」）：该要求在 v1.0.131(97) 提过（当时只做了弹窗左对齐 `alignAlertMessageLeft`），设置页更新日志卡越写越长（18 大条 × 每条 4~8 个长 bullet、序号 🥇2 重复出现四次、徽章写死 v1.0.139、关于页本版要点停在 v1.0.134）——**要求没落成机械校验就会回潮**，本次一并根治。
- **修法**：① 设置页「更新说明」整卡重写为 **18 条一行式**（`N. 结果一句话 (版本区间)`，每条 ≤40 字，只写结果不写过程；徽章版本改**动态取 `Version.marketing`** 永不陈旧；标题/正文显式 `textAlignment = .left`）；② 关于页「本版要点」同步精简 ≤3 条；③ 更新弹窗沿用 `alignAlertMessageLeft`（左对齐）+ latest.json changelog 改为短句序号式；④ **闸门新增 `[文案·R46]` 机械校验**：直接解析 Swift 源——logContent 序号必须 1..N 严格递增不重复、每条 ≤40 字、badge 必须动态、标题/正文必须显式左对齐、关于页要点 ≤3 条且序号式——任何一条不合规 = 红条禁打包。
- **教训**：①**口头/记忆里的排版要求必须落成闸门断言**，否则两个版本内必回潮（本次是同一要求二次返工）；②写死在 UI 里的版本号（徽章/本版要点）是陈旧文案的最大来源，一律改读 `Version.marketing` 动态拼接；③长更新日志对玩家无价值——过程细节归 REGRESSION.md（仓库），App 内只留一行式结果。

### R47 九犯「13 个后台任务会话默认出屏」：JS 守卫在真机会整体死亡，防出屏必须有 CSS 兜底（v1.0.143(113) 根治，2026-10-26）

- **症状**（老总 12:20 真机：1.0.142 装后「打开主会话，右侧抽屉按钮默认就超出屏幕」；该会话顶栏是「**13 个后台任务**」超长胶囊，与既往复现用的「1 个后台任务」拥挤度完全不同）。
- **根因（CSS-only 探针实锤 `_probe_r47_cssonly`）**：只注入 CSS、不跑 JS shim（= 真机 JS 通道死亡环境，R42 已实锤过真机存在这种环境）进该会话 → 按钮 right=434 > vw=430 默认出屏。**R35~R45 十版把防出屏全写在 JS 守卫里，JS 一死全部救不了**——这是历次「沙箱绿真机错」反复复发的总根源之一。次因：R45 守卫还留着「两拍稳定门」，真机胶囊文字随流式每拍变宽 → 越界量逐拍抖动 → 门永不满足（R39 同款坑，重构时没删干净）。
- **修法（两层）**：① **CSS 兜底**：`headerCorner` 整簇 `position:absolute; right:2px` 钉在标题行右缘（脱离 flex 流，顶行溢出多少与它无关；crumbs 本有 right:96 预留不被压）——JS 死也绝不出屏；② **两拍门删除**：守卫每拍从当前视觉位直接解目标值并写入（幂等：到位后 Δ=0 零写入；动画帧误读至多存活一拍即被下拍覆盖）。
- **验证**：CSS-only 探针修复后 right=428 ≤ vw-2 ✅；胶囊 ±6px 高频抖动 3 秒全程 right 恒 428 ✅；全量闸门 112 绿/0 红（2 项 DSH 前端死循环连坐无法校验）✅；源锚点新增 `[顶栏·R47]`（absolute 兜底三特征）+ `[抽屉·R45/47]` 负锚点（`__dshGuardX` 计时器回潮即红）。
- **教训**：①**真机存在 JS 几何 shim 整体死亡的环境（R42 实锤），任何布局不变量必须有纯 CSS 兜底**——JS 守卫只能做微调与补偿，「绝不出屏」这种底线必须由 CSS 钉死；②「两拍稳定门」在内容持续变宽的真机顶栏里永不满足——R39 教训重演，幂等直写（每拍从视觉位重算）才是正解，动画误读存活不过一拍；③复现必须用真机同一条数据（13 个后台任务的拥挤度是这次的关键变量，1 个任务永远复现不出）。

## 三、校验 SOP（每个新版本出包前必做）


### 前置
1. DSH Desktop 必须起来（3083 有响应）：
   ```powershell
   curl --noproxy '*' -o /dev/null -w "%{http_code}" http://127.0.0.1:3083/
   # 不是 200 就：Start-ScheduledTask -TaskName "DSHDesktop-Launch"（约 15~20 秒）
   ```
   ⚠️ DSH 桌面端**只能用计划任务拉起**，沙箱内直接启动一律被回收。

### 跑闸门
```bash
cd E:/desktop/所有skill/deepseek-harness-ios/_diag
env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY -u all_proxy -u ALL_PROXY \
  NODE_PATH="C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules" \
  "C:/Users/Administrator/.workbuddy/binaries/node/versions/22.22.2-6/node.exe" regression.js
```
- 全量跑三尺寸：430×932 / 393×852 / 375×812，共 **30 条断言**。
- `--quick` 只跑 430（调试用，**发版必须跑全量**）。
- 退出码 `0` = 准予打包；`1` = **禁止打包**，按红条定位再修。

🔴 **必清代理环境变量**。否则 Playwright 继承系统代理，`127.0.0.1:3083` 全部 404/403、`#root` 空，会把「代理污染」误判成「DSH 挂了」。

### 资产同步（改了 Swift 里的注入代码后必须重做）
闸门依赖从 Swift 还原出来的两份资产，改完代码要重新生成，否则测的是旧代码：
```bash
cd _diag
python _extract_js.py        # → app_inject.js（从 ViewController.swift 抽 iosCompatShims，CSS 也在里面）
node --check app_inject.js   # 语法体检，不通过就是 Swift 里 \\( 之类的转义又写错了
```
> `app_inject.css` / `app_inject_old.css` 是早期做「修复前/修复后对照图」用的旧资产，闸门不依赖它们。

### 交付
🔴 **视觉类修复必须带修复前后对照图**，不许只说改了。

---

## 四、编码铁律（防止再引入会失效的补丁）

1. 🔴 **禁止写 CSS Module 哈希类名**（`ank0OG_*` / `uWtHQG_*` / `CZPbNW_*` / `NwyCaq_*` / `VYXhfG_*` / `MnhYfG_*` / `_727C8a_*`…）。
   一律用不变量：`[class*="语义片段"]`、`aria-label`、`role`、文本内容、几何关系、`data-*`。
   > DSH 的类名格式还会换形态（实测从 `ank0OG_headerCorner` 变成过 `_button_1rv3m_2`），只有语义片段稳定。
2. 🔴 **禁止单点补丁**。凡是「把某个按钮推回 N px」的写法一律否决，改写成「遍历全页 + 安全线」的通用钳制。
3. 🔴 **绝不用 `margin` 推回溢出元素**：实测 flex 子项上 `margin-right` 会 1:3 放大（加 8px → 退 24px）。一律 `transform: translateX(-Npx)`，纯视觉位移、1:1 精确、幂等。
4. 🔴 **横向收口一律 `overflow-x: clip`，绝不用 `hidden`**：`hidden` 会创建滚动容器、破坏 `position:sticky` 顶栏。
5. 🔴 **自动修复必须自带定时器兜底**：只靠 MutationObserver，页面静止时一次都不跑。
6. 🔴 **每修一个问题，就往闸门加一条断言**。断言缺失 = 下次必然复发。
   修的补丁用了哪个语义锚点，就把该锚点加进 `_diag/regression.js` 的 `CRITICAL_ANCHORS`。
7. 🔴 **断言只能打不变量**。打哈希类名的断言本身就会随换版失效，等于没有闸门。
8. Swift 多行字符串里 JS 的 `\(` 必须双写成 `\\(`，否则编译失败。
9. 🔴 **新函数一律自包含**：注入 JS 被多个 IIFE 块分割，跨块调 `setP/num/sbHeight` 等
   会 ReferenceError 且被 `try/catch` 静默吞掉 —— 表现为「每 3 秒都跑、却什么都没写进去」
   （R14 真因）。局部 `setPI` + 就地 `parseFloat`。
10. 🔴 **z-index 出不了别人的 stacking context**：给深层元素抬 z 无效时，先查它挂在谁的
    stacking context 里（R14 第二真因），要么降对方、要么换宿主。
11. 🔴 **页面归属标记是红线**：任何 `loadURLString` 对 DSH 地址传 `markAsDSHService:false` 一律禁止；
    新增加载入口必须继承归属（R18 真凶）。
12. 🔴 **改文件一律二进制读写或 AI 编辑工具，严禁脚本文本模式重写**：
    `io.open(p).read()` + `write()`（newline 缺省）会把 CRLF 全转 LF（2026-10-20 踩过，AppDelegate/Info.plist 整文件 diff，靠 git checkout 抢救）；插入文本中的换行必须显式 `\r\n`。
    ⚠️ 2026-10-24 补充：Git Bash 的 `sed -i` **即使零匹配也会重写文件并剥掉全部 CR**（ViewController.swift 9552 行整文件 diff，当场用二进制 `\n`→`\r\n` 转回抢救）—— 本仓库 CRLF 文件上禁用 `sed -i`，替换一律 `io.open(p,'rb')` 二进制读写或 AI 编辑工具。
13. 🔴 **改完代码必须重跑闸门出新凭证**：CI 硬校验 `sourceHash == 现场 sha256`，凭证过期 = 打包直接被拒。
14. 🔴 **「沙箱绿、真机错」先做真机截图逐条带像素对拍**（R18 方法论）：先归因页面层 vs 原生层，绝不连改多版页面层碰运气。

---

## 五、闸门设计说明（为什么这么测）

| 设计 | 原因 |
|---|---|
| 注入 App 的**完整 CSS + JS**（不只是 CSS） | 只注 CSS 测不出运行期钳制（`fixOverlayOverflow` / `alignComposerButtons`），会误报 |
| 溢出只看「左边缘在屏内、右边缘越界」 | 整体在屏外的（右侧面板收起时 `left == vw`、抽屉收起时 `left == -150`）是收起态，本来就该在屏外 |
| 重叠判定用 `elementFromPoint` 采样，不用 bounding box 比对 | 滚动容器的 bounding box 天生覆盖其下方吸底区 —— 曾因此误报「133 对重叠」，实为假警报 |
| 断言锚点只用 `aria-label` / `[class*=]` / 几何 | 哈希类名会漂移（见第一节 62/102） |
| 三尺寸各跑一遍 | 抽屉 252px 在 375 宽屏上占比更大，430 绿不代表 375 绿 |

---

## 六、版本台账

| 版本 | build | CI run | 要点 |
|---|---|---|---|
| 1.0.122 | 61 | `39266712218` | 横向溢出第一轮（单点补丁，后会复发） |
| 1.0.123 | 62 | `39275502511` | 通用出血钳制 + 3 秒兜底定时器 |
| 1.0.124 | 67 | `39351887630` | 抽屉 252 收敛 + 齿轮 v1.0.9 + 会话框按钮居中 + 删除崩溃 + 费用计量浮层遮挡 + **回归闸门建立** |
| 1.0.125 | 本次 | 本次 | 底部插件 dock 换行防重叠（R13）+ 插件页 fab 可点/不压标题（R14）+ 顶栏兜底硬钳制（R15）+ 闸门扩到 34 条 |
| 1.0.126 | 本次 | 本次 | 顶栏 +59pt 根治（R16，真机 env=59 像素实锤，删代理层 env padding）+ 详情页 fab 避让（R17）+ 闸门常驻模拟真机 env=59，扩到 40 条 |
| 1.0.129 | 73 | `39423199229` | 会话框底排防挤爆（撤回/重优出现时发送钮被挤出屏）+ 整页滚动锁 + 闸门防挂死三件套，65 断言 |
| 1.0.130 | 74 | `39442915203` | **顶栏 +59 真凶在原生层根治（R18，归属标记写坏）** + 服务列表排序（R19）+ 闸门 65 绿/0 红；老总真机确认闭环 |
| 1.0.131 | 97 | — | 顶栏按钮固定车位定版（R31：目录最左 12px / 标题 / 后台任务 / 智能体团队 358 / 抽屉 394）+ 弹窗说明靠左；98~100 全局重构翻车已回退，97 为稳定基线（老总令：1.0.131 停留在 97） |
| 1.0.132 | 101 | `40054493653` | **后台任务胶囊 × 智能体团队重叠根治（R32：32×32 规则漏排除真凶 + 测量死循环 + 车位漂移 + 标题预留盲区）** + 闸门新增 4 条断言（89 绿/0 红）+ 探针三档对拍零重叠；MD5 `f9e188f159600f13f327bb146ace93ce` |
| 1.0.133 | 102 | `40063506152` | **标题横跳双源根治（R32b/R32c：胶囊冻结污染 + 无胶囊流式场景流内矩形每帧跳变，单一真值化）+ 图片放大预览「闪退」根治（R33：看门狗 4ms 内把灯箱改锚定塌缩 5×0，整层豁免含 img 的 modal dialog）** + 闸门 91 绿/0 红；MD5 `d167ee0f9eddd66893bf5f7fb0a40991` |
| 1.0.134 | 103 | `40074031610` | **右抽屉顶栏三症状根治（R35：DSH 自写 --dsh-statusbar=75 偏大，面板改优先读原生 --dsh-sb-native + syncDrawerGeometry 300ms 常驻环幂等校正与防出屏「只补不清」补位）+ 左侧目录手势化（R36 老总拍板：目录/侧边栏开关整排隐藏（0-size+overflow+opacity:0），左缘右滑开目录、左滑关目录→关右栏→子页返回，最多退回会话主界面；断言 7 不变量更替：fab 隐藏但元素在=手势 click 载体）** + 闸门 85 绿/0 红（5 项 DSH 前端死循环连坐无法校验，非 App 回归）；MD5 `f843b4b30bef2fa3fdaa0d986b60c113` |
| 1.0.135 | 104 | `40083843838` | **R35b 文件工作区下移+抽屉按钮出屏二次根治（--dsh-statusbar 值守卫：MutationObserver 微任务回写先于渲染；防出屏改增量补位，带位移出屏也精确收敛 vw-2）+ R36b 手势双方向收窄左缘 32px（老总实证全屏横滑误关误返）+ R36c 插件页死胡同根治（整页容器横滚豁免修正 + 左滑四连兜底扑空拉开目录，真命中目标探针验证）** + 闸门 97 绿/0 红；MD5 `c97045abbbcdeb8608566e46f9698c32` |
| 1.0.136 | 105 | `40110230482` | **R37 + 号弹层闪退根治（writer-held 写句柄持有期伪关闭按时机判据吞掉 + 提示行）+ R38 抽屉按钮出屏三犯根治（防出屏五铁律重写）** + 闸门 103 绿/0 红；老总真机验收：+ 号弹层已修复 ✅、抽屉/工作区仍复发（R39 四犯）；MD5 `0699409a3f2420513324fadcd2f911f1` |
| 1.0.137 | 106 | `40115979794` | **R39 抽屉四犯 + 工作区下移三犯根治（守卫 v2：记忆冻结 + 三变量全恢复 + 全子树盯防；救援 v2：模糊稳态门 ±2px + 160 上限精确收敛 vw-2）+ R40 多终端同步丢失根治（前台合成 online 双派发 + 长后台 reload 冷恢复；占用锁官方无解，profile 插件空闲让出列入后续）** + 闸门 109 绿/0 红；MD5 `d198887ecc9abe71cebf5c0d3e483131` |
| 1.0.138 | 108 | `40191493627` | **R41 抽屉按钮出屏五犯根治（真凶=标签条拥挤：功能钮簇被推入 pane overflow-hidden 裁剪区物理拉不回；簇级单值重算钳制+sticky 双保险）+ R41b 顶排高度锁定恒等会话页内容行（绝对值单拍重算容差 3pt）+ R41c 挂载即矫根治开合闪烁（渲染前微任务全量矫正首帧即正确）** + 闸门 109 绿/0 红（1 项 DSH 前端死循环连坐非 App 回归）；对比模拟图与三格高度对齐拼图已交老总过目确认；MD5 `ffd09e1bc2d35b6251f384f59415857f`；git push 被代理掐断，经 gh api Git 数据接口原子推送（远端 046042de，本地待网络恢复后 fetch 对齐） |
| 1.0.139 | 109 | `40194201942` | **R42 启动预热（App 侧 HEAD 热身）** + 闸门 111 绿/0 红；⚠️ 同日网关缓存补丁（R42 插件侧 immutable 7 天）真机黑屏**已回滚**并 _pcf=121b 击穿恢复（详见 R42 条目回滚记录）；MD5 `e50bdcd80e5938d7bcccb466ec1b14dc` |
| 1.0.140 | 110 | `40205729915` | **R43 右侧边栏按钮/整条顶栏「超出屏幕」六犯根治（真凶=R41 补丁自身：①屏外收起面板内簇被簇级钳制整簇 translateX(-450~-880) 拖进可视区=幽灵按钮；②stripChrome 不透明底色 rgb(21,21,23) 盖死开始页顶栏只剩 5pt 残影；③R41b 负 margin 上拉无父容器裁剪保护）——四件套：屏外容器零平移（祖先链可见性判定）+ 簇底色改透明 + 顶栏活命自愈（自家补丁写入把行推出父容器即撤回）+ 拉力三重封顶（≤24px/父余量/算不出不动）** + 闸门 110 绿/0 红（2 项 DSH 前端死循环连坐无法校验，非 App 回归；R41 旧断言同步改造：屏内簇强推拉回，禁拿屏外簇冒充）；A/B 对拍图 `_diag/_r43_ab_compare.png`；凭证 src=`e3dacb236a85`；MD5 `badb54f30dde387e0b716568fd28189d`；⚠️ 老总真机验收：开始页遮挡已好，但「开→关抽屉回会话页按钮出屏 1/3」仍复发（R44 七犯，见下行） |
| 1.0.141 | 111 | `40251283534` | **R44 开→关抽屉回会话页「抽屉按钮出屏约 1/3」七犯根治（真凶=关抽屉后 DSH 在 headerCorner 补写/滞留 translateX(-8px)，按钮视觉右缘贴死屏缘被裁；基准位救援认为自然位合法永不介入——铁律②盲区）——视觉位救援：抽屉关闭态 + 视觉越界>4px 连续≥1200ms 才出手，总位移整体重算拉回 vw-2（单值不累加幂等）** + 闸门 116 绿/0 红/0 无法校验（新增 `[抽屉·R44]` 行为断言 + 源锚点）；boss 会话沙箱实测基线 right=428=vw-2；凭证 src=`ef52b6133eee`；MD5 `349b9b5c2937569f4e7cb88be8f3ea59`；⚠️ 老总真机复验：开→关抽屉回会话页仍出屏 1/3（八犯），指令「代码重构」→ R45 |
| 1.0.142 | 112 | `40264363082` | **R45 抽屉按钮出屏八犯 → 代码重构：唯一守卫「自然位清零模型」（五层救援补丁 R35b/R38/R39/R43⑤/R44 全删）+ R46 文案规范纳入打包前校验**（更新说明 18 大条→一行式 ≤40 字、序号 1..N、显式左对齐、badge 动态版本；闸门 `[文案·R46]` 解析 Swift 源机械校验）；闸门 116 绿/0 红；凭证 src=`f5b7c605fb1b`；MD5 `9b032e721e55fd53cf91f14a6da7ca75`；⚠️ 老总真机复验：「13 个后台任务」长标题会话默认出屏（九犯）→ R47 |
| 1.0.143 | 待打包 | 待打包 | **R47 九犯根治（真凶两层：①R35~R45 十版防出屏全写在 JS 守卫里，真机 JS 通道会整体死亡（R42 实锤环境），CSS-only 探针实测 right=434>430 默认出屏；②R45 残留两拍稳定门被真机胶囊流式变宽卡死——R39 同款坑）——修法：headerCorner 整簇 CSS absolute right:2px 钉标题行右缘（脱离 flex 流，JS 死也绝不出屏）+ 守卫删两拍门每拍幂等直写目标值** + 源锚点 `[顶栏·R47]` 三特征 + `[抽屉·R45/47]` 负锚点（计时器回潮即红）；CSS-only/抖动/全量三探针全过；更新说明/关于文案同步 1..19 |


## 七、闸门自身踩过的坑（复用必读）

1. **跨 IIFE 作用域调函数 = ReferenceError 被吞**：`num/setP/sbHeight` 定义在 4154 行边界之后的块里，`applySidebarInset` 所在块调不到 —— `fixPageHeadFab` 第一版因此「每 3 秒都跑、却什么都没写进去」。新函数一律**自包含**（局部 `setPI`、就地 parseFloat），并必须实测「内联样式真的写进去了」才算修完。
2. **z-index 出不了别人的 stacking context**：fab z=1000 挂在 overlayLayer(z=20) 里，被根 context 的 pageHead(z=999) 压住 —— 抬 fab 自身没用，要么降对方、要么换宿主。
3. **验证「没修好」先查「跑没跑」再查「对不对」**：先手工复算判定条件确认逻辑无误，再查作用域/调用链，两步定位。
3. **验证「没修好」先查「跑没跑」再查「对不对」**：先手工复算判定条件确认逻辑无误，再查作用域/调用链，两步定位。
4. **锚点断言不能拿「默认态 DOM 命中数」当判据**（v1.0.126 第一版实测误报 97/134）：`viewOptionsMenu`/`modal`/`questionDialog` 等惰性组件默认态本来就不在 DOM 里。正确判据是双层：关键锚点跨四态（主页/抽屉/会话/插件页）任一命中即活 + 硬断言；全量 134 锚点对「DSH 自有 CSS 规则文本」做子串体检、只记录趋势不拦截。
5. **CSS 规则文本必须排除自家注入样式表**：我们注入的 `[class*=` 选择器包含所有锚点字符串，不排除就 100% 自证通过。识别铁证：含 `[class*=` / `[class^=` / `[class$=` 的样式表即注入层（DSH 自己从不用属性子串选择器）。实测 202 张样式表里 9 张是自家的，剩余 138 万字符才是权威语料。
6. **一次性公告弹窗要按用户路径处理**：费用插件的 `dialog.cm-billion-notice`（居中 fixed 模态）会盖住抽屉上半部并干扰齿轮 `elementFromPoint`，制造两条假红。它是插件 UI，App 侧不动（改动只在 App 侧铁律），闸门模拟用户点「知道了」+ 抽屉扫描跳过 fixed 祖先链。

## 八、闸门如何强制：发布凭证 + CI 卡口（v1.0.126 定版）

> 老总原话驱动：「重复问题重复出现，如何根治」。前两条（锚点换不变量、补丁通用化）治「怎么修」，
> 本节治「**不修能不能混过去**」—— 以前跑不跑闸门全靠自觉，CI 只要 commit 就打包，这才是流程层真漏洞。

### 机制

```
node _diag/regression.js（本地，三尺寸 35 断言）
   └─ 全绿 → 写 _diag/gate-result.json（发布凭证）
        { ok, pass/fail, version, dshFingerprint, anchorCritical,
          sourceHash: sha256(ViewController.swift), finishedAt }
git commit + push（凭证随仓库提交）
   └─ CI「Verify regression gate」步骤：python3 _diag/verify_gate.py
        ├─ 凭证不存在            → exit 1（没跑闸门）
        ├─ ok != true / fail != 0 → exit 1（跑了但红）
        ├─ sourceHash ≠ 现场 sha256 → exit 1（跑完又改代码）
        ├─ version ≠ 现场 VERSION  → exit 1（改版本没重跑）
        └─ anchorCritical.dead 非空 → exit 1（关键锚点失效 = DSH 改版）
```

### 四条拒绝路径实测（2026-10-20）

| 场景 | 结果 |
|---|---|
| 缺凭证 | exit 1 `缺少 _diag/gate-result.json` |
| 闸门红（ok=false） | exit 1 `回归闸门未通过（fail=3）` |
| 跑完闸门又改代码 | exit 1 `凭证 80a9625ac832 ≠ 现场 d82e16d09d3f` |
| 版本不符 | exit 1 `凭证版本 9.9.9 ≠ 现场 VERSION 1.0.125` |
| 正常全绿 | exit 0 放行 |

### 日常动作（每次发版）

1. 改完代码 → `python _diag/_extract_js.py && node --check _diag/app_inject.js`
2. `node _diag/regression.js`（约 2 分钟，需 3083 在线 + 计划任务拉起 DSH Desktop）
3. 全绿 → `git add` **逐个文件**（禁目录通配）→ commit + push → CI 自动校验凭证
4. 凭证里的 `dshFingerprint` 是 DSH 换版哨兵：DSH 官方前端一换版指纹必变，
   此时若关键锚点也死，闸门直接红 —— 这就是「换版即暴露」而非「用户先发现」。

### 已知边界（如实声明）

- 凭证是本地生成、随仓库提交的 JSON，理论上可手工伪造 —— 但伪造它需要**故意**绕过，
  与「防呆+防懒」的定位匹配；真要强对抗需 CI 内跑 Playwright + DSH 环境，macOS 免费算力跑不动。
- 55/134 惰性锚点（提问卡/下拉/灯箱等）闸门够不着，只做健康度趋势记录。
- 🔴 **闸门只测页面层（WKWebView 里的 DOM/CSS/JS），原生层（constraint/contentInset/scrollView 位移、
  归属判定、导航流程）永远测不出** —— R18（125~129 四版白修）就是这个盲区造成的。
  原生类问题只能靠：真机截图逐条带像素对拍 + 代码评审 + 老总真机验收。
