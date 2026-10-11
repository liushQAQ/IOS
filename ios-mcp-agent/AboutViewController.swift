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
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.8"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"

        text.text = """
        手机助手 (ios-mcp-agent)
        版本：v\(version) (Build \(build))
        开发者：liush（GitHub: liush734530963）

        【功能原理与环境边界】
        1. 越狱设备（已装 iOS-MCP 8090 端口）：
           - 支持 AI 自然语言全自动拆解步骤驱动 iPhone；
           - 支持定时工作流自动亮屏、自动输入 4/6 位锁屏密码解锁、调起任意 App 及模拟点击滑动。
        2. 纯巨魔设备（TrollStore 未越狱，无法装 iOS-MCP）：
           - 支持后台常驻定时工作流：无感切换深色/浅色模式、软注销桌面(Respring)、跳转勿扰模式、URL 调起应用；
           - 针对夜间挂机无法输锁屏密码的问题，内置「纯黑伪熄屏(0亮度)」模式，绕过真锁屏，次日自动恢复亮度并打开应用。

        ==============================
        🌟 最新更新日志 (v1.0.8)
        ==============================
        【新增功能与核心优化】
        1. 快捷指令与工具箱全面开放自定义：
           - 彻底打破固定预设限制：支持自由「➕ 新建快捷动作」；
           - 支持修改已有动作的标题、副标题与执行参数（Bundle ID、密码、秒数等）；
           - 支持左滑快速删除无用快捷指令；
           - 支持点击直接单点触发，点击右侧详情图标进入编辑面板。
        2. 自由度工作流编排与前置条件自由扩展：
           - 支持任务左滑删除与步骤左滑删除；
           - 前置条件门控全面开放自由增删改查：可自由添加最低电量、最高电量、有效时间段、充电状态、越狱状态、CarPlay 连入等任意组合。
        3. 对标成熟越狱实测的动态根环境探测引擎 (EnvironmentDetector)：
           - 引入 dlopen / dlsym 动态探测 jbroot / jbroot_alloc 导出符号（精准对标 RootHide / Dopamine）；
           - 深度遍历 /var/jb、/private/preboot/<UUID>/procursus 隐藏根与 TrollStore 沙盒逃逸特征；
           - 动态探测 127.0.0.1:8090 MCP 服务连通状态；
           - 界面首屏以醒目卡片展示当前硬件/越狱环境诊断与锁屏能力推荐方案。

        ==============================
        📖 使用前检查
        ==============================
        1. 若需 AI 自动化点击与自动输密码解锁，请确保设备已越狱并开启 iOS MCP (http://127.0.0.1:8090/health 返回 status:ok)。
        2. 若为纯巨魔未越狱设备，可直接进入右上角「定时/工作流」使用系统外观切换、软注销与伪熄屏打卡。
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
