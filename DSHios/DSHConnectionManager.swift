import Foundation
import UIKit

// MARK: - 1. 通信层全量可配置参数
public struct DSHNetworkConfiguration {
    public var pingIntervalLAN: TimeInterval = 25.0         // 局域网心跳基准周期
    public var pingIntervalExtMin: TimeInterval = 10.0      // 外网心跳下限（防NAT网关超时踢线）
    public var pingIntervalExtMax: TimeInterval = 25.0      // 外网心跳上限
    public var staleRTTThresholdMs: Int = 800               // 判定卡顿态(STALE)的RTT阈值(毫秒)
    public var staleMaxDuration: TimeInterval = 25.0        // STALE最大容忍时间，超时主动断开重连
    public var maxMissedHeartbeats: Int = 3                 // 连续未收到Pong的最大允许次数
    public var backoffIntervals: [TimeInterval] = [1.0, 2.0, 4.0, 8.0, 15.0] // 阶梯退避重试时间
    public var maxUnackedQueueSize: Int = 50                // 客户端未确认消息内存与磁盘容量上限
    public var maxOutOfOrderWindowSize: Int = 100           // 乱序缓冲窗口大小上限 (抽离可配置)
    public var requestTimeout: TimeInterval = 15.0          // 底层Socket连接与握手超时
    public var resumeAckTimeout: TimeInterval = 10.0        // session.resume 发出后等待 ack 的超时时间

    public static let `default` = DSHNetworkConfiguration()
}

// MARK: - 2. 连接状态机定义
public enum DSHConnectionState: Equatable {
    case disconnected
    case connecting
    case connected(rttMs: Int)
    case stale(rttMs: Int) // 卡顿态：高延迟但物理连接存活，UI提示但不销毁会话
    case reconnecting(attempt: Int)
}

// MARK: - 3. 协议消息与帧模型定义 (实现 Codable 确保能序列化落盘)
public struct DSHClientMessage: Codable, Equatable {
    public let clientMsgId: String
    public let sessionId: String
    public let text: String
    public let timestamp: Int64

    public init(clientMsgId: String, sessionId: String, text: String, timestamp: Int64) {
        self.clientMsgId = clientMsgId
        self.sessionId = sessionId
        self.text = text
        self.timestamp = timestamp
    }
}

public struct DSHResumePayload: Codable {
    public let type = "session.resume"
    public let sessionId: String
    public let lastReceivedSeq: Int
    public let unackedMessages: [DSHClientMessage] // 断线重连时携带所有未收到ACK的消息
}

// MARK: - 4. DSH 通信层核心管理器 (纯客户端视角：高可靠、零泄漏、容灾恢复)
public final class DSHConnectionManager {
    public static let shared = DSHConnectionManager()

    // 外部回调
    public var onStateChanged: ((DSHConnectionState) -> Void)?
    public var onMessageReceived: ((Data, Int) -> Void)? // 业务数据Payload, 服务端最新Seq
    public var onSessionExpired: (() -> Void)?            // 服务端通知会话已销毁时的降级回调

    // 本地磁盘持久化 Key（应对 iOS 进程被系统 SIGKILL 强杀）
    private let kPersistedSessionIdKey = "DSH.Net.SessionId"
    private let kPersistedLastSeqKey   = "DSH.Net.LastSeq"
    private let kPersistedUnackedKey   = "DSH.Net.UnackedMessages"

    // 配置与串行调度队列
    private let config: DSHNetworkConfiguration
    private let queue = DispatchQueue(label: "com.dsh.network.serial", qos: .userInitiated)
    private var urlSession: URLSession!
    private var webSocketTask: URLSessionWebSocketTask?

    // 会话与序号状态
    private var targetURL: URL?
    private var isLAN: Bool = false
    private var currentSessionId: String = ""
    private var lastReceivedSeq: Int = 0

    // 心跳与 RTT 监控
    private var heartbeatTimer: DispatchSourceTimer?
    private var missedHeartbeats: Int = 0
    private var smoothedRTT: Double = 50.0
    private var lastPingTimestamp: Int64 = 0

    // STALE 兜底熔断
    private var staleTimer: DispatchSourceTimer?
    private var isStale: Bool = false

