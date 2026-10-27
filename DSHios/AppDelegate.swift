import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    /// 应用版本：每次发版递增（MARKETING_VERSION / CURRENT_PROJECT_VERSION 同源）。
    /// 真值来自 Info.plist（CFBundleShortVersionString / CFBundleVersion），
    /// 这里只是 Info.plist 读取失败时的兜底常量，需与 VERSION 文件保持一致。
    enum Version {
        /// 展示版本（CFBundleShortVersionString）
        static let marketing = "2.1.2"
        /// 构建号（CFBundleVersion）
        static let build = "3"
        /// 组合展示，如 v1.0.4 (4)
        static var display: String { "v\(marketing) (\(build))" }
    }

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // 开启 64MB 内存 + 256MB 磁盘 URL 缓存，让静态 JS/CSS/字体强缓存落盘，秒开页面
        let memoryCapacity = 64 * 1024 * 1024
        let diskCapacity = 256 * 1024 * 1024
        let cache = URLCache(memoryCapacity: memoryCapacity, diskCapacity: diskCapacity, diskPath: "dsh_web_cache")
        URLCache.shared = cache

        // 🔴 R42（v1.0.139，老总「UI 固化缓存提速」令 · APP 侧启动预热）：
        //   dsh-anywhere 插件侧已给带指纹资源下发 7 天强缓存（2026-10-25，见 REGRESSION R42），
        //   WKWebView 自带 HTTP 缓存自动吃到——冷启动网络量从 5.7MB 降为只拉入口 HTML。
        //   但每次冷启动到网关的 DNS + TCP + TLS（Funnel 隧道）握手仍串行在首请求前。
        //   这里在进程拉起的最早时机对服务源发一个轻量 HEAD 热身：唤醒隧道、复用 TLS
        //   会话票据，WebView 真正的首请求握手成本近乎归零。结果丢弃、异常静默、不落缓存。
        PrewarmHelper.warmServiceConnection()
        return true
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

    func application(_ application: UIApplication,
                     didDiscardSceneSessions sceneSessions: Set<UISceneSession>) {
    }
}

/// R42：启动预热 —— 对 DSH 服务源（网关）做一次轻量 HEAD 连接热身。
/// 服务地址取 App 双轨固化存储（activeServiceURL 优先，lastURL 兜底）；
/// ephemeral 会话不落任何缓存；失败静默（预热是锦上添花，不许影响启动路径）。
enum PrewarmHelper {
    static func warmServiceConnection() {
        let defaults = UserDefaults.standard
        let raw = defaults.string(forKey: "DSHios.activeServiceURL")
            ?? defaults.string(forKey: "DSHios.lastURL")
            ?? defaults.string(forKey: "DSHios.mainDSHURL")
        guard let raw, let url = URL(string: raw), let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "HEAD"
        request.timeoutInterval = 4
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 4
        URLSession(configuration: config).dataTask(with: request) { _, _, _ in }.resume()
    }
}
