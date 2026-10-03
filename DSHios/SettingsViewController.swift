import UIKit

final class SettingsViewController: UIViewController {

    private let onSave: (String) -> Void
    private let urlTextField = UITextField()

    init(onSave: @escaping (String) -> Void) {
        self.onSave = onSave
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "设置"
        view.backgroundColor = .systemBackground
        setupUI()
    }

    private func setupUI() {
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false

        let titleLabel = UILabel()
        titleLabel.text = "DeepSeek Harness 服务地址"
        titleLabel.font = .preferredFont(forTextStyle: .headline)

        urlTextField.borderStyle = .roundedRect
        urlTextField.autocapitalizationType = .none
        urlTextField.autocorrectionType = .no
        urlTextField.keyboardType = .URL
        urlTextField.placeholder = "http://<电脑IP>:3083/"
        urlTextField.text = UserDefaults.standard.string(forKey: "DSHios.lastURL")

        let hintLabel = UILabel()
        hintLabel.numberOfLines = 0
        hintLabel.font = .preferredFont(forTextStyle: .footnote)
        hintLabel.textColor = .secondaryLabel
        hintLabel.text = """
        填入电脑端 DSH Pocket 服务地址（局域网明文 HTTP，免密码）：
        http://192.168.215.218:3083/
        需电脑端 DSH Desktop 保持运行，手机与电脑在同一局域网。
        """

        let saveButton = UIButton(type: .system)
        saveButton.setTitle("保存并加载", for: .normal)
        saveButton.addTarget(self, action: #selector(saveTapped), for: .touchUpInside)

        stack.addArrangedSubview(titleLabel)
        stack.addArrangedSubview(urlTextField)
        stack.addArrangedSubview(hintLabel)
        stack.addArrangedSubview(saveButton)

        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 24),
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20)
        ])
    }

    @objc private func saveTapped() {
        guard let text = urlTextField.text, !text.isEmpty else { return }
        onSave(text)
        navigationController?.popViewController(animated: true)
    }
}
