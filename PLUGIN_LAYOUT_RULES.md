# 插件 UI 布局规范 · 会话框禁占区（DSH 自建插件强制要求）

> **立规**：2026-10-23 老总令 ——
> 「以后任何插件看都不要占用这个会话框位置，占用了压缩原生按钮空间。提示其他玩家。
> 这是规范纳入 DSH 自建插件要求。」
>
> **适用范围**：所有 DSH 自建插件（含第三方插件、优化胶囊、费用计量、模型选择器、
> 任何往页面里加 UI 的扩展），以及 App 侧为插件做的一切适配代码。
> **两端同时生效、缺一不可**：
> - **① 插件源码侧**（电脑端 = 插件的 `client.js` 里 `slots.inject(slotName)` 选的 slot）——
>   必须从源头选对落点 slot，见第 3.1 节。
> - **② App 适配侧**（iOS 真机 / `ViewController.swift` 的 shim）——
>   只做隔离与兜底，不许替插件搬位，见第 3.2 节。
>
> 两端是同一套 DSH 前端，**改插件 slot 电脑端与手机端同时生效**；
> App 侧 shim 只在插件不改源码时做隔离兜底。
> **冲突优先级**：本文件 > REGRESSION.md > 记忆 > 聊天记录。

---

## 0. 一句话铁律

**插件永远不占会话框（composer）的位置，永远不压缩原生按钮的空间。**
插件要有 UI，去自己的地盘（顶栏 / 卡片下方 dock / 面板 / 独立浮层），
不许挤进用户打字的那个框，也不许把原生按钮挤窄。

---

## 1. 禁区定义（Session Composer Exclusion Zone）

禁占区 = 会话输入卡片矩形及其内部所有行：

| 结构（实测锚点） | 说明 |
|---|---|
| `[class*="composerStack"] [class*="_card"]` | 会话输入卡片本体（含圆角外框） |
| `VERcba_row` | 卡片底部按钮行 |
| `VERcba_tools` | 左半工具组（添加附件 / 语音 / 权限模式 / 插件胶囊） |
| `VERcba_standardControls` | 右半标准控件（模型选择器 / 优化 / 齿轮） |
| `VERcba_trailing` | 尾部操作区（发送 / 停止） |
| `VERcba_primary` | 发送按钮容器 |

**判定口径**：以上任一容器的边界矩形（getBoundingClientRect）内部，
不允许出现任何插件注入元素；以上任一容器内的原生元素宽度，
不允许低于其内容自然宽度（`scrollWidth`）—— 低于即「被压缩」，视为违规。

---

## 2. 绝对禁止（任一条即违规，闸门直接红、禁止发版）

### ❌ F1 往会话框里加东西
不许在 composer 卡片内 `appendChild` / 注入伪元素 / 叠加插件 UI。
状态徽标、剩余额度、用量提示、模型名、提示语，一律不许放进这个框。

### ❌ F2 用 `transform` 把插件元素「视觉上移」进会话框
**这是本项目史上最严重的错乱根源（两次复发）**：
`transform: translate(x, -85px)` 只改绘制位置，**元素仍占原容器的布局宽度**。
真机装了该插件后，工具行被这 85px 硬撑爆 → 模型按钮/权限按钮被压成叠印甚至消失。
「看起来搬走了」= 实际没搬走，必须按「仍占位」处理。

### ❌ F3 改原生容器的宽度来给插件腾位置
不许给 `standardControls` / `tools` / `trailing` / `row` 写
`padding-right` / `padding-left` / `width` / `flex-basis` / `margin` 来扣掉一块空间。
原生容器的宽度归 DSH 官方布局所有，插件不许动。

### ❌ F4 用 `position: absolute/fixed` 抢占原生按钮的坐标
不许把插件元素 absolute 定位到原生按钮所在的 x/y 上（哪怕 z-index 更高、看起来没遮住），
因为原生按钮的位置会随官方改版、屏幕宽度、键盘弹出而变，抢位必然在某机型上叠印。

### ❌ F5 让原生按钮变窄、被裁、被遮挡
禁止任何导致以下现象的写法：
- 原生按钮宽度 < 内容自然宽度（文字被截断成「i-3.8」「完全权」这类）
- 原生按钮中心点 `elementFromPoint` 命中的不是它自己（被插件遮住点不到）
- 原生按钮右缘越出卡片/屏幕