    // session.resume 握手状态与超时
    private var isHandshaking: Bool = false
    private var resumeAckTimer: DispatchSourceTimer?

    // 乱序与去重：只记录大于 lastReceivedSeq 的乱序包
    private var outOfOrderSeqs = Set<Int>()

    // 未确认消息队列 (内存与磁盘双写)
    private var unackedMessages: [String: DSHClientMessage] = [:] // clientMsgId -> 消息体
    private var unackedKeysOrder: [String] = []                  // 严格保持先进先出顺序

    // 重连与生命周期控制
    private var reconnectAttempt: Int = 0
    private var isIntentionalClose: Bool = false
    private var bgTaskID: UIBackgroundTaskIdentifier = .invalid

    public init(config: DSHNetworkConfiguration = .default) {
        self.config = config
        
        let sessionConfig = URLSessionConfiguration.default
        sessionConfig.requestCachePolicy = .reloadIgnoringLocalCacheData
        sessionConfig.urlCache = nil
        sessionConfig.timeoutIntervalForRequest = config.requestTimeout
        self.urlSession = URLSession(configuration: sessionConfig, delegate: nil, delegateQueue: nil)

        // 冷启动恢复：读取持久化的 sessionId、lastReceivedSeq 以及未 ACK 消息
        self.currentSessionId = UserDefaults.standard.string(forKey: kPersistedSessionIdKey) ?? ""
        self.lastReceivedSeq = UserDefaults.standard.integer(forKey: kPersistedLastSeqKey)
        self.loadPersistedUnackedMessages()

        setupAppLifecycle()
    }

    // MARK: - 主连接与发送接口 (URL固定)
    public func connect(to url: URL, sessionId: String, isLAN: Bool) {
        queue.async {
            self.targetURL = url
            self.isLAN = isLAN
            // 修复隐患 3：connect 入口必须显式重置 isIntentionalClose = false，确保后续可正常重连
            self.isIntentionalClose = false
            self.reconnectAttempt = 0
            self.isHandshaking = false

            if !sessionId.isEmpty && sessionId != self.currentSessionId {
                self.currentSessionId = sessionId
                self.lastReceivedSeq = 0
                self.outOfOrderSeqs.removeAll()
                self.persistSessionState()
            }

            self.startConnecting()
        }
    }

    public func sendMessage(_ text: String) {
        queue.async {
            guard !self.currentSessionId.isEmpty else { return }
            let msgId = UUID().uuidString
            let msg = DSHClientMessage(
                clientMsgId: msgId,
                sessionId: self.currentSessionId,
                text: text,
                timestamp: Date().millisecondsSince1970
            )

            // 1. 压入未确认队列并立即持久化落盘（防止发送中途被系统杀掉丢消息）
            self.enqueueUnackedMessage(msg)

            // 2. 发送消息帧，并捕获底层发送错误
            self.sendRawMessage(type: "chat.message", payload: msg)
        }
    }

    // MARK: - 内部连接底层
    private func startConnecting() {
        guard let url = targetURL else { return }
        notifyState(.connecting)

        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = urlSession.webSocketTask(with: url)
        webSocketTask?.resume()

        // 蹦床调度开启消息监听，消除递归调用栈
        scheduleNextReceive()

        // 启动 session.resume 握手流程
        sendResumeHandshake()

        // 启动动态心跳保活
        startHeartbeatLoop()
    }

    private func sendResumeHandshake() {
        guard !currentSessionId.isEmpty else { return }
        // 修复隐患 2：握手状态标记，防重复 resume 风暴
        if isHandshaking { return }
        isHandshaking = true

        let pending = unackedKeysOrder.compactMap { unackedMessages[$0] }
        let resume = DSHResumePayload(
            sessionId: currentSessionId,
            lastReceivedSeq: lastReceivedSeq,
            unackedMessages: pending
        )
        sendRawMessage(type: "session.resume", payload: resume)

        // 启动 session.resume.ack 应答兜底超时计时器
        startResumeAckTimeout()
    }

