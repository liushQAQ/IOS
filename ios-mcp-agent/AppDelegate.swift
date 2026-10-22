import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // 崩溃守卫必须在最早期安装：先把上次启动是否中断记录下来
        CrashGuard.shared.install()
        CrashGuard.shared.beginBoot()

        // 兼容老版本或未成功激活 SceneDelegate 的场景，双保险初始化 UI，杜绝黑屏
        if #available(iOS 13.0, *) {
            // 由 SceneDelegate 接管窗口
        } else {
            let win = UIWindow(frame: UIScreen.main.bounds)
            win.rootViewController = UINavigationController(rootViewController: ViewController())
            win.makeKeyAndVisible()
            self.window = win
        }
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