### ❌ F6 依赖「可能不渲染」的容器当常驻落点
不许把必须常驻可见的入口挂在条件渲染区域（例：费用明细 dock 在无会话数据时
`display:none`，整块不存在）。挂上去 = 新会话时入口消失。

---

## 3. 允许的落点（按优先级，插件要 UI 就选这些）

| 优先级 | 位置 | 约束 |
|---|---|---|
| **P1** | **会话头部 `conversation.session.header.actions`**（等于「对话 / 轨迹 / 系统监控」tab 行右侧、标题行那一排：`mobil · 智能体团队 · 创造模式 · [你的插件]`） | 高度 28px、垂直居中；**必须待在那一行**，宽度不够时按可用宽度等比压缩（标签出省略号），不许换行下移、不许挤压原生按钮 |
| **P2** | 会话卡片**下方**的 dock 行（`conversation.composer.dock` / `VERcba_dock`） | 仅限常驻渲染的内容；且 `flex-wrap: wrap` 允许换行 |
| **P3** | 侧边栏抽屉 / 设置面板 / 插件自己的页面内 | 不覆盖抽屉内原生入口 |
| **P4** | 独立浮层 | 不覆盖 composer，不覆盖顶栏原生按钮，必须有 `pointer-events` 收敛，关闭态零占位 |

### 3.1 插件源码侧：slot 黑白名单（电脑端 = 手机端，同一套前端）

**⛔ 黑名单 —— 禁止 `slots.inject` 这些 slot（全在会话框里）：**

| 禁用 slot | 为什么 |
|---|---|
| `conversation.input.left` | 左半工具行，直接挤 `+ / 语音 / 权限模式` |
| `conversation.input.right` | 右半工具行，直接挤模型选择器 / 齿轮 / 发送 |
| `conversation.input.model` | 模型 seat 本身；**接管**（`priority:-1` 替换官方）合规，**叠加**（同级并列）违规 |
| `conversation.input.model.label` | 模型按钮的文字位，宽度只有几十 px |
| `conversation.input.overlay` / `.attachments` / `.plan` / `.permission` | 输入框内部各层 |
| `conversation.composer.bar` | 输入卡片本体 |

**✅ 白名单 —— 推荐 `slots.inject` 这些 slot：**

| 推荐 slot | 位置 | 备注 |
|---|---|---|
| `conversation.session.header.actions` | 会话标题行右侧（**首选**） | 与「智能体团队」「创造模式」并排，实测零重叠 |
| `conversation.session.header.utilities` | 标题行工具位 | 与 actions 同一行的另一组 |
| `conversation.session.header.corner` | 标题行最右角 | 空间最小，只放图标按钮 |
| `conversation.composer.dock` | 卡片下方读数条（P2） | 官方 round/step/token pill 也在这里，`order` 排在其后 |
| `shell.overlay` | 全局浮层（P4） | 关闭态必须零占位 |
| `settings.section` / `sidebar.*` | 设置页 / 侧边栏（P3） | 不覆盖原生入口即可 |

**⚠️ 条件声明陷阱**：`conversation.session.header.actions` **只在有会话时声明**
（新会话空态 `conversation.session` 子节点为 0，slot 不存在）。
插件若只在空态验证，会误判「注册成功但不渲染」。验证必须打开真实会话。

**⚠️ single slot priority 冲突**：`conversation.input.model.label` 等 single slot
同一 priority 只能有一个注册者，第二个会抛
`single slot "..." already has a registration at priority 0` 并整块不渲染。
插件要接管必须显式 `priority: -1`，且要在 `inject` 里对所有上下文服务做防御
（实测 `remote.session` 缺失会让 `slot entry crashed`）。

### 3.2 App 适配侧（iOS shim）

只做两件事：**① 隔离**（把违规插件的 inline 占位清掉，让它回原生流）；
**② 兜底**（插件自己已经合规但位置计算依赖 fixed 时，帮它纠偏菜单）。
不许替插件搬位、不许改原生容器宽度、不许用 transform 视觉位移。

**🔴 3.2.1 原生按钮零干预（2026-10-23 build 92 事故后新增的硬红线）**

> 老总 11:36 真机：「模型选择按钮呢，直接不见了。**这不是原生按钮吗？？？**」

