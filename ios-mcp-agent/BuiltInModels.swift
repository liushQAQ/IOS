import Foundation

/// 模型服务商预设模型条目
struct ProviderPreset {
    let name: String
    let category: String // "国内主流" / "国外主流"
    let baseURL: String
    let recommendedModels: [String]
    let placeholderKey: String
    let hint: String
}

/// 国内外主流模型服务商预设（开源公开，绝不含私有 Key）
enum GlobalModelPresets {
    static let providers: [ProviderPreset] = [
        // 国内主流
        ProviderPreset(
            name: "硅基流动 (SiliconFlow)",
            category: "国内主流",
            baseURL: "https://api.siliconflow.cn/v1",
            recommendedModels: [
                "THUDM/GLM-4-32B-0414",
                "zai-org/GLM-4.5-Air",
                "deepseek-ai/DeepSeek-V3",
                "Qwen/Qwen2.5-72B-Instruct"
            ],
            placeholderKey: "sk-...",
            hint: "国内高速推理平台，支持超多免费/极速模型"
        ),
        ProviderPreset(
            name: "DeepSeek 官方",
            category: "国内主流",
            baseURL: "https://api.deepseek.com/v1",
            recommendedModels: [
                "deepseek-chat",
                "deepseek-reasoner"
            ],
            placeholderKey: "sk-...",
            hint: "深度求索官方接口，高性价比推理能力"
        ),
        ProviderPreset(
            name: "智谱清言 (Zhipu AI)",
            category: "国内主流",
            baseURL: "https://open.bigmodel.cn/api/paas/v4",
            recommendedModels: [
                "glm-4-flash",
                "glm-4-air",
                "glm-4-plus"
            ],
            placeholderKey: "api_key...",
            hint: "智谱官方大模型，glm-4-flash 免费且极速"
        ),
        ProviderPreset(
            name: "月之暗面 (Moonshot Kimi)",
            category: "国内主流",
            baseURL: "https://api.moonshot.cn/v1",
            recommendedModels: [
                "moonshot-v1-8k",
                "moonshot-v1-32k",
                "moonshot-v1-128k"
            ],
            placeholderKey: "sk-...",
            hint: "Kimi 官方长文本模型接口"
        ),
        ProviderPreset(
            name: "阿里百炼 (通义千问 Qwen)",
            category: "国内主流",
            baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
            recommendedModels: [
                "qwen-turbo",
                "qwen-plus",
                "qwen-max"
            ],
            placeholderKey: "sk-...",
            hint: "阿里云百炼兼容 OpenAI 协议接口"
        ),

        // 国外主流
        ProviderPreset(
            name: "OpenAI 官方",
            category: "国外主流",
            baseURL: "https://api.openai.com/v1",
            recommendedModels: [
                "gpt-4o-mini",
                "gpt-4o",
                "o3-mini"
            ],
            placeholderKey: "sk-proj-...",
            hint: "需自备国际网络环境或反代"
        ),
        ProviderPreset(
            name: "Anthropic Claude (OpenAI兼容反代)",
            category: "国外主流",
            baseURL: "https://api.anthropic.com/v1",
            recommendedModels: [
                "claude-3-5-haiku-20241022",
                "claude-3-5-sonnet-20241022"
            ],
            placeholderKey: "sk-ant-...",
            hint: "支持 Claude 原生或中转网关"
        ),
        ProviderPreset(
            name: "Google Gemini (兼容网关)",
            category: "国外主流",
            baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
            recommendedModels: [
                "gemini-2.5-flash",
                "gemini-1.5-flash"
            ],
            placeholderKey: "AIzaSy...",
            hint: "Google 官方 OpenAI 协议兼容端点"
        )
    ]
}

struct ModelPreset {
    let title: String
    let base: String
    let key: String
    let model: String
}

/// 公开版这三项都是空。自用版由打包机在编译前改写注入 Key，不进 Git。
enum BuiltInModels {
    static let options: [ModelPreset] = []
    static let defaultBase = ""
    static let defaultKey = ""
    static let defaultModel = ""
}
