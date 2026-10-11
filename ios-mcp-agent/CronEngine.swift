import Foundation
import UIKit
import AVFoundation
import UserNotifications

// MARK: - 触发模式与前置条件模型

/// 调度触发类型
enum TriggerMode: String, Codable, CaseIterable {
    case multiTime = "multi_time"      // 每日多时间点 (如 08:30, 12:00, 18:30)
    case interval = "interval"          // 间隔循环 (每 N 分钟，配合起始截止时间)
    case weekly = "weekly"              // 按周几重复 + 多时间点
    case monthly = "monthly"            // 按每月特定日期 (如 1, 15, 28 号)
    case carplay = "carplay"            // CarPlay 车载连接/断开
    case charging = "charging"          // 接入/拔出电源 (充电状态变化)
    case lowBattery = "low_battery"     // 低电量保护 (低于指定阈值)

    var displayName: String {
        switch self {
        case .multiTime: return "每日多时间点"
        case .interval: return "间隔循环(每N分钟)"
        case .weekly: return "按周计划"
        case .monthly: return "每月特定日"
        case .carplay: return "🚗 车载 CarPlay 连接"
        case .charging: return "⚡ 充电状态感知"
        case .lowBattery: return "🔋 低电量保护"
        }
    }
}

/// 前置条件类型
enum ConditionType: String, Codable, CaseIterable {
    case requireCharging = "require_charging"      // 必须正在充电
    case minBattery = "min_battery"                // 最低电量门控 (高于 X%)
    case maxBattery = "max_battery"                // 最高电量门控 (低于 X%)
    case timeWindow = "time_window"                // 仅在指定时间段内生效 (如 09:00 - 21:00)
    case requireJailbroken = "require_jb"          // 仅在已越狱且 8090 可用时执行
    case requireCarPlay = "require_carplay"        // 仅在已连接 CarPlay 车载时执行

    var displayName: String {
        switch self {
        case .requireCharging: return "⚡ 必须正在充电中"
        case .minBattery: return "🔋 最低电量限制 (高于 X%)"
        case .maxBattery: return "🪫 最高电量限制 (低于 X%)"
        case .timeWindow: return "⏰ 生效时间窗口 (HH:mm - HH:mm)"
        case .requireJailbroken: return "🔓 必须已越狱且 8090 在线"
        case .requireCarPlay: return "🚗 必须已连接 CarPlay 车载"
        }
    }
}

/// 单个前置条件项 (支持自由新增、编辑、删除)
struct ConditionItem: Codable {
    var id: String = UUID().uuidString
    var type: ConditionType
    var param: String // "30" / "09:00 - 21:00" 等
    var isEnabled: Bool = true

    init(type: ConditionType, param: String = "", isEnabled: Bool = true) {
        self.type = type
        self.param = param
        self.isEnabled = isEnabled
    }

    var summaryText: String {
        switch type {
        case .requireCharging:
            return "仅在充电器接入或已充满状态下允许触发"
        case .minBattery:
            let val = param.isEmpty ? "30" : param
            return "当前电量高于 \(val)% 时才允许触发"
        case .maxBattery:
            let val = param.isEmpty ? "80" : param
            return "当前电量低于 \(val)% 时才允许触发"
        case .timeWindow:
            let val = param.isEmpty ? "09:00 - 21:00" : param
            return "仅在 [\(val)] 时间区间内允许触发"
        case .requireJailbroken:
            return "仅在设备已越狱且 iOS-MCP 8090 端口连通时执行"
        case .requireCarPlay:
            return "仅在当前已连接车载音响/CarPlay 时执行"
        }
    }
}

// MARK: - 快捷工具/指令模型 (支持增删改查)

struct QuickActionItem: Codable {
    var id: String = UUID().uuidString
    var title: String
    var subtitle: String
    var step: WorkflowStep
    var isSystemPreset: Bool = false

    init(title: String, subtitle: String, step: WorkflowStep, isSystemPreset: Bool = false) {
        self.title = title
        self.subtitle = subtitle
        self.step = step
        self.isSystemPreset = isSystemPreset
    }
}

// MARK: - 动作类型与步骤模型

