import { defineFieldCopy } from './field-copy'

export const FIELD_LABELS_ZH: Record<string, string> = defineFieldCopy({
  model: '默认模型',
  modelContextLength: '上下文窗口',
  fallbackProviders: '备用模型',
  toolsets: '启用的工具集',
  timezone: '时区',
  display: {
    personality: '人格',
    showReasoning: '推理内容'
  },
  desktop: {
    repoScanEnabled: '自动仓库发现',
    repoScanRoots: '仓库发现根目录',
    repoScanExcludePaths: '排除的仓库路径'
  },
  agent: {
    maxTurns: '最大智能体步数',
    imageInputMode: '图片附件',
    apiMaxRetries: 'API 重试次数',
    serviceTier: '服务层级',
    toolUseEnforcement: '工具调用强制'
  },
  terminal: {
    cwd: '工作目录',
    backend: '执行后端',
    timeout: '命令超时',
    persistentShell: '持久 Shell',
    envPassthrough: '环境变量透传',
    dockerImage: 'Docker 镜像',
    singularityImage: 'Singularity 镜像',
    modalImage: 'Modal 镜像',
    daytonaImage: 'Daytona 镜像'
  },
  fileReadMaxChars: '文件读取上限',
  toolOutput: {
    maxBytes: '终端输出上限',
    maxLines: '文件分页上限',
    maxLineLength: '单行长度上限'
  },
  codeExecution: {
    mode: '代码执行模式'
  },
  approvals: {
    mode: '审批模式',
    timeout: '审批超时',
    mcpReloadConfirm: '确认 MCP 重载'
  },
  commandAllowlist: '命令白名单',
  security: {
    redactSecrets: '隐藏密钥',
    allowPrivateUrls: '允许私有 URL'
  },
  browser: {
    allowPrivateUrls: '浏览器私有 URL',
    autoLocalForPrivateUrls: '私有 URL 使用本地浏览器'
  },
  checkpoints: {
    enabled: '文件检查点',
    maxSnapshots: '检查点上限'
  },
  voice: {
    recordKey: '语音快捷键',
    maxRecordingSeconds: '最大录音时长',
    autoTts: '朗读回复'
  },
  stt: {
    enabled: '语音转文字',
    echoTranscripts: '回显转写文本',
    provider: '语音转文字提供方',
    local: {
      model: '本地转写模型',
      language: '转写语言'
    },
    openai: {
      model: 'OpenAI STT 模型'
    },
    groq: {
      model: 'Groq STT 模型'
    },
    mistral: {
      model: 'Mistral STT 模型'
    },
    elevenlabs: {
      modelId: 'ElevenLabs STT 模型',
      languageCode: 'ElevenLabs 语言',
      tagAudioEvents: '标注音频事件',
      diarize: '说话人分离'
    }
  },
  tts: {
    provider: '语音合成提供方',
    edge: { voice: 'Edge 语音' },
    openai: { model: 'OpenAI TTS 模型', voice: 'OpenAI 语音' },
    elevenlabs: { voiceId: 'ElevenLabs 语音', modelId: 'ElevenLabs 模型' },
    xai: {
      voiceId: 'xAI (Grok) 语音',
      language: 'xAI 语言',
      speed: 'xAI 播放速度',
      autoSpeechTags: 'xAI 自动语音标签',
      optimizeStreamingLatency: 'xAI 流式延迟优化',
      sampleRate: 'xAI 采样率',
      bitRate: 'xAI 比特率'
    },
    minimax: { model: 'MiniMax TTS 模型', voiceId: 'MiniMax 语音' },
    mistral: { model: 'Mistral TTS 模型', voiceId: 'Mistral 语音' },
    gemini: { model: 'Gemini TTS 模型', voice: 'Gemini 语音' },
    neutts: { model: 'NeuTTS 模型', device: 'NeuTTS 设备' },
    kittentts: { model: 'KittenTTS 模型', voice: 'KittenTTS 语音' },
    piper: { voice: 'Piper 语音' },
    deepinfra: { model: 'DeepInfra TTS 模型', voice: 'DeepInfra 语音' }
  },
  memory: {
    memoryEnabled: '持久记忆',
    userProfileEnabled: '用户画像',
    memoryCharLimit: '记忆容量上限',
    userCharLimit: '画像容量上限',
    provider: '记忆提供方'
  },
  context: {
    engine: '上下文引擎'
  },
  compression: {
    enabled: '自动压缩',
    threshold: '压缩阈值',
    targetRatio: '压缩目标',
    protectLastN: '保护的近期消息数'
  },
  delegation: {
    model: '子智能体模型',
    provider: '子智能体提供方',
    maxIterations: '子智能体回合上限',
    maxConcurrentChildren: '并行子智能体数',
    childTimeoutSeconds: '子智能体超时',
    reasoningEffort: '子智能体推理强度'
  },
  updates: {
    nonInteractiveLocalChanges: '应用内更新的本地改动处理'
  }
})

