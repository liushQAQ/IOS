import Foundation

// MARK: - 采集节流 / 拟人 / 风控（2026-11-10，抖音+小红书采集）
// 默认保守。一键还原：把 enabled 置 false，则采集节奏与旧版逐字节等价（不做任何额外等待/拦截），
// 只保留采集工具与结构化落盘；彻底还原见 backup/ios-mcp-agent-20261110/AgentRunner.swift.bak_20261110。
// 立场：不跟平台对抗。只做时间维度拟人（步间随机停顿/阅读间歇/活跃时段/配额）+ 风控命中急停，
// 不做坐标抖动（掉命中率，且平台不靠几像素判 AI），不注入进程、不 Hook、不发内容、不回写平台。
private enum CollectGuard {
    static let enabled = true

    // 时间维度拟人（仅采集模式生效，普通任务零影响）
    static let stepDelayMinNs: UInt64 = 1_500_000_000
    static let stepDelayMaxNs: UInt64 = 4_000_000_000
    static let readingEveryMin = 8
    static let readingEveryMax = 12
    static let readingPauseMinNs: UInt64 = 20_000_000_000
    static let readingPauseMaxNs: UInt64 = 60_000_000_000

    // 单账号单设备配额 + 真人活跃时段
    static let hourlyQuota = 60
    static let dailyQuota = 300
    static let activeHourStart = 8
    static let activeHourEnd = 23

    // 风控急停：命中即停 + 落盘已采部分 + 退避，不硬点、不重试绕过
    static let riskKeywords = ["验证", "滑块", "操作频繁", "操作过于频繁", "稍后再试", "安全验证", "访问频繁", "请稍后"]
    static let backoffNs: UInt64 = 60_000_000_000

    // 机器在环自检熔断（替代被撤掉的「人工在环」）：连续无变化即停本批次，活不回到用户手上
    static let circuitNoChange = 4
    static let batchMax = 3
}

private struct CollectedItem: Codable {
    let platform: String
    let link: String
    let caption: String
    let collectedAt: String
}

struct AgentConfig: Codable {
    var mcpBase: String
    var llmBase: String
    var llmKey: String
    var llmModel: String
    var maxSteps: Int

    static let storageKey = "ios-mcp-agent.config"

    enum CodingKeys: String, CodingKey {
        case mcpBase, llmBase, llmKey, llmModel, maxSteps
    }

    init(mcpBase: String, llmBase: String, llmKey: String, llmModel: String, maxSteps: Int) {
        self.mcpBase = mcpBase
        self.llmBase = llmBase
        self.llmKey = llmKey
        self.llmModel = llmModel
        self.maxSteps = maxSteps
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.mcpBase = (try? container.decodeIfPresent(String.self, forKey: .mcpBase)) ?? "http://127.0.0.1:8090"
        self.llmBase = (try? container.decodeIfPresent(String.self, forKey: .llmBase)) ?? BuiltInModels.defaultBase
        self.llmKey = (try? container.decodeIfPresent(String.self, forKey: .llmKey)) ?? BuiltInModels.defaultKey
        self.llmModel = (try? container.decodeIfPresent(String.self, forKey: .llmModel)) ?? BuiltInModels.defaultModel
        let steps = (try? container.decodeIfPresent(Int.self, forKey: .maxSteps)) ?? 30
        self.maxSteps = steps <= 0 ? 30 : steps
    }

    static func load() -> AgentConfig {
        let d = UserDefaults.standard
        // 1. 优先从 Documents 物理持久化文件加载用户已保存的配置 (覆盖安装永不丢失)
        if let fileConfig = DataPersistenceManager.shared.loadAgentConfig() {
            // 同步刷新 UserDefaults 镜像
            d.set(fileConfig.mcpBase, forKey: "mcpBase")
            d.set(fileConfig.llmBase, forKey: "llmBase")
            d.set(fileConfig.llmKey, forKey: "llmKey")
            d.set(fileConfig.llmModel, forKey: "llmModel")
            d.set(fileConfig.maxSteps, forKey: "maxSteps")
            return fileConfig
        }

        // 2. 若物理文件尚不存在，尝试从 UserDefaults 读取历史配置并自动持久化到文件
        let hasExistingUserDefaults = d.string(forKey: "llmBase") != nil || d.string(forKey: "llmKey") != nil || d.string(forKey: "llmModel") != nil
        let loaded = AgentConfig(
            mcpBase: d.string(forKey: "mcpBase") ?? "http://127.0.0.1:8090",
            llmBase: d.string(forKey: "llmBase") ?? BuiltInModels.defaultBase,
            llmKey: d.string(forKey: "llmKey") ?? BuiltInModels.defaultKey,
            llmModel: d.string(forKey: "llmModel") ?? BuiltInModels.defaultModel,
            maxSteps: d.integer(forKey: "maxSteps") == 0 ? 30 : d.integer(forKey: "maxSteps")
        )

        if hasExistingUserDefaults {
            DataPersistenceManager.shared.saveAgentConfig(loaded)
        }
        return loaded
    }

    func save() {
        let d = UserDefaults.standard
        d.set(mcpBase, forKey: "mcpBase")
        d.set(llmBase, forKey: "llmBase")
        d.set(llmKey, forKey: "llmKey")
        d.set(llmModel, forKey: "llmModel")
        d.set(maxSteps, forKey: "maxSteps")
        DataPersistenceManager.shared.saveAgentConfig(self)
    }
}

/// 2026-11-09 灵敏度四层修复（与同仓库 Python 版 agent_loop.py 同口径）：
/// ① tap_id 编号精确点 + 点前反查；② 每步 before/after 元素树+前台 diff 闭环、脚本实测事实注入；
/// ③ 防重复动作签名 + 连续无变化强制换策略 + fail 先重规划 + 结构化历史；
/// ④ 意图对齐块 + 历史窗口放宽 + max_tokens 提升 + 工具收敛 + 元素树空自动文本兜底。
/// 纯文本架构（无 b64 截图通道）：元素树为空/无文字时自动调 describe_screen 回灌，而非截图。
/// 2026-11-10 采集层：剪贴板短链 + collect 循环/结构化落盘 + 拟人节流 + 风控急停 + 机器在环熔断 + 抖音/小红书双平台 SOP。
final class AgentRunner {
    let config: AgentConfig
    private let mcp: MCPClient
    private var stopped = false

