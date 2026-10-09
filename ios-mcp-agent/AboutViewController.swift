import UIKit

final class AboutViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        title = "关于与更新"
        view.backgroundColor = .systemBackground

        let text = UITextView()
        text.isEditable = false
        text.font = .systemFont(ofSize: 15)
        text.backgroundColor = .clear
        text.text = """
        手机助手 (ios-mcp-agent)
        版本：v1.0.1
        开发者：liush（GitHub: liush734530963）

        【功能原理】
        用户输入一句话（如“帮我打开微信，找到好友ZZ发信息”），由大模型拆解步骤，App 自动通过 127.0.0.1:8090 调度本机 ios-mcp 驱动 iPhone 完成操作。

        ==============================
        🌟 最新更新日志 (v1.0.1)
        ==============================
        【新增功能】
        1. 原生 UI 元素树极速驱动（彻底告别截图）：
           - 全面舍弃耗时易错的视觉截图识别。
           - 实时直读系统原生元素树与中心坐标，单步由 4~6 秒提速至几百毫秒，点名准确率 100%。
        2. 后台防墓碑保活引擎：
           - 引入静音音频后台机制，退到后台操作微信时绝不断连冻结。
        3. 全新独立原创科技图标：
           - 专属夜空蓝青色渐变与 MCP 拓扑微芯片图标。
        4. 双版本规范化版本管理：
           - 自动化构建自用版 (内置模型) 与公开版 (纯净无密钥)。

        【体验说明】
        1. 极速顺畅：零图像开销，Token 消耗降低 80% 以上。
        2. 秒开无黑屏：规范 Scene 生命周期。
        3. 锁屏自愈：每轮前自动唤醒防拦截。

        ==============================
        📖 使用前检查
        ==============================
        1. 确保已越狱并安装 iOS MCP，Safari 打开 http://127.0.0.1:8090/health 看到 status:ok。
        2. 点右上角「模型」配置或选择你的可用模型接口。
        3. 回到主界面输入指令，点击「开始」即可。
        """
        text.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(text)
        NSLayoutConstraint.activate([
            text.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            text.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 14),
            text.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -14),
            text.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
    }
}