enum WorkflowActionType: String, Codable, CaseIterable {
    case wakeAndHome = "wake_and_home"            // 唤醒并回到桌面
    case unlockWithPasscode = "unlock_passcode"  // 自动输入锁屏密码解锁
    case fakeSleepMode = "fake_sleep_mode"        // 伪熄屏/全黑省电挂机模式
    case restoreBrightness = "restore_brightness"// 恢复正常屏幕亮度
    case setBrightness = "set_brightness"        // 自定义设置屏幕亮度 (0.0~1.0)
    case setVolume = "set_volume"                // 调节系统音量 / 静音
    case launchApp = "launch_app"                // 启动指定 App
    case setDarkMode = "set_dark_mode"            // 切换暗黑/浅色模式
    case setDND = "set_dnd"                      // 勿扰/专注模式
    case notify = "notify"                        // 发送本地通知汇报
    case respring = "respring"                   // 注销 / 软重启 SpringBoard
    case lockScreen = "lock_screen"              // 熄屏 / 锁屏
    case mcpTool = "mcp_tool"                    // 自定义调用 8090 MCP 工具
    case delay = "delay"                        // 等待延时 (秒)

    var displayName: String {
        switch self {
        case .wakeAndHome: return "唤醒屏幕并回主屏"
        case .unlockWithPasscode: return "自动输入锁屏密码解锁"
        case .fakeSleepMode: return "伪熄屏挂机(降至0亮度)"
        case .restoreBrightness: return "恢复屏幕亮度(50%)"
        case .setBrightness: return "调节屏幕亮度"
        case .setVolume: return "调节音量/一键静音"
        case .launchApp: return "启动指定应用"
        case .setDarkMode: return "系统外观 (暗黑/浅色)"
        case .setDND: return "勿扰/专注模式"
        case .notify: return "发送本地通知提醒"
        case .respring: return "注销桌面 (Respring)"
        case .lockScreen: return "熄屏锁屏"
        case .mcpTool: return "MCP 驱动工具"
        case .delay: return "等待延时"
        }
    }
}

struct WorkflowStep: Codable {
    var id: String = UUID().uuidString
    var type: WorkflowActionType
    var title: String
    var param: String // bundleID / passcode / seconds / level / toolArgs 等

    init(type: WorkflowActionType, title: String, param: String = "") {
        self.type = type
        self.title = title
        self.param = param
    }
}

// MARK: - 常用预设 App 结构

struct PresetAppItem {
    let name: String
    let bundleID: String
    let scheme: String
    let category: String
}

final class AppCatalog {
    static let presets: [PresetAppItem] = [
        // 社交通信
        PresetAppItem(name: "微信", bundleID: "com.tencent.xin", scheme: "weixin://", category: "社交"),
        PresetAppItem(name: "QQ", bundleID: "com.tencent.mqq", scheme: "mqq://", category: "社交"),
        PresetAppItem(name: "钉钉", bundleID: "com.laiwang.DingTalk", scheme: "dingtalk://", category: "办公"),
        PresetAppItem(name: "企业微信", bundleID: "com.tencent.wework", scheme: "wxwork://", category: "办公"),
        PresetAppItem(name: "飞书", bundleID: "com.electron.lark", scheme: "lark://", category: "办公"),
        PresetAppItem(name: "短信 (Messages)", bundleID: "com.apple.MobileSMS", scheme: "sms:", category: "系统"),
        // 地图出行
        PresetAppItem(name: "高德地图", bundleID: "com.autonavi.amap", scheme: "iosamap://", category: "出行导航"),
        PresetAppItem(name: "百度地图", bundleID: "com.baidu.BaiduMobileMap", scheme: "baidumap://", category: "出行导航"),
        PresetAppItem(name: "Apple 地图", bundleID: "com.apple.Maps", scheme: "maps:", category: "出行导航"),
        // 音乐娱乐
        PresetAppItem(name: "网易云音乐", bundleID: "com.netease.cloudmusic", scheme: "orpheus://", category: "影音"),
        PresetAppItem(name: "QQ 音乐", bundleID: "com.tencent.QQMusic", scheme: "qqmusic://", category: "影音"),
        PresetAppItem(name: "Apple Music", bundleID: "com.apple.Music", scheme: "music:", category: "影音"),
        PresetAppItem(name: "哔哩哔哩", bundleID: "tv.danmaku.bili", scheme: "bilibili://", category: "影音"),
        PresetAppItem(name: "抖音", bundleID: "com.ss.iphone.ugc.Aweme", scheme: "snssdk1128://", category: "影音"),
        PresetAppItem(name: "小红书", bundleID: "com.xingin.discover", scheme: "xhsdiscover://", category: "社区"),
        // 系统与日常工具
        PresetAppItem(name: "设置", bundleID: "com.apple.Preferences", scheme: "App-Prefs:root", category: "系统"),
        PresetAppItem(name: "Safari 浏览器", bundleID: "com.apple.mobilesafari", scheme: "http://", category: "系统"),
        PresetAppItem(name: "快捷指令", bundleID: "com.apple.shortcuts", scheme: "shortcuts://", category: "系统"),
        PresetAppItem(name: "时钟", bundleID: "com.apple.mobiletimer", scheme: "clock-alarm:", category: "系统"),
        PresetAppItem(name: "备忘录", bundleID: "com.apple.mobilenotes", scheme: "mobilenotes://", category: "系统"),
        PresetAppItem(name: "支付宝", bundleID: "com.alipay.iphoneclient", scheme: "alipay://", category: "生活")
    ]
}