    private func startResumeAckTimeout() {
        resumeAckTimer?.cancel()
        resumeAckTimer = DispatchSource.makeTimerSource(queue: queue)
        resumeAckTimer?.schedule(deadline: .now() + config.resumeAckTimeout)
        resumeAckTimer?.setEventHandler { [weak self] in
            guard let self = self else { return }
            print("[DSHNet] session.resume.ack 超时未收到，清除握手态并触发重连")
            // 修复隐患 2：超时后清空握手状态标记
            self.isHandshaking = false
            self.handleDisconnect()
        }
        resumeAckTimer?.resume()
    }

    private func cancelResumeAckTimeout() {
        isHandshaking = false
        resumeAckTimer?.cancel()
        resumeAckTimer = nil
    }

    // MARK: - 蹦床调度接收循环（防止递归栈溢出与内存泄漏）
    private func scheduleNextReceive() {
        guard let task = webSocketTask else {
            // 修复隐患 8：任务不存在时触发断开通知
            handleDisconnect()
            return
        }

        task.receive { [weak self] result in
            guard let self = self else { return }
            self.queue.async {
                switch result {
                case .success(let message):
                    self.parseIncomingMessage(message)
                    // 修复隐患 8：当 webSocketTask 不在 running 态时，主动触发 handleDisconnect() 向外通知状态
                    if let currentTask = self.webSocketTask, currentTask.state == .running {
                        self.scheduleNextReceive()
                    } else {
                        print("[DSHNet] WebSocket 不处于 running 态，停止接收并向外分发断开事件")
                        self.handleDisconnect()
                    }
                case .failure(let error):
                    print("[DSHNet] 传输通道读取中断: \(error.localizedDescription)")
                    self.handleDisconnect()
                }
            }
        }
    }

    // MARK: - 下行数据解析与协议处理
    private func parseIncomingMessage(_ message: URLSessionWebSocketTask.Message) {
        var rawData: Data?
        switch message {
        case .data(let data): rawData = data
        case .string(let text): rawData = text.data(using: .utf8)
        @unknown default: break
        }
        guard let data = rawData else { return }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else { return }

        // 1. 核心修复：仅收到Pong才清零missedHeartbeats，业务消息绝不清零！
        if type == "pong" {
            handlePong(json)
            return
        }

        // 2. 核心补强：解析 session.resume.ack 协议帧
        if type == "session.resume.ack" {
            cancelResumeAckTimeout()
            let status = (json["status"] as? String) ?? "ok"
            if status == "expired" {
                print("[DSHNet] 服务端通知该会话已过期/不存在，执行客户端彻底降级与终止重连")
                self.handleSessionExpired()
                return
            } else {
                // 修复隐患 4：使用可配置上限清空乱序集合
                self.outOfOrderSeqs.removeAll()
                self.reconnectAttempt = 0
                // 修复隐患 6：收到 ok 明确切入 connected 状态，通知外部连接恢复成功
                let currentRTT = max(1, Int(self.smoothedRTT))
                notifyState(.connected(rttMs: currentRTT))
                return
            }
        }

        // 3. 处理客户端上行消息 ACK
        if type == "msg.ack", let ackId = json["clientMsgId"] as? String {
            dequeueUnackedMessage(ackId)
            return
        }

        // 4. 处理业务消息及去重逻辑优化
        if let seq = json["seq"] as? Int {
            if seq <= lastReceivedSeq {
                return
            }
            if outOfOrderSeqs.contains(seq) {
                return
            }

            if seq == lastReceivedSeq + 1 {
                lastReceivedSeq = seq
                while outOfOrderSeqs.contains(lastReceivedSeq + 1) {
                    outOfOrderSeqs.remove(lastReceivedSeq + 1)
                    lastReceivedSeq += 1
                }
            } else {
                outOfOrderSeqs.insert(seq)
                // 修复隐患 4：使用配置结构体中的上限
                if outOfOrderSeqs.count > config.maxOutOfOrderWindowSize {
                    outOfOrderSeqs.remove(outOfOrderSeqs.min()!)
                }
            }
            self.persistSessionState()
        }

        // 分发给上层 UI 进行渲染
        DispatchQueue.main.async {
            self.onMessageReceived?(data, self.lastReceivedSeq)
        }
    }

