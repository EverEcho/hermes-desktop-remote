# RHermes Mobile（Capacitor）详细落地方案

## 1. 目标与边界

在本仓库新增一个 iOS / Android 移动端应用。移动端与 RHermes Desktop 连接同一个远程 Hermes Gateway，使用同一套登录账号、Profile、会话、模型配置、工作区和 Agent 运行状态。

目标不是做一个精简的聊天伴侣，而是让 Desktop 的核心工作流都能在手机上完成；差别仅在于小屏和触控环境下的导航、布局与操作手势。

### 1.1 必须保持一致的内容

- 同一个 Gateway、同一 OAuth 身份、同一 Profile 的服务端数据。
- 同一会话历史、会话标题、归档状态、服务端置顶状态、消息、工具调用、审批与澄清请求。
- 同一 Gateway WebSocket 协议：`session.resume`、`session.create`、`prompt.submit`、`session.interrupt` 以及流式事件。
- 同一 REST 资源语义：会话、配置、模型、Skills、MCP、Cron、Messaging、Artifacts、Files、Git Review 等。
- 同一“后端是事实来源”的原则：移动端缓存只能用于即时呈现和离线提示，恢复连接后必须以 Gateway 状态校正。

### 1.2 明确不做的错误复用

- 不把 `apps/desktop/src` 的 React 页面直接 import 到移动端。
- 不在移动端模拟 `window.hermesDesktop` 或 Electron IPC。
- 不把 Electron 本机文件系统、Git、PTY、窗口、快捷键能力伪造成手机能力。
- 不修改 `apps/desktop` 的页面、状态机或 Electron 业务逻辑来迁就手机。

Desktop 的 renderer 通过 `window.hermesDesktop` 使用 Electron；移动端应直接使用远程 Gateway 的 HTTPS/WSS 接口。两端复用协议和业务语义，而不是复用平台桥接层。

## 2. 仓库结构

新增独立 workspace；Desktop 不改动。根 `package.json` 只增加 workspace 条目和 mobile 脚本（机械性 monorepo 配置变更）。

```text
apps/
├─ desktop/                         # 保持不动
├─ shared/                          # 继续提供 JSON-RPC / WS 公共能力
└─ mobile/                          # 新增
   ├─ android/                      # Capacitor 生成
   ├─ ios/                          # Capacitor 生成
   ├─ src/
   │  ├─ app/                       # App shell、导航、全局 Provider
   │  ├─ auth/                      # OAuth PKCE、凭证和连接配置
   │  ├─ gateway/                   # REST / WSS client、重连、事件分发
   │  ├─ sessions/                  # 会话列表、详情、消息流、草稿
   │  ├─ workspace/                 # Files、Preview、Review、Agent 输出
   │  ├─ features/                  # Skills、Artifacts、Cron、Messaging 等
   │  ├─ settings/                  # 移动版 Settings
   │  ├─ native/                    # Capacitor 能力适配层
   │  ├─ ui/                        # 移动专用原子组件、Sheet、Action Sheet
   │  └─ test/                      # contract / UI / mock gateway helpers
   ├─ capacitor.config.ts
   ├─ vite.config.ts
   └─ package.json
doc/
└─ mobile-capacitor-implementation-plan.md
```

### 2.1 依赖原则

- 使用 React + Vite + Capacitor，不引入第二套 UI 框架。
- 直接依赖 `@hermes/shared` 的 `JsonRpcGatewayClient`、WebSocket URL / ticket 相关公共代码。
- 使用 Capacitor 的 Browser、App、Keyboard、Haptics、Push Notifications、Camera、Filesystem / Share 能力；所有原生调用必须封装在 `src/native/`。
- 凭证存储使用 Keychain / Android Keystore 对应的 secure storage 插件；禁止使用 `localStorage`、普通 Preferences 或 URL 保存 access / refresh token。
- 组件视觉可继承 Desktop 的 token 命名和内容结构，但 CSS 和触控交互在 mobile 内独立实现。

## 3. 登录与连接

### 3.1 OAuth 主路径

移动端复用 Desktop 已实现的 Gateway Native OAuth / PKCE 协议，而不是把账号密码传给 App。