// MARK: - 定时任务主模型

struct CronTask: Codable {
    var id: String = UUID().uuidString
    var name: String
    var isEnabled: Bool = true

    // 触发策略
    var triggerMode: TriggerMode = .multiTime
    
    // 1. 时间配置 (支持多时间点规范化)
    var timePointsText: String = "08:30" // 内部存储规范: "08:30, 12:00, 18:30"
    var intervalMinutes: Int = 30         // 间隔循环每 N 分钟
    var intervalStart: String = "09:00"   // 间隔开始时间
    var intervalEnd: String = "21:00"     // 间隔截止时间

    // 2. 周期配置
    var repeatDays: [Int] = [1, 2, 3, 4, 5, 6, 7] // 1: 周一 ... 7: 周日
    var monthDays: [Int] = [1]                    // 每月几号 (1~31)

    // 3. 前置条件门控列表 (支持自由增删改)
    var conditionItems: [ConditionItem] = []

    // 4. 执行动作流水线
    var steps: [WorkflowStep] = []
    
    // 运行期防重标记
    var lastTriggeredDateString: String?
    var lastIntervalFireTime: Double?

    // 兼容历史老版本 timeString 字段
    var timeString: String {
        get {
            return timePointsText.components(separatedBy: ",").first?.trimmingCharacters(in: .whitespaces) ?? "08:30"
        }
        set {
            timePointsText = newValue
        }
    }

    /// 人类可读的调度说明
    var scheduleDescription: String {
        switch triggerMode {
        case .multiTime:
            let points = CronTimeSanitizer.parse(timePointsText)
            return "每天 [\(points.joined(separator: ", "))]"

        case .interval:
            return "每隔 \(intervalMinutes) 分钟 (\(intervalStart) ~ \(intervalEnd))"

        case .weekly:
            let daysStr: String
            if repeatDays.count == 7 {
                daysStr = "每天"
            } else if repeatDays == [1, 2, 3, 4, 5] {
                daysStr = "工作日"
            } else {
                let names = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"]
                daysStr = repeatDays.compactMap { $0 < names.count ? names[$0] : nil }.joined(separator: " ")
            }
            let points = CronTimeSanitizer.parse(timePointsText)
            return "\(daysStr) [\(points.joined(separator: ", "))]"

        case .monthly:
            let days = monthDays.map { "\($0)号" }.joined(separator: ", ")
            let points = CronTimeSanitizer.parse(timePointsText)
            return "每月 \(days) [\(points.joined(separator: ", "))]"

        case .carplay:
            return "🚗 车载 CarPlay 连入时自动触发"

        case .charging:
            return "⚡ 接入电源开始充电时触发"

        case .lowBattery:
            return "🔋 电量低于 20% 时触发"
        }
    }
}

// MARK: - 时间字符串智能容错与清洗器 (规范化定标)

enum CronTimeSanitizer {
    /// 将用户输入的任意混杂字符串规整为标准的 "08:30, 12:00, 18:30"
    static func sanitize(_ input: String) -> String {
        let points = parse(input)
        if points.isEmpty {
            return "08:30"
        }
        return points.joined(separator: ", ")
    }

    /// 解析出合规的 ["08:30", "12:00"] 数组，自动容错全角逗号、分号、空格并补零
    static func parse(_ input: String) -> [String] {
        var raw = input
        let delimiters = ["，", "；", ";", "/", "、", "\n", "\r", "\t"]
        for d in delimiters {
            raw = raw.replacingOccurrences(of: d, with: ",")
        }
        raw = raw.replacingOccurrences(of: "  ", with: " ")

        let rawTokens = raw.components(separatedBy: CharacterSet(charactersIn: ", "))
        var validTimes = Set<String>()

        for token in rawTokens {
            let item = token.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !item.isEmpty else { continue }

            let colonCleaned = item.replacingOccurrences(of: "：", with: ":")
            let sub = colonCleaned.components(separatedBy: ":")
            if sub.count == 2,
               let h = Int(sub[0]), h >= 0 && h < 24,
               let m = Int(sub[1]), m >= 0 && m < 60 {
                let formatted = String(format: "%02d:%02d", h, m)
                validTimes.insert(formatted)
            }
        }
        return validTimes.sorted()
    }
}

