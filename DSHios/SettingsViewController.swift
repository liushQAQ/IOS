import UIKit

// MARK: - 服务条目与存储

struct ServiceItem: Codable, Equatable {
    var name: String
    var url: String
}

enum ServiceStore {
    static let key = "DSHios.services"
    static let seededKey = "DSHios.servicesSeeded"

    /// 默认预置：本机（192.168.215.218）所有在用的局域网服务端口。
    /// 与电脑端 9009 仪表盘 services-config.json 对齐。
    static let defaults: [ServiceItem] = [
        ServiceItem(name: "DSH 主控（desk端·全权限）", url: "http://192.168.215.218:3083/"),
        ServiceItem(name: "DSH 网页端（headless）", url: "http://192.168.215.218:3084/"),
        ServiceItem(name: "端口仪表盘（9009）", url: "http://192.168.215.218:9009/"),
        ServiceItem(name: "反向代理（8080 统一入口）", url: "http://192.168.215.218:8080/"),
        ServiceItem(name: "认证网关（9060）", url: "http://192.168.215.218:9060/"),
        ServiceItem(name: "文件管理器（9050）", url: "http://192.168.215.218:9050/"),
        ServiceItem(name: "本地搜索代理（8020）", url: "http://192.168.215.218:8020/"),
        ServiceItem(name: "凡人修仙（8070）", url: "http://192.168.215.218:8070/"),
        ServiceItem(name: "群聊图片生成（8030）", url: "http://192.168.215.218:8030/"),
        ServiceItem(name: "点歌API（8200）", url: "http://192.168.215.218:8200/"),
        ServiceItem(name: "WorkBuddy 账号切换（57890）", url: "http://192.168.215.218:57890/"),
        ServiceItem(name: "OpenAI代理（8050·API）", url: "http://192.168.215.218:8050/"),
        ServiceItem(name: "视频解析（8011·API）", url: "http://192.168.215.218:8011/"),
        ServiceItem(name: "Video API（8120·API）", url: "http://192.168.215.218:8120/"),
        ServiceItem(name: "TTS 语音（8210·API）", url: "http://192.168.215.218:8210/"),
    ]

    static func load() -> [ServiceItem] {
        if !UserDefaults.standard.bool(forKey: seededKey) {
            UserDefaults.standard.set(true, forKey: seededKey)
            save(defaults)
            return defaults
        }
        guard let data = UserDefaults.standard.data(forKey: key),
              let items = try? JSONDecoder().decode([ServiceItem].self, from: data) else {
            return defaults
        }
        return items.isEmpty ? defaults : items
    }

    static func save(_ items: [ServiceItem]) {
        if let data = try? JSONEncoder().encode(items) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    static func add(_ item: ServiceItem) {
        var items = load()
        items.append(item)
        save(items)
    }

    static func update(at index: Int, with item: ServiceItem) {
        var items = load()
        guard items.indices.contains(index) else { return }
        items[index] = item
        save(items)
    }

    static func remove(at index: Int) {
        var items = load()
        guard items.indices.contains(index) else { return }
        items.remove(at: index)
        save(items)
    }
}

// MARK: - 服务列表管理页

final class SettingsViewController: UIViewController {

    private let onSave: (String) -> Void
    private let onSelect: (String) -> Void
    private var services: [ServiceItem] = []
    private let tableView = UITableView(frame: .zero, style: .insetGrouped)