export const FIELD_DESCRIPTIONS_ZH: Record<string, string> = defineFieldCopy({
  model: '新对话默认使用，除非你在输入框中选择其他模型。',
  modelContextLength: '保持 0 以使用所选模型检测到的上下文窗口。',
  fallbackProviders: '默认模型失败时依次尝试的备用 provider:model 条目。',
  display: {
    personality: '新会话的默认助手风格。',
    showReasoning: '后端提供时显示推理部分。'
  },
  desktop: {
    repoScanEnabled: '扫描本地文件夹中的 Git 仓库并显示在项目中。',
    repoScanRoots: '要扫描的文件夹。留空则扫描 home 目录。',
    repoScanExcludePaths: '仓库发现时跳过的文件夹及其子目录。'
  },
  timezone: 'IANA 时区标识符。留空使用系统时区。',
  agent: {
    imageInputMode: '控制图片附件发送给模型的方式。',
    maxTurns: 'Hermes 停止运行前工具调用回合的上限。'
  },
  terminal: {
    cwd: '工具与终端工作的默认项目文件夹。',
    persistentShell: '后端支持时在命令间保持 shell 状态。',
    envPassthrough: '透传到工具执行的环境变量。',
    dockerImage: '执行后端为 Docker 时使用的容器镜像。',
    singularityImage: '执行后端为 Singularity 时使用的镜像。',
    modalImage: '执行后端为 Modal 时使用的镜像。',
    daytonaImage: '执行后端为 Daytona 时使用的镜像。'
  },
  codeExecution: {
    mode: '代码执行限定到当前项目的严格程度。'
  },
  fileReadMaxChars: '单次文件请求中 Hermes 可读取的最大字符数。',
  approvals: {
    mode: 'Hermes 如何处理需要显式批准的命令。',
    timeout: '审批提示等待超时时间。'
  },
  security: {
    redactSecrets: '尽可能对模型可见内容隐藏检测到的密钥。'
  },
  checkpoints: {
    enabled: '在文件编辑前创建可回滚快照。'
  },
  memory: {
    memoryEnabled: '保存可帮助未来会话的持久记忆。',
    userProfileEnabled: '维护用户偏好的紧凑画像。'
  },
  context: {
    engine: '对话接近上下文上限时的管理策略。'
  },
  compression: {
    enabled: '对话变大时总结较早的上下文。'
  },
  voice: {
    autoTts: '自动朗读助手回复。'
  },
  tts: {
    xai: {
      voiceId: 'xAI 语音 ID（如 eve）或自定义语音 ID。',
      language: '朗读语言代码（如 en、pt-BR），或 "auto" 自动检测。',
      speed: '播放速度。0.7 更慢，1.0 正常，1.5 更快。',
      autoSpeechTags: '合成前让 LLM 在脚本中插入表现性音频标签（[laughing]、[sighs]）。',
      optimizeStreamingLatency: '延迟与质量权衡。0 = 最佳质量，2 = 最低延迟。',
      sampleRate: '音频采样率（Hz）。越高音质越好、文件越大。',
      bitRate: 'MP3 比特率（bps）。仅当编码为 mp3 时生效。'
    },
    neutts: {
      device: 'NeuTTS 的本地推理设备。'
    }
  },
  stt: {
    enabled: '启用本地或提供方支持的语音转写。',
    echoTranscripts: '将语音消息的原始转写文本发回聊天。',
    elevenlabs: {
      languageCode: '可选 ISO-639-3 语言代码。留空由 ElevenLabs 自动检测。'
    }
  },
  updates: {
    nonInteractiveLocalChanges:
      '从应用内自我更新时（无终端提示），保留本地源码改动（stash）或丢弃（discard）。终端更新始终询问。'
  }
})