- **App 侧永远不许搬原生按钮**。`ofTiQG_root`（官方模型选择器）、权限模式、语音、齿轮、发送 —— 一律零干预：
  不 `position:fixed`、不 `transform`、不改 `width/max-width/flex`、不参与任何停靠计算。
- 92 版把 `ofTiQG_root` `fixed` 到顶栏后，真机上整块消失（原生按钮被搬出可视区）。
  **插件搬走就够了** —— 官方 flex 会让原生按钮自然拿到完整宽度（实测 5px → 206px）。
- App 侧只搬**插件**：`dcc-root`（插件模型）、`dsh-po-capsule`（提示词优化）等。

**🔴 3.2.2 tab 行没有 slot，位置只能靠 App 侧 fixed**

- 官方 `conversation.session.header.actions` 在**标题行**（`mobil` / 会话名那一行），
  **不是**「对话 / 轨迹 / 系统监控」tab 行。tab 行（`_727C8a_tabs`）**没有任何官方 slot**。
- 老总要的「tab 行右侧」在插件侧无法实现 → 只能 App 侧 `fixed` 到 tab 行右侧：
  `top = tabBtnCenterY - 14`，从右往左排（最右 `right:12`）。
- 取不到 tab 行的页面（无轨迹数据 / 新会话空态 / 电脑端）→ **完全不动**，
  让插件留在它自己的 `header.actions` 里，绝不制造错位。

**所有落点共同要求**：
1. 幂等（值不变不重复写），脱离状态可完全还原（清 inline 后回到原生位置）。
2. 若位置由 JS 计算，必须有「目标容器不存在 → 自动还原」分支。
3. 若带下拉/弹层，弹层必须**在打开时重新定位**贴住自己的触发器
   （实测坑：`position:fixed` 的菜单位置由前端按原始位置算，触发器搬走后菜单会跑到屏幕中部。
   正确做法：按触发器中线判断在屏幕上半还是下半，上→向下展开、下→向上展开）。

---

## 4. 必须通过的自检（4 条机械断言，缺一不可）

改完插件适配，跑 `_diag/regression.js`，以下必须全绿：

1. **禁区内零插件元素** —— 遍历 composer 卡片子孙，不含任何 `data-plugin-*` / 插件类名元素。
2. **原生按钮未被压缩** —— 逐个原生按钮断言 `rect.width >= scrollWidth - 1`。
3. **原生按钮可点** —— 每个原生按钮中心 `elementFromPoint` 命中自身或其后代。
4. **禁区内零重叠** —— 按钮两两矩形不相交；右缘不越卡片、不越屏。

补充（真机必做）：装**全部**插件后截图逐条对拍，
因为「沙箱没装某插件 → 永远测不出」是本项目已踩两次的盲区（见第 5 节）。

---

## 5. 为什么会有这条规范（两起真实事故，全部已发版翻车）

### 事故 A（v1.0.131 build 89→90）：模型选择器飞成悬浮按钮
2026-10-21 把 `dcc-root`（插件模型选择器）误判为「积分胶囊」收进插件条，
用 `position:absolute` + inline `!important` 把它搬到卡片顶部 →
老总真机：模型按钮飞离会话框、点击菜单错位重叠。

### 事故 B（v1.0.131 build 90→91）：整个会话框按钮全错乱
「插件条搬位」三处叠加：
1. 优化胶囊 `transform: translate(24px, -85px)` **仍占工具行 85px 布局宽度**；
2. `standardControls` 被硬扣 `padding-right: 48px`；
3. 引擎把 `dcc-root` / `cm-*` 全部 `absolute` 抢位。
→ 老总真机：所有按钮位置错乱重叠、"没眼看"、新建会话模型按钮直接消失。

**共同盲区**：沙箱**没装** `dsh-po-capsule` 优化插件，所以「插件元素撑爆工具行」
在沙箱永远复现不出 —— 闸门全绿、真机全崩。这条规范就是为了从源头禁掉这类写法，
而不是等真机翻车再修。

### 修法结论（91 起长期有效）
**App 侧不再对 composer 做任何搬位/占位干预**，布局全权交回 DSH 官方原生 flex。
插件元素要么留在自己的 dock，要么按第 3 节搬到专属停靠区。

