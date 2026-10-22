import Foundation

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

/// 纯文本元素树优先执行器：彻底舍弃每步截图与看图模型识别，零延迟、点名 100% 精确
final class AgentRunner {
    let config: AgentConfig
    private let mcp: MCPClient
    private var stopped = false

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
            log("✅ 驱动就绪 (极速纯文本模式)")
            _ = try? await mcp.call("wake_and_home")
            try? await Task.sleep(nanoseconds: 300_000_000)

            var history: [String] = []

            // 🚀 启发式直连加速：检测「打开/启动微信/设置/Safari」直接 0 毫秒秒开，跳过第 1 步大模型网络请求
            let initialLaunch = detectDirectLaunch(task: task)
            if let directApp = initialLaunch {
                log("⚡ [启发式秒开] 直连启动应用: \(directApp.name) (\(directApp.bundleID))")
                _ = try? await mcp.call("launch_app", arguments: ["bundle_id": directApp.bundleID])
                history.append("第1步已秒开启动 \(directApp.name)")
                try? await Task.sleep(nanoseconds: 600_000_000)
            }

            let startStep = (initialLaunch != nil) ? 2 : 1
            for step in startStep...config.maxSteps {
                if stopped { log("⏹️ 任务已停止"); return }

                // 1. 获取当前屏幕元素树并解析出结构化按钮与坐标
                let rawTree = (try? await mcp.call("get_ui_elements")) ?? ""
                let elements = ElementParser.parse(raw: rawTree)
                
                // 格式化给模型的精简可点击元素清单（前 30 项高频核心按钮）
                let elementDescriptions = elements.prefix(30).map { item in
                    "- [\(item.label)] 坐标:(\(Int(item.x)),\(Int(item.y)))"
                }.joined(separator: "\n")

                let prompt = userPrompt(task: task, step: step, history: history, elementsSummary: elementDescriptions)
                
                // 2. 调大模型（纯文本 Function Calling，极快返回）
                let message = try await chat(prompt)
                guard let call = firstToolCall(message) else {
                    let text = message["content"] as? String ?? ""
                    log("第 \(step) 步思考: \(text.prefix(60))")
                    history.append("第\(step)步无动作")
                    continue
                }

                let name = call.name
                let args = call.arguments
                log("👉 步骤 \(step): \(name) \(short(args))")

                if name == "done" || name == "fail" {
                    log(name == "done" ? "🎉 任务完成: \(args["reason"] ?? "")" : "❌ 任务终止: \(args["reason"] ?? "")")
                    return
                }

                // 3. 执行动作：优先 tap_element 或精确坐标 tap
                do {
                    if name == "tap_element" {
                        let targetText = (args["text"] as? String) ?? ""
                        if let matched = elements.first(where: { $0.label.localizedCaseInsensitiveContains(targetText) }) {
                            _ = try await mcp.call("tap_screen", arguments: ["x": Int(matched.x), "y": Int(matched.y)])
                            log("  📍 命中元素 [\(matched.label)]，点击坐标 (\(Int(matched.x)),\(Int(matched.y)))")
                        } else {
                            _ = try await mcp.call("tap_element", arguments: args)
                        }
                    } else {
                        let result = try await mcp.call(name, arguments: args)
                        let clipped = String(result.prefix(200))
                        if !clipped.isEmpty { log("  反馈: \(clipped)") }
                    }
                    history.append("第\(step)步调用 \(name) 成功")
                } catch {
                    log("  ⚠️ 执行遇到提示: \(error.localizedDescription)")
                    history.append("第\(step)步调用 \(name) 失败: \(error.localizedDescription)")
                }

                // 极简微延迟（0.3秒）
                try? await Task.sleep(nanoseconds: 300_000_000)
            }
            log("已达最大步数 \(config.maxSteps)，任务结束")
        } catch {
            log("💥 运行时错误: \(error.localizedDescription)")
        }
    }

    /// 启发式识别任务中的直连应用
    private func detectDirectLaunch(task: String) -> (name: String, bundleID: String)? {
        let lower = task.lowercased()
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

    // MARK: - 模型交互（纯文本，无图像开销）

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
            "max_tokens": 600,
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

    private func userPrompt(task: String, step: Int, history: [String], elementsSummary: String) -> String {
        """
        【用户任务】\(task)
        【当前第 \(step) 步】
        【近期记录】
        \(history.suffix(5).joined(separator: "\n"))
        【当前屏幕检测到的可点击元素列表】
        \(elementsSummary.isEmpty ? "(无直接文字元素，可通过坐标或滑动操作)" : elementsSummary)
        请根据当前界面元素做出决策，调用一个最合适的工具。完成请调 done。
        """
    }

    private func short(_ args: [String: Any]) -> String {
        let data = try? JSONSerialization.data(withJSONObject: args)
        return String((data.flatMap { String(data: $0, encoding: .utf8) } ?? "").prefix(120))
    }

    private var systemPrompt: String {
        """
        你是运行在越狱 iPhone 上的精准操作大脑。
        我们已彻底废弃低效迟钝的视觉截图识别，改用系统原生【UI 元素树】高精度直连操作！
        
        决策铁律：
        1. 优先调用 tap_element：传入当前屏幕元素中出现的文字名字即可精准点击。
        2. 输入文字：若要输入内容，先点击输入框，然后调用 input_text。
        3. 页面滚动：如果找不到想要的按钮，调用 swipe_screen 向上或向下滑动查找。
        4. 应用跳转：启动应用使用 launch_app（微信: com.tencent.xin，设置: com.apple.Preferences，Safari: com.apple.mobilesafari）。
        5. 任务达成：当用户指定的要求执行完毕，立即调用 done(reason: "中文说明")。
        """
    }

    private func toolSpecs() -> [[String: Any]] {
        func fn(_ name: String, _ desc: String, _ props: [String: Any], _ required: [String]) -> [String: Any] {
            ["type": "function", "function": [
                "name": name, "description": desc,
                "parameters": ["type": "object", "properties": props, "required": required]
            ]]
        }
        func s(_ d: String) -> [String: Any] { ["type": "string", "description": d] }
        func n(_ d: String) -> [String: Any] { ["type": "number", "description": d] }
        return [
            fn("tap_element", "按文字精准点击当前屏幕上的元素（最推荐，零失误）", ["text": s("元素名称或按钮文字")], ["text"]),
            fn("tap_screen", "按像素坐标点击", ["x": n("X坐标"), "y": n("Y坐标")], ["x", "y"]),
            fn("input_text", "向当前输入框输入文字", ["text": s("要输入的文字内容")], ["text"]),
            fn("press_key", "按虚拟键盘特殊键", ["key": s("例如 return, enter, delete")], ["key"]),
            fn("swipe_screen", "滑动屏幕(如向上翻页: fromY:600 toY:200)", ["fromX": n(""), "fromY": n(""), "toX": n(""), "toY": n("")], ["fromX", "fromY", "toX", "toY"]),
            fn("launch_app", "打开指定 Bundle ID 的应用", ["bundle_id": s("例如 com.tencent.xin")], ["bundle_id"]),
            fn("press_home", "按 Home 键回到桌面", [:], []),
            fn("done", "任务已圆满完成", ["reason": s("完成原因总结")], ["reason"]),
            fn("fail", "无法继续或任务失败", ["reason": s("失败原因总结")], ["reason"])
        ]
    }
}
