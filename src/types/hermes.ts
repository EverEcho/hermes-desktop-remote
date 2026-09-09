export interface StatusResponse {
  auth_flows?: string[]
  auth_required?: boolean
  status: string
  version?: string
  gateway_running?: boolean
  gateway_state?: string
  hermes_home?: string
  config_version?: number
}

export interface WebhookRoute {
  created_at: string | null
  deliver: string
  deliver_only: boolean
  description: string
  enabled: boolean
  events: string[]
  name: string
  prompt: string
  secret_set: boolean
  skills: string[]
  url: string
}

export interface WebhooksResponse {
  base_url: string
  enabled: boolean
  subscriptions: WebhookRoute[]
}

export interface WebhookCreatePayload {
  deliver?: string
  deliver_chat_id?: string
  deliver_only?: boolean
  description?: string
  events?: string[]
  name: string
  prompt?: string
  skills?: string[]
}

export interface WebhookCreateResponse extends WebhookRoute {
  secret: string
}

export interface WebhookEnableResponse {
  enabled: true
  needs_restart: boolean
  ok: boolean
  platform: 'webhook'
  restart_action?: string
  restart_error?: string
  restart_pid?: number | null
}

export interface SessionInfo {
  archived?: boolean
  /** ISO timestamps supplied by some cron-run API versions. */
  created_at?: null | string
  cwd?: null | string
  git_branch?: null | string
  git_repo_root?: null | string
  ended_at: null | number
  id: string
  _lineage_root_id?: null | string
  input_tokens: number
  is_active: boolean
  last_active: number
  message_count: number
  model: null | string
  output_tokens: number
  actual_cost_usd?: null | number
  estimated_cost_usd?: null | number
  parent_session_id?: null | string
  pinned?: boolean
  /** Server-side read watermark; undefined on older gateways. */
  unread?: boolean
  preview: null | string
  source: null | string
  started_at: number
  title: null | string
  tool_call_count: number
  /** ISO timestamps supplied by some cron-run API versions. */
  updated_at?: null | string
  handoff_platform?: null | string
  handoff_state?: null | string
  handoff_error?: null | string
  profile?: string
  is_default_profile?: boolean
  connection_id?: string
}

export interface PaginatedSessions {
  limit: number
  offset: number
  sessions: SessionInfo[]
  total: number
  profile_totals?: Record<string, number>
  errors?: Array<{ profile: string; error: string }>
}

export interface SessionMessage {
  args?: unknown
  content: unknown
  display_content?: unknown
  context?: unknown
  reasoning?: null | string
  reasoning_content?: null | string
  reasoning_details?: unknown
  display_kind?: string
  display_metadata?: string | unknown
  role: 'assistant' | 'system' | 'tool' | 'user'
  row_id?: number
  id?: number
  text?: unknown
  timestamp?: number
  tool_call_id?: null | string
  tool_calls?: unknown
  tool_name?: string
  name?: string
}

export interface SessionMessagesResponse {
  messages: SessionMessage[]
  pagination?: {
    limit: number
    offset: number
    order: 'latest' | 'oldest'
    returned: number
  }
  session_id: string
}

export interface SessionResumeResponse {
  auto_continue?: { attempt: number; interrupted_at: number }
  inflight?: null | {
    assistant?: string
    corrections?: string[]
    error?: string
    recoverable?: boolean
    status?: string
    streaming?: boolean
    user?: string
  }
  queued?: null | { user?: string }
  pending_approval?: {
    allow_permanent?: boolean
    choices?: string[]
    command?: string
    description?: string
    request_id?: string
    smart_denied?: boolean
  }
  pending_clarify?: {
    answers?: Record<string, unknown>
    choices?: null | string[]
    multi_select?: boolean
    question?: string
    questions?: unknown
    request_id?: string
  }
  info?: SessionRuntimeInfo
  message_count?: number
  messages?: SessionMessage[]
  messages_omitted?: boolean
  session_id: string
  stored_session_id?: string
}

export interface SessionCreateResponse {
  info?: SessionRuntimeInfo
  message_count?: number
  messages?: SessionMessage[]
  session_id: string
  stored_session_id?: string
}

export interface SessionRuntimeInfo {
  approval_mode?: string
  branch?: string
  cwd?: string
  model?: string
  personality?: string
  provider?: string
  reasoning_effort?: string
  running?: boolean
  fast?: boolean
  service_tier?: string
  session_id?: string
  yolo?: boolean
}

