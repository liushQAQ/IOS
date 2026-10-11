import UIKit
import AVFoundation
import AudioToolbox
import Vision
import PhotosUI

// MARK: - 二维码地址解析

/// 从二维码原始内容里提取「可连接的服务地址」。
/// 支持：标准 http/https 链接、分享文案里夹带的链接、JSON 包装（{"url": "..."}）、
/// 以及 host:port / host/path / 局域网 IP 这类裸地址（自动补 http://）。
enum QRAddressParser {

    /// 解析失败返回 nil（说明这个二维码不是地址码，例如微信名片、付款码）。
    static func extractURL(from raw: String) -> String? {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }

        // 1. JSON 包装：{ "url": "http://..." } 之类
        if text.hasPrefix("{") || text.hasPrefix("[") {
            if let data = text.data(using: .utf8),
               let object = try? JSONSerialization.jsonObject(with: data) {
                if let found = searchURL(in: object) { return found }
            }
        }

        // 2. 从一段分享文案里抠出 http(s) 链接
        if let range = text.range(of: "https?://[^\\s\"'<>）】]+", options: [.regularExpression, .caseInsensitive]) {
            let candidate = String(text[range])
            if let url = URL(string: candidate), url.host?.isEmpty == false {
                return candidate
            }
        }

        // 3. 裸地址：192.168.1.100:3083/dsh/ 、cn-hk-bgp-4.ofalias.net:47027 、localhost:3083
        let bare = "^[A-Za-z0-9][A-Za-z0-9\\.\\-_]*(:\\d{1,5})?(/[^\\s]*)?$"
        if text.range(of: bare, options: .regularExpression) != nil,
           text.contains(".") || text.contains(":") || text.lowercased().contains("localhost") {
            let candidate = "http://" + text
            if let url = URL(string: candidate), url.host?.isEmpty == false {
                return candidate
            }
        }
        return nil
    }

    /// 是否为本机/局域网地址（这类扫到即直连，零点击；公网地址会再弹一次确认，防误扫微信等二维码）
    static func isTrustedLocalAddress(_ text: String) -> Bool {
        guard let host = URL(string: text)?.host?.lowercased(), !host.isEmpty else { return false }
        if host == "localhost" || host.hasSuffix(".local") || host.hasSuffix(".lan") { return true }
        if host.hasPrefix("192.168.") || host.hasPrefix("10.") || host.hasPrefix("127.") { return true }
        let parts = host.split(separator: ".")
        if parts.count == 4, parts[0] == "172", let second = Int(parts[1]), (16...31).contains(second) {
            return true
        }
        return false
    }

    /// 在任意 JSON 结构里递归找第一个像地址的字符串
    private static func searchURL(in object: Any) -> String? {
        if let string = object as? String {
            let lower = string.lowercased()
            if lower.hasPrefix("http://") || lower.hasPrefix("https://") {
                return string
            }
            return nil
        }
        if let dict = object as? [String: Any] {
            // 优先常见键名
            for key in ["url", "URL", "link", "linkUrl", "address", "addr", "server", "host", "uri"] {
                if let value = dict[key], let found = searchURL(in: value) { return found }
            }
            for (_, value) in dict {
                if let found = searchURL(in: value) { return found }
            }
        }
        if let array = object as? [Any] {
            for value in array {
                if let found = searchURL(in: value) { return found }
            }
        }
        return nil
    }
}

// MARK: - 二维码图片生成（把当前地址变成二维码，方便别的手机扫）