    // 四层参数（对齐 Python 版 CONFIG 段）
    private let elementListMax = 60
    private let noChangeLimit = 2
    private let repeatActionLimit = 2
    private let historyWindow = 16
    private let failReplan = 1
    private let checkFailLimit = 3
    private let uiStableMax: TimeInterval = 2.5
    private let uiStablePoll: UInt64 = 300_000_000
    private let clickActions: Set<String> = [
        "tap_id", "tap_screen", "tap_element", "swipe_screen", "long_press", "double_tap"
    ]

    // 采集态（2026-11-10）：搜索 → 逐条采链接+文案 → 去重 → 结构化落盘
    private var collected: [CollectedItem] = []
    private var seenLinks: Set<String> = []
    private var pendingLink = ""
    private var isCollect = false
    private var collectStepCount = 0
    private var circuitNoChangeStreak = 0

    init(config: AgentConfig) {
        self.config = config
        self.mcp = MCPClient(base: config.mcpBase)
    }

    func stop() { stopped = true }

    func run(task: String, log: @escaping (String) -> Void) async {
        do {
            log("⚡ 连接 \(config.mcpBase)...")
            _ = try await mcp.health()
            try await mcp.connect()
            log("✅ 驱动就绪（四层闭环模式）")
            _ = try? await mcp.call("wake_and_home")
            try? await Task.sleep(nanoseconds: 300_000_000)

            // 采集模式：由任务文本自动识别，无需命令、无需用户操作
            isCollect = isCollectTask(task)
            if isCollect {
                log("🧺 采集模式（抖音/小红书）：低而慢 + 小批次 + 风控急停 + 机器在环自检熔断 + 自动结构化落盘")
                if CollectGuard.enabled {
                    if !withinActiveHours() {
                        log("⏰ 当前不在真人活跃时段（\(CollectGuard.activeHourStart):00–\(CollectGuard.activeHourEnd):00），本批次不跑")
                        return
                    }
                    if quotaExceeded() {
                        log("📊 已达小时/日配额，自动停，不硬跑")
                        return
                    }
                }
            }

            var history: [String] = []              // 结构化历史：动作 → 脚本实测结果
            var failStreak = 0                      // 连续模型自报 fail
            var lastFact = ""                       // 上一动作的脚本实测事实
            var hardRule = ""                        // 脚本硬约束（注入下一轮）
            var noChangeStreak = 0                   // 连续「点了画面没变」
            var actionAttempts: [String: Int] = [:]  // 动作签名 → 连续无效次数
            var replanLeft = failReplan
            var lastSig = ""

            // 🚀 启发式直连加速：检测「打开/启动微信/设置/Safari/抖音/小红书」直接秒开，跳过第 1 步模型请求
            let initialLaunch = detectDirectLaunch(task: task)
            if let directApp = initialLaunch {
                log("⚡ [启发式秒开] 直连启动应用: \(directApp.name) (\(directApp.bundleID))")
                _ = try? await mcp.call("launch_app", arguments: ["bundle_id": directApp.bundleID])
                history.append("第1步已秒开启动 \(directApp.name)")
                try? await Task.sleep(nanoseconds: 600_000_000)
            }

            let startStep = initialLaunch != nil ? 2 : 1
            let upperStep = max(config.maxSteps, startStep)
            for step in startStep...upperStep {
                if stopped {
                    log("⏹️ 任务已停止")
                    if isCollect { _ = saveCollectResults(log: log) }
                    return
                }

                // ① 取全量元素树 + 前台 App
                let rawTree = (try? await mcp.call("get_ui_elements")) ?? ""
                let elements = ElementParser.parse(raw: rawTree)
                let fgBefore = (try? await mcp.call("get_frontmost_app")) ?? ""
                let used = Array(elements.prefix(elementListMax))

                // 元素树空/无文字 → 自动文本兜底（纯文本架构无截图通道，不等模型自觉）
                var extraInfo = ""
                if used.isEmpty || used.allSatisfy({ $0.label.isEmpty }) {
                    let desc = (try? await mcp.call("describe_screen")) ?? ""
                    if !desc.isEmpty {
                        extraInfo = "【元素树兜底·describe_screen】\n" + String(desc.prefix(800))
                    }
                }

                // ② 编号清单（含 #编号 / 类型 / 文字 / 像素坐标）
                let elementDescriptions = used.map { item in
                    "[#\(item.id)] \(item.type.isEmpty ? "" : "[\(item.type)] ")\(item.label) @(\(Int(item.x)),\(Int(item.y)))"
                }.joined(separator: "\n")

                // ②b 采集模式：风控急停 —— 命中验证/滑块/操作频繁立即停，落盘已采部分后退避，不硬点不绕过
                if isCollect, CollectGuard.enabled {
                    let scan = rawTree + "\n" + elementDescriptions + "\n" + extraInfo
                    if let hit = CollectGuard.riskKeywords.first(where: { scan.contains($0) }) {
                        log("🛑 风控命中「\(hit)」：立即停止，不硬点、不绕过；已采 \(collected.count) 条先落盘，退避 60s")
                        _ = saveCollectResults(log: log)
                        try? await Task.sleep(nanoseconds: CollectGuard.backoffNs)
                        return
                    }
                }

                // ③ 意图对齐 + 结构化历史 + 脚本实测事实 + 硬约束 拼 prompt
                let userText = buildUserPrompt(task: task, step: step, maxSteps: upperStep,
                                              history: history, elements: elementDescriptions,
                                              extraInfo: extraInfo, lastFact: lastFact,
                                              hardRule: hardRule, total: elements.count,
                                              shown: used.count)

                // ④ 调模型
                var message: [String: Any] = [:]
                do {
                    message = try await chat(userText)
                } catch {
                    log("  ⚠️ 模型调用失败: \(error.localizedDescription)")
                    history.append("第\(step)步模型调用失败(\(error.localizedDescription))，需重试")
                    continue
                }
                guard let call = firstToolCall(message) else {
                    let text = message["content"] as? String ?? ""
                    log("第 \(step) 步思考: \(text.prefix(60))")
                    history.append("第\(step)步无动作，需重新输出动作")
                    continue
                }
                let name = call.name
                let args = call.arguments
                log("👉 步骤 \(step): \(name) \(short(args))")

                // ⑤ check 核对：模型自报 fail 计数；连续失败强制回主屏并清空历史
                let check = (args["check"] as? String ?? "").lowercased()
                if check == "fail" { failStreak += 1 } else { failStreak = 0 }
                if failStreak >= checkFailLimit && name != "press_home" {
                    log("连续 \(failStreak) 步核对失败，强制回主屏重来并清空历史")
                    _ = try? await mcp.call("press_home")
                    failStreak = 0
                    noChangeStreak = 0
                    actionAttempts.removeAll()
                    history.removeAll()          // 治「回主屏→再瞎点→再回主屏」死循环
                    hardRule = ""
                    lastFact = "【脚本实测】连续核对失败，已强制回主屏并清空历史，从零重新拆任务。"
                    await waitUIStable()
                    continue
                }
                lastSig = actionSignature(name: name, args: args)

                // ⑥ done / fail：fail 先强制重规划一次，不立即错误退出；任一收尾都自动落盘兜底
                if name == "done" {
                    log("🎉 任务完成: \(args["reason"] ?? "")")
                    if isCollect { _ = saveCollectResults(log: log) }
                    return
                }
                if name == "fail" {
                    if replanLeft > 0 {
                        replanLeft -= 1
                        log("第\(step)步 fail -> 脚本强制重规划（剩余 \(replanLeft) 次）: \(args["reason"] ?? "")")
                        history.append("第\(step)步 fail(\(args["reason"] ?? "")) -> 脚本要求重规划，不许直接退出")
                        hardRule = "上一轮模型判定卡死，已强制重规划：禁止再直接判 fail；先 press_home 回主屏，重新拆子目标换入口，或改用 tap_id 精确编号点击。"
                        lastFact = "【脚本实测】模型主动判 fail，脚本已拦截并要求重规划一次。"
                        noChangeStreak = 0
                        continue
                    }
                    log("❌ 任务终止: \(args["reason"] ?? "")")
                    if isCollect { _ = saveCollectResults(log: log) }
                    return
                }

                // ⑦ 执行（编号精确点 + 点前反查 + 采集工具）；读类工具结果返回以回灌历史
                let beforeSig = screenSignature(elements)
                var result: String? = nil
                do {
                    result = try await execute(name: name, args: args, elements: used, log: log)
                } catch {
                    log("  ⚠️ 执行失败: \(error.localizedDescription)")
                    history.append("第\(step)步 \(name) 执行失败(\(error.localizedDescription))，错误详情完整回灌，换别的做法")
                    actionAttempts[lastSig, default: 0] += 1
                    lastFact = "【脚本实测·上一步】动作=\(lastSig) 执行失败(\(error.localizedDescription))，界面未变，必须换做法。"
                    hardRule = "上一动作执行报错(\(error.localizedDescription))，禁止原样重试，换参数或换动作。"
                    continue
                }

                // ⑧ 动作后闭环验证：等界面稳定 → 取 after 元素树/前台 → 算 diff（脚本事实，非模型自报）
                await waitUIStable()
                let rawAfter = (try? await mcp.call("get_ui_elements")) ?? ""
                let afterElements = ElementParser.parse(raw: rawAfter)
                let fgAfter = (try? await mcp.call("get_frontmost_app")) ?? ""
                let afterSig = screenSignature(afterElements)
                let diff = diffElements(before: beforeSig, after: afterSig)
                let changed = (afterSig != beforeSig) || (fgAfter != fgBefore)
                let fgNote = fgAfter != fgBefore
                    ? "前台App: \(String(fgBefore.prefix(40))) -> \(String(fgAfter.prefix(40)))"
                    : "前台App 未变"
                lastFact = "【脚本实测·上一步】动作=\(lastSig)；画面\(changed ? "有变化" : "无变化")；\(fgNote)；新增元素:\(listOrNone(diff.added))；消失元素:\(listOrNone(diff.removed))"

                // ⑧b 采集模式：低而慢（时间维度拟人）—— 步间随机停顿 + 每 8~12 步插阅读/回看间歇
                if isCollect, CollectGuard.enabled {
                    bumpQuota()
                    collectStepCount += 1
                    let d = UInt64.random(in: CollectGuard.stepDelayMinNs...CollectGuard.stepDelayMaxNs)
                    try? await Task.sleep(nanoseconds: d)
                    let every = Int.random(in: CollectGuard.readingEveryMin...CollectGuard.readingEveryMax)
                    if collectStepCount % every == 0 {
                        let pause = UInt64.random(in: CollectGuard.readingPauseMinNs...CollectGuard.readingPauseMaxNs)
                        log("☕ 阅读/回看间歇 \(pause / 1_000_000_000)s（拟人节奏）")
                        try? await Task.sleep(nanoseconds: pause)
                    }
                }

                // ⑨ 防重复：点击类动作无效 → 累计；连续无变化 / 同一签名重复 → 下一轮硬约束换策略
                hardRule = ""
                if !changed && clickActions.contains(name) {
                    noChangeStreak += 1
                    actionAttempts[lastSig, default: 0] += 1
                    hardRule = "上一动作点击后画面无任何变化，本步必须换做法（换 #编号 / 换 swipe 方向 / 换入口 / press_home 重来）。"
                    if noChangeStreak >= noChangeLimit {
                        hardRule = "【强制换策略】连续 \(noChangeStreak) 步点击画面无变化，禁止原样重试动作 \(lastSig)；必须换入口/换 swipe/换 tap_id 编号/回主屏重来。"
                        noChangeStreak = 0
                    }
                    let attempts = actionAttempts[lastSig, default: 0]
                    if attempts >= repeatActionLimit {
                        hardRule += " 该动作签名已连续无效 \(attempts) 次，脚本禁止再原样重试。"
                    }
                } else {
                    noChangeStreak = 0
                    actionAttempts[lastSig] = 0
                }

                // ⑨b 采集模式：机器在环自检熔断 —— 连续 N 步画面无变化 → 停本批次、落盘已采部分（零人工）
                if isCollect, CollectGuard.enabled {
                    if changed {
                        circuitNoChangeStreak = 0
                    } else {
                        circuitNoChangeStreak += 1
                        if circuitNoChangeStreak >= CollectGuard.circuitNoChange {
                            log("🧯 自检熔断：连续 \(circuitNoChangeStreak) 步画面无变化，停本批次并落盘已采 \(collected.count) 条")
                            _ = saveCollectResults(log: log)
                            return
                        }
                    }
                }

                history.append("第\(step)步: \(name) \(short(args))")
                history.append("  └ 实测: \(lastFact.replacingOccurrences(of: "【脚本实测·上一步】", with: ""))")
                if let res = result, !res.isEmpty {
                    // 直通读类工具（describe_screen/ocr_screen/get_clipboard/…）结果回喂模型
                    log("第\(step)步 \(name) 结果 -> \(String(res.prefix(120)))")
                    history.append("第\(step)步 \(name) 执行结果(真实值从中读): \(res)")
                }
            }
            log("已达最大步数 \(upperStep)，任务结束")
            if isCollect { _ = saveCollectResults(log: log) }
        } catch {
            log("💥 运行时错误: \(error.localizedDescription)")
            if isCollect { _ = saveCollectResults(log: log) }
        }
    }