export interface SessionSearchResponse {
  results: SessionSearchResult[]
}

export interface SessionSearchResult {
  id: string
  preview: null | string
  title: null | string
}

export interface ModelInfoResponse {
  model: string
  provider: string
  auto_context_length?: number
  config_context_length?: number
  effective_context_length?: number
}

export interface ModelOptionProvider {
  is_current?: boolean
  models?: string[]
  name: string
  slug: string
  total_models?: number
  warning?: string
  featured_models?: string[]
  authenticated?: boolean
  auth_type?: string
  key_env?: string
  is_user_defined?: boolean
  api_url?: string
  /** Per-model option support, keyed by model id. Lets the UI gate
   *  fast/reasoning controls (same contract as Desktop). */
  capabilities?: Record<string, ModelCapabilities>
}

export interface ModelCapabilities {
  fast: boolean
  reasoning: boolean
  can_disable_reasoning?: boolean
}

export interface ModelOptionsResponse {
  model?: string
  provider?: string
  providers?: ModelOptionProvider[]
}

export interface ProfileInfo {
  display_name?: string
  has_env?: boolean
  is_default: boolean
  model?: string | null
  name: string
  path?: string
  provider?: string | null
  skill_count?: number
}

export interface ProfileSoul {
  content: string
  exists?: boolean
}

/** Optional desktop preferences bundled into a Gateway-side profile archive. */
export interface ProfileDesktopOverlay {
  version?: number
  [key: string]: unknown
}

/** Result returned when the Gateway starts a maintenance action. */
export interface GatewayActionResponse {
  name?: string
  pid?: number
  ok?: boolean
  message?: string
  action?: string
  status?: string
}

export interface GatewayActionStatus {
  exit_code: number | null
  lines: string[]
  name: string
  pid: number | null
  running: boolean
}

export interface DebugShareResponse extends GatewayActionResponse {
  url?: string
}

export interface ProfilesResponse {
  profiles: ProfileInfo[]
}

export interface ProfileCreatePayload {
  clone_all?: boolean
  clone_from?: string | null
  clone_from_default?: boolean
  name: string
  no_skills?: boolean
}

export interface ProfileSetupCommand {
  command: string
}

export interface HermesConfig {
  agent?: {
    reasoning_effort?: string
    personalities?: Record<string, unknown>
    service_tier?: string
  }
  display?: {
    personality?: string
    skin?: string
    interim_assistant_messages?: boolean
  }
  terminal?: { cwd?: string }
  stt?: { enabled?: boolean }
  voice?: {
    max_recording_seconds?: number
    auto_tts?: boolean
  }
}

export type HermesConfigRecord = Record<string, unknown>

export interface SkillInfo {
  description?: string
  enabled: boolean
  name: string
  source?: string
}

export interface SkillHubResult {
  description: string
  identifier: string
  name: string
  repo: string | null
  source: string
  tags: string[]
  trust_level: string
}

export interface SkillHubSourcesResponse {
  featured: SkillHubResult[]
  index_available: boolean
  installed: Record<string, { name: string | null; scan_verdict: string | null; trust_level: string | null }>
  sources: Array<{ available?: boolean; id: string; label: string; rate_limited?: boolean; searchable?: boolean }>
}

export interface SkillHubSearchResponse {
  installed: Record<string, { name: string | null; scan_verdict: string | null; trust_level: string | null }>
  results: SkillHubResult[]
  source_counts: Record<string, number>
  timed_out: string[]
}

export interface SkillHubPreview extends SkillHubResult {
  files: string[]
  skill_md: string
}

export interface SkillHubScanFinding {
  severity: string
  category: string
  file: string
  line: number | null
  description: string
}

export interface SkillHubScanResult {
  name: string
  identifier: string
  source: string
  trust_level: string
  verdict: string
  summary: string
  policy: 'allow' | 'ask' | 'block'
  policy_reason: string | null
  findings: SkillHubScanFinding[]
  severity_counts: Record<string, number>
}

export interface CronJob {
  deliver?: null | string
  enabled: boolean
  id: string
  last_error?: null | string
  last_run_at?: null | string
  model?: null | string
  name?: null | string
  next_run_at?: null | string
  no_agent?: boolean
  prompt?: null | string
  provider?: null | string
  schedule?: { display?: string; expr?: string; kind?: string }
  schedule_display?: null | string
  script?: null | string
  state?: null | string
  /** Legacy gateway shape, retained for older servers. */
  cron?: string
  description?: string
  profile?: string
  skills?: string[]
  created_at?: string
  updated_at?: string
  last_run?: null | string
  next_run?: null | string
}