---

## 6. 现存落点清单（截至 v1.0.131 build 92 + 电脑端同步）

### 6.1 电脑端（插件源码侧，实测 1440/1280/1024 三档，30 绿 0 红）

| 元素 | 归属 | slot | 实测几何 | 状态 |
|---|---|---|---|---|
| Lobster 积分胶囊 `dcc-root` | 自建 `dsh-our-free-model-composer-credits` | **`conversation.session.header.actions`**（原 `conversation.input.left`） | `[540,13,104,24]`，与 `智能体团队[363,11,93,28]`、`创造模式[464,14,68,22]` 零重叠 | ✅ 合规（P1，已迁） |
| 官方模型选择器 `ofTiQG_root` | DSH 官方 | `conversation.input.model` | 宽 206px（迁移前被 `dcc-root` 压到 5px） | ✅ 恢复正常 |
| WorkBuddy 余额读数 | 官方 `dsh-connect-workbuddy`（`creditPosition`） | `composer`→`stats` 改配置 | 从 `conversation.input.left` 移到 `conversation.composer.dock` | ✅ 合规（P2，已迁配置） |
| 提示词优化胶囊 `dsh-po-capsule` | 自建 `dsh-prompt-optimizer` | **`conversation.session.header.actions`**（原 `conversation.input.right`） | `[530,12,85,26]` 折叠态 / 展开态 238px；1280·1024 零重叠零出屏；优化功能实测 10s 写回（9→219 字） | ✅ 合规（P1，v1.5.0 已迁） |
| 模型搜索 `dms-root` | 自建 `dsh-model-search-live` | `conversation.input.model`，`priority:-1` **接管替换**官方 | 不额外新增元素，不占空间 | ✅ 合规（接管型，非叠加） |
| 费用明细 `cm-stat-entry` / `cm-bbox` | 自建 `dsh-cost-meter` | `conversation.composer.dock` | 卡片下方独立读数条 | ✅ 合规（P2） |
| 系统监控 `sm-root` | 自建 system-monitor | `conversation.composer.dock` | 同上 | ✅ 合规（P2） |
| 优化胶囊 `dsh-po-capsule` | 第三方 | 官方 dock 流 | App 不搬 | ✅ 合规 |
| 微信 UI / 微信 Plus | 自建 | `settings.section` | 只在设置页 | ✅ 合规（P3） |

**迁移前实测违规**（2026-10-23 修复前）：
`conversation.session.header.actions` 只有 2 个原生子元素；
`conversation.input.left` 挂着积分胶囊；`conversation.input.right` 挂着优化胶囊；
`conversation.input.right` 子树非空（`poCapsule` 在 `[110,852,85,26]`）；
`ofTiQG_root` 被挤到 5px 宽、标签宽 0。
迁移后：`rightInner = []`（右半工具行完全腾空）、`ofTiQG` 恢复 206px、`triggerLabel` 123px。

### 6.1.1 三件套迁移记录（2026-10-23）

| 插件 | 仓库 | 版本 | 改动 |
|---|---|---|---|
| `dsh-our-free-model-composer-credits` | `liushQAQ/dsh-our-free-model-composer-credits` | 1.1.0 → **1.2.0** | `SLOT` 改 `header.actions`；`useAnchorRect` 补 `height`；面板方向自适应 |
| `dsh-prompt-optimizer` | `liushQAQ/dsh-prompt-optimizer` | 1.4.7 → **1.5.0** | `SLOT_INPUT` 改 `header.actions`；README 增「布局规范」章 |
| `dsh-connect-workbuddy` | node_modules（官方包，不改源码） | 配置项 | `creditPosition: composer` → `stats` |

### 6.2 iOS App 侧（shim，build 92）

| 元素 | 落点 | 状态 |
|---|---|---|
| 优化胶囊 `dsh-po-capsule` | **已退出插件条机制**（插件自身迁到会话头部，shim 不再接管：`KNOWN`/`sels`/`releaseHijack` 三处移除） | ✅ 合规（P1，build 93） |
| 费用明细 `cm-stat-entry` / `cm-bbox` | 会话卡片**下方** dock 行 | ✅ 合规（P2） |
| 插件模型 `dcc-root`（Lobster / Loom） | 顶栏 tab 行右侧停靠（shim_27） | ✅ 合规（P1，build 92） |
| 官方模型 `ofTiQG_root`（gemini-3.8） | 顶栏 tab 行右侧停靠（shim_27） | ✅ 合规（P1，build 92） |
| 会话框原生按钮（+ / 语音 / 权限 / 优化 / 齿轮 / 发送） | 原生 flex 布局，App 零干预 | ✅ 93 起长期保持 |