```text
输入或扫码 Gateway URL
        ↓
GET /api/status
        ↓
auth_required + auth_flows 包含 native_pkce
        ↓
生成 PKCE verifier/challenge 和 state
        ↓
Browser.open(/auth/native/authorize?...)
        ↓
用户在 Gateway/身份提供方完成账号登录
        ↓
rhermes-mobile://oauth/callback?code=...&state=...
        ↓
App URL listener 校验 state
        ↓
POST /auth/native/token { code, code_verifier }
        ↓
Secure Storage 保存 access_token / refresh_token / expires_at
        ↓
POST /api/auth/ws-ticket (Authorization: Bearer <access_token>)
        ↓
wss://.../api/ws?ticket=<single-use-ticket>
```

实现要求：

- `state` 不匹配、回调缺少 code、token response 不完整时立刻失败，不尝试继续连接。
- access token 在到期前 60 秒调用 `/auth/native/refresh`；refresh token 轮换后覆盖旧值。
- 每次 WebSocket 新连接（首次、前后台恢复、网络恢复、切换 Profile）都重新请求 `/api/auth/ws-ticket`；不能复用旧 ticket。
- 401 / 403 才进入“需要重新登录”；DNS、超时、5xx、弱网均为可重试连接错误。
- 登出要清除 access token、refresh token、内存中的 ticket、会话缓存和 WebSocket。

### 3.2 Token Gateway 兼容路径

当 `/api/status` 未要求 OAuth 时，显示高级兼容入口：Gateway URL + session token。

- REST：`X-Hermes-Session-Token: <token>`。
- WSS：`/api/ws?token=<token>`。
- token 同样进入 Secure Storage，不进日志、分析事件或截图诊断。

### 3.3 上线前必须通过的网关兼容性检查

- `/auth/native/authorize` 是否允许 `rhermes-mobile://oauth/callback`，或是否已有 Universal Link / App Link allow-list。
- Gateway CORS 是否允许 Capacitor WebView Origin（iOS 常见 `capacitor://localhost`，Android 常见 `http://localhost`）。
- Gateway WebSocket Origin 校验是否允许上述 Origin。
- 真实 HTTPS 证书是否受 iOS 与 Android 系统信任；不支持通过客户端绕过自签名证书错误。
- Bearer REST、token refresh、WS ticket 和断线重连是否均在真实设备上工作。

若 REST CORS 不能满足，可由 native HTTP adapter 发 REST；但 WebSocket Origin 仍必须由 Gateway 显式支持，不能通过客户端绕过。

## 4. Gateway Client 与状态模型

### 4.1 模块职责

| 模块 | 职责 |
| --- | --- |
| `auth/token-store.ts` | 安全读写 token、到期判断、登出清理 |
| `auth/pkce.ts` | Web Crypto PKCE、state、回调校验、token exchange |
| `gateway/http-client.ts` | 注入认证头、JSON/upload、错误标准化、Profile 参数 |
| `gateway/ws-client.ts` | 基于 `@hermes/shared` 的 WSS 连接、ticket、RPC、重连 |
| `gateway/connection-store.ts` | idle/connecting/open/reconnecting/error/auth-required 状态 |
| `gateway/event-router.ts` | 将 Gateway event 分发到 session、approval、tool、notification store |
| `gateway/cache-reset.ts` | Gateway/Profile 切换时清掉绑定旧上下文的缓存 |

### 4.2 会话身份规则

必须沿用 Desktop 的双身份约束：

- 路由、历史、置顶、归档使用持久 `stored_session_id`。
- 当前 WebSocket 发消息、流式事件、运行状态使用 runtime `session_id`。
- 恢复已存在会话先调用 `session.resume`，再用返回 runtime id 发 `prompt.submit`。
- `prompt.submit` 报 session-not-found 或可识别的 stale runtime 错误时，只恢复一次并重试一次；不得退化为创建新会话，避免消息写错会话。
- 用户在 `session.resume`、上传或提交过程中切换会话时，旧异步结果不得覆盖新页面。

### 4.3 重连规则

- 前台可见且连接断开：1s、2s、4s、8s、15s 上限的指数退避。
- App 进入后台：关闭高频 UI 刷新，保留可恢复的连接状态；系统回收后按冷启动恢复。
- App 回前台、网络从 offline 变 online：立即尝试刷新 token、重取 ticket、重连。
- 连续失败后显示可操作错误页：重试、切换 Gateway、重新登录；不能无限“正在连接”。
- 重连成功后刷新当前 Profile 的会话列表、当前会话历史、配置与正在运行状态；不跳转、不抢走用户正在阅读的会话。