    // MARK: - 心跳、RTT评估与STALE熔断定时器
    private func startHeartbeatLoop() {
        heartbeatTimer?.cancel()
        heartbeatTimer = DispatchSource.makeTimerSource(queue: queue)
        let interval = isLAN ? config.pingIntervalLAN : config.pingIntervalExtMin
        heartbeatTimer?.schedule(deadline: .now() + interval, repeating: interval)
        heartbeatTimer?.setEventHandler { [weak self] in
            self?.sendPing()
        }
        heartbeatTimer?.resume()
    }

    private func sendPing() {
        guard let task = webSocketTask, task.state == .running else { return }

        if missedHeartbeats >= config.maxMissedHeartbeats {
            print("[DSHNet] 连续丢心跳达到上限(\(missedHeartbeats))，主动断开重连")
            handleDisconnect()
            return
        }

        missedHeartbeats += 1
        lastPingTimestamp = Date().millisecondsSince1970
        let pingDict: [String: Any] = ["type": "ping", "timestamp": lastPingTimestamp]
        sendRawDict(pingDict)
    }

    private func handlePong(_ json: [String: Any]) {
        self.missedHeartbeats = 0

        let now = Date().millisecondsSince1970
        let sentTime = (json["timestamp"] as? Int64) ?? lastPingTimestamp
        let rtt = max(1, Double(now - sentTime))
        smoothedRTT = 0.8 * smoothedRTT + 0.2 * rtt
        let rttInt = Int(smoothedRTT)

        if rttInt > config.staleRTTThresholdMs {
            notifyState(.stale(rttMs: rttInt))
            startStaleTimeoutWatchdogIfNeeded()
        } else {
            cancelStaleTimeoutWatchdog()
            notifyState(.connected(rttMs: rttInt))
        }

        if !isLAN {
            let nextInterval = max(config.pingIntervalExtMin, min(config.pingIntervalExtMax, (smoothedRTT * 8.0) / 1000.0))
            heartbeatTimer?.schedule(deadline: .now() + nextInterval, repeating: nextInterval)
        }
    }

    private func startStaleTimeoutWatchdogIfNeeded() {
        if isStale { return }
        isStale = true
        staleTimer?.cancel()
        staleTimer = DispatchSource.makeTimerSource(queue: queue)
        staleTimer?.schedule(deadline: .now() + config.staleMaxDuration)
        staleTimer?.setEventHandler { [weak self] in
            print("[DSHNet] 卡顿(STALE)达到上限阈值未恢复，触发熔断重连")
            self?.handleDisconnect()
        }
        staleTimer?.resume()
    }

    private func cancelStaleTimeoutWatchdog() {
        isStale = false
        staleTimer?.cancel()
        staleTimer = nil
    }

