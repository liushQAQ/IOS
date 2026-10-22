import Foundation
import UIKit

/// 核心数据持久化与升级防覆盖管理器
/// 职责：
/// 1. 采用 iOS Documents 物理文件 + UserDefaults 双重互备机制，避开系统覆盖安装时的可能重置；
/// 2. 严格的初次安装判定（AntiOverwriteGuard）：只要设备上曾经初始化过或存在历史配置，覆盖安装时绝不以默认预设覆盖用户数据；
/// 3. 用户即使清空所有任务，空列表状态也受持久化尊重，不会在下次启动或版本更新时被强行加回默认任务；
/// 4. 提供一键导出全量配置 JSON 与导入恢复能力。
final class DataPersistenceManager {
    static let shared = DataPersistenceManager()

    private let fileManager = FileManager.default

    // 持久化存储根目录: Documents/ios_mcp_data/
    // 🔴 启动期高危点加固：极端环境（巨魔/异常沙盒）下 urls(for:) 可能返回空数组，
    // 旧写法 [0] 会直接索引越界导致「一打开就闪退」。此处改为安全兜底，绝不越界。
    private var dataDirectory: URL {
        let docs: URL
        if let first = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first {
            docs = first
        } else {
            // 兜底：退回 App 沙盒根，保证 App 至少可正常启动
            docs = URL(fileURLWithPath: NSHomeDirectory())
        }
        let dir = docs.appendingPathComponent("ios_mcp_data", isDirectory: true)
        if !fileManager.fileExists(atPath: dir.path) {
            try? fileManager.createDirectory(at: dir, withIntermediateDirectories: true, attributes: nil)
        }
        return dir
    }

    private var tasksFileURL: URL {
        return dataDirectory.appendingPathComponent("cron_tasks.json")
    }

    private var quickActionsFileURL: URL {
        return dataDirectory.appendingPathComponent("quick_actions.json")
    }

    private var agentConfigFileURL: URL {
        return dataDirectory.appendingPathComponent("agent_config.json")
    }

    private var markerFileURL: URL {
        return dataDirectory.appendingPathComponent(".initialized_marker")
    }

    // UserDefaults 兼容 Key
    private let legacyTasksKey = "ios-mcp-agent.cron_tasks"
    private let legacyQuickActionsKey = "ios-mcp-agent.quick_actions"
    private let defaultsInitializedKey = "ios-mcp-agent.has_ever_initialized"
    private let configUserCustomizedKey = "ios-mcp-agent.config_user_customized"

    private init() {
        _ = dataDirectory
    }

    // MARK: - 首次安装与防覆盖状态检测 (Anti-Overwrite Guard)

    /// 检测是否为设备全生命周期中的「真正初次全新安装」
    /// 只有在：物理 marker 不存在、数据文件不存在、UserDefaults 历史标记也不存在的情况下，才返回 true
    var isPristineFirstLaunch: Bool {
        // 1. 物理标记文件存在 -> 不是初次安装
        if fileManager.fileExists(atPath: markerFileURL.path) {
            return false
        }
        // 2. 物理数据文件存在 -> 不是初次安装
        if fileManager.fileExists(atPath: tasksFileURL.path) || fileManager.fileExists(atPath: quickActionsFileURL.path) {
            markInitialized()
            return false
        }
        // 3. UserDefaults 标记存在 -> 不是初次安装
        if UserDefaults.standard.bool(forKey: defaultsInitializedKey) {
            markInitialized()
            return false
        }
        // 4. 检查是否存在旧版存留在 UserDefaults 中的数据
        if UserDefaults.standard.data(forKey: legacyTasksKey) != nil ||
           UserDefaults.standard.data(forKey: legacyQuickActionsKey) != nil {
            markInitialized()
            return false
        }
        return true
    }

    /// 是否曾经持久化保存过定时任务
    var hasEverSavedTasks: Bool {
        return fileManager.fileExists(atPath: tasksFileURL.path) ||
               UserDefaults.standard.data(forKey: legacyTasksKey) != nil
    }

    /// 是否曾经持久化保存过快捷指令
    var hasEverSavedQuickActions: Bool {
        return fileManager.fileExists(atPath: quickActionsFileURL.path) ||
               UserDefaults.standard.data(forKey: legacyQuickActionsKey) != nil
    }

    /// 标记已完成初始化，生成防覆盖永久盾牌
    func markInitialized() {
        UserDefaults.standard.set(true, forKey: defaultsInitializedKey)
        let info = "initialized_at=\(Date().timeIntervalSince1970)"
        try? info.write(to: markerFileURL, atomically: true, encoding: .utf8)
    }

    // MARK: - 定时任务数据管理 (双轨互备)

    func loadTasks() -> [CronTask]? {
        // 优先从 Documents 文件加载
        if let data = try? Data(contentsOf: tasksFileURL) {
            if let tasks = decodeTasksSafely(from: data) {
                // 双写同步到 UserDefaults 保持镜像
                UserDefaults.standard.set(data, forKey: legacyTasksKey)
                return tasks
            }
        }

        // 回退从 UserDefaults 加载 (平滑迁移升级用户)
        if let data = UserDefaults.standard.data(forKey: legacyTasksKey) {
            if let tasks = decodeTasksSafely(from: data) {
                // 立即持久化到 Documents 物理文件
                try? data.write(to: tasksFileURL, options: .atomic)
                markInitialized()
                return tasks
            }
        }

        return nil
    }

