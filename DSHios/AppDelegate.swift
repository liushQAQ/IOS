import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    /// 应用版本：每次发版递增（MARKETING_VERSION / CURRENT_PROJECT_VERSION 同源）。
    /// 真值来自 Info.plist（CFBundleShortVersionString / CFBundleVersion），
    /// 这里只是 Info.plist 读取失败时的兜底常量，需与 VERSION 文件保持一致。
    enum Version {
        /// 展示版本（CFBundleShortVersionString）
        static let marketing = "1.0.101"
        /// 构建号（CFBundleVersion）
        static let build = "35"
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