export interface CronJobCreatePayload {
  prompt: string
  schedule: string
  deliver?: string
  model?: string
  name?: string
  provider?: string
  /** Legacy gateway shape, retained for older servers. */
  cron?: string
  description?: string
  profile?: string
  skills?: string[]
}

export interface CronJobUpdates {
  schedule?: string
  deliver?: string
  enabled?: boolean
  model?: null | string
  name?: string
  prompt?: string
  provider?: null | string
  /** Legacy gateway shape, retained for older servers. */
  cron?: string
  description?: string
  skills?: string[]
}

export interface CronDeliveryTarget {
  home_env_var: null | string
  home_target_set: boolean
  id: string
  name: string
}

/** A Gateway-provided, parameterized template for creating a cron job. */
export interface AutomationBlueprintField {
  name: string
  type: 'enum' | 'text' | 'time' | 'weekdays'
  label: string
  default: null | string
  options: string[]
  optional: boolean
  strict?: boolean
  help: string
}

export interface AutomationBlueprint {
  key: string
  title: string
  description: string
  category: string
  tags: string[]
  fields: AutomationBlueprintField[]
  command: string
  appUrl: string
}

export interface MessagingPlatformInfo {
  configured: boolean
  description: string
  docs_url: string
  enabled: boolean
  env_vars: MessagingEnvVarInfo[]
  error_code?: null | string
  error_message?: null | string
  gateway_running: boolean
  home_channel?: MessagingHomeChannel | null
  id: string
  name: string
  state?: null | string
  updated_at?: null | string
}

export interface MessagingPlatformsResponse {
  platforms: MessagingPlatformInfo[]
}

export interface MessagingEnvVarInfo {
  advanced: boolean
  description: string
  is_password: boolean
  is_set: boolean
  key: string
  prompt: string
  redacted_value: null | string
  required: boolean
  url: null | string
}

export interface MessagingHomeChannel {
  chat_id: string
  name: string
  platform: string
  thread_id?: string
}

export interface MessagingPlatformUpdate {
  clear_env?: string[]
  enabled?: boolean
  env?: Record<string, string>
}

export interface PairingUser {
  age_minutes?: number
  platform: string
  request_id?: string
  user_id: string
  user_name?: string
}

export interface PairingResponse {
  approved: PairingUser[]
  pending: PairingUser[]
}

export interface UsageStats {
  calls: number
  input: number
  output: number
  total: number
}

export interface AudioTranscriptionResponse {
  ok: boolean
  provider?: string
  transcript: string
}

export interface AudioSpeakResponse {
  ok: boolean
  data_url: string
  mime_type: string
  provider?: string
}

export interface EnvVarInfo {
  advanced: boolean
  category: string
  channel_managed?: boolean
  description: string
  is_password: boolean
  is_set: boolean
  provider?: string
  provider_label?: string
  redacted_value: null | string
  tools: string[]
  url: null | string
}

export interface ConfigSchemaResponse {
  category_order?: string[]
  fields: Record<string, ConfigFieldSchema>
}

export interface ConfigFieldSchema {
  category?: string
  description?: string
  options?: unknown[]
  type?: 'boolean' | 'list' | 'number' | 'select' | 'string' | 'text'
}

export interface StarmapGraph {
  clusters?: Array<{ category: string; count: number }>
  edges: Array<{ source: string; target: string }>
  memory?: Array<{ body: string; source: 'memory' | 'profile'; timestamp?: number | null; title: string }>
  nodes: Array<{
    category?: string
    createdBy?: string | null
    id: string
    kind: 'memory' | 'skill' | string
    label: string
    memorySource?: 'memory' | 'profile'
    pinned?: boolean
    state?: string
    timestamp?: number | null
    useCount?: number
  }>
  stats?: Record<string, unknown>
}

export interface LearningNodeDetail {
  content: string
  kind: 'memory' | 'skill'
  label: string
  ok: boolean
}