    /// 启发式识别任务中的直连应用。bundle id 为公开已知值，避免模型编造。
    private func detectDirectLaunch(task: String) -> (name: String, bundleID: String)? {
        let lower = task.lowercased()
        // 抖音 / 小红书（2026-11-10 采集模式直连）
        if lower.contains("抖音") || lower.contains("douyin") || lower.contains("aweme") {
            return ("抖音", "com.ss.iphone.ugc.Aweme")
        }
        if lower.contains("小红书") || lower.contains("xhs") || lower.contains("redbook") {
            return ("小红书", "com.xingin.discover")
        }
        if lower.contains("微信") || lower.contains("wechat") {
            return ("微信", "com.tencent.xin")
        }
        if lower.contains("设置") || lower.contains("preferences") {
            return ("设置", "com.apple.Preferences")
        }
        if lower.contains("safari") || lower.contains("浏览器") {
            return ("Safari", "com.apple.mobilesafari")
        }
        if lower.contains("备忘录") || lower.contains("notes") {
            return ("备忘录", "com.apple.mobilenotes")
        }
        if lower.contains("信息") || lower.contains("短信") {
            return ("信息", "com.apple.MobileSMS")
        }
        return nil
    }

    // MARK: - 第1层：动作执行（编号精确点 + 点前反查 + 采集工具）