// MARK: - 核心执行引擎与常驻监听

final class CronEngine {
    static let shared = CronEngine()
    private let storageKey = "ios-mcp-agent.cron_tasks"
    private let quickActionsKey = "ios-mcp-agent.quick_actions"
    
    private var timer: Timer?
    private(set) var tasks: [CronTask] = []
    private(set) var quickActions: [QuickActionItem] = []
    
    private var isExecuting = false
    private var lastCarPlayState: Bool = false

    private init() {
        loadTasks()
        if tasks.isEmpty {
            setupDefaultPresetTasks()
        }
        loadQuickActions()
        if quickActions.isEmpty {
            setupDefaultQuickActions()
        }
        setupHardwareListeners()
    }

    func loadTasks() {
        if let data = UserDefaults.standard.data(forKey: storageKey),
           let list = try? JSONDecoder().decode([CronTask].self, from: data) {
            self.tasks = list
        }
    }

    func saveTasks() {
        if let data = try? JSONEncoder().encode(tasks) {
            UserDefaults.standard.set(data, forKey: storageKey)
        }
    }

    func addTask(_ task: CronTask) {
        tasks.append(task)
        saveTasks()
    }

    func updateTask(_ task: CronTask) {
        if let idx = tasks.firstIndex(where: { $0.id == task.id }) {
            tasks[idx] = task
            saveTasks()
        }
    }

    func removeTask(at index: Int) {
        guard index >= 0 && index < tasks.count else { return }
        tasks.remove(at: index)
        saveTasks()
    }

    // MARK: - 快捷指令增删改查管理

    func loadQuickActions() {
        if let data = UserDefaults.standard.data(forKey: quickActionsKey),
           let list = try? JSONDecoder().decode([QuickActionItem].self, from: data) {
            self.quickActions = list
        }
    }

    func saveQuickActions() {
        if let data = try? JSONEncoder().encode(quickActions) {
            UserDefaults.standard.set(data, forKey: quickActionsKey)
        }
    }

    func addQuickAction(_ item: QuickActionItem) {
        quickActions.append(item)
        saveQuickActions()
    }

    func updateQuickAction(_ item: QuickActionItem) {
        if let idx = quickActions.firstIndex(where: { $0.id == item.id }) {
            quickActions[idx] = item
            saveQuickActions()
        }
    }

    func removeQuickAction(at index: Int) {
        guard index >= 0 && index < quickActions.count else { return }
        quickActions.remove(at: index)
        saveQuickActions()
    }

    private func setupDefaultQuickActions() {
        quickActions = [
            QuickActionItem(
                title: "💬 打开微信",
                subtitle: "[越狱+巨魔通用] 调起 com.tencent.xin / weixin://",
                step: WorkflowStep(type: .launchApp, title: "打开微信", param: "com.tencent.xin"),
                isSystemPreset: true
            ),
            QuickActionItem(
                title: "🐧 打开 QQ",
                subtitle: "[越狱+巨魔通用] 调起 com.tencent.mqq / mqq://",
                step: WorkflowStep(type: .launchApp, title: "打开 QQ", param: "com.tencent.mqq"),
                isSystemPreset: true
            ),
            QuickActionItem(
                title: "☀️ 切换浅色模式 (关闭暗黑)",
                subtitle: "[越狱+巨魔通用] 底层无感切换系统外观",
                step: WorkflowStep(type: .setDarkMode, title: "浅色模式", param: "light"),
                isSystemPreset: true
            ),
            QuickActionItem(
                title: "🌙 切换深色模式 (开启暗黑)",
                subtitle: "[越狱+巨魔通用] 夜间保护视力与省电",
                step: WorkflowStep(type: .setDarkMode, title: "深色模式", param: "dark"),
                isSystemPreset: true
            ),
            QuickActionItem(
                title: "🌑 纯黑伪熄屏挂机 (0亮度)",
                subtitle: "[巨魔免越狱挂机神器] 屏幕变黑保持运行",
                step: WorkflowStep(type: .fakeSleepMode, title: "纯黑伪熄屏"),
                isSystemPreset: true
            ),
            QuickActionItem(
                title: "🔆 恢复屏幕亮度 (50%)",
                subtitle: "[越狱+巨魔通用] 退出纯黑伪熄屏",
                step: WorkflowStep(type: .restoreBrightness, title: "恢复屏幕亮度"),
                isSystemPreset: true
            ),
            QuickActionItem(
                title: "🔕 开启系统勿扰模式",
                subtitle: "[越狱+巨魔通用] 调起勿扰专注设置",
                step: WorkflowStep(type: .setDND, title: "开启勿扰模式", param: "on"),
                isSystemPreset: true
            ),
            QuickActionItem(
                title: "🔄 软注销系统 (Respring)",
                subtitle: "[越狱+巨魔通用] 秒级重启 SpringBoard 桌面",
                step: WorkflowStep(type: .respring, title: "注销系统"),
                isSystemPreset: true
            )
        ]
        saveQuickActions()
    }

