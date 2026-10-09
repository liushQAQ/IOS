import UIKit

/// 模型配置：支持一键「拉取模型列表」、Picker/弹窗直接选模型确定，无需手动手敲模型名
final class SettingsViewController: UIViewController {
    private let mcpField = UITextField()
    private let baseField = UITextField()
    private let keyField = UITextField()
    private let modelField = UITextField()
    private let fetchButton = UIButton(type: .system)
    private let loadingIndicator = UIActivityIndicatorView(style: .medium)

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "模型配置"
        view.backgroundColor = .systemBackground
        let config = AgentConfig.load()

        configure(mcpField, "ios-mcp 地址", config.mcpBase)
        configure(baseField, "模型接口 Base URL（如 https://api.siliconflow.cn/v1）", config.llmBase)
        configure(keyField, "API Key (密钥)", config.llmKey)
        keyField.isSecureTextEntry = true
        configure(modelField, "模型名（可手动输入或点击下方获取）", config.llmModel)

        // 🔘 获取模型列表按钮
        fetchButton.setTitle("🔍 点击获取可用模型列表", for: .normal)
        fetchButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .medium)
        fetchButton.backgroundColor = .systemGray6
        fetchButton.layer.cornerRadius = 8
        fetchButton.heightAnchor.constraint(equalToConstant: 44).isActive = true
        fetchButton.addTarget(self, action: #selector(fetchModels), for: .touchUpInside)

        loadingIndicator.hidesWhenStopped = true

        let modelRow = UIStackView(arrangedSubviews: [modelField, fetchButton])
        modelRow.axis = .vertical
        modelRow.spacing = 8

        var rows: [UIView] = [mcpField, baseField, keyField, modelRow]

        // 快速预设分段选择（自用版）
        if !BuiltInModels.options.isEmpty {
            let label = UILabel()
            label.text = "常用快捷预设："
            label.font = .systemFont(ofSize: 13, weight: .medium)
            label.textColor = .secondaryLabel
            rows.append(label)

            let presets = UISegmentedControl(items: BuiltInModels.options.map(\.title))
            presets.addTarget(self, action: #selector(applyPreset(_:)), for: .valueChanged)
            rows.append(presets)
        }

        let saveButton = UIButton(type: .system)
        saveButton.setTitle("保存配置", for: .normal)
        saveButton.titleLabel?.font = .boldSystemFont(ofSize: 18)
        saveButton.backgroundColor = .systemBlue
        saveButton.setTitleColor(.white, for: .normal)
        saveButton.layer.cornerRadius = 8
        saveButton.heightAnchor.constraint(equalToConstant: 48).isActive = true
        saveButton.addTarget(self, action: #selector(saveConfig), for: .touchUpInside)
        rows.append(saveButton)

        let stack = UIStackView(arrangedSubviews: rows)
        stack.axis = .vertical
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        view.addSubview(loadingIndicator)
        loadingIndicator.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),

            loadingIndicator.centerXAnchor.constraint(equalTo: fetchButton.centerXAnchor),
            loadingIndicator.centerYAnchor.constraint(equalTo: fetchButton.centerYAnchor)
        ])
    }

    private func configure(_ field: UITextField, _ placeholder: String, _ text: String) {
        field.placeholder = placeholder
        field.text = text
        field.borderStyle = .roundedRect
        field.autocapitalizationType = .none
        field.autocorrectionType = .no
        field.clearButtonMode = .whileEditing
        field.heightAnchor.constraint(equalToConstant: 44).isActive = true
    }

    @objc private func applyPreset(_ control: UISegmentedControl) {
        let preset = BuiltInModels.options[control.selectedSegmentIndex]
        baseField.text = preset.base
        keyField.text = preset.key
        modelField.text = preset.model
    }

    /// 核心功能：点击网络请求 Base URL + Key 获取在线可用模型并弹出选择菜单
    @objc private func fetchModels() {
        view.endEditing(true)
        guard let base = baseField.text?.trimmingCharacters(in: .whitespacesAndNewlines), !base.isEmpty else {
            showAlert("请先填写模型接口 Base URL")
            return
        }
        let key = keyField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        var cleanBase = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        // 处理兼容：若填的是 https://domain.com/v1/chat/completions，截断为 https://domain.com/v1
        if cleanBase.hasSuffix("/chat/completions") {
            cleanBase = String(cleanBase.dropLast("/chat/completions".count))
        }

        let modelsUrlStr = cleanBase.hasSuffix("/models") ? cleanBase : cleanBase + "/models"
        guard let url = URL(string: modelsUrlStr) else {
            showAlert("Base URL 地址格式无效")
            return
        }

        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.timeoutInterval = 15
        if !key.isEmpty {
            req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        }

        fetchButton.isEnabled = false
        fetchButton.setTitle("正在拉取模型中...", for: .normal)
        loadingIndicator.startAnimating()

        Task {
            do {
                let (data, response) = try await NetworkCompat.data(for: req, session: .shared)
                await MainActor.run {
                    self.fetchButton.isEnabled = true
                    self.fetchButton.setTitle("🔍 点击获取可用模型列表", for: .normal)
                    self.loadingIndicator.stopAnimating()
                }

                if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
                    let errStr = String(data: data, encoding: .utf8) ?? "状态码 \(http.statusCode)"
                    await MainActor.run { self.showAlert("拉取失败: \(errStr.prefix(120))") }
                    return
                }

                guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let list = obj["data"] as? [[String: Any]] else {
                    await MainActor.run { self.showAlert("未从响应中解析出有效的模型列表(data)") }
                    return
                }

                let modelIDs = list.compactMap { $0["id"] as? String }.sorted()
                if modelIDs.isEmpty {
                    await MainActor.run { self.showAlert("接口返回成功，但模型列表为空") }
                    return
                }

                await MainActor.run {
                    self.showModelPickerActionSheet(models: modelIDs)
                }
            } catch {
                await MainActor.run {
                    self.fetchButton.isEnabled = true
                    self.fetchButton.setTitle("🔍 点击获取可用模型列表", for: .normal)
                    self.loadingIndicator.stopAnimating()
                    self.showAlert("网络连接错误: \(error.localizedDescription)")
                }
            }
        }
    }

    /// 弹出选择框让用户挑选模型，选中后直接确定回填
    private func showModelPickerActionSheet(models: [String]) {
        let alert = UIAlertController(title: "请选择模型 (共 \(models.count) 个)", message: "点击选中即可自动填入配置", preferredStyle: .actionSheet)

        // 展示前 20 个主流匹配模型，避免选项过多爆屏
        let displayList = Array(models.prefix(25))
        for m in displayList {
            alert.addAction(UIAlertAction(title: m, style: .default, handler: { [weak self] _ in
                self?.modelField.text = m
            }))
        }

        if models.count > 25 {
            alert.addAction(UIAlertAction(title: "⚠️ 模型过多，可直接在上框手动输入", style: .destructive, handler: nil))
        }

        alert.addAction(UIAlertAction(title: "取消", style: .cancel, handler: nil))

        if let popover = alert.popoverPresentationController {
            popover.sourceView = fetchButton
            popover.sourceRect = fetchButton.bounds
        }
        present(alert, animated: true)
    }

    private func showAlert(_ msg: String) {
        let alert = UIAlertController(title: "提示", message: msg, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "确定", style: .default))
        present(alert, animated: true)
    }

    @objc private func saveConfig() {
        var config = AgentConfig.load()
        config.mcpBase = mcpField.text?.trimmingCharacters(in: .whitespaces) ?? config.mcpBase
        config.llmBase = baseField.text?.trimmingCharacters(in: .whitespaces) ?? config.llmBase
        config.llmKey = keyField.text?.trimmingCharacters(in: .whitespaces) ?? ""
        config.llmModel = modelField.text?.trimmingCharacters(in: .whitespaces) ?? config.llmModel
        config.save()
        navigationController?.popViewController(animated: true)
    }
}