### 4.4 Profile 路由

Desktop 支持两种 Profile：同一 Gateway 的多 Profile，以及每个 Profile 指向不同 Gateway 的 Electron 远程覆盖。移动端必须显式区分。

- 同一 Gateway 多 Profile：REST 使用已有 `profile` query/body 语义；切换时重连并清掉旧 Profile 内存缓存。
- Profile 对应另一台 Gateway：在移动端表现为“连接”，不是伪装成同一 Gateway 的 Profile。每个连接各自保存认证信息和最近 Profile。
- 会话请求必须携带所属 Profile；收到跨 Profile 的行时保留 owner 信息，归档、重命名、删除、恢复都回写原 owner。

## 5. 移动端信息架构

聊天始终是主场景。Desktop 的 Sidebar、Overlay、右侧 Pane 被重组为抽屉、全屏二级页和底部 Sheet。

```text
登录/连接选择
  └─ Chat Home
      ├─ 左侧 Drawer
      │   ├─ 新建聊天 / 搜索
      │   ├─ Profile / 连接切换
      │   ├─ 置顶会话
      │   ├─ 项目与工作区
      │   ├─ 最近会话 / Cron / Messaging 会话
      │   └─ Skills / Artifacts / Messaging / Cron / Agents / Settings
      ├─ 会话详情
      │   ├─ Header：返回、标题、Profile/工作区、模型、更多
      │   ├─ Transcript：消息、思考、工具、审批、附件、Diff
      │   ├─ Composer：附件、语音、模型、输入、发送/停止
      │   └─ Workspace Sheet：文件、更改、预览、运行输出
      └─ 全屏二级页
          ├─ 文件树 / 文件编辑 / 预览
          ├─ Review / Diff / Commit
          ├─ Skills / Artifacts / Messaging / Cron / Agents / Starmap
          └─ Settings
```

### 5.1 Desktop 到移动端的交互映射

| Desktop 原交互 | 移动端交互 | 不变的业务 action |
| --- | --- | --- |
| 左侧 Sidebar | 左侧滑出 Drawer；会话页也可全屏打开 | 新建、搜索、置顶、项目、最近、Profile |
| Titlebar | 顶部安全区 Header | 标题、状态、模型、会话动作 |
| 右键菜单 | 长按 + Action Sheet | 归档、重命名、置顶、分支、删除 |
| hover 显示操作 | 常用操作显式展示，其余放 `…` | 原 action 不变 |
| 三栏 Pane | 底部 Sheet，向上拖拽进入全屏 | Files / Review / Preview / logs |
| 多个会话 Tile / 分屏 | 单会话栈 + 会话快速切换 | 同一个 session 数据与运行状态 |
| 键盘快捷键 / Command Palette | 搜索页、长按、手势和显式入口 | 同一命令执行器 |
| 拖拽排序 | 编辑模式下拖动排序 | 置顶/排序持久化 |
| 拖拽上传 | 文件、相册、相机、系统分享 | 同一附件上传与 `file.attach` |
| OS 通知 | Push 通知 + 深链 | 完成、审批、澄清提醒 |

### 5.2 会话详情页

#### Header

- 左上：返回到会话 Drawer。
- 中央：会话标题；副标题显示当前 Profile、Gateway 名称和工作区短名。
- 右侧：模型/审批模式入口、编辑标题、更多菜单。
- `…` 固定包含：置顶/取消置顶、重命名、归档/恢复、分支、删除、文件、更改、分享会话链接（若服务端能力存在）。

#### Transcript

- 复用 Desktop 的消息类型、Markdown、代码块、表格、附件、工具结果和审批信息结构。
- 思考和工具调用默认紧凑折叠，显示状态、摘要和耗时；用户点击后展开完整参数/输出。
- 代码块可复制、换行、展开全屏阅读；Diff 卡片打开 Review Sheet。
- 用户上滑阅读时停止自动滚动，出现“回到最新”浮动按钮；用户在底部时保持流式跟随。
- 背景会话的完成事件只更新列表 badge 和通知，不主动切换前台会话。

#### Composer

- 底部固定并适配 safe area、iOS keyboard 与 Android IME。
- `+`：文件、相册、拍照、粘贴图片；文件上传后沿用 Desktop 附件语义。
- 模型/推理强度/审批模式为紧凑 Sheet；当前值在输入区上方或 Header 中可见。
- 发送时显示停止按钮；运行中支持 steer；要求澄清/审批时输入区不应伪装成可正常提交。
- 语音输入通过系统权限采集音频，调用既有 `/api/audio/transcribe`；语音播放调用 `/api/audio/speak`。