    private func execute(name: String, args: [String: Any], elements: [UIElementItem], log: (String) -> Void) async throws -> String? {
        switch name {
        case "tap_id":
            guard let id = intValue(args["id"]), id >= 1, id <= elements.count else {
                throw MCPError.tool("元素编号 #\(args["id"] ?? "") 不存在（本屏清单共 \(elements.count) 个）")
            }
            let el = elements[id - 1]
            let x = Int(el.x), y = Int(el.y)
            let probe = (try? await mcp.call("get_element_at_point", arguments: ["x": x, "y": y])) ?? ""
            log("  tap_id #\(id) [\(el.label)] @(\(x),\(y)) 点前反查: \(probe.isEmpty ? "无返回" : String(probe.prefix(120)))")
            _ = try await mcp.call("tap_screen", arguments: ["x": x, "y": y])
            return nil

        case "tap_screen":
            let x = intValue(args["x"]) ?? 0
            let y = intValue(args["y"]) ?? 0
            let probe = (try? await mcp.call("get_element_at_point", arguments: ["x": x, "y": y])) ?? ""
            log("  tap_screen (\(x),\(y)) 点前反查: \(probe.isEmpty ? "无返回" : String(probe.prefix(120)))")
            _ = try await mcp.call("tap_screen", arguments: ["x": x, "y": y])
            return nil

        case "tap_element":
            // 归一化全等优先 → 包含时选最短标签（避「通用设置」这类静态长标签）→ 否则交服务端
            let target = (args["text"] as? String) ?? ""
            if let matched = matchElement(target, in: elements) {
                let x = Int(matched.x), y = Int(matched.y)
                let probe = (try? await mcp.call("get_element_at_point", arguments: ["x": x, "y": y])) ?? ""
                log("  📍 命中元素 [\(matched.label)] #\(matched.id) @(\(x),\(y)) 点前反查: \(probe.isEmpty ? "无返回" : String(probe.prefix(120)))")
                _ = try await mcp.call("tap_screen", arguments: ["x": x, "y": y])
            } else {
                _ = try await mcp.call("tap_element", arguments: args)
            }
            return nil

        case "get_clipboard":
            // 读剪贴板；采集模式由脚本正则提短链（抖音口令/小红书口令），模型不必自己抠文本
            let out = try await mcp.call("get_clipboard")
            let clipped = String(out.prefix(800))
            if isCollect, let link = extractShareLink(out) {
                pendingLink = link
                log("  🔗 已从剪贴板提取短链: \(link)")
                return clipped + "\n【脚本实测】已提取分享短链: \(link)（下一步 collect_item 会自动采用）"
            }
            return clipped.isEmpty ? nil : clipped

        case "set_clipboard":
            let text = (args["text"] as? String) ?? ""
            _ = try await mcp.call("set_clipboard", arguments: ["text": text])
            return nil

        case "collect_item":
            return collectItem(args: args, log: log)

        case "collect_save":
            return saveCollectResults(log: log)

        default:
            // 其余工具（含收敛后的读类工具）去掉 check/think/reason 后直转 ios-mcp
            var fwd: [String: Any] = [:]
            for (k, v) in args where k != "check" && k != "think" && k != "reason" {
                fwd[k] = v
            }
            let out = try await mcp.call(name, arguments: fwd)
            let clipped = String(out.prefix(800))
            if !clipped.isEmpty { log("  反馈: \(String(clipped.prefix(200)))") }
            return clipped.isEmpty ? nil : clipped
        }
    }