enum QRCodeImageFactory {
    static func make(from text: String, size: CGFloat = 300) -> UIImage? {
        guard let data = text.data(using: .utf8),
              let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        filter.setValue(data, forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let output = filter.outputImage else { return nil }
        let scale = size / max(output.extent.width, 1)
        let scaled = output.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let context = CIContext(options: nil)
        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}

// MARK: - 扫码取地址（相机扫描 + 相册二维码识别）

final class QRAddressScannerViewController: UIViewController {

    /// 扫到合法地址后回调（页面已 dismiss）
    var onResult: ((String) -> Void)?

    private let session = AVCaptureSession()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private let sessionQueue = DispatchQueue(label: "dsh.qr.scanner.session")
    private let hintLabel = UILabel()
    private var torchButton: UIButton!
    private var isTorchOn = false
    private var isFinished = false
    /// 连续扫到非地址码时的提示节流
    private var lastRejectAt: TimeInterval = 0

    override var prefersStatusBarHidden: Bool { false }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        buildUI()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        isFinished = false
        startFlow()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        stopSession()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    // MARK: - 界面

    private func buildUI() {
        // 顶部标题
        let titleLabel = UILabel()
        titleLabel.text = "扫描地址二维码"
        titleLabel.textColor = .white
        titleLabel.font = .preferredFont(forTextStyle: .headline)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        // 关闭
        let closeButton = UIButton(type: .system)
        closeButton.setImage(UIImage(systemName: "xmark"), for: .normal)
        closeButton.tintColor = .white
        closeButton.backgroundColor = UIColor(white: 0, alpha: 0.45)
        closeButton.layer.cornerRadius = 18
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        closeButton.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)

        // 手电筒
        let torch = UIButton(type: .system)
        torch.setImage(UIImage(systemName: "bolt.slash.fill"), for: .normal)
        torch.tintColor = .white
        torch.backgroundColor = UIColor(white: 0, alpha: 0.45)
        torch.layer.cornerRadius = 18
        torch.translatesAutoresizingMaskIntoConstraints = false
        torch.addTarget(self, action: #selector(torchTapped), for: .touchUpInside)
        torchButton = torch

        // 取景框
        let frameView = UIView()
        frameView.layer.borderColor = UIColor.white.withAlphaComponent(0.9).cgColor
        frameView.layer.borderWidth = 2
        frameView.layer.cornerRadius = 16
        frameView.backgroundColor = .clear
        frameView.translatesAutoresizingMaskIntoConstraints = false

        // 提示
        hintLabel.text = "对准电脑端 / 其他设备上显示的地址二维码\n自动识别并连接，无需手动输入"
        hintLabel.textColor = .white
        hintLabel.font = .preferredFont(forTextStyle: .footnote)
        hintLabel.textAlignment = .center
        hintLabel.numberOfLines = 0
        hintLabel.translatesAutoresizingMaskIntoConstraints = false

        // 相册
        let albumButton = UIButton(type: .system)
        albumButton.setTitle("从相册选二维码图片", for: .normal)
        albumButton.setImage(UIImage(systemName: "photo.on.rectangle"), for: .normal)
        albumButton.tintColor = .white
        albumButton.setTitleColor(.white, for: .normal)
        albumButton.titleLabel?.font = .preferredFont(forTextStyle: .subheadline)
        albumButton.backgroundColor = UIColor(white: 1, alpha: 0.16)
        albumButton.layer.cornerRadius = 22
        albumButton.contentEdgeInsets = UIEdgeInsets(top: 10, left: 18, bottom: 10, right: 18)
        albumButton.translatesAutoresizingMaskIntoConstraints = false
        albumButton.addTarget(self, action: #selector(albumTapped), for: .touchUpInside)

        view.addSubview(frameView)
        view.addSubview(titleLabel)
        view.addSubview(closeButton)
        view.addSubview(torch)
        view.addSubview(hintLabel)
        view.addSubview(albumButton)

        NSLayoutConstraint.activate([
            closeButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            closeButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            closeButton.widthAnchor.constraint(equalToConstant: 36),
            closeButton.heightAnchor.constraint(equalToConstant: 36),

            torch.topAnchor.constraint(equalTo: closeButton.topAnchor),
            torch.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            torch.widthAnchor.constraint(equalToConstant: 36),
            torch.heightAnchor.constraint(equalToConstant: 36),

            titleLabel.centerYAnchor.constraint(equalTo: closeButton.centerYAnchor),
            titleLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),

            frameView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            frameView.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -40),
            frameView.widthAnchor.constraint(equalTo: view.widthAnchor, multiplier: 0.72),
            frameView.heightAnchor.constraint(equalTo: frameView.widthAnchor),

            hintLabel.topAnchor.constraint(equalTo: frameView.bottomAnchor, constant: 24),
            hintLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 32),
            hintLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -32),

            albumButton.topAnchor.constraint(equalTo: hintLabel.bottomAnchor, constant: 20),
            albumButton.centerXAnchor.constraint(equalTo: view.centerXAnchor)
        ])
    }

    // MARK: - 相机权限与启动

    private func startFlow() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configureAndStart()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    guard let self else { return }
                    if granted { self.configureAndStart() } else { self.showCameraDenied() }
                }
            }
        default:
            showCameraDenied()
        }
    }

    private func configureAndStart() {
        if session.inputs.isEmpty {
            guard let device = AVCaptureDevice.default(for: .video),
                  let input = try? AVCaptureDeviceInput(device: device) else {
                presentSimpleAlert(title: "无法启动相机", message: "当前设备未检测到可用摄像头，可改用「从相册选二维码图片」。")
                return
            }
            session.beginConfiguration()
            session.sessionPreset = .high
            if session.canAddInput(input) { session.addInput(input) }

            let output = AVCaptureMetadataOutput()
            if session.canAddOutput(output) {
                session.addOutput(output)
                output.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
                // 只收二维码，避免每帧解析一堆条码拖慢取景（空数组会抛异常，必须判存在）
                if output.availableMetadataObjectTypes.contains(.qr) {
                    output.metadataObjectTypes = [.qr]
                }
            }
            session.commitConfiguration()

            let layer = AVCaptureVideoPreviewLayer(session: session)
            layer.videoGravity = .resizeAspectFill
            layer.frame = view.bounds
            view.layer.insertSublayer(layer, at: 0)
            previewLayer = layer
        }
        sessionQueue.async { [weak self] in
            guard let self else { return }
            if !self.session.isRunning { self.session.startRunning() }
        }
    }

    private func stopSession() {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            if self.session.isRunning { self.session.stopRunning() }
        }
        setTorch(on: false, updateIcon: true)
    }

    private func showCameraDenied() {
        let alert = UIAlertController(
            title: "需要相机权限",
            message: "扫码需要访问相机。可在「设置 → 隐私与安全 → 相机」中允许本 App 使用相机。也可以先用「从相册选二维码图片」。",
            preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "去设置", style: .default) { _ in
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
        })
        alert.addAction(UIAlertAction(title: "好", style: .cancel))
        present(alert, animated: true)
    }

    private func presentSimpleAlert(title: String, message: String) {
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "好", style: .cancel))
        present(alert, animated: true)
    }

    // MARK: - 交互

    @objc private func closeTapped() {
        stopSession()
        dismiss(animated: true)
    }

    @objc private func torchTapped() {
        setTorch(on: !isTorchOn, updateIcon: true)
    }

    private func setTorch(on: Bool, updateIcon: Bool) {
        isTorchOn = on
        guard let device = AVCaptureDevice.default(for: .video), device.hasTorch else { return }
        do {
            try device.lockForConfiguration()
            device.torchMode = on ? .on : .off
            device.unlockForConfiguration()
        } catch {
            // 设备不支持手电筒或占用中：静默忽略
        }
        if updateIcon {
            let name = on ? "bolt.fill" : "bolt.slash.fill"
            torchButton.setImage(UIImage(systemName: name), for: .normal)
        }
    }

    private func flashHint(_ text: String) {
        hintLabel.text = text
        hintLabel.textColor = .systemYellow
        AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) { [weak self] in
            guard let self else { return }
            self.hintLabel.textColor = .white
            self.hintLabel.text = "对准电脑端 / 其他设备上显示的地址二维码\n自动识别并连接，无需手动输入"
        }
    }

    /// 统一处理扫到的原始内容
    private func handleScannedText(_ raw: String) {
        guard !isFinished else { return }
        guard let address = QRAddressParser.extractURL(from: raw) else {
            // 不是地址码（微信名片/付款码/纯文本）：震动提示后继续扫，不退出
            let now = Date().timeIntervalSince1970
            if now - lastRejectAt > 2.4 {
                lastRejectAt = now
                flashHint("这不是地址二维码\n请扫电脑端显示的「连接地址」二维码")
            }
            return
        }
        isFinished = true
        AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
        stopSession()
        let callback = onResult
        dismiss(animated: true) { callback?(address) }
    }

    // MARK: - 相册二维码识别

    @objc private func albumTapped() {
        var config = PHPickerConfiguration()
        config.filter = .images
        config.selectionLimit = 1
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = self
        present(picker, animated: true)
    }

    /// 用 Vision 识别图片里的二维码（也兼容图片被截图/缩放后的情况）
    static func detectQRCode(in image: UIImage) -> String? {
        guard let cgImage = image.cgImage else { return nil }
        let request = VNDetectBarcodesRequest()
        request.symbologies = [.qr]
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        try? handler.perform([request])
        return request.results?.first?.payloadStringValue
    }
}