### 5.3 Drawer

- 以参考图的 Codex 结构组织：顶部产品名、搜索、连接/Profile；中间为固定产品入口、置顶、项目、最近会话；底部为新建聊天和设置。
- 会话列表支持搜索、分页加载、运行中状态点、未读/需要输入 badge、长按菜单和左滑归档。
- 项目进入后显示该项目会话与工作区；新建会话会携带该工作区 cwd。
- 不因后台事件自动打开 Drawer 或跳转会话。

### 5.4 Files、Preview、Review

远程 Gateway 已提供对应 REST 路径，移动端直接使用，不经过 Electron：

- Files：`/api/fs/list`、`/api/fs/read-text`、`/api/fs/read-data-url`、`/api/fs/write-text`、`/api/fs/git-root`、`/api/fs/default-cwd`。
- Git：`/api/git/status`、`/api/git/file-diff`、`/api/git/review/*`、`/api/git/worktree/*`、`/api/git/branch/*`。

移动交互：

- 从 Header `…`、工具卡片、Diff 卡片进入 Workspace Sheet。
- Sheet 顶部使用“文件 / 更改 / 预览 / 输出”分段切换；初始为半屏，高内容任务可拖成全屏。
- 文件树按需加载目录；点击文本文件进入全屏阅读/编辑；保存前重新读取或使用服务端版本标识避免覆盖 Agent 刚写入的内容。
- 图片、音频、视频优先通过带认证的 `/api/fs/read-data-url` 读取；避免把 OAuth token 拼进外部 URL。大媒体另定义 bearer 可访问的下载路径后再做流式播放。
- Review 默认显示变更文件与 added/removed 数；打开文件进入全屏 Diff；stage/unstage/revert/commit/push 固定在底部动作条。revert、commit、push、create PR 均需明确确认。
- Preview 对 URL 直接在安全 WebView 打开；远程文件以 `/api/fs/read-text` / data URL 渲染 markdown、源码和图片。不要使用 `file://`。

### 5.5 Terminal

- 读取 `agent.terminal.output` Gateway event，提供只读的“运行输出”页：命令标题、实时 stdout/stderr、复制、搜索、下载文本、退出状态。
- Desktop 的本地 Electron PTY 不迁移到手机。
- 现有 `terminal.read.request` 需要读取 Desktop xterm buffer，不能冒充为远程手机交互终端。
- 若未来需要“在手机敲 shell”，必须由 Gateway 新增受控 PTY WebSocket、权限策略、生命周期、审计与断开清理；它是独立能力，不属于 Capacitor UI 改造。

## 6. Desktop 功能清单与移动端呈现

| 领域 | 移动端页面 | Gateway 依据 | 说明 |
| --- | --- | --- | --- |
| Chat / Sessions | Drawer + 会话详情 | `/api/sessions/*` + `/api/ws` | 核心、全量支持 |
| Profiles | Drawer 选择 + Settings | `/api/profiles/*` | 连接与 Profile 显式区分 |
| Projects / Worktrees | Drawer + Workspace Sheet | `/api/git/worktrees/*`、会话 cwd | 手机不做本地扫描仓库 |
| Models / providers | Composer Sheet + Settings | `/api/model/*`、`/api/providers/*` | 同一后端配置 |
| Files / editor | Workspace Sheet + 全屏编辑器 | `/api/fs/*` | 仅远程文件系统 |
| Preview | Workspace Sheet + 全屏 | `/api/fs/*`、URL preview | 安全 WebView / 内容渲染 |
| Review / Ship | Workspace Sheet + 全屏 Diff | `/api/git/review/*` | 同一 Git 后端 |
| Agent output | Workspace Sheet | `agent.terminal.output` | 只读输出 |
| Skills / MCP | 全屏页面 | `/api/skills/*`、`/api/mcp/*` | 所有 mutation 有确认与错误回滚 |
| Artifacts | 全屏页面 | 既有 artifact REST/事件 | 可打开、复制、下载、预览 |
| Messaging / pairing | 全屏页面 | `/api/messaging/*`、`/api/pairing/*` | pairing 是消息平台用户授权，不是 App 登录 |
| Cron | 全屏页面 | `/api/cron/*` | 创建、暂停、恢复、触发、查看 runs |
| Agents / Starmap | 全屏页面 | Agents / graph REST 和事件 | 不自动抢占聊天前台 |
| Settings | 全屏设置栈 | `/api/config`、`/api/env` 等 | 去掉 keybind、窗口、安装等桌面项 |
| Notifications | 原生权限 + Push | Gateway events / Push service | 深链定位会话与 action |