    // MARK: - 第2/3层辅助：diff 闭环 + 防重复

    private func screenSignature(_ elements: [UIElementItem]) -> Set<String> {
        Set(elements.map { "\(String($0.label.prefix(40)))@\(Int($0.x)),\(Int($0.y))" })
    }

    private func diffElements(before: Set<String>, after: Set<String>) -> (added: [String], removed: [String]) {
        func txt(_ s: Set<String>) -> Set<String> {
            Set(s.map { v in
                if let r = v.range(of: "@", options: .backwards) { return String(v[..<r.lowerBound]) }
                return v
            })
        }
        let b = txt(before), a = txt(after)
        return (a.subtracting(b).sorted(), b.subtracting(a).sorted())
    }

    private func actionSignature(name: String, args: [String: Any]) -> String {
        let keys = ["id", "text", "content", "bundle_id", "url", "key",
                    "x", "y", "fromX", "fromY", "toX", "toY"]
        let parts = keys.compactMap { k -> String? in
            guard let v = args[k], String(describing: v) != "" else { return nil }
            return "\(k)=\(String(String(describing: v).prefix(30)))"
        }
        return name + "(" + parts.joined(separator: ",") + ")"
    }

    /// 动作后自适应等待：连续两次元素树一致=界面就绪，立即走下一步（比固定 0.3s 更稳）。
    private func waitUIStable() async {
        let deadline = Date().addingTimeInterval(uiStableMax)
        var last: String? = nil
        while Date() < deadline {
            let raw = (try? await mcp.call("get_ui_elements")) ?? ""
            let sig = ElementParser.parse(raw: raw)
                .prefix(40)
                .map { "\($0.label)@\(Int($0.x)),\(Int($0.y))" }
                .joined(separator: "|")
            if let l = last, l == sig { return }
            last = sig
            try? await Task.sleep(nanoseconds: uiStablePoll)
        }
    }

    private func listOrNone(_ xs: [String]) -> String {
        let p = xs.prefix(6)
        return p.isEmpty ? "无" : p.joined(separator: "、")
    }

    private func matchElement(_ text: String, in elements: [UIElementItem]) -> UIElementItem? {
        let t = norm(text)
        guard !t.isEmpty else { return nil }
        if let hit = elements.first(where: { norm($0.label) == t }) { return hit }
        let contains = elements.filter { t.contains(norm($0.label)) || norm($0.label).contains(t) }
        return contains.min(by: { $0.label.count < $1.label.count })
    }

