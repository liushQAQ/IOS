import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    /// 应用版本：每次发版递增（MARKETING_VERSION / CURRENT_PROJECT_VERSION 同源）。
    enum Version {
        /// 展示版本（CFBundleShortVersionString）
        static let marketing = "1.0.4"
        /// 构建号（CFBundleVersion）
        static let build = "4"
        /// 组合展示，如 v1.0.4 (4)
        static var display: String { "v\(marketing) (\(build))" }
    }

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
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
