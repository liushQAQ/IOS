import AVFoundation
import UIKit

/// 负责在执行任务期间防止 iOS 墓碑机制挂起进程
final class BackgroundKeeper {
    static let shared = BackgroundKeeper()
    private var audioPlayer: AVAudioPlayer?
    private var bgTaskID: UIBackgroundTaskIdentifier = .invalid

    private init() {}

    func start() {
        // 安全模式（上次启动疑似闪退）下不启动音频保活，避免音频会话异常阻断启动
        if CrashGuard.shared.safeMode { return }

        // 1. 申请系统短时后台任务兜底
        if bgTaskID == .invalid {
            bgTaskID = UIApplication.shared.beginBackgroundTask(withName: "AgentExecution") { [weak self] in
                self?.stop()
            }
        }

        // 2. 激活音频会话 + 循环播放极微小静音 WAV
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
            
            if audioPlayer == nil {
                let silentData = createSilentWAVData()
                audioPlayer = try AVAudioPlayer(data: silentData)
                audioPlayer?.numberOfLoops = -1
                audioPlayer?.volume = 0.01 // 极低音量静音
            }
            audioPlayer?.play()
        } catch {
            print("BackgroundKeeper 启动失败: \(error)")
        }
    }

    func stop() {
        audioPlayer?.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        
        if bgTaskID != .invalid {
            UIApplication.shared.endBackgroundTask(bgTaskID)
            bgTaskID = .invalid
        }
    }

    /// 动态生成 1 秒 PCM 44.1kHz 16-bit 静音 WAV 裸数据，避免外部资源依赖
    private func createSilentWAVData() -> Data {
        let sampleRate: Int32 = 44100
        let channels: Int16 = 1
        let bitsPerSample: Int16 = 16
        let durationSeconds = 1
        let dataSize = Int32(sampleRate * Int32(durationSeconds) * Int32(channels * (bitsPerSample / 8)))
        let totalSize = 36 + dataSize

        var data = Data()
        data.append(contentsOf: "RIFF".utf8)
        data.append(contentsOf: withUnsafeBytes(of: totalSize.littleEndian) { Array($0) })
        data.append(contentsOf: "WAVE".utf8)
        data.append(contentsOf: "fmt ".utf8)
        
        let subchunk1Size: Int32 = 16
        let audioFormat: Int16 = 1 // PCM
        let byteRate: Int32 = sampleRate * Int32(channels * (bitsPerSample / 8))
        let blockAlign: Int16 = channels * (bitsPerSample / 8)

        data.append(contentsOf: withUnsafeBytes(of: subchunk1Size.littleEndian) { Array($0) })
        data.append(contentsOf: withUnsafeBytes(of: audioFormat.littleEndian) { Array($0) })
        data.append(contentsOf: withUnsafeBytes(of: channels.littleEndian) { Array($0) })
        data.append(contentsOf: withUnsafeBytes(of: sampleRate.littleEndian) { Array($0) })
        data.append(contentsOf: withUnsafeBytes(of: byteRate.littleEndian) { Array($0) })
        data.append(contentsOf: withUnsafeBytes(of: blockAlign.littleEndian) { Array($0) })
        data.append(contentsOf: withUnsafeBytes(of: bitsPerSample.littleEndian) { Array($0) })

        data.append(contentsOf: "data".utf8)
        data.append(contentsOf: withUnsafeBytes(of: dataSize.littleEndian) { Array($0) })
        data.append(Data(count: Int(dataSize))) // 全 0 静音字节
        return data
    }
}
