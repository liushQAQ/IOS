import Foundation
import UIKit

/// 崩溃自愈与安全启动守卫
/// 职责：
/// 1. 安装未捕获异常与致命信号捕获，异常时把可读原因落盘到 Documents/ios_mcp_data/last_crash.log；
/// 2. 启动打「正在启动」标记，启动后 4 秒仍存活才清除；下次启动若发现标记残留 = 上次闪退，
///    自动进入「安全模式」：跳过音频保活、自动检查更新与默认定时引擎，保证 App 至少能打开；
/// 3. 提供崩溃记录读取与安全模式复位，方便在「关于」页一键恢复。
final class CrashGuard {
    static let shared = CrashGuard()

    private let crashCountKey = "crashguard.crash_count"
    private let lastCrashTimeKey = "crashguard.last_crash_at"

    private(set) var previousBootCrashed = false
    private(set) var safeMode = false

    private var healthyCheckScheduled = false

    private init() {}

    // MARK: - 存储位置

    private var dataDirectory: URL? {
        guard let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            return nil
        }
        let dir = docs.appendingPathComponent("ios_mcp_data", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true, attributes: nil)
        }
        return dir
    }

    private var bootMarkerURL: URL? {
        return dataDirectory?.appendingPathComponent("boot.marker")
    }

    private var crashLogURL: URL? {
        return dataDirectory?.appendingPathComponent("last_crash.log")
    }

    // MARK: - 安装捕获

    func install() {
        NSSetUncaughtExceptionHandler { exception in
            CrashGuard.shared.recordException(exception)
        }
        // 致命信号：只恢复默认处理并重新抛出（信号上下文内不做任何 Swift 内存操作，避免二次死锁）。
        // 闪退原因由「启动标记残留」在下次启动时判定并进入安全模式。
        for sig in [SIGABRT, SIGSEGV, SIGBUS, SIGILL, SIGFPE, SIGTRAP, SIGSYS] {
            signal(sig) { s in
                signal(s, SIG_DFL)
                raise(s)
            }
        }
    }

    // MARK: - 启动标记

    func beginBoot() {
        guard let dir = dataDirectory else { return }
        let marker = dir.appendingPathComponent("boot.marker")

        if FileManager.default.fileExists(atPath: marker.path) {
            previousBootCrashed = true
            safeMode = true
            let previous = (try? String(contentsOf: marker, encoding: .utf8)) ?? "(无内容)"
            let report = """
            ⚠️ 检测到上一次启动未正常完成（疑似闪退）。

            【上次启动标记】
            \(previous)

            【本次处置】
            已自动进入「安全模式」：本次启动已跳过后台音频保活、自动检查更新与默认定时引擎，
            以便 App 能正常打开。请在「关于」页查看详情，确认无误后点「退出安全模式并恢复正常启动」。
            提示：若启动后 8 秒内被手动划掉，也会被记为一次「未正常完成」，属正常现象。

            【环境】
            系统版本：\(UIDevice.current.systemName) \(UIDevice.current.systemVersion)
            机型标识：\(CrashGuard.deviceModelIdentifier())
            界面类型：\(UIDevice.current.userInterfaceIdiom == .pad ? "iPad (pad)" : "iPhone (phone)")
            App 版本：\(CrashGuard.appVersionText())
            记录时间：\(Date())
            """
            writeReport(report)
        }

        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?"
        let content = "booted_at=\(Date().timeIntervalSince1970)\nversion=\(version)\nbuild=\(build)\nidiom=\(UIDevice.current.userInterfaceIdiom.rawValue)\niOS=\(UIDevice.current.systemVersion)\n"
        try? content.write(to: marker, atomically: true, encoding: .utf8)
    }

    /// 启动后调用：界面稳定存活足够时间后才清除启动标记，表示本次启动健康。
    /// 注意：不能用过短的固定延时——冷启动几秒内被用户手动划掉会被误判成闪退。
    func scheduleHealthyCheck() {
        guard !healthyCheckScheduled else { return }
        healthyCheckScheduled = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 8.0) {
            CrashGuard.shared.markBootHealthy()
        }
    }

    func markBootHealthy() {
        if let marker = bootMarkerURL, FileManager.default.fileExists(atPath: marker.path) {
            try? FileManager.default.removeItem(at: marker)
        }
    }

    /// 手动退出安全模式（下次启动恢复正常）
    func resetSafeMode() {
        safeMode = false
        markBootHealthy()
    }

    // MARK: - 崩溃记录

    func recordException(_ exception: NSException) {
        let callStack = exception.callStackSymbols.prefix(30).joined(separator: "\n")
        let report = """
        ❌ 未捕获异常（NSSetUncaughtExceptionHandler）

        名称：\(exception.name.rawValue)
        原因：\(exception.reason ?? "(无)")
        环境：\(UIDevice.current.systemName) \(UIDevice.current.systemVersion) / 界面类型 \(UIDevice.current.userInterfaceIdiom.rawValue) / 机型 \(CrashGuard.deviceModelIdentifier())
        版本：\(CrashGuard.appVersionText())
        时间：\(Date())

        【调用栈】
        \(callStack)
        """
        writeReport(report)
    }

    private func writeReport(_ text: String) {
        guard let dir = dataDirectory else { return }
        let url = dir.appendingPathComponent("last_crash.log")
        try? text.write(to: url, atomically: true, encoding: .utf8)
        let defaults = UserDefaults.standard
        defaults.set(Date().timeIntervalSince1970, forKey: lastCrashTimeKey)
        defaults.set(defaults.integer(forKey: crashCountKey) + 1, forKey: crashCountKey)
        // 有崩溃记录时同步把启动标记保留下来，确保下次启动仍能进入安全模式
        if let marker = bootMarkerURL, !FileManager.default.fileExists(atPath: marker.path) {
            try? "crashed_at=\(Date().timeIntervalSince1970)\n".write(to: marker, atomically: true, encoding: .utf8)
        }
    }

    func readLastReport() -> String? {
        guard let url = crashLogURL, let text = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        return text
    }

    func clearReports() {
        if let url = crashLogURL { try? FileManager.default.removeItem(at: url) }
        UserDefaults.standard.set(0, forKey: crashCountKey)
    }

    var crashCount: Int {
        return UserDefaults.standard.integer(forKey: crashCountKey)
    }

    // MARK: - 辅助

    static func appVersionText() -> String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "v\(version) (Build \(build))"
    }

    static func deviceModelIdentifier() -> String {
        var systemInfo = utsname()
        uname(&systemInfo)
        let machine = withUnsafePointer(to: &systemInfo.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 32) {
                String(cString: $0)
            }
        }
        return machine.isEmpty ? "未知" : machine
    }
}