## 7. 原生适配边界

### 7.1 必需能力

| 能力 | 移动端实现 |
| --- | --- |
| OAuth 浏览器与回调 | Capacitor Browser + App URL listener |
| 凭证 | Keychain / Android Keystore secure storage |
| 键盘 | Capacitor Keyboard，动态更新 composer / sheet inset |
| 触觉反馈 | Capacitor Haptics，发送、成功、警告、错误 |
| 附件 | Camera、Photo Library、File Picker、Share target |
| 通知 | Push Notifications + deep link |
| 剪贴板/分享 | Capacitor Clipboard / Share |
| 前后台/网络 | App lifecycle + Network，驱动重新认证与重连 |

### 7.2 安全规则

- access token、refresh token、session token、WS ticket、附件内容不写入普通日志。
- 诊断日志对 Authorization、token、ticket、password、secret request value 做字段级脱敏。
- 外部链接、Preview URL、下载路径均做 scheme allow-list；禁止任意 `file://`、javascript URL 和未认证的远程工作区地址。
- 用户确认前不执行 stage、revert、commit、push、创建 PR、写文件、运行高风险工具动作。
- Secret / sudo / approval 请求使用独立的强提示 Sheet，完成后立即从组件内存清除敏感输入。

## 8. 测试与验收

### 8.1 Contract tests

以现有 Desktop Gateway 行为作为合同，使用同一组 RPC fixture 覆盖：

- OAuth token exchange、refresh、401/403 与网络错误分类。
- 每次 reconnect 重取 WS ticket；旧 ticket 永不复用。
- `session.resume` 后的 runtime id 映射；stale runtime 只恢复/重试一次。
- `message.delta`、`thinking.delta`、`tool.*`、`clarify.request`、`approval.request`、`secret.request`、`agent.terminal.output` 分发。
- 会话切换、Profile 切换、前后台切换时，过期异步请求不得写入当前视图。
- 远程 Files 和 Git 的路径、Profile、认证头、错误回滚。

### 8.2 UI tests

- 竖屏窄宽、横屏、刘海/安全区、软键盘打开时 composer 与 Sheet 不遮挡。
- 长会话流式输出时滚动不抖动；阅读历史时不会被新消息强制拉回底部。
- Drawer、Action Sheet、嵌套 Sheet 的返回顺序正确：一次返回只关闭最上层表面。
- 长按、左滑、拖动 Sheet、文件树展开、Diff 大文件虚拟滚动可用。
- 深色/浅色、系统字体放大、屏幕阅读器标签和触控目标尺寸可用。

### 8.3 真机验收

- iPhone 与 Android 真机均能以 OAuth 登录真实 HTTPS/WSS Gateway。
- Token 刷新、后台恢复、弱网、切换 Wi-Fi/蜂窝网络、Gateway 重启均有可恢复表现。
- 与 Desktop 同时连接同一 Profile：消息、会话标题、归档、变更、审批状态最终一致。
- 文件浏览、Diff、stage/unstage/revert/commit/push 在远程工作区实际生效，并显示失败原因。
- Desktop 目录无移动端业务改动；`apps/mobile` 可以独立 build、sync iOS、sync Android。

## 9. 需要在编码前确认的唯一外部契约

本仓库只包含 Desktop 客户端，以下 Gateway 服务端能力需用真实部署验证后才可声明完成：

1. Native OAuth 的移动 redirect URI allow-list。
2. Capacitor REST CORS 与 WSS Origin allow-list。
3. OAuth bearer 访问所有 `/api/fs/*`、`/api/git/*`、下载/大媒体接口的权限边界。
4. 单 Gateway 的 `profile` query/body 路由语义，以及多 Gateway Profile 覆盖在移动端的连接呈现。
5. Push 服务如何由 Gateway 产生设备级通知 token；这不应复用 Messaging pairing。

以上均是服务端契约验证，不要求修改 Desktop。若某项不存在，应在 Gateway 增加最小且受限的能力，而不是在移动端增加兼容性伪实现。