### 6.3 验证脚本

| 脚本 | 覆盖 | 结果 |
|---|---|---|
| `_diag/_host_verify.js` | **电脑端**：胶囊在头部 / 离开卡片 / 离开工具行 / 头部零重叠 / 模型按钮宽度 / 工具行零插件（1440/1280/1024） | 30 绿 0 红 |
| `_diag/_dock_verify.js` | iOS shim：停靠位置 + 菜单贴合（430/375） | 22 绿 |
| `_diag/_dock_tabsim.js` | iOS shim：人造 tab 行 + 宽度压缩（430/393/375） | 24 绿 |
| `_diag/regression.js` | 总闸门（含 R23 静态防复发断言） | 75 绿 0 红 |
| `_diag/_host_verify.js` | 电脑端全链路（胶囊在头部 / 离开卡片 / 头部零重叠 / 模型按钮宽度 / 工具行零插件） | 30 绿 |
| `_diag/_po_probe.js` / `_po_func2.js` / `_po_narrow.js` | 优化胶囊位置 + **功能回归**（打字→点优化→草稿写回）+ 窄屏零重叠 | 全绿 |

### 6.4 iOS App 内的长期规范文本（面向所有玩家）

**入口**：设置页底部 → `🔴 插件布局规范（所有玩家必读）` → `PluginLayoutRulesViewController`。

老总 2026-10-23 令：「在 iOS App 那个地方长期文本显示规范。要求任何插件占用原生会话框位置、
压缩原生按钮的，必须回到顶部 tab 栏，如何规范。也要告诉他们。通用性任何玩家都适合。」

页面内容（8 张卡片，永久常驻、随 App 分发）：

| 卡片 | 内容 |
|---|---|
| 🔴 一句话铁律 | 插件永不占会话框、永不压缩原生按钮；要有界面去会话头部 / 卡片下方 dock / 侧栏 / 浮层 |
| 💥 违规时会发生什么 | 模型按钮压到 5px、文字宽 0；按钮叠印点不动；窄屏溢出；新建会话模型按钮消失 |
| ✅ 唯一正确做法 | 挂 `conversation.session.header.actions`；附「空态不声明」陷阱说明 |
| ⛔ 禁止挂的 slot | `conversation.input.*` 全系 + `conversation.composer.bar`（等宽字体列全名） |
| ⛔ 禁止的绕过写法 | transform 视觉位移 / 改原生容器宽度 / absolute 抢位 / 挂条件渲染容器 |
| ✅ 推荐挂的 slot | header.actions / header.utilities / header.corner / composer.dock / shell.overlay / settings.section |
| 📏 版面约束 | 28pt 高、不换行、等比压缩出省略号、菜单随锚点方向展开、关闭态零占位 |
| 🌍 通用性说明 | 不区分使用者/机器/渠道；官方公开 slot；两端同一套前端；已迁移插件清单 |
| 🧪 改完怎么自检 | 5 条机械断言 + 「必须在装全插件的环境里测」 |

**为什么放在 App 里而不是只放仓库**：老总要求「也要告诉他们」—— 装 App 的玩家不看 GitHub，
规范必须出现在玩家一定看得到的地方，且要长期常驻、不能是跑马灯或一次性弹窗。

---

## 7. 违规处理

- 插件作者：按第 2 节整改后方可合入。
- App 侧适配：闸门红 = **禁止打包**（CI 硬校验 `_diag/gate-result.json`）。
- 发现新插件违反本规范：先在 App 侧做隔离（`releaseHijack` 清它的 inline 占位），
  再要求插件作者整改；**不允许**用「App 侧帮它搬位」来绕过。
- **插件自己合规后，shim 必须同步退出**（例：`dsh-po-capsule` 在 93 从 `KNOWN`/`sels`/
  `releaseHijack` 三处移除）—— 否则 shim 与插件双方同时改同一元素，形成互删互插。
