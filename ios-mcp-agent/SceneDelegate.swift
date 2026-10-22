import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene,
               willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = (scene as? UIWindowScene) else { return }
        let window = UIWindow(windowScene: windowScene)
        let root = UINavigationController(rootViewController: ViewController())
        window.rootViewController = root
        self.window = window
        window.makeKeyAndVisible()

        // 界面已就绪：4 秒后仍存活则判定本次启动健康，清除「启动中」标记
        CrashGuard.shared.scheduleHealthyCheck()
    }

    func sceneDidDisconnect(_ scene: UIScene) {}
    func sceneDidBecomeActive(_ scene: UIScene) {}
    func sceneWillResignActive(_ scene: UIScene) {}
    func sceneWillEnterForeground(_ scene: UIScene) {}
    func sceneDidEnterBackground(_ scene: UIScene) {
        // 能正常进后台说明启动已健康，立即清标记，避免误判为闪退
        CrashGuard.shared.markBootHealthy()
    }
}