// MARK: - 相机元数据回调

extension QRAddressScannerViewController: AVCaptureMetadataOutputObjectsDelegate {
    func metadataOutput(_ output: AVCaptureMetadataOutput,
                        didOutput metadataObjects: [AVMetadataObject],
                        from connection: AVCaptureConnection) {
        guard let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let value = object.stringValue else { return }
        handleScannedText(value)
    }
}

// MARK: - 相册选择回调

extension QRAddressScannerViewController: PHPickerViewControllerDelegate {
    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let provider = results.first?.itemProvider,
              provider.canLoadObject(ofClass: UIImage.self) else { return }
        provider.loadObject(ofClass: UIImage.self) { [weak self] object, _ in
            guard let self else { return }
            guard let image = object as? UIImage else { return }
            DispatchQueue.main.async {
                if let code = Self.detectQRCode(in: image) {
                    self.handleScannedText(code)
                } else {
                    self.flashHint("这张图片里没有识别到二维码\n换一张试试")
                }
            }
        }
    }
}

// MARK: - 当前地址二维码展示（给别的手机/设备扫）

final class QRCodeDisplayViewController: UIViewController {

    private let address: String

    init(address: String) {
        self.address = address
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .pageSheet
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        let titleLabel = UILabel()
        titleLabel.text = "当前地址二维码"
        titleLabel.font = .preferredFont(forTextStyle: .headline)
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        let subtitle = UILabel()
        subtitle.text = "用另一台手机打开本 App → 悬浮球 →「扫码连接」，扫这张码即可自动填好地址。"
        subtitle.font = .preferredFont(forTextStyle: .footnote)
        subtitle.textColor = .secondaryLabel
        subtitle.numberOfLines = 0
        subtitle.textAlignment = .center
        subtitle.translatesAutoresizingMaskIntoConstraints = false

        let container = UIView()
        container.backgroundColor = .white
        container.layer.cornerRadius = 16
        container.translatesAutoresizingMaskIntoConstraints = false

        let imageView = UIImageView(image: QRCodeImageFactory.make(from: address, size: 300))
        imageView.contentMode = .scaleAspectFit
        imageView.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(imageView)

        let addressLabel = UILabel()
        addressLabel.text = address
        addressLabel.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        addressLabel.textColor = .secondaryLabel
        addressLabel.numberOfLines = 0
        addressLabel.textAlignment = .center
        addressLabel.isUserInteractionEnabled = true
        addressLabel.translatesAutoresizingMaskIntoConstraints = false

        let copyButton = UIButton(type: .system)
        copyButton.setTitle("复制地址", for: .normal)
        copyButton.setImage(UIImage(systemName: "doc.on.doc"), for: .normal)
        copyButton.addTarget(self, action: #selector(copyTapped), for: .touchUpInside)

        let shareButton = UIButton(type: .system)
        shareButton.setTitle("分享二维码", for: .normal)
        shareButton.setImage(UIImage(systemName: "square.and.arrow.up"), for: .normal)
        shareButton.addTarget(self, action: #selector(shareTapped), for: .touchUpInside)

        let closeButton = UIButton(type: .system)
        closeButton.setTitle("关闭", for: .normal)
        closeButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        closeButton.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)

        let buttons = UIStackView(arrangedSubviews: [copyButton, shareButton, closeButton])
        buttons.axis = .horizontal
        buttons.distribution = .equalSpacing
        buttons.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(titleLabel)
        view.addSubview(subtitle)
        view.addSubview(container)
        view.addSubview(addressLabel)
        view.addSubview(buttons)

        NSLayoutConstraint.activate([
            titleLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20),
            titleLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            titleLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),

            subtitle.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),
            subtitle.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            subtitle.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),