    init(onSave: @escaping (String) -> Void, onSelect: @escaping (String) -> Void) {
        self.onSave = onSave
        self.onSelect = onSelect
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "服务列表"
        view.backgroundColor = .systemBackground
        services = ServiceStore.load()

        navigationItem.rightBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .add, target: self, action: #selector(addTapped))

        tableView.dataSource = self
        tableView.delegate = self
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "service")
        tableView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(tableView)
        NSLayoutConstraint.activate([
            tableView.topAnchor.constraint(equalTo: view.topAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        let footer = UIView(frame: CGRect(x: 0, y: 0, width: 0, height: 72))
        let footerLabel = UILabel()
        footerLabel.text = "点击行直接打开该服务；右上角 + 添加新地址；左滑删除或编辑。列表保存在本机，电脑 IP 变化时只需编辑对应条目。"
        footerLabel.font = .preferredFont(forTextStyle: .footnote)
        footerLabel.textColor = .secondaryLabel
        footerLabel.numberOfLines = 0
        footerLabel.translatesAutoresizingMaskIntoConstraints = false
        footer.addSubview(footerLabel)
        NSLayoutConstraint.activate([
            footerLabel.topAnchor.constraint(equalTo: footer.topAnchor, constant: 8),
            footerLabel.leadingAnchor.constraint(equalTo: footer.leadingAnchor, constant: 20),
            footerLabel.trailingAnchor.constraint(equalTo: footer.trailingAnchor, constant: -20),
            footerLabel.bottomAnchor.constraint(lessThanOrEqualTo: footer.bottomAnchor, constant: -8),
        ])
        tableView.tableFooterView = footer
    }

    // MARK: - 添加 / 编辑

    @objc private func addTapped() {
        presentEditor(nil)
    }

    private func presentEditor(_ existing: (index: Int, item: ServiceItem)?) {
        let alert = UIAlertController(
            title: existing == nil ? "添加服务" : "编辑服务",
            message: "名称与局域网地址",
            preferredStyle: .alert)

        alert.addTextField { tf in
            tf.placeholder = "名称（如：端口仪表盘）"
            tf.text = existing?.item.name
            tf.autocapitalizationType = .none
        }
        alert.addTextField { tf in
            tf.placeholder = "http://192.168.215.218:9009/"
            tf.text = existing?.item.url
            tf.autocapitalizationType = .none
            tf.autocorrectionType = .no
            tf.keyboardType = .URL
        }

        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        alert.addAction(UIAlertAction(title: "保存", style: .default) { [weak self] _ in
            guard let self,
                  let name = alert.textFields?[0].text?.trimmingCharacters(in: .whitespaces),
                  !name.isEmpty,
                  var url = alert.textFields?[1].text?.trimmingCharacters(in: .whitespaces),
                  !url.isEmpty else { return }
            if !url.lowercased().hasPrefix("http://"), !url.lowercased().hasPrefix("https://") {
                url = "http://" + url
            }
            let item = ServiceItem(name: name, url: url)
            if let existing {
                ServiceStore.update(at: existing.index, with: item)
            } else {
                ServiceStore.add(item)
            }
            self.services = ServiceStore.load()
            self.tableView.reloadData()
        })
        present(alert, animated: true)
    }
}

extension SettingsViewController: UITableViewDataSource, UITableViewDelegate {

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        services.count
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "service", for: indexPath)
        let item = services[indexPath.row]
        var config = cell.defaultContentConfiguration()
        config.text = item.name
        config.secondaryText = item.url
        config.secondaryTextProperties.color = .secondaryLabel
        config.secondaryTextProperties.font = .preferredFont(forTextStyle: .caption1)
        cell.contentConfiguration = config
        cell.accessoryType = .disclosureIndicator
        return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        let item = services[indexPath.row]
        onSave(item.url)
        onSelect(item.url)
        navigationController?.popViewController(animated: true)
    }

    func tableView(_ tableView: UITableView,
                   trailingSwipeActionsConfigurationForRowAt indexPath: IndexPath) -> UISwipeActionsConfiguration? {
        let delete = UIContextualAction(style: .destructive, title: "删除") { [weak self] _, _, done in
            ServiceStore.remove(at: indexPath.row)
            self?.services = ServiceStore.load()
            tableView.deleteRows(at: [indexPath], with: .automatic)
            done(true)
        }
        let edit = UIContextualAction(style: .normal, title: "编辑") { [weak self] _, _, done in
            guard let self else { done(false); return }
            self.presentEditor((indexPath.row, self.services[indexPath.row]))
            done(true)
        }
        edit.backgroundColor = .systemBlue
        return UISwipeActionsConfiguration(actions: [delete, edit])
    }
}
