import Foundation
import UIKit
import MachO

/// 运行环境类型
enum JailbreakFlavor: String {
    case stock = "未越狱/原生"
    case trollStore = "纯巨魔 (TrollStore)"
    case rootless = "Rootless 越狱 (Dopamine/ElleKit)"
    case roothide = "RootHide 隐匿越狱 (Bootstrap/Serotonin)"
}

/// 环境探针诊断结果
struct EnvironmentReport {
    let flavor: JailbreakFlavor
    let jbRoot: String?
    let isTrollStore: Bool
    let isJailbroken: Bool
    let isMcpReachable: Bool
    let mcpPort: Int
    let summary: String
    let canSimulateHardwareTouch: Bool // 能否锁屏模拟按键
    let canRespring: Bool
    let canRunCronBackground: Bool
}

/// 专为 iOS 设计的深度环境与越狱探针，完全整合对标 RootHide、Rootless 与 TrollStore 沙盒机制
final class EnvironmentDetector {
    static let shared = EnvironmentDetector()

    private(set) var currentReport: EnvironmentReport?
    private var lastMcpCheckTime: Date?

    private init() {}

    /// 探测越狱根目录 (针对 RootHide 动态前缀 `.jbroot-<16位HEX>`、Dopamine 及 /var/jb)
    func detectJailbreakRoot() -> (flavor: JailbreakFlavor, path: String?) {
        // 1. 尝试 dlsym 探测注入的 libroothide / libroot API
        if let handle = dlopen(nil, RTLD_NOW) {
            typealias JbRootFn = @convention(c) (UnsafePointer<CChar>?) -> UnsafePointer<CChar>?
            if let sym = dlsym(handle, "jbroot") ?? dlsym(handle, "jbroot_alloc") {
                let fn = unsafeBitCast(sym, to: JbRootFn.self)
                if let cStr = fn("/") {
                    let path = String(cString: cStr)
                    if !path.isEmpty && path != "/" {
                        let clean = path.hasSuffix("/") ? String(path.dropLast()) : path
                        return (.roothide, clean)
                    }
                }
            }
        }

        // 2. RootHide 核心路径 `/var/containers/Bundle/Application/.jbroot-<16位HEX>`
        let jbRootParents = [
            "/var/containers/Bundle/Application",
            "/private/var/containers/Bundle/Application",
            "/var/mobile/Containers/Shared/AppGroup"
        ]
        for parent in jbRootParents {
            if let dir = opendir(parent) {
                defer { closedir(dir) }
                while let entry = readdir(dir) {
                    let name = withUnsafePointer(to: &entry.pointee.d_name) {
                        $0.withMemoryRebound(to: CChar.self, capacity: Int(entry.pointee.d_namlen) + 1) {
                            String(cString: $0)
                        }
                    }
                    if name.hasPrefix(".jbroot-") || name == ".jbroot" {
                        let full = "\(parent)/\(name)"
                        if access("\(full)/usr/bin", F_OK) == 0 || access("\(full)/bin", F_OK) == 0 || FileManager.default.fileExists(atPath: full) {
                            return (.roothide, full)
                        }
                    }
                }
            }
        }

        // 3. 检查 App Bundle 下的 .jbroot 链接
        let bundleJbroot = (Bundle.main.bundlePath as NSString).appendingPathComponent(".jbroot")
        if access(bundleJbroot, F_OK) == 0 {
            if let dest = try? FileManager.default.destinationOfSymbolicLink(atPath: bundleJbroot), !dest.isEmpty {
                return (.roothide, dest)
            }
            return (.roothide, bundleJbroot)
        }

        // 4. 检查动态库注入环境变量 (DYLD_INSERT_LIBRARIES)
        if let insertLibs = ProcessInfo.processInfo.environment["DYLD_INSERT_LIBRARIES"], !insertLibs.isEmpty {
            if let range = insertLibs.range(of: ".jbroot-[0-9A-Fa-f]{16}", options: .regularExpression) {
                return (.roothide, String(insertLibs[..<range.upperBound]))
            }
            if insertLibs.contains("/jb") || insertLibs.contains("procursus") {
                return (.rootless, "/var/jb")
            }
        }

        // 5. 遍历 dyld 映射
        let imageCount = _dyld_image_count()
        for i in 0..<imageCount {
            if let cName = _dyld_get_image_name(i) {
                let imgPath = String(cString: cName)
                if let range = imgPath.range(of: ".jbroot-[0-9A-Fa-f]{16}", options: .regularExpression) {
                    return (.roothide, String(imgPath[..<range.upperBound]))
                }
            }
        }

        // 6. 探测 /private/preboot/ 动态区 (Dopamine / Serotonin)
        let prebootPath = "/private/preboot"
        if let subdirs = try? FileManager.default.contentsOfDirectory(atPath: prebootPath) {
            for dir in subdirs {
                let candidateBase = "\(prebootPath)/\(dir)"
                if let innerDirs = try? FileManager.default.contentsOfDirectory(atPath: candidateBase) {
                    for inner in innerDirs {
                        let fullCandidate = "\(candidateBase)/\(inner)"
                        if inner.hasPrefix(".jbroot-") {
                            return (.roothide, fullCandidate)
                        }
                        if inner.hasPrefix("jb-") || inner.hasPrefix("dopamine-") {
                            return (.rootless, fullCandidate)
                        }
                    }
                }
            }
        }

        // 7. 标准 Rootless /var/jb 符号链接
        let standardLinks = ["/var/jb", "/private/var/jb", "/var/run/jbroot"]
        for sym in standardLinks {
            if FileManager.default.fileExists(atPath: sym) || access(sym, F_OK) == 0 {
                return (.rootless, sym)
            }
        }

        return (.stock, nil)
    }