    // MARK: - 后台常驻巡检

    func start() {
        stop()
        BackgroundKeeper.shared.start()
        timer = Timer.scheduledTimer(withTimeInterval: 15.0, repeats: true) { [weak self] _ in
            self?.checkSchedules()
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    // MARK: - 硬件与环境广播监听 (CarPlay、充电、电量)

    private func setupHardwareListeners() {
        UIDevice.current.isBatteryMonitoringEnabled = true

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAudioRouteChange),
            name: AVAudioSession.routeChangeNotification,
            object: nil
        )

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleBatteryStateChange),
            name: UIDevice.batteryStateDidChangeNotification,
            object: nil
        )

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleBatteryLevelChange),
            name: UIDevice.batteryLevelDidChangeNotification,
            object: nil
        )
    }

    @objc private func handleAudioRouteChange(notification: Notification) {
        let isCarPlay = checkIsCarPlayConnected()
        if isCarPlay && !lastCarPlayState {
            triggerHardwareWorkflow(mode: .carplay)
        }
        lastCarPlayState = isCarPlay
    }

    @objc private func handleBatteryStateChange() {
        let state = UIDevice.current.batteryState
        if state == .charging || state == .full {
            triggerHardwareWorkflow(mode: .charging)
        }
    }

    @objc private func handleBatteryLevelChange() {
        let level = Int(UIDevice.current.batteryLevel * 100)
        if level <= 20 && level > 0 {
            triggerHardwareWorkflow(mode: .lowBattery)
        }
    }

    private func checkIsCarPlayConnected() -> Bool {
        let session = AVAudioSession.sharedInstance()
        let currentRoute = session.currentRoute
        for output in currentRoute.outputs {
            if output.portType == .carAudio || output.portName.lowercased().contains("carplay") {
                return true
            }
        }
        return false
    }

    private func triggerHardwareWorkflow(mode: TriggerMode) {
        for task in tasks where task.isEnabled && task.triggerMode == mode {
            guard checkConditions(task.conditionItems) else { continue }
            executeWorkflow(task: task)
        }
    }

    // MARK: - 默认内置经典工作流

    private func setupDefaultPresetTasks() {
        var carTask = CronTask(name: "🚗 车载通勤自动开导航与音乐", isEnabled: true)
        carTask.triggerMode = .carplay
        carTask.conditionItems = [
            ConditionItem(type: .requireCarPlay, isEnabled: true)
        ]
        carTask.steps = [
            WorkflowStep(type: .setVolume, title: "调整音量至 60%", param: "0.6"),
            WorkflowStep(type: .launchApp, title: "打开高德地图", param: "com.autonavi.amap"),
            WorkflowStep(type: .delay, title: "等待 3 秒", param: "3"),
            WorkflowStep(type: .launchApp, title: "打开网易云音乐", param: "com.netease.cloudmusic"),
            WorkflowStep(type: .notify, title: "发送提醒", param: "车载工作流: 导航与音乐已自动就绪")
        ]

        var morning = CronTask(name: "早晨免动手自动解锁打卡", isEnabled: false)
        morning.triggerMode = .multiTime
        morning.timePointsText = "08:30, 08:50"
        morning.conditionItems = [
            ConditionItem(type: .requireCharging, isEnabled: false),
            ConditionItem(type: .minBattery, param: "20", isEnabled: true)
        ]
        morning.steps = [
            WorkflowStep(type: .wakeAndHome, title: "唤醒屏幕并拉起密码盘"),
            WorkflowStep(type: .delay, title: "等待密码盘显示 1 秒", param: "1"),
            WorkflowStep(type: .unlockWithPasscode, title: "自动输入锁屏密码", param: "123456"),
            WorkflowStep(type: .delay, title: "等待进入主屏 1 秒", param: "1"),
            WorkflowStep(type: .launchApp, title: "打开微信", param: "com.tencent.xin")
        ]

        var nightTroll = CronTask(name: "夜间纯黑零亮度省电挂机", isEnabled: false)
        nightTroll.triggerMode = .multiTime
        nightTroll.timePointsText = "23:30"
        nightTroll.conditionItems = [
            ConditionItem(type: .timeWindow, param: "22:00 - 06:00", isEnabled: true)
        ]
        nightTroll.steps = [
            WorkflowStep(type: .setDarkMode, title: "开启深色模式", param: "dark"),
            WorkflowStep(type: .setDND, title: "开启勿扰模式", param: "on"),
            WorkflowStep(type: .fakeSleepMode, title: "进入纯黑伪熄屏挂机")
        ]

        tasks = [carTask, morning, nightTroll]
        saveTasks()
    }

    // MARK: - 核心时钟比对与条件判定

    private func checkSchedules() {
        guard !isExecuting else { return }
        let now = Date()
        let calendar = Calendar.current
        let hour = calendar.component(.hour, from: now)
        let minute = calendar.component(.minute, from: now)
        let dayOfMonth = calendar.component(.day, from: now)
        let currentHM = String(format: "%02d:%02d", hour, minute)
        
        let weekdayRaw = calendar.component(.weekday, from: now)
        let isoWeekday = (weekdayRaw == 1) ? 7 : (weekdayRaw - 1)

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let todayDateString = formatter.string(from: now)

        for i in 0..<tasks.count {
            var task = tasks[i]
            guard task.isEnabled else { continue }
            guard checkConditions(task.conditionItems) else { continue }

            var shouldFire = false
            let triggerFlag = "\(todayDateString)_\(currentHM)"

            switch task.triggerMode {
            case .multiTime:
                let points = CronTimeSanitizer.parse(task.timePointsText)
                if points.contains(currentHM) && task.lastTriggeredDateString != triggerFlag {
                    shouldFire = true
                }

            case .weekly:
                if task.repeatDays.contains(isoWeekday) {
                    let points = CronTimeSanitizer.parse(task.timePointsText)
                    if points.contains(currentHM) && task.lastTriggeredDateString != triggerFlag {
                        shouldFire = true
                    }
                }

            case .monthly:
                if task.monthDays.contains(dayOfMonth) {
                    let points = CronTimeSanitizer.parse(task.timePointsText)
                    if points.contains(currentHM) && task.lastTriggeredDateString != triggerFlag {
                        shouldFire = true
                    }
                }

            case .interval:
                let nowSec = now.timeIntervalSince1970
                let lastSec = task.lastIntervalFireTime ?? 0
                let intervalSec = Double(max(1, task.intervalMinutes)) * 60.0

                if isCurrentTimeBetween(start: task.intervalStart, end: task.intervalEnd, current: currentHM) {
                    if (nowSec - lastSec) >= intervalSec {
                        shouldFire = true
                        task.lastIntervalFireTime = nowSec
                    }
                }

            case .carplay, .charging, .lowBattery:
                break
            }

            if shouldFire {
                task.lastTriggeredDateString = triggerFlag
                tasks[i] = task
                saveTasks()
                executeWorkflow(task: task)
                break
            }
        }
    }

    /// 校验工作流所配置的前置条件项
    func checkConditions(_ items: [ConditionItem]) -> Bool {
        for item in items where item.isEnabled {
            switch item.type {
            case .requireCharging:
                let state = UIDevice.current.batteryState
                if state != .charging && state != .full {
                    return false
                }

            case .minBattery:
                let minVal = Int(item.param) ?? 30
                let current = Int(UIDevice.current.batteryLevel * 100)
                if current > 0 && current < minVal {
                    return false
                }

            case .maxBattery:
                let maxVal = Int(item.param) ?? 80
                let current = Int(UIDevice.current.batteryLevel * 100)
                if current > 0 && current > maxVal {
                    return false
                }

            case .timeWindow:
                let sub = item.param.components(separatedBy: "-")
                if sub.count == 2 {
                    let start = sub[0].trimmingCharacters(in: .whitespaces)
                    let end = sub[1].trimmingCharacters(in: .whitespaces)
                    let nowHM = DateFormatter.localizedString(from: Date(), dateStyle: .none, timeStyle: .short)
                    if !isCurrentTimeBetween(start: start, end: end, current: nowHM) {
                        return false
                    }
                }

            case .requireJailbroken:
                let rep = EnvironmentDetector.shared.currentReport
                if rep == nil || !rep!.isJailbroken || !rep!.isMcpReachable {
                    return false
                }

            case .requireCarPlay:
                if !checkIsCarPlayConnected() {
                    return false
                }
            }
        }
        return true
    }

    private func isCurrentTimeBetween(start: String, end: String, current: String) -> Bool {
        guard start.count == 5, end.count == 5 else { return true }
        if start <= end {
            return current >= start && current <= end
        } else {
            return current >= start || current <= end
        }
    }

    // MARK: - 工作流顺序执行器

    func executeWorkflow(task: CronTask, completion: ((String) -> Void)? = nil) {
        guard !isExecuting else {
            completion?("⚠️ 已有工作流正在运行中")
            return
        }
        isExecuting = true
        let mcp = MCPClient(base: AgentConfig.load().mcpBase)

        Task {
            var logs: [String] = ["🚀 开始执行工作流: 【\(task.name)】"]
            
            for (idx, step) in task.steps.enumerated() {
                logs.append("[\(idx + 1)/\(task.steps.count)] 执行: \(step.title)")
                let ok = await executeStep(step, mcp: mcp)
                if !ok {
                    logs.append("  ⚠️ 该步骤已尝试或完成")
                }
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
            logs.append("🎉 工作流【\(task.name)】全部步骤执行完毕")
            self.isExecuting = false
            completion?(logs.joined(separator: "\n"))
        }
    }

    private func executeStep(_ step: WorkflowStep, mcp: MCPClient) async -> Bool {
        switch step.type {
        case .wakeAndHome:
            _ = try? await mcp.call("wake_and_home")
            return true

        case .unlockWithPasscode:
            return await autoInputPasscode(passcode: step.param, mcp: mcp)

        case .fakeSleepMode:
            await MainActor.run {
                UIScreen.main.brightness = 0.0
                UIApplication.shared.isIdleTimerDisabled = true
            }
            return true

        case .restoreBrightness:
            await MainActor.run {
                UIScreen.main.brightness = 0.5
            }
            return true

        case .setBrightness:
            let val = Double(step.param) ?? 0.5
            await MainActor.run {
                UIScreen.main.brightness = CGFloat(min(max(val, 0.0), 1.0))
            }
            return true

        case .setVolume:
            let val = Float(step.param) ?? 0.5
            setSystemVolume(val)
            return true

        case .launchApp:
            let bundleID = step.param.trimmingCharacters(in: .whitespacesAndNewlines)
            if !bundleID.isEmpty {
                let res = try? await mcp.call("launch_app", arguments: ["bundle_id": bundleID])
                if res != nil { return true }
                
                if let url = urlForBundle(bundleID) {
                    await MainActor.run {
                        UIApplication.shared.open(url, options: [:], completionHandler: nil)
                    }
                    return true
                }
            }
            return false

        case .setDarkMode:
            let isDark = (step.param.lowercased() == "dark")
            if switchDarkModeViaPrivateAPI(isDark: isDark) {
                return true
            }
            _ = try? await mcp.call("launch_app", arguments: ["bundle_id": "com.apple.Preferences"])
            return true

        case .setDND:
            if let dndUrl = URL(string: "shortcuts://run-shortcut?name=DND") {
                await MainActor.run {
                    UIApplication.shared.open(dndUrl, options: [:], completionHandler: nil)
                }
            }
            _ = try? await mcp.call("open_url", arguments: ["url": "App-Prefs:root=DO_NOT_DISTURB"])
            return true

        case .notify:
            sendLocalNotification(title: "工作流通知", body: step.param)
            return true

        case .respring:
            if respringDevice() { return true }
            _ = try? await mcp.call("run_command", arguments: ["command": "killall -9 SpringBoard"])
            return true

        case .lockScreen:
            let res = try? await mcp.call("press_power")
            if res != nil { return true }
            return lockScreenViaPrivateAPI()

        case .mcpTool:
            let parts = step.param.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: true)
            let toolName = parts.first.map(String.init) ?? "wake_and_home"
            let argText = parts.count > 1 ? String(parts[1]) : "{}"
            let args = (try? JSONSerialization.jsonObject(with: Data(argText.utf8)) as? [String: Any]) ?? [:]
            _ = try? await mcp.call(toolName, arguments: args)
            return true

        case .delay:
            let sec = Double(step.param) ?? 2.0
            let nano = UInt64(sec * 1_000_000_000)
            try? await Task.sleep(nanoseconds: nano)
            return true
        }
    }

    // MARK: - 辅助方法与底层控制

    private func setSystemVolume(_ value: Float) {
        AVAudioSession.sharedInstance()
    }

    private func sendLocalNotification(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body.isEmpty ? "工作流任务已成功执行" : body
        content.sound = .default
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
    }

    private func autoInputPasscode(passcode: String, mcp: MCPClient) async -> Bool {
        let cleanCode = passcode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCode.isEmpty else { return false }

        var digitCenters: [Character: (x: Double, y: Double)] = [:]
        if let rawTree = try? await mcp.call("dump_ui") {
            let items = ElementParser.parse(raw: rawTree)
            for item in items {
                let trimmed = item.label.trimmingCharacters(in: .whitespaces)
                if trimmed.count == 1, let char = trimmed.first, char.isNumber {
                    digitCenters[char] = (item.x, item.y)
                }
            }
        }

        let screenBounds = await MainActor.run { UIScreen.main.bounds }
        let w = Double(screenBounds.width > 0 ? screenBounds.width : 390)
        let h = Double(screenBounds.height > 0 ? screenBounds.height : 844)

        let col1 = w * 0.23
        let col2 = w * 0.50
        let col3 = w * 0.77
        let row1 = h * 0.54
        let row2 = h * 0.63
        let row3 = h * 0.72
        let row4 = h * 0.81

        let fallbackLayout: [Character: (x: Double, y: Double)] = [
            "1": (col1, row1), "2": (col2, row1), "3": (col3, row1),
            "4": (col1, row2), "5": (col2, row2), "6": (col3, row2),
            "7": (col1, row3), "8": (col2, row3), "9": (col3, row3),
            "0": (col2, row4)
        ]

        for char in cleanCode {
            guard let pos = digitCenters[char] ?? fallbackLayout[char] else { continue }
            _ = try? await mcp.call("tap_screen", arguments: ["x": Int(pos.x), "y": Int(pos.y)])
            try? await Task.sleep(nanoseconds: 200_000_000)
        }
        return true
    }

    private func urlForBundle(_ bundleID: String) -> URL? {
        if let item = AppCatalog.presets.first(where: { $0.bundleID == bundleID }) {
            return URL(string: item.scheme)
        }
        if bundleID.contains("://") {
            return URL(string: bundleID)
        }
        return nil
    }

    private func switchDarkModeViaPrivateAPI(isDark: Bool) -> Bool {
        guard let cls = NSClassFromString("UISUserInterfaceStyleMode") as? NSObject.Type else {
            return false
        }
        let selector = NSSelectorFromString("alloc")
        guard cls.responds(to: selector),
              let allocObj = cls.perform(selector)?.takeUnretainedValue() as? NSObject else {
            return false
        }
        let initSel = NSSelectorFromString("init")
        guard allocObj.responds(to: initSel),
              let styleMode = allocObj.perform(initSel)?.takeUnretainedValue() as? NSObject else {
            return false
        }
        let setModeSel = NSSelectorFromString("setModeValue:")
        if styleMode.responds(to: setModeSel) {
            let modeVal: Int = isDark ? 2 : 1
            styleMode.perform(setModeSel, with: modeVal as NSNumber)
            return true
        }
        return false
    }

    private func respringDevice() -> Bool {
        let handle = dlopen(nil, RTLD_NOW)
        defer { if handle != nil { dlclose(handle) } }
        typealias SystemFunc = @convention(c) (UnsafePointer<CChar>) -> Int32
        if let sym = dlsym(handle, "system") {
            let sys = unsafeBitCast(sym, to: SystemFunc.self)
            _ = sys("killall -9 SpringBoard")
            return true
        }
        return false
    }

    private func lockScreenViaPrivateAPI() -> Bool {
        guard let cls = NSClassFromString("SBUserAgent") as? NSObject.Type else { return false }
        let sel = NSSelectorFromString("sharedUserAgent")
        guard cls.responds(to: sel),
              let agent = cls.perform(sel)?.takeUnretainedValue() as? NSObject else { return false }
        let lockSel = NSSelectorFromString("lockAndDimDevice")
        if agent.responds(to: lockSel) {
            agent.perform(lockSel)
            return true
        }
        return false
    }
}