    private func norm(_ s: String) -> String {
        s.lowercased()
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "-", with: "")
            .replacingOccurrences(of: "_", with: "")
            .replacingOccurrences(of: "·", with: "")
    }

    private func intValue(_ v: Any?) -> Int? {
        if let n = v as? Int { return n }
        if let d = v as? Double { return Int(d) }
        if let s = v as? String { return Int(s) }
        if let n = v as? NSNumber { return n.intValue }
        return nil
    }

    // MARK: - 采集层：识别 / 短链 / 去重落盘 / 节流风控（2026-11-10）

    /// 任务文本自动识别采集模式（不用命令、不用用户选）：抖音/小红书 + 搜索 + 链接/文案
    private func isCollectTask(_ task: String) -> Bool {
        let t = task.lowercased()
        let verbs = ["采集", "抓取", "抓链接", "抓文案", "复制链接", "批量", "导出", "收集"]
        let hasVerb = verbs.contains { t.contains($0) }
        let hasLink = t.contains("链接") || t.contains("文案") || t.contains("短链")
        let hasPlatform = t.contains("抖音") || t.contains("小红书") || t.contains("douyin") || t.contains("xhs")
        return (hasVerb && hasLink) || (hasPlatform && hasLink)
    }

    /// 从分享口令里正则提短链。抖音 v.douyin.com；小红书 xhslink.com / xiaohongshu.com。
    private func extractShareLink(_ text: String) -> String? {
        let patterns = [
            "https?://v\\.douyin\\.com/[A-Za-z0-9_\\-]+/?",
            "https?://xhslink\\.com/[A-Za-z0-9_\\-/]+/?",
            "https?://[A-Za-z0-9.\\-]*xiaohongshu\\.com/[A-Za-z0-9_\\-/?=&]+",
            "https?://[A-Za-z0-9.\\-]*douyin\\.com/[A-Za-z0-9_\\-/?=&]+"
        ]
        for p in patterns {
            if let r = text.range(of: p, options: .regularExpression) {
                return String(text[r])
            }
        }
        return nil
    }

    /// 提交一条采集结果：文案必填，link 留空则自动用 get_clipboard 提取的短链；按链接去重。
    private func collectItem(args: [String: Any], log: (String) -> Void) -> String {
        let caption = ((args["caption"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        var link = ((args["link"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if link.isEmpty { link = pendingLink }
        if let extracted = extractShareLink(link) { link = extracted }
        var platform = (args["platform"] as? String) ?? ""
        if platform.isEmpty {
            if link.contains("douyin") { platform = "抖音" }
            else if link.contains("xhslink") || link.contains("xiaohongshu") { platform = "小红书" }
            else { platform = "未标注" }
        }
        if caption.isEmpty && link.isEmpty {
            return "【脚本实测】collect_item 无效：文案与链接都为空，未计入。请先 get_clipboard 取链接 + ocr_screen 读文案。"
        }
        let key = link.isEmpty ? "caption:" + caption : link
        if seenLinks.contains(key) {
            return "【脚本实测】重复条目，已去重，未计入（当前 \(collected.count) 条）。"
        }
        seenLinks.insert(key)
        collected.append(CollectedItem(platform: platform, link: link, caption: caption,
                                       collectedAt: ISO8601DateFormatter().string(from: Date())))
        pendingLink = ""
        log("  🧺 已采集第 \(collected.count) 条 [\(platform)] \(link.isEmpty ? "(无链接)" : link)")
        let full = collected.count >= CollectGuard.batchMax
        return "【脚本实测】已采集第 \(collected.count) 条，去重生效。"
            + (full ? " 已达单批次上限 \(CollectGuard.batchMax)，请 collect_save 落盘并输出 done。" : " 继续下一条或 collect_save。")
    }

    /// 结构化落盘：JSON + CSV 到 Documents/ios_mcp_data/，另写 collect-latest.json 便于查看。
    @discardableResult
    private func saveCollectResults(log: (String) -> Void) -> String {
        guard !collected.isEmpty else { return "【脚本实测】无采集结果可落盘。" }
        let fm = FileManager.default
        // 与 DataPersistenceManager 一致的安全兜底：urls(for:) 空数组时退回沙盒根，绝不越界
        let docs = fm.urls(for: .documentDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory())
        let dir = docs.appendingPathComponent("ios_mcp_data", isDirectory: true)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true, attributes: nil)
        let stamp = collectStamp()
        let jsonURL = dir.appendingPathComponent("collect-\(stamp).json")
        let csvURL = dir.appendingPathComponent("collect-\(stamp).csv")
        let latestURL = dir.appendingPathComponent("collect-latest.json")

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(collected),
              let json = String(data: data, encoding: .utf8) else {
            return "【脚本实测】JSON 编码失败，未落盘。"
        }
        var csv = "platform,link,caption,collectedAt\n"
        for it in collected {
            csv += "\(csvEscape(it.platform)),\(csvEscape(it.link)),\(csvEscape(it.caption)),\(csvEscape(it.collectedAt))\n"
        }
        do {
            try json.write(to: jsonURL, atomically: true, encoding: .utf8)
            try json.write(to: latestURL, atomically: true, encoding: .utf8)
            try csv.write(to: csvURL, atomically: true, encoding: .utf8)
        } catch {
            return "【脚本实测】落盘失败: \(error.localizedDescription)"
        }
        let msg = "已落盘 \(collected.count) 条 → \(jsonURL.path)（+ \(csvURL.lastPathComponent) + collect-latest.json）"
        log("💾 【脚本实测】" + msg)
        log("📋 【采集清单】共 \(collected.count) 条（App 内「采集结果」按钮可查看 / 复制 / 分享，全程不用电脑）：")
        for (i, it) in collected.enumerated() {
            log("  [\(i + 1)] \(it.platform) | \(it.link.isEmpty ? "(无链接)" : it.link) | \(it.caption)")
        }
        return "【脚本实测】" + msg
    }

    private func csvEscape(_ s: String) -> String {
        "\"" + s.replacingOccurrences(of: "\"", with: "\"\"")
            .replacingOccurrences(of: "\n", with: " ")
            .replacingOccurrences(of: "\r", with: " ") + "\""
    }

    private func collectStamp() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyyMMdd-HHmmss"
        return f.string(from: Date())
    }

    private func quotaKeys() -> (hour: String, day: String) {
        let c = Calendar.current.dateComponents([.year, .month, .day, .hour], from: Date())
        let y = c.year ?? 0, m = c.month ?? 0, d = c.day ?? 0, h = c.hour ?? 0
        return ("collect.quota.\(y)\(m)\(d)\(h)", "collect.quota.\(y)\(m)\(d)")
    }

    private func withinActiveHours() -> Bool {
        let h = Calendar.current.component(.hour, from: Date())
        return h >= CollectGuard.activeHourStart && h < CollectGuard.activeHourEnd
    }

    private func quotaExceeded() -> Bool {
        let k = quotaKeys(), d = UserDefaults.standard
        return d.integer(forKey: k.hour) >= CollectGuard.hourlyQuota
            || d.integer(forKey: k.day) >= CollectGuard.dailyQuota
    }

    private func bumpQuota() {
        let k = quotaKeys(), d = UserDefaults.standard
        d.set(d.integer(forKey: k.hour) + 1, forKey: k.hour)
        d.set(d.integer(forKey: k.day) + 1, forKey: k.day)
    }

    // MARK: - 第4层：意图对齐 + 模型交互

    private func buildUserPrompt(task: String, step: Int, maxSteps: Int, history: [String],
                                 elements: String, extraInfo: String, lastFact: String,
                                 hardRule: String, total: Int, shown: Int) -> String {
        var plan = "【任务对齐】任务原文：\(task)\n完成判据：达到任务描述的最终界面/状态才算完成，输出 done 前必须逐字确认；当前第 \(step)/\(maxSteps) 步。每步 think 写清「本步子目标 → 预期界面变化 → 距完成判据还差什么」。"
        if isCollect { plan += "\n" + collectSOP }
        let hist = "【结构化历史（动作→脚本实测）】\n" + (history.isEmpty ? "(无)" : history.suffix(historyWindow).joined(separator: "\n"))
        let el = "屏幕元素清单（共 \(total) 个，显示前 \(shown) 个；tap_id 按 #编号 精确点击；坐标为像素，可直接照抄）：\n" + (elements.isEmpty ? "（元素树本次不可用/无文字元素）" : elements)
        let fact = lastFact.isEmpty ? "【脚本实测·上一步】首步，无上一动作可核对。" : lastFact
        let note = "本轮判断依据=元素清单（含 #编号/类型/文字/像素坐标）；纯文本架构无截图通道，元素树空时已自动附 describe_screen 文本兜底。读屏幕文字用 ocr_screen。"
        let rule = hardRule.isEmpty ? "" : "【脚本硬约束】" + hardRule
        return [plan, hist, el, extraInfo, fact, note, rule,
                "这是第 \(step) 步。先用 check 字段核对上一步效果(pass/fail)，再给下一个动作。坐标单位=像素。"]
            .filter { !$0.isEmpty }
            .joined(separator: "\n")
    }

    private func chat(_ userText: String) async throws -> [String: Any] {
        // 🔴 用户手填的 Base URL 若非法，强制解包会直接闪退，这里改为抛错由上层提示
        let rawBase = config.llmBase.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: rawBase + "/chat/completions") else {
            throw MCPError.badResponse("模型接口地址格式无效：\(config.llmBase)")
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 60
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(config.llmKey)", forHTTPHeaderField: "Authorization")

        let payload: [String: Any] = [
            "model": config.llmModel,
            "temperature": 0.1,
            "max_tokens": 1000,   // 旧 600：四层新增 check/think/实测块，放宽防截断
            "messages": [
                ["role": "system", "content": systemPrompt],
                ["role": "user", "content": userText]
            ],
            "tools": toolSpecs(),
            "tool_choice": "auto"
        ]

        req.httpBody = try JSONSerialization.data(withJSONObject: payload)
        let (data, response) = try await NetworkCompat.data(for: req, session: .shared)
        if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
            throw MCPError.badResponse("模型端点报错 \(http.statusCode): \(String(data: data, encoding: .utf8)?.prefix(120) ?? "")")
        }
        let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let choices = obj?["choices"] as? [[String: Any]]
        return (choices?.first?["message"] as? [String: Any]) ?? [:]
    }

    private struct ToolCall { let name: String; let arguments: [String: Any] }

    private func firstToolCall(_ message: [String: Any]) -> ToolCall? {
        guard let calls = message["tool_calls"] as? [[String: Any]],
              let fn = calls.first?["function"] as? [String: Any],
              let name = fn["name"] as? String else { return nil }
        let raw = fn["arguments"] as? String ?? "{}"
        let args = (try? JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any]) ?? [:]
        return ToolCall(name: name, arguments: args)
    }

    private func short(_ args: [String: Any]) -> String {
        let data = try? JSONSerialization.data(withJSONObject: args)
        return String((data.flatMap { String(data: $0, encoding: .utf8) } ?? "").prefix(120))
    }

    private var systemPrompt: String {
        let base = """
        你是运行在越狱 iPhone 上的屏幕 GUI Agent。根据屏幕元素清单决定下一步动作，每步只选一个动作。

        动作（每步只调一个工具）：
        - tap_id:       最优先！id = 元素清单 #编号，脚本按该元素精确像素坐标点击，零估点误差、零同名歧义
        - tap_element:  text 按文字点名（同名元素多时优先改用 tap_id）
        - tap_screen:   x, y 像素坐标（仅当清单里确实没有目标时；照抄清单 @(x,y)）
        - input_text / press_key / swipe_screen / launch_app / press_home
        - describe_screen / ocr_screen / get_element_at_point / wait_for_disappear（读信息用）
        - done(reason) / fail(reason)

        规则：
        1. 点按钮优先 tap_id（照抄 #编号）> tap_element（照抄文字）> tap_screen。中文界面 WiFi 设置项叫「无线局域网」，清单里叫什么就照抄什么。
        2. 输入文字前必须先 tap_id/tap_screen 聚焦输入框；Safari 搜索固定套路：点地址栏 → input_text → press_key(enter)。
        3. 每步必须用 check 字段核对上一步：达到预期=pass；不符（进错页/弹窗/点了没反应/画面没变）=fail，并立刻给纠正动作（press_home 回主屏或换 #编号），禁止硬往下一步走。第一步填 pass。
        4. ⚠ 每轮 prompt 里有【脚本实测·上一步】，那是脚本对元素树做的前后对比，是客观事实，优先级高于你自己的印象；事实说「画面无变化」就必须判 fail 并换做法。
        5. 【意图对齐】每步 think 写清「本步子目标 → 预期界面变化 → 距完成判据还差什么」；不要每轮重新猜任务，按【任务对齐】与【结构化历史】连续推进。
        6. launch_app 必须带 bundle_id 字段（设置=com.apple.Preferences 微信=com.tencent.xin Safari=com.apple.mobilesafari 备忘录=com.apple.mobilenotes），禁止编造、禁止只写在 reason 里。
        7. 这是 iPhone（iOS）不是 Mac！WiFi/IP/蓝牙/亮度等系统设置一律打开「设置」App 操作，禁止用命令行做系统设置。
        8. 禁止编造数值：要查看/写入的 IP、电量等真实值用 ocr_screen 读屏幕文字，读不到就回到能读到的页面重读，禁止用 192.168.1.100 之类占位假值。
        9. 判断依据=元素清单；清单只显示前 N 个，目标不在时先 swipe_screen 滚动，别直接估坐标瞎点。
        10. 【防重复】见到【脚本硬约束】/【强制换策略】必须换编号/换 swipe/换入口/回主屏，禁止原样重试。
        11. 任务完成后输出 done，且 done 前确认已达到【任务对齐】里的完成判据。
        12. 给人看的文字一律简体中文：think、reason 都必须中文，禁止英文回复。
        """
        if !isCollect { return base }
        let extra = [
            "",
            "【采集模式补充规则（仅本次任务）】",
            "- 逐条流程：tap_id 进详情 → ocr_screen 读文案 → 分享→复制链接 → get_clipboard → collect_item(caption=文案) → 返回列表 swipe 下一条。",
            "- link 不必自己填：get_clipboard 后脚本已提取短链，collect_item 会自动关联；同一链接自动去重。",
            "- 采够一批就 collect_save 并 done；脚本在 done 时也会自动落盘兜底。",
            "- 只读不发：只采屏幕公开可见的标题/描述/链接，禁止任何发布/评论/点赞/关注动作。",
            "- 见到验证/滑块/操作频繁，脚本会自动停，禁止硬点绕过。"
        ].joined(separator: "\n")
        return base + "\n" + extra
    }

    private var collectSOP: String {
        [
            "【采集模式 SOP（抖音/小红书通用；只读不发）】",
            "1. 目标 App 已按任务词自动直连；点搜索框 → input_text(关键词) → press_key(enter)。",
            "2. 搜索结果列表逐条 tap_id 进详情；描述折叠先点「展开」；ocr_screen 读标题/描述/作者作为「文案」。",
            "3. 取链接：点「分享」→ 点「复制链接」→ get_clipboard；脚本自动从口令正则提短链，你不必抠文本。",
            "4. 提交：collect_item(caption=屏幕读到的文案，platform=抖音/小红书)；link 留空，脚本自动关联刚提取的短链；同一链接自动去重。",
            "5. 收尾：collect_save 结构化落盘（JSON+CSV 到 Documents/ios_mcp_data/）后输出 done；脚本在 done/急停/熔断时也会自动落盘兜底。",
            "6. 短链域名：抖音 v.douyin.com；小红书 xhslink.com / xiaohongshu.com。口令形如「复制此链接，打开抖音搜索…」原样 get_clipboard 即可。",
            "7. 小批次：单批不超过 \(CollectGuard.batchMax) 条，采够即 collect_save + done；只采屏幕公开可见的标题/描述/链接，禁止发布/评论/点赞/关注，禁止回写平台。",
            "8. 见到验证/滑块/操作频繁，脚本会自动停并退避，禁止硬点绕过。"
        ].joined(separator: "\n")
    }

    private func toolSpecs() -> [[String: Any]] {
        func fn(_ name: String, _ desc: String, _ props: [String: Any], _ required: [String]) -> [String: Any] {
            var p = props
            p["check"] = ["type": "string", "description": "核对上一步效果：pass/fail，第一步填 pass"]
            p["think"] = ["type": "string", "description": "简短中文判断（本步子目标→预期界面→距完成判据）"]
            return ["type": "function", "function": [
                "name": name, "description": desc,
                "parameters": ["type": "object", "properties": p, "required": required + ["check", "think"]]
            ]]
        }
        func s(_ d: String) -> [String: Any] { ["type": "string", "description": d] }
        func n(_ d: String) -> [String: Any] { ["type": "number", "description": d] }
        func i(_ d: String) -> [String: Any] { ["type": "integer", "description": d] }
        // 工具收敛：只留高频/安全工具，降低弱模型在过多工具里选错的概率（对齐 Python 版 EXPOSED_EXT）
        var specs: [[String: Any]] = [
            fn("tap_id", "按 #编号 精确点击元素（最优先，零估点误差）", ["id": i("元素清单里的 #编号")], ["id"]),
            fn("tap_element", "按文字精确点击屏幕元素", ["text": s("元素名称或按钮文字")], ["text"]),
            fn("tap_screen", "按像素坐标点击（与清单 @(x,y) 同坐标系）", ["x": n("X像素"), "y": n("Y像素")], ["x", "y"]),
            fn("input_text", "向当前输入框输入文字", ["text": s("要输入的文字内容")], ["text"]),
            fn("press_key", "按虚拟键盘特殊键", ["key": s("例如 return, enter, delete")], ["key"]),
            fn("swipe_screen", "滑动屏幕（如向上翻页: fromY:600 toY:200）",
               ["fromX": n(""), "fromY": n(""), "toX": n(""), "toY": n("")], ["fromX", "fromY", "toX", "toY"]),
            fn("launch_app", "打开指定 Bundle ID 的应用", ["bundle_id": s("例如 com.apple.Preferences")], ["bundle_id"]),
            fn("press_home", "按 Home 键回到桌面", [:], []),
            fn("describe_screen", "聚合屏幕快照（元素树+OCR 文字）", [:], []),
            fn("ocr_screen", "OCR 读取屏幕文字（IP/电量/验证码等真实值）", [:], []),
            fn("get_element_at_point", "坐标反查元素（验证这点上是什么）", ["x": n(""), "y": n("")], ["x", "y"]),
            fn("wait_for_disappear", "等待某文字元素从屏幕消失（加载圈/弹窗）", ["text": s("")], ["text"]),
            fn("done", "任务已圆满完成", ["reason": s("完成原因总结")], ["reason"]),
            fn("fail", "无法继续或任务失败（脚本会先强制重规划一次）", ["reason": s("失败原因总结")], ["reason"])
        ]
        // 采集模式才追加 4 个工具；非采集任务工具表逐字节不变，不稀释精确度
        if isCollect {
            specs += [
                fn("get_clipboard", "读剪贴板（分享→复制链接后取短链，脚本自动正则提取）", [:], []),
                fn("set_clipboard", "写剪贴板", ["text": s("要写入的文本")], ["text"]),
                fn("collect_item", "提交一条采集结果（文案+链接自动关联/去重）",
                   ["caption": s("屏幕 OCR 读到的标题/描述/作者"),
                    "link": s("可选，留空则用 get_clipboard 提取的短链"),
                    "platform": s("可选：抖音/小红书")], ["caption"]),
                fn("collect_save", "把已采集条目结构化落盘（JSON+CSV）", [:], [])
            ]
        }
        return specs
    }
}