    /// 探测是否具备巨魔特权沙盒逃逸能力
    func detectTrollStore() -> Bool {
        let testPaths = [
            "/var/mobile/Library/Preferences",
            "/var/mobile/Media",
            "/var/mobile/Containers",
            "/var/containers/Bundle/trollstore.app",
            "/Applications/TrollStore.app"
        ]
        for p in testPaths {
            if FileManager.default.isReadableFile(atPath: p) || access(p, F_OK) == 0 {
                return true
            }
        }
        if ProcessInfo.processInfo.environment["TROLLSTORE"] != nil {
            return true
        }
        return false
    }

    /// 快速异步探测本机 8090 端口 iOS-MCP 服务连通性
    func checkMcpReachability(port: Int = 8090) async -> Bool {
        guard let url = URL(string: "http://127.0.0.1:\(port)/tools") else { return false }
        var req = URLRequest(url: url)
        req.timeoutInterval = 1.2
        do {
            let (_, resp) = try await NetworkCompat.data(for: req, session: .shared)
            if let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode) {
                return true
            }
        } catch {
            return false
        }
        return false
    }

    /// 产生完整运行环境诊断报告
    func diagnose() async -> EnvironmentReport {
        let (flavor, path) = detectJailbreakRoot()
        let isTroll = detectTrollStore()
        let isJB = (flavor == .rootless || flavor == .roothide)
        let resolvedFlavor: JailbreakFlavor = isJB ? flavor : (isTroll ? .trollStore : .stock)

        let isMcpOk = await checkMcpReachability(port: 8090)

        var summary = ""
        switch resolvedFlavor {
        case .roothide:
            summary = "RootHide 隐匿越狱环境 (根目录: \(path ?? "未知"))"
        case .rootless:
            summary = "Rootless 越狱环境 (根目录: \(path ?? "/var/jb"))"
        case .trollStore:
            summary = "纯巨魔环境 (TrollStore 特权，未检测到越狱根)"
        case .stock:
            summary = "标准原生未越狱沙盒环境"
        }

        let report = EnvironmentReport(
            flavor: resolvedFlavor,
            jbRoot: path,
            isTrollStore: isTroll,
            isJailbroken: isJB,
            isMcpReachable: isMcpOk,
            mcpPort: 8090,
            summary: summary,
            canSimulateHardwareTouch: isMcpOk, // 依赖 8090 服务端 SpringBoard 注入
            canRespring: isTroll || isJB,
            canRunCronBackground: true // 通过 BackgroundKeeper 音频保活均可运行
        )
        self.currentReport = report
        return report
    }
}