            container.topAnchor.constraint(equalTo: subtitle.bottomAnchor, constant: 18),
            container.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            container.widthAnchor.constraint(equalToConstant: 260),
            container.heightAnchor.constraint(equalToConstant: 260),

            imageView.topAnchor.constraint(equalTo: container.topAnchor, constant: 10),
            imageView.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 10),
            imageView.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -10),
            imageView.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -10),

            addressLabel.topAnchor.constraint(equalTo: container.bottomAnchor, constant: 14),
            addressLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            addressLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),

            buttons.topAnchor.constraint(equalTo: addressLabel.bottomAnchor, constant: 22),
            buttons.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 28),
            buttons.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -28)
        ])
    }

    @objc private func copyTapped() {
        UIPasteboard.general.string = address
        let alert = UIAlertController(title: "已复制地址", message: address, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "好", style: .cancel))
        present(alert, animated: true)
    }

    @objc private func shareTapped() {
        var items: [Any] = [address]
        if let image = QRCodeImageFactory.make(from: address, size: 600) { items.append(image) }
        let activity = UIActivityViewController(activityItems: items, applicationActivities: nil)
        activity.popoverPresentationController?.sourceView = view
        present(activity, animated: true)
    }

    @objc private func closeTapped() {
        dismiss(animated: true)
    }
}