    func saveTasks(_ tasks: [CronTask]) {
        markInitialized()
        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted
        if let data = try? encoder.encode(tasks) {
            try? data.write(to: tasksFileURL, options: .atomic)
            UserDefaults.standard.set(data, forKey: legacyTasksKey)
        }
    }

    // MARK: - 快捷指令数据管理 (双轨互备)

    func loadQuickActions() -> [QuickActionItem]? {
        // 优先从 Documents 文件加载
        if let data = try? Data(contentsOf: quickActionsFileURL) {
            if let actions = decodeQuickActionsSafely(from: data) {
                UserDefaults.standard.set(data, forKey: legacyQuickActionsKey)
                return actions
            }
        }

        // 回退从 UserDefaults 加载
        if let data = UserDefaults.standard.data(forKey: legacyQuickActionsKey) {
            if let actions = decodeQuickActionsSafely(from: data) {
                try? data.write(to: quickActionsFileURL, options: .atomic)
                markInitialized()
                return actions
            }
        }

        return nil
    }

    func saveQuickActions(_ actions: [QuickActionItem]) {
        markInitialized()
        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted
        if let data = try? encoder.encode(actions) {
            try? data.write(to: quickActionsFileURL, options: .atomic)
            UserDefaults.standard.set(data, forKey: legacyQuickActionsKey)
        }
    }

    // MARK: - 用户 AgentConfig 管理 (API Key 与模型保护)

    var isConfigUserCustomized: Bool {
        return UserDefaults.standard.bool(forKey: configUserCustomizedKey)
    }

    func markConfigUserCustomized() {
        UserDefaults.standard.set(true, forKey: configUserCustomizedKey)
    }

    func loadAgentConfig() -> AgentConfig? {
        if let data = try? Data(contentsOf: agentConfigFileURL),
           let config = try? JSONDecoder().decode(AgentConfig.self, from: data) {
            return config
        }
        return nil
    }

    func saveAgentConfig(_ config: AgentConfig) {
        markConfigUserCustomized()
        if let data = try? JSONEncoder().encode(config) {
            try? data.write(to: agentConfigFileURL, options: .atomic)
        }
    }

    // MARK: - 安全容错解码逻辑 (逐项保护，不因单项损坏丢弃整组)

    private func decodeTasksSafely(from data: Data) -> [CronTask]? {
        // 1. 先尝试全量标准解码
        if let list = try? JSONDecoder().decode([CronTask].self, from: data) {
            return list
        }

        // 2. 若全量解析因某条损坏失败，降级为逐项安全解析
        guard let jsonArray = try? JSONSerialization.jsonObject(with: data, options: []) as? [[String: Any]] else {
            return nil
        }

        var recovered: [CronTask] = []
        for itemDict in jsonArray {
            if let itemData = try? JSONSerialization.data(withJSONObject: itemDict, options: []),
               let task = try? JSONDecoder().decode(CronTask.self, from: itemData) {
                recovered.append(task)
            }
        }
        return recovered
    }

    private func decodeQuickActionsSafely(from data: Data) -> [QuickActionItem]? {
        if let list = try? JSONDecoder().decode([QuickActionItem].self, from: data) {
            return list
        }

        guard let jsonArray = try? JSONSerialization.jsonObject(with: data, options: []) as? [[String: Any]] else {
            return nil
        }

        var recovered: [QuickActionItem] = []
        for itemDict in jsonArray {
            if let itemData = try? JSONSerialization.data(withJSONObject: itemDict, options: []),
               let action = try? JSONDecoder().decode(QuickActionItem.self, from: itemData) {
                recovered.append(action)
            }
        }
        return recovered
    }

    // MARK: - 备份与还原支持 (全量导出/导入)

    struct FullBackupPayload: Codable {
        var version: String
        var exportedAt: String
        var tasks: [CronTask]
        var quickActions: [QuickActionItem]
        var config: AgentConfig?
    }

    func exportFullBackupJSON() -> String? {
        let tasks = loadTasks() ?? []
        let quickActions = loadQuickActions() ?? []
        let config = AgentConfig.load()

        let payload = FullBackupPayload(
            version: "1.0.9",
            exportedAt: ISO8601DateFormatter().string(from: Date()),
            tasks: tasks,
            quickActions: quickActions,
            config: config
        )

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(payload),
              let json = String(data: data, encoding: .utf8) else {
            return nil
        }
        return json
    }

    func restoreFromBackupJSON(_ jsonString: String) -> (success: Bool, message: String) {
        guard let data = jsonString.data(using: .utf8) else {
            return (false, "无效的 JSON 字符串")
        }

        guard let payload = try? JSONDecoder().decode(FullBackupPayload.self, from: data) else {
            return (false, "备份数据格式校验未通过")
        }

        saveTasks(payload.tasks)
        saveQuickActions(payload.quickActions)
        if let cfg = payload.config {
            cfg.save()
        }

        return (true, "已成功恢复 \(payload.tasks.count) 个工作流与 \(payload.quickActions.count) 个快捷指令！")
    }
}
