import UIKit

/// iPad 弹层兼容层
/// 背景：iPad 上以 `.actionSheet` 呈现 UIAlertController 时，UIKit 会把它转成 popover，
/// 若未提供 popoverPresentationController 的锚点（sourceView/sourceRect 或 barButtonItem），
/// 会直接抛 NSInternalInconsistencyException 闪退（iPhone 不受影响）。
/// 本扩展统一收口：所有 actionSheet 一律先补锚点再呈现，杜绝该类崩溃；
/// 同时解决「已经有弹层在呈现时再弹一次」导致的呈现冲突异常。
extension UIViewController {

    /// 安全呈现 actionSheet：自动补齐 iPad popover 锚点
    /// - Parameter sourceView: 锚点视图；为空时锚定到当前页面中心区域
    func presentActionSheet(_ sheet: UIAlertController, sourceView: UIView? = nil, animated: Bool = true) {
        if let popover = sheet.popoverPresentationController {
            let anchor: UIView? = sourceView ?? self.view
            popover.sourceView = anchor
            if let anchor = anchor, anchor.bounds.width > 0, anchor.bounds.height > 0 {
                popover.sourceRect = CGRect(x: anchor.bounds.midX, y: anchor.bounds.midY, width: 1, height: 1)
            } else {
                popover.sourceRect = CGRect(x: 1, y: 1, width: 1, height: 1)
            }
            // 不做方向限制，避免窄屏/横屏下被挤压
            popover.permittedArrowDirections = []
        }
        presentWhenReady(sheet, animated: animated)
    }

    /// 安全呈现 alert：iPad 上 alert 不走 popover，但仍统一补锚点与呈现排队
    func presentAlertSafely(_ alert: UIAlertController, animated: Bool = true) {
        if let popover = alert.popoverPresentationController {
            popover.sourceView = self.view
            popover.sourceRect = CGRect(x: self.view.bounds.midX, y: self.view.bounds.midY, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }
        presentWhenReady(alert, animated: animated)
    }

    /// 呈现排队：若当前有弹层正在呈现/正在消失，等它结束后再呈现，最多重试 20 次（约 1 秒）
    private func presentWhenReady(_ vc: UIViewController, animated: Bool, attempt: Int = 0) {
        guard attempt < 20 else { return }
        if self.presentedViewController != nil || self.isBeingDismissed || self.isBeingPresented {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
                self?.presentWhenReady(vc, animated: animated, attempt: attempt + 1)
            }
            return
        }
        self.present(vc, animated: animated)
    }

    /// 取当前最顶层可呈现的控制器
    static func dsh_topMost(from root: UIViewController?) -> UIViewController? {
        guard var top = root else { return nil }
        while let presented = top.presentedViewController {
            top = presented
        }
        if let nav = top as? UINavigationController, let visible = nav.visibleViewController {
            return UIViewController.dsh_topMost(from: visible)
        }
        if let tab = top as? UITabBarController, let selected = tab.selectedViewController {
            return UIViewController.dsh_topMost(from: selected)
        }
        return top
    }
}