    // MARK: - 异常断开与阶梯退避重试
    private func handleDisconnect() {
        guard !isIntentionalClose else { return }
        heartbeatTimer?.cancel()
        cancelStaleTimeoutWatchdog()
        cancelResumeAckTimeout()
        webSocketTask?.cancel(with: .abnormalClosure, reason: nil)
        webSocketTask = nil

        let delay = config.backoffIntervals[min(reconnectAttempt, config.backoffIntervals.count - 1)]
        reconnectAttempt += 1
        notifyState(.reconnecting(attempt: reconnectAttempt))

        queue.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self = self, !self.isIntentionalClose else { return }
            self.startConnecting()
        }
    }

    // MARK: - 会话过期降级处理 (彻底终止阶梯重连循环，清空全部本地状态)
    private func handleSessionExpired() {
        isIntentionalClose = true // 关键：终止阶梯重连循环
        heartbeatTimer?.cancel()
        cancelStaleTimeoutWatchdog()
        cancelResumeAckTimeout()
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil

        currentSessionId = ""
        lastReceivedSeq = 0
        outOfOrderSeqs.removeAll()
        unackedMessages.removeAll()
        unackedKeysOrder.removeAll()
        persistSessionState()
        persistUnackedMessages()

        notifyState(.disconnected)
        DispatchQueue.main.async {
            self.onSessionExpired?()
        }
    }

    // MARK: - 消息发送与失败捕获保护 (修复隐患 1：判空保护)
    private func sendRawMessage<T: Codable>(type: String, payload: T) {
        guard let data = try? JSONEncoder().encode(payload),
              let str = String(data: data, encoding: .utf8) else { return }

        // 修复隐患 1：判空保护
        guard let task = webSocketTask else {
            print("[DSHNet] webSocketTask 为空，取消裸发送，消息保留在未确认队列中")
            return
        }

        task.send(.string(str)) { [weak self] error in
            if let error = error {
                print("[DSHNet] 消息发送失败，保留在未确认队列中: \(error.localizedDescription)")
            }
        }
    }

    private func sendRawDict(_ dict: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let str = String(data: data, encoding: .utf8) else { return }

        // 修复隐患 1：判空保护
        guard let task = webSocketTask else { return }

        task.send(.string(str)) { [weak self] error in
            if let error = error {
                print("[DSHNet] 原始字典数据发送异常: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - 未确认消息队列管理 (内存+磁盘持久化)
    private func enqueueUnackedMessage(_ msg: DSHClientMessage) {
        if unackedKeysOrder.count >= config.maxUnackedQueueSize {
            let oldest = unackedKeysOrder.removeFirst()
            unackedMessages.removeValue(forKey: oldest)
        }
        unackedMessages[msg.clientMsgId] = msg
        unackedKeysOrder.append(msg.clientMsgId)
        persistUnackedMessages()
    }

    private func dequeueUnackedMessage(_ msgId: String) {
        unackedMessages.removeValue(forKey: msgId)
        unackedKeysOrder.removeAll(where: { $0 == msgId })
        persistUnackedMessages()
    }

    private func persistUnackedMessages() {
        let list = unackedKeysOrder.compactMap { unackedMessages[$0] }
        do {
            let data = try JSONEncoder().encode(list)
            UserDefaults.standard.set(data, forKey: kPersistedUnackedKey)
        } catch {
            print("[DSHNet] 持久化未确认消息异常: \(error.localizedDescription)")
        }
    }

    private func loadPersistedUnackedMessages() {
        guard let data = UserDefaults.standard.data(forKey: kPersistedUnackedKey) else { return }
        do {
            let list = try JSONDecoder().decode([DSHClientMessage].self, from: data)
            for m in list {
                unackedMessages[m.clientMsgId] = m
                unackedKeysOrder.append(m.clientMsgId)
            }
        } catch {
            // 修复隐患 7：异常捕获与告警日志，防止静默吞掉
            print("[DSHNet] 读取已持久化未确认消息失败，数据可能损坏: \(error.localizedDescription)")
        }
    }

    private func persistSessionState() {
        UserDefaults.standard.set(currentSessionId, forKey: kPersistedSessionIdKey)
        UserDefaults.standard.set(lastReceivedSeq, forKey: kPersistedLastSeqKey)
    }

    private func notifyState(_ state: DSHConnectionState) {
        DispatchQueue.main.async {
            self.onStateChanged?(state)
        }
    }

    // MARK: - iOS 应用生命周期
    private func setupAppLifecycle() {
        NotificationCenter.default.addObserver(self, selector: #selector(appDidEnterBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(appDidBecomeActive), name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    @objc private func appDidEnterBackground() {
        bgTaskID = UIApplication.shared.beginBackgroundTask(withName: "DSHFlushState") { [weak self] in
            self?.endBackgroundTask()
        }
        queue.async {
            self.persistSessionState()
            self.persistUnackedMessages()
            self.endBackgroundTask()
        }
    }

    @objc private func appDidBecomeActive() {
        endBackgroundTask()
        queue.async {
            // 修复隐患 5：必须先判断 targetURL 是否存在，防止未曾调过 connect 触发空访问
            guard self.targetURL != nil else { return }

            if self.webSocketTask == nil || self.webSocketTask?.state != .running {
                self.reconnectAttempt = 0
                self.startConnecting()
            }
        }
    }

    private func endBackgroundTask() {
        if bgTaskID != .invalid {
            UIApplication.shared.endBackgroundTask(bgTaskID)
            bgTaskID = .invalid
        }
    }
}

private extension Date {
    var millisecondsSince1970: Int64 {
        Int64(self.timeIntervalSince1970 * 1000.0)
    }
}
