export interface StatusResponse {
  auth_flows?: string[]
  auth_required?: boolean
  status: string
  version?: string
}

export interface SessionInfo {
  archived?: boolean
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
  parent_session_id?: null | string
  pinned?: boolean
  preview: null | string
  source: null | string
  started_at: number
  title: null | string
  tool_call_count: number
  handoff_platform?: null | string
  handoff_state?: null | string
  handoff_error?: null | string
  profile?: string
  is_default_profile?: boolean
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
  content: unknown
  reasoning?: null | string
  reasoning_content?: null | string
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
  info?: SessionRuntimeInfo
  message_count?: number
  messages?: SessionMessage[]
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
}

export interface ModelOptionsResponse {
  model?: string
  provider?: string
  providers?: ModelOptionProvider[]
}

export interface ProfileInfo {
  is_default: boolean
  name: string
  path?: string
}

export interface ProfilesResponse {
  profiles: ProfileInfo[]
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

export interface CronJob {
  created_at?: string
  cron: string
  deliver?: string
  description?: string
  enabled: boolean
  id: string
  last_run?: null | string
  name: string
  next_run?: null | string
  profile?: string
  prompt: string
  skills?: string[]
  updated_at?: string
}

export interface CronJobCreatePayload {
  cron: string
  deliver?: string
  description?: string
  name: string
  profile?: string
  prompt: string
  skills?: string[]
}

export interface CronJobUpdates {
  cron?: string
  deliver?: string
  description?: string
  name?: string
  prompt?: string
  skills?: string[]
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
  description: string
  is_password: boolean
  is_set: boolean
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
  edges: Array<{ source: string; target: string }>
  nodes: Array<{ id: string; kind: string; label: string }>
}

export interface McpServerSummary {
  enabled: boolean
  name: string
  tools_count?: number
}

export interface ToolsetInfo {
  description?: string
  enabled: boolean
  name: string
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

export interface GitStatusResponse {
  branch: string
  modified: string[]
  staged: string[]
  untracked: string[]
}

export interface GitFileDiffResponse {
  diff: string
  path: string
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