export interface AnalyticsResponse {
  by_model: Array<{ actual_cost?: number; estimated_cost?: number; input_tokens?: number; model: string; output_tokens?: number; provider?: string; sessions?: number }>
  period_days: number
  totals: {
    total_actual_cost: number
    total_api_calls: number | null
    total_estimated_cost: number
    total_input: number | null
    total_output: number | null
    total_reasoning: number | null
    total_sessions: number
  }
}

export interface LogsResponse {
  file: string
  lines: string[]
}

export interface ComputerUseStatus {
  accessibility: boolean | null
  can_grant: boolean
  checks: Array<{ label: string; message: string; status: string }>
  error: string | null
  installed: boolean
  platform: string
  platform_supported: boolean
  ready: boolean | null
  screen_recording: boolean | null
  screen_recording_capturable: boolean | null
  version: string | null
}

export interface BackendUpdateCheckResponse {
  behind: number | null
  can_apply: boolean
  commits?: Array<{ at: number; author: string; sha: string; summary: string }>
  current_version: string
  install_method: string
  message: string | null
  update_available: boolean
  update_command: string | null
}

export interface AudioSpeakResponse {
  data_url: string
  mime_type: string
  ok: boolean
  provider?: string
}

export interface McpServerSummary {
  args?: string[]
  command?: string | null
  enabled: boolean
  name: string
  tools_count?: number
  transport?: string
  url?: string | null
}

export interface McpTestResult {
  error?: string
  ok: boolean
  prompts?: number
  resources?: number
  tools: Array<{ description: string; name: string }>
}

export interface McpCatalogEntry {
  name: string
  description: string
  source: string
  transport: string
  auth_type: string
  required_env: Array<{ name: string; prompt: string; required: boolean }>
  command: string | null
  args: string[]
  url: string | null
  needs_install: boolean
  installed: boolean
  enabled: boolean
}

export interface McpCatalogResponse {
  entries: McpCatalogEntry[]
  diagnostics: Array<{ name: string; kind: string; message: string }>
}

export interface MemoryStatusResponse {
  active: string
  builtin_files: { memory: number; user: number }
  providers: Array<{ configured: boolean; description: string; name: string }>
}

export type MemoryProviderFieldKind = 'bool' | 'json' | 'number' | 'secret' | 'select' | 'text'

export interface MemoryProviderFieldOption { description: string; label: string; value: string }

export interface MemoryProviderField {
  description: string
  group: string
  info?: string
  inline: boolean
  is_set: boolean
  key: string
  kind: MemoryProviderFieldKind
  label: string
  options: MemoryProviderFieldOption[]
  placeholder: string
  value: string
}

export interface MemoryProviderConfig {
  docs_url: string
  fields: MemoryProviderField[]
  label: string
  name: string
}

export interface MemoryProviderOAuthStatus {
  auth: 'apikey' | 'oauth' | null
  connected: boolean
  detail: string
  state: 'connected' | 'error' | 'idle' | 'pending'
}

export interface CuratorStatusResponse {
  archive_after_days: number | null
  enabled: boolean
  interval_hours: number | null
  last_run_at: string | null
  min_idle_hours: number | null
  paused: boolean
  stale_after_days: number | null
}

export interface ToolsetInfo {
  configured?: boolean
  description?: string
  enabled: boolean
  label?: string
  name: string
  tools?: string[]
}

export interface ToolEnvVar {
  key: string
  prompt: string
  url: string | null
  default: string | null
  is_set: boolean
}

export interface ToolProvider {
  name: string
  badge: string
  tag: string
  env_vars: ToolEnvVar[]
  post_setup: string | null
  requires_nous_auth: boolean
  is_active: boolean
  status?: 'ready' | 'needs_setup' | 'needs_auth' | 'needs_keys'
  web_backend?: string
  tts_provider?: string
  capabilities?: Array<'search' | 'extract'>
}

export interface ToolsetConfig {
  name: string
  has_category: boolean
  providers: ToolProvider[]
  active_provider: string | null
  active_search_backend?: string | null
  active_extract_backend?: string | null
}

export interface ToolsetModel {
  id: string
  display: string
  speed: string
  strengths: string
  price: string
}

export interface ToolsetModelsResponse {
  name: string
  has_models: boolean
  provider?: string | null
  plugin?: string | null
  models: ToolsetModel[]
  current: string | null
  default: string | null
}

/** Health state reported by the connected Gateway for a terminal backend. */
export type TerminalBackendStatus = 'ready' | 'needs_setup' | 'unavailable'

