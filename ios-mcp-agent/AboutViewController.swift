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
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.9"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"

        text.text = """
        手机助手 (ios-mcp-agent)
        版本：v\(version) (Build \(build))
        开发者：liush
        开源主页：https://github.com/liush734530963/ios-mcp-agent-public

        【功能原理与环境边界】
        1. 越狱设备（已装 iOS-MCP 8090 端口）：
           - 支持 AI 自然语言全自动拆解步骤驱动 iPhone；
           - 支持定时工作流自动亮屏、自动输入 4/6 位锁屏密码解锁、调起任意 App 及模拟点击滑动。
        2. 纯巨魔设备（TrollStore 未越狱，无法装 iOS-MCP）：
           - 支持后台常驻定时工作流：无感切换深色/浅色模式、软注销桌面(Respring)、跳转勿扰模式、URL 调起应用；
           - 针对夜间挂机无法输锁屏密码的问题，内置「纯黑伪熄屏(0亮度)」模式，绕过真锁屏，次日自动恢复亮度并打开应用。

        ==============================
        🌟 最新更新日志 (v1.0.9)
        ==============================
        【个人数据升级安全防覆盖体系】
        1. 物理 Documents 沙盒双轨持久化加固 (DataPersistenceManager)：
           - 彻底解决覆盖安装升级时数据丢失痛点！
           - 用户的 API Key、Base URL、自定义工作流任务、快捷动作全部受 Documents 物理文件与 UserDefaults 双轨保护；
           - 只要未主动卸载 App，无论是更新自签还是通过巨魔覆盖安装，已配置的个人数据 100% 完好继承，绝对不被新安装包默认示例覆盖！
        2. 全版本无损平滑迁移与容错解码：
           - 自动识别并平滑升级历史版本数据（v1.0.6、v1.0.7、v1.0.8）；
           - 采用安全容错解码，即使未来数据字段扩充，升级也不会导致任务损坏。
        3. 清空状态完全尊重：
           - 用户清空所有任务或快捷动作后，系统尊重纯净状态，重启或更新版本时绝不再强加默认示例。
        4. 全量备份与还原工具箱：
           - 设置页支持一键导出全量工作流与配置到剪贴板，支持从剪贴板一键恢复。

        ==============================
        🌟 历史重要更新 (v1.0.8)
        ==============================
        - 快捷指令与工具箱全面开放自定义与自由增删改查；
        - 工作流支持多模式调度与前置条件任意组合；
        - 对标成熟越狱实测的动态根环境探测引擎 (EnvironmentDetector)。

        ==============================
        📖 使用前检查与 iOS-MCP 安装指引
        ==============================
        1. 若需 AI 自动化点击与自动输密码解锁，请确保设备已越狱并安装 iOS-MCP 插件 (GitHub: witchan/iOS-MCP)。
        2. 确保在设备上开启服务后，Safari 打开 http://127.0.0.1:8090/health 能看到 status:ok。
        3. 若为纯巨魔未越狱设备，无需安装 iOS-MCP，可直接进入右上角「定时/工作流」使用系统外观切换、软注销与伪熄屏打卡。
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