/** One selectable remote terminal execution backend. The Gateway owns all
 * execution; clients only select the backend and render its output. */
export interface TerminalBackendInfo {
  active: boolean
  description: string
  detail: string
  label: string
  name: string
  status: TerminalBackendStatus
}

export interface TerminalBackendsResponse {
  active: string
  backends: TerminalBackendInfo[]
}

export interface FsListEntry {
  is_dir: boolean
  name: string
  path: string
  size?: number
}

export interface FsListResponse {
  entries: FsListEntry[]
  path: string
}

export interface GitStatusFile {
  path: string
  staged: boolean
  unstaged: boolean
  untracked: boolean
  conflicted: boolean
}

/** Mirrors HermesRepoStatus from the original desktop client. */
export interface GitStatusResponse {
  branch: string | null
  defaultBranch: string | null
  detached: boolean
  ahead: number
  behind: number
  staged: number
  unstaged: number
  untracked: number
  conflicted: number
  changed: number
  added: number
  removed: number
  files: GitStatusFile[]
}

export interface GitFileDiffResponse {
  diff: string
  path: string
}

export interface AuxiliaryTaskAssignment {
  base_url: string
  model: string
  provider: string
  task: string
}

export interface AuxiliaryModelsResponse {
  main: { model: string; provider: string }
  tasks: AuxiliaryTaskAssignment[]
}

export interface MoaModelSlot {
  provider: string
  model: string
  reasoning_effort?: string
  enabled?: boolean
}

export interface MoaPresetConfig {
  aggregator: MoaModelSlot
  aggregator_temperature: number
  degraded_reference_policy: 'loud' | 'silent'
  enabled: boolean
  max_tokens: number
  reference_models: MoaModelSlot[]
  reference_temperature: number
  reference_max_tokens?: number | null
  fanout?: string
  reference_timeout: number | null
}

export interface MoaConfigResponse {
  default_preset: string
  active_preset: string
  presets: Record<string, MoaPresetConfig>
  aggregator: MoaModelSlot
  aggregator_temperature: number
  degraded_reference_policy: 'loud' | 'silent'
  enabled: boolean
  max_tokens: number
  reference_models: MoaModelSlot[]
  reference_temperature: number
  reference_timeout: number | null
}

export interface ModelAssignmentRequest {
  api_key?: string
  base_url?: string
  model: string
  provider: string
  scope: 'main' | 'auxiliary'
  task?: string
}

export interface StaleAuxAssignment {
  task: string
  provider: string
  model: string
}

export interface ModelAssignmentResponse {
  ok?: boolean
  provider: string
  model: string
  stale_aux?: StaleAuxAssignment[]
}

export interface RecommendedDefaultModel {
  model: string
  provider?: string
}

export interface OAuthProvider {
  connected?: boolean
  disconnectable?: boolean
  docs_url: string
  flow: 'device_code' | 'external' | 'pkce'
  id: string
  name: string
  status: string
}

export interface OAuthProvidersResponse {
  providers: OAuthProvider[]
}

export type OAuthStartResponse =
  | { auth_url: string; expires_in: number; flow: 'pkce'; session_id: string }
  | {
      expires_in: number
      flow: 'device_code'
      poll_interval: number
      session_id: string
      user_code: string
      verification_url: string
    }

export interface OAuthPollResponse {
  error_message?: null | string
  expires_at?: null | number
  session_id: string
  status: 'approved' | 'denied' | 'error' | 'expired' | 'pending'
}

export interface CustomEndpoint {
  api_key_preview?: null | string
  base_url: string
  context_length?: null | number
  discover_models: boolean
  has_api_key: boolean
  id: string
  is_current?: boolean
  model: string
  models: string[]
  name: string
  source?: string
}

export interface CustomEndpointsResponse {
  current: { base_url: string; model: string; provider: string }
  endpoints: CustomEndpoint[]
  id?: string
  ok?: boolean
}

export interface CustomEndpointUpdate {
  api_key?: string
  base_url: string
  context_length?: number
  discover_models?: boolean
  id?: string
  make_default?: boolean
  model: string
  models?: string[]
  name: string
}

export interface CustomEndpointValidationResponse {
  message: string
  models: string[]
  ok: boolean
  reachable: boolean
}

export interface ArtifactInfo {
  content?: string
  created_at?: string
  id: string
  mime_type?: string
  name: string
  path?: string
  size?: number
  type?: string
}
