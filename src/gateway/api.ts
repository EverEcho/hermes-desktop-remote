import type {
  AuxiliaryModelsResponse,
  BackendUpdateCheckResponse,
  AnalyticsResponse,
  AudioSpeakResponse,
  AutomationBlueprint,
  ConfigSchemaResponse,
  ComputerUseStatus,
  CronDeliveryTarget,
  CronJob,
  CronJobCreatePayload,
  CronJobUpdates,
  CustomEndpointUpdate,
  CustomEndpointValidationResponse,
  CustomEndpointsResponse,
  EnvVarInfo,
  FsListResponse,
  GatewayActionResponse,
  GatewayActionStatus,
  GitFileDiffResponse,
  GitStatusResponse,
  DebugShareResponse,
  HermesConfig,
  HermesConfigRecord,
  LearningNodeDetail,
  LogsResponse,
  MessagingPlatformUpdate,
  MessagingPlatformsResponse,
  ModelAssignmentRequest,
  ModelAssignmentResponse,
  ModelInfoResponse,
  ModelOptionsResponse,
  McpServerSummary,
  McpCatalogResponse,
  McpTestResult,
  MemoryStatusResponse,
  MemoryProviderConfig,
  MemoryProviderOAuthStatus,
  MoaConfigResponse,
  OAuthPollResponse,
  OAuthProvidersResponse,
  OAuthStartResponse,
  PaginatedSessions,
  PairingResponse,
  ProfileCreatePayload,
  ProfileDesktopOverlay,
  ProfileSoul,
  ProfileSetupCommand,
  ProfilesResponse,
  RecommendedDefaultModel,
  SessionCreateResponse,
  SessionInfo,
  SessionMessagesResponse,
  SessionResumeResponse,
  SessionSearchResponse,
  SkillInfo,
  SkillHubPreview,
  SkillHubScanResult,
  SkillHubSearchResponse,
  SkillHubSourcesResponse,
  StatusResponse,
  StarmapGraph,
  TerminalBackendsResponse,
  ToolsetInfo,
  ToolsetConfig,
  ToolsetModelsResponse,
  CuratorStatusResponse,
  WebhookCreatePayload,
  WebhookCreateResponse,
  WebhookEnableResponse,
  WebhooksResponse
} from '@/types/hermes'
import { apiRequest, getActiveProfile } from './http-client'
import { getGateway } from './ws-client'

const SESSION_LIST_TIMEOUT_MS = 60_000
const STARTUP_TIMEOUT_MS = 60_000
const CRON_TRIGGER_TIMEOUT_MS = 24 * 60 * 60 * 1000
export type GatewaySessionSource = 'desktop' | 'mobile'
export interface SessionSourceFilter {
  excludeSources?: string[]
  source?: string
}

export interface SidebarSessionSlice {
  profiles_truncated?: Record<string, boolean>
  sessions: SessionInfo[]
}

export interface SidebarSessionsResponse {
  cron: SidebarSessionSlice
  errors?: Array<{ error: string; profile: string }>
  messaging: SidebarSessionSlice
  recents: SidebarSessionSlice
}

export interface SidebarSessionsRequest {
  cronLimit: number
  messagingExclude: string[]
  messagingLimit: number
  recentsExclude: string[]
  recentsLimit: number
  recentsProfile: string
}

// Surface selection is fixed during bootstrap, so this source is stable for
// the lifetime of a mounted app. Keeping it here means every create/resume
// request gets the same Gateway-visible origin without threading UI props
// through the domain/session stores.
let sessionSource: GatewaySessionSource = 'mobile'

export function setGatewaySessionSource(source: GatewaySessionSource): void {
  sessionSource = source
}

function profileBody(fields: Record<string, unknown>, explicitProfile?: string): Record<string, unknown> {
  const profile = explicitProfile ?? getActiveProfile()
  return profile && profile !== 'default' ? { ...fields, profile } : fields
}

export function getStatus(): Promise<StatusResponse> {
  return apiRequest<StatusResponse>('/api/status')
}

export function getWebhooks(): Promise<WebhooksResponse> {
  return apiRequest<WebhooksResponse>('/api/webhooks')
}

export function enableWebhooks(): Promise<WebhookEnableResponse> {
  return apiRequest<WebhookEnableResponse>('/api/webhooks/enable', { method: 'POST' })
}

export function createWebhook(body: WebhookCreatePayload): Promise<WebhookCreateResponse> {
  return apiRequest<WebhookCreateResponse>('/api/webhooks', { method: 'POST', body })
}

export function deleteWebhook(name: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/api/webhooks/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

export function setWebhookEnabled(name: string, enabled: boolean): Promise<{ enabled: boolean; name: string; ok: boolean }> {
  return apiRequest<{ enabled: boolean; name: string; ok: boolean }>(`/api/webhooks/${encodeURIComponent(name)}/enabled`, {
    method: 'PUT',
    body: { enabled }
  })
}

export function listSessions(
  limit = 40,
  archived: 'exclude' | 'include' | 'only' = 'exclude',
  order: 'created' | 'recent' = 'recent',
  offset = 0,
  filter: SessionSourceFilter = {}
): Promise<PaginatedSessions> {
  const params = new URLSearchParams({
    limit: String(Math.max(1, limit)),
    offset: String(Math.max(0, offset)),
    min_messages: '1',
    archived,
    order
  })
  if (filter.source) params.set('source', filter.source)
  if (filter.excludeSources?.length) params.set('exclude_sources', filter.excludeSources.join(','))

  return apiRequest<PaginatedSessions>(
    `/api/sessions?${params.toString()}`,
    { timeoutMs: SESSION_LIST_TIMEOUT_MS }
  )
}

/** Read-only aggregated session index across profiles on one remote Gateway. */
export function listAllProfileSessions(
  limit = 40,
  archived: 'exclude' | 'include' | 'only' = 'exclude',
  order: 'created' | 'recent' = 'recent',
  offset = 0,
  filter: SessionSourceFilter = {}
): Promise<PaginatedSessions> {
  const params = new URLSearchParams({
    limit: String(Math.max(1, limit)),
    offset: String(Math.max(0, offset)),
    min_messages: '1',
    archived,
    order
  })
  if (filter.source) params.set('source', filter.source)
  if (filter.excludeSources?.length) params.set('exclude_sources', filter.excludeSources.join(','))
  return apiRequest<PaginatedSessions>(`/api/profiles/sessions?${params.toString()}`, {
    profile: 'all',
    timeoutMs: SESSION_LIST_TIMEOUT_MS
  })
}

let sidebarBatchEndpointMissing = false

/**
 * Fetch the three independent sidebar streams in one Gateway request. The
 * route was added after the base session endpoints, so a 404 falls back to
 * the equivalent source-filtered reads for older remote Gateways.
 */
export async function listSidebarSessions(req: SidebarSessionsRequest): Promise<SidebarSessionsResponse> {
  const requestProfile = req.recentsProfile === 'all' ? 'all' : undefined

  const fallback = async (): Promise<SidebarSessionsResponse> => {
    const list = req.recentsProfile === 'all' ? listAllProfileSessions : listSessions
    const [recents, cron, messaging] = await Promise.all([
      list(req.recentsLimit, 'exclude', 'recent', 0, { excludeSources: req.recentsExclude }),
      list(req.cronLimit, 'exclude', 'recent', 0, { source: 'cron' }),
      list(req.messagingLimit, 'exclude', 'recent', 0, { excludeSources: req.messagingExclude })
    ])
    return {
      recents: { sessions: recents.sessions },
      cron: { sessions: cron.sessions },
      messaging: { sessions: messaging.sessions },
      errors: [...(recents.errors ?? []), ...(cron.errors ?? []), ...(messaging.errors ?? [])]
    }
  }

  if (sidebarBatchEndpointMissing) return fallback()

  const params = new URLSearchParams({
    recents_profile: req.recentsProfile,
    recents_limit: String(Math.max(1, req.recentsLimit)),
    cron_limit: String(Math.max(1, req.cronLimit)),
    messaging_limit: String(Math.max(1, req.messagingLimit))
  })
  if (req.recentsExclude.length) params.set('recents_exclude', req.recentsExclude.join(','))
  if (req.messagingExclude.length) params.set('messaging_exclude', req.messagingExclude.join(','))

  try {
    return await apiRequest<SidebarSessionsResponse>(`/api/profiles/sessions/sidebar?${params.toString()}`, {
      profile: requestProfile,
      timeoutMs: SESSION_LIST_TIMEOUT_MS
    })
  } catch (error) {
    if (error instanceof Error && /API error 404/.test(error.message)) {
      sidebarBatchEndpointMissing = true
      return fallback()
    }
    throw error
  }
}

export function getSession(id: string, profile?: string): Promise<SessionInfo> {
  return apiRequest<SessionInfo>(`/api/sessions/${encodeURIComponent(id)}`, { profile })
}

export function getSessionMessages(
  id: string,
  options: { limit?: number; offset?: number; order?: 'latest' | 'oldest'; includeCompacted?: boolean; profile?: string } = {}
): Promise<SessionMessagesResponse> {
  const params = new URLSearchParams()

  if (options.limit !== undefined) params.set('limit', String(Math.max(1, options.limit)))
  if (options.offset !== undefined) params.set('offset', String(Math.max(0, options.offset)))
  if (options.order) params.set('order', options.order)
  if (options.includeCompacted !== undefined) params.set('include_compacted', String(options.includeCompacted))

  const suffix = params.size > 0 ? `?${params.toString()}` : ''

  return apiRequest<SessionMessagesResponse>(`/api/sessions/${encodeURIComponent(id)}/messages${suffix}`, {
    profile: options.profile
  })
}

export function searchSessions(query: string, profile?: string): Promise<SessionSearchResponse> {
  return apiRequest<SessionSearchResponse>(
    `/api/sessions/search?q=${encodeURIComponent(query)}`,
    { profile }
  )
}

export function scanSessionPullRequests(ids: string[]): Promise<{ pull_requests: Record<string, { number: number; url: string }>; scanned: string[] }> {
  return apiRequest<{ pull_requests: Record<string, { number: number; url: string }>; scanned: string[] }>('/api/profiles/sessions/pull-requests', {
    method: 'POST',
    body: { ids }
  })
}

export function setSessionArchived(id: string, archived: boolean, profile?: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/api/sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    profile,
    body: profileBody({ archived }, profile)
  })
}

export function setSessionPinned(id: string, pinned: boolean, profile?: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/api/sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    profile,
    body: profileBody({ pinned }, profile)
  })
}

export function setSessionUnread(id: string, unread: boolean, profile?: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/api/sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    profile,
    body: profileBody({ unread }, profile)
  })
}

export function renameSession(id: string, title: string, profile?: string): Promise<{ ok: boolean; title: string }> {
  return apiRequest<{ ok: boolean; title: string }>(`/api/sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    profile,
    body: profileBody({ title }, profile)
  })
}

export function deleteSession(id: string, profile?: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/api/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    profile
  })
}

export async function resumeSession(
  storedSessionId: string,
  options?: { omitMessages?: boolean }
): Promise<SessionResumeResponse> {
  const gateway = getGateway()

  if (!gateway) {
    throw new Error('Gateway not connected')
  }

  return gateway.request<SessionResumeResponse>('session.resume', {
    session_id: storedSessionId,
    source: sessionSource,
    ...(options?.omitMessages ? { omit_messages: true } : {})
  })
}

/** Create a Gateway-managed child conversation from an existing stored
 * session. This is RPC rather than a local Git/worktree operation, so it is
 * equally valid for browser, mobile, and Tauri surfaces. */
export async function branchSession(id: string): Promise<SessionCreateResponse> {
  const gateway = getGateway()
  if (!gateway) throw new Error('Gateway is not connected')
  return gateway.request<SessionCreateResponse>('session.branch', {
    session_id: id
  })
}

export interface CreateSessionOptions {
  cwd?: string
  model?: string
  provider?: string
  reasoningEffort?: string
  fast?: boolean
}

export async function createSession(options?: CreateSessionOptions): Promise<SessionCreateResponse> {
  const gateway = getGateway()

  if (!gateway) {
    throw new Error('Gateway not connected')
  }

  const params: Record<string, unknown> = {}

  if (options?.cwd) {
    params.cwd = options.cwd
  }

  /* Sticky composer selection rides on session.create, like Desktop. */
  if (options?.model) {
    params.model = options.model
  }

  if (options?.provider) {
    params.provider = options.provider
  }

  if (options?.reasoningEffort) {
    params.reasoning_effort = options.reasoningEffort
  }

  if (options?.fast) {
    params.fast = true
  }

  params.source = sessionSource

  return gateway.request<SessionCreateResponse>('session.create', params)
}

/** Live fast-mode switch — same mechanism as Desktop's model-edit-submenu. */
export async function setSessionFast(sessionId: string, fast: boolean): Promise<unknown> {
  const gateway = getGateway()

  if (!gateway) {
    throw new Error('Gateway not connected')
  }

  return gateway.request('config.set', {
    key: 'fast',
    session_id: sessionId,
    value: fast ? 'fast' : 'normal'
  })
}

export async function submitPrompt(
  sessionId: string,
  text: string,
  options?: {
    model?: string
    provider?: string
    reasoningEffort?: string
    attachments?: Array<{ data_url: string; filename: string }>
    truncateBeforeUserOrdinal?: number
  }
): Promise<unknown> {
  const gateway = getGateway()

  if (!gateway) {
    throw new Error('Gateway not connected')
  }

  const params: Record<string, unknown> = {
    session_id: sessionId,
    text
  }

  if (options?.model) {
    params.model = options.model
  }

  if (options?.provider) {
    params.provider = options.provider
  }

  if (options?.reasoningEffort) {
    params.reasoning_effort = options.reasoningEffort
  }

  if (options?.attachments?.length) {
    params.attachments = options.attachments
  }

  if (options?.truncateBeforeUserOrdinal !== undefined) {
    params.truncate_before_user_ordinal = options.truncateBeforeUserOrdinal

    if (options.truncateBeforeUserOrdinal === 0) {
      params.confirm_empty_truncate = true
    }
  }

  return gateway.request('prompt.submit', params, 1_800_000)
}

export async function interruptSession(sessionId: string): Promise<unknown> {
  const gateway = getGateway()

  if (!gateway) {
    throw new Error('Gateway not connected')
  }

  return gateway.request('session.interrupt', { session_id: sessionId })
}

export async function redirectSession(sessionId: string, text: string): Promise<{ status?: 'queued' | 'redirected' | 'rejected' }> {
  const gateway = getGateway()
  if (!gateway) throw new Error('Gateway is not connected')
  return gateway.request<{ status?: 'queued' | 'redirected' | 'rejected' }>('session.redirect', { session_id: sessionId, text })
}

export interface SlashCompletionItem {
  text: string
  display?: string
  meta?: string
}

export async function completeSlash(text: string): Promise<{ items?: SlashCompletionItem[]; replace_from?: number }> {
  const gateway = getGateway()

  if (!gateway) {
    throw new Error('Gateway not connected')
  }

  return gateway.request('complete.slash', { text }, 10_000)
}

/** A remote Gateway workspace completion for inline `@` references. */
export interface PathCompletionItem {
  display?: string
  icon?: string
  meta?: string
  text: string
}

/**
 * The workspace belongs to the connected Gateway, not the client device.
 * Supplying the session and cwd lets the server resolve relative paths in the
 * same context in which the prompt will execute.
 */
export async function completePath(
  word: string,
  options: { cwd?: string; sessionId?: string } = {}
): Promise<{ items?: PathCompletionItem[] }> {
  const gateway = getGateway()

  if (!gateway) {
    throw new Error('Gateway not connected')
  }

  return gateway.request('complete.path', {
    word,
    ...(options.sessionId ? { session_id: options.sessionId } : {}),
    ...(options.cwd ? { cwd: options.cwd } : {})
  }, 10_000)
}

export interface SlashExecResult {
  output?: string
  warning?: string
  type?: string
  message?: string
  display?: string
}

export async function execSlash(sessionId: string, command: string): Promise<SlashExecResult> {
  const gateway = getGateway()

  if (!gateway) {
    throw new Error('Gateway not connected')
  }

  return gateway.request('slash.exec', { session_id: sessionId, command: command.replace(/^\/+/, '') }, 60_000)
}

export function getModelInfo(): Promise<ModelInfoResponse> {
  return apiRequest<ModelInfoResponse>('/api/model/info', { timeoutMs: STARTUP_TIMEOUT_MS })
}

export function getModelOptions(options: { refresh?: boolean; includeUnconfigured?: boolean; explicitOnly?: boolean } = {}): Promise<ModelOptionsResponse> {
  const params = new URLSearchParams()
  if (options.refresh) params.set('refresh', '1')
  if (options.includeUnconfigured) params.set('include_unconfigured', '1')
  if (options.explicitOnly !== false) params.set('explicit_only', '1')

  return apiRequest<ModelOptionsResponse>(`/api/model/options?${params.toString()}`, {
    timeoutMs: STARTUP_TIMEOUT_MS
  })
}

export function setGlobalModel(provider: string, model: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/api/model/set', {
    method: 'POST',
    body: { scope: 'main', provider, model }
  })
}

export function getProfiles(): Promise<ProfilesResponse> {
  return apiRequest<ProfilesResponse>('/api/profiles', { timeoutMs: STARTUP_TIMEOUT_MS })
}

export function createProfile(body: ProfileCreatePayload): Promise<{ name: string; ok: boolean; path: string }> {
  return apiRequest<{ name: string; ok: boolean; path: string }>('/api/profiles', {
    method: 'POST',
    body
  })
}

/** Archives remain on the connected Gateway; callers deliberately never assume a local filesystem. */
export function exportProfileArchive(name: string): Promise<{ archive: string; ok: boolean }> {
  return apiRequest<{ archive: string; ok: boolean }>(`/api/profiles/${encodeURIComponent(name)}/export`, {
    method: 'POST',
    body: { extra_files: {}, output: '' },
    timeoutMs: STARTUP_TIMEOUT_MS
  })
}

export function importProfileArchive(archive: string, name?: string): Promise<{ desktop: null | ProfileDesktopOverlay; name: string; ok: boolean; path: string }> {
  return apiRequest<{ desktop: null | ProfileDesktopOverlay; name: string; ok: boolean; path: string }>('/api/profiles/import', {
    method: 'POST',
    body: profileBody({ archive, name: name || null }),
    timeoutMs: STARTUP_TIMEOUT_MS
  })
}

export function renameProfile(name: string, newName: string): Promise<{ name: string; ok: boolean; path: string }> {
  return apiRequest<{ name: string; ok: boolean; path: string }>(`/api/profiles/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    body: { new_name: newName }
  })
}

export function deleteProfile(name: string): Promise<{ ok: boolean; path: string }> {
  const normalized = name.trim()
  if (!normalized || normalized.toLowerCase() === 'default') {
    return Promise.reject(new Error('The default profile cannot be deleted.'))
  }

  return apiRequest<{ ok: boolean; path: string }>(`/api/profiles/${encodeURIComponent(normalized)}`, {
    method: 'DELETE'
  })
}

export function getProfileSoul(name: string): Promise<ProfileSoul> {
  return apiRequest<ProfileSoul>(`/api/profiles/${encodeURIComponent(name)}/soul`)
}

export function updateProfileSoul(name: string, content: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/api/profiles/${encodeURIComponent(name)}/soul`, { method: 'PUT', body: { content } })
}

export function getProfileSetupCommand(name: string): Promise<ProfileSetupCommand> {
  return apiRequest<ProfileSetupCommand>(`/api/profiles/${encodeURIComponent(name)}/setup-command`)
}

export function getConfig(): Promise<HermesConfig> {
  return apiRequest<HermesConfig>('/api/config', { timeoutMs: STARTUP_TIMEOUT_MS })
}

export function getConfigRecord(): Promise<HermesConfigRecord> {
  return apiRequest<HermesConfigRecord>('/api/config')
}

export function getConfigDefaults(): Promise<HermesConfigRecord> {
  return apiRequest<HermesConfigRecord>('/api/config/defaults', { timeoutMs: STARTUP_TIMEOUT_MS })
}

export function getConfigSchema(): Promise<ConfigSchemaResponse> {
  return apiRequest<ConfigSchemaResponse>('/api/config/schema')
}

export function saveConfig(config: HermesConfigRecord): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/api/config', { method: 'PUT', body: { config } })
}

export function getAuxiliaryModels(): Promise<AuxiliaryModelsResponse> {
  return apiRequest<AuxiliaryModelsResponse>('/api/model/auxiliary')
}

export function setModelAssignment(body: ModelAssignmentRequest): Promise<ModelAssignmentResponse> {
  return apiRequest<ModelAssignmentResponse>('/api/model/set', { method: 'POST', body })
}

export function getMoaModels(): Promise<MoaConfigResponse> {
  return apiRequest<MoaConfigResponse>('/api/model/moa')
}

export function saveMoaModels(body: MoaConfigResponse): Promise<MoaConfigResponse & { ok: boolean }> {
  return apiRequest<MoaConfigResponse & { ok: boolean }>('/api/model/moa', { method: 'PUT', body })
}

export function getRecommendedDefaultModel(provider: string): Promise<RecommendedDefaultModel> {
  return apiRequest<RecommendedDefaultModel>(`/api/model/recommended-default?provider=${encodeURIComponent(provider)}`)
}

export function getEnvVars(): Promise<Record<string, EnvVarInfo>> {
  return apiRequest<Record<string, EnvVarInfo>>('/api/env')
}

export function setEnvVar(key: string, value: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/api/env', { method: 'PUT', body: { key, value } })
}

export function deleteEnvVar(key: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/api/env', { method: 'DELETE', body: { key } })
}

export function revealEnvVar(key: string): Promise<{ key: string; value: string }> {
  return apiRequest<{ key: string; value: string }>('/api/env/reveal', { method: 'POST', body: { key } })
}

export function validateProviderCredential(key: string, value: string, apiKey?: string): Promise<{ ok: boolean; reachable: boolean; message: string; models?: string[] }> {
  return apiRequest<{ ok: boolean; reachable: boolean; message: string; models?: string[] }>('/api/providers/validate', { method: 'POST', body: { key, value, api_key: apiKey ?? '' } })
}

export function getCustomEndpoints(): Promise<CustomEndpointsResponse> {
  return apiRequest<CustomEndpointsResponse>('/api/providers/custom-endpoints')
}

export function saveCustomEndpoint(endpoint: CustomEndpointUpdate): Promise<CustomEndpointsResponse> {
  return apiRequest<CustomEndpointsResponse>('/api/providers/custom-endpoints', { method: 'POST', body: endpoint })
}

export function validateCustomEndpoint(endpoint: CustomEndpointUpdate): Promise<CustomEndpointValidationResponse> {
  return apiRequest<CustomEndpointValidationResponse>('/api/providers/custom-endpoints/validate', { method: 'POST', body: endpoint })
}

export function activateCustomEndpoint(id: string): Promise<{ ok: boolean; provider: string; model: string }> {
  return apiRequest<{ ok: boolean; provider: string; model: string }>(
    `/api/providers/custom-endpoints/${encodeURIComponent(id)}/activate`,
    { method: 'POST' }
  )
}

export function deleteCustomEndpoint(id: string): Promise<CustomEndpointsResponse> {
  return apiRequest<CustomEndpointsResponse>(`/api/providers/custom-endpoints/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  })
}

export function listOAuthProviders(): Promise<OAuthProvidersResponse> {
  return apiRequest<OAuthProvidersResponse>('/api/providers/oauth')
}

export function disconnectOAuthProvider(providerId: string): Promise<{ ok: boolean; provider: string }> {
  return apiRequest<{ ok: boolean; provider: string }>(`/api/providers/oauth/${encodeURIComponent(providerId)}`, {
    method: 'DELETE'
  })
}

export function startOAuthLogin(providerId: string): Promise<OAuthStartResponse> {
  return apiRequest<OAuthStartResponse>(`/api/providers/oauth/${encodeURIComponent(providerId)}/start`, {
    method: 'POST'
  })
}

export function pollOAuth(providerId: string, sessionId: string): Promise<OAuthPollResponse> {
  return apiRequest<OAuthPollResponse>(
    `/api/providers/oauth/${encodeURIComponent(providerId)}/poll/${encodeURIComponent(sessionId)}`
  )
}

export function cancelOAuthSession(sessionId: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/api/oauth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
}

export function getToolsets(): Promise<ToolsetInfo[]> {
  return apiRequest<ToolsetInfo[]>('/api/tools/toolsets')
}

export function listMcpServers(): Promise<{ servers: McpServerSummary[] }> {
  return apiRequest<{ servers: McpServerSummary[] }>('/api/mcp/servers')
}

export function getMemoryStatus(): Promise<MemoryStatusResponse> {
  return apiRequest<MemoryStatusResponse>('/api/memory')
}

export function getMemoryProviderConfig(provider: string): Promise<MemoryProviderConfig> {
  return apiRequest<MemoryProviderConfig>(`/api/memory/providers/${encodeURIComponent(provider)}/config?surface=declared`)
}

export function saveMemoryProviderConfig(provider: string, values: Record<string, string>): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/api/memory/providers/${encodeURIComponent(provider)}/config?surface=declared`, { method: 'PUT', body: { values } })
}

export function startMemoryProviderOAuth(provider: string): Promise<MemoryProviderOAuthStatus> {
  return apiRequest<MemoryProviderOAuthStatus>(`/api/memory/providers/${encodeURIComponent(provider)}/oauth/start`, { method: 'POST' })
}

export function getMemoryProviderOAuthStatus(provider: string): Promise<MemoryProviderOAuthStatus> {
  return apiRequest<MemoryProviderOAuthStatus>(`/api/memory/providers/${encodeURIComponent(provider)}/oauth/status`)
}

export function getStarmapGraph(): Promise<StarmapGraph> {
  return apiRequest<StarmapGraph>('/api/learning/graph')
}

export function getUsageAnalytics(days = 30): Promise<AnalyticsResponse> {
  return apiRequest<AnalyticsResponse>(`/api/analytics/usage?days=${Math.max(1, Math.floor(days))}`)
}

export function getLogs(params: { component?: string; file?: string; level?: string; lines?: number; search?: string } = {}): Promise<LogsResponse> {
  const query = new URLSearchParams()
  if (params.file) query.set('file', params.file)
  if (params.lines !== undefined) query.set('lines', String(params.lines))
  if (params.level && params.level !== 'ALL') query.set('level', params.level)
  if (params.component && params.component !== 'all') query.set('component', params.component)
  if (params.search) query.set('search', params.search)
  const suffix = query.size ? `?${query.toString()}` : ''
  return apiRequest<LogsResponse>(`/api/logs${suffix}`)
}

export function getComputerUseStatus(): Promise<ComputerUseStatus> {
  return apiRequest<ComputerUseStatus>('/api/tools/computer-use/status')
}

export function grantComputerUsePermissions(): Promise<{ message?: string; name?: string; ok: boolean }> {
  return apiRequest<{ message?: string; name?: string; ok: boolean }>('/api/tools/computer-use/permissions/grant', { method: 'POST' })
}

export function checkHermesUpdate(force = false): Promise<BackendUpdateCheckResponse> {
  return apiRequest<BackendUpdateCheckResponse>(`/api/hermes/update/check${force ? '?force=true' : ''}`)
}

export function runGatewayDoctor(): Promise<GatewayActionResponse> {
  return apiRequest<GatewayActionResponse>('/api/ops/doctor', { method: 'POST', body: {} })
}

export function runGatewaySecurityAudit(): Promise<GatewayActionResponse> {
  return apiRequest<GatewayActionResponse>('/api/ops/security-audit', { method: 'POST', body: {} })
}

export function runGatewayBackup(): Promise<GatewayActionResponse & { archive?: string }> {
  return apiRequest<GatewayActionResponse & { archive?: string }>('/api/ops/backup', { method: 'POST', body: {}, timeoutMs: STARTUP_TIMEOUT_MS })
}

export function createGatewayDebugShare(): Promise<DebugShareResponse> {
  return apiRequest<DebugShareResponse>('/api/ops/debug-share', { method: 'POST', body: {}, timeoutMs: 120_000 })
}

export function getGatewayActionStatus(name: string, lines = 200): Promise<GatewayActionStatus> {
  return apiRequest<GatewayActionStatus>(`/api/actions/${encodeURIComponent(name)}/status?lines=${Math.max(1, lines)}`)
}

export function updateHermes(): Promise<{ message?: string; ok: boolean }> {
  return apiRequest<{ message?: string; ok: boolean }>('/api/hermes/update', { method: 'POST' })
}

export function speakText(text: string): Promise<AudioSpeakResponse> {
  return apiRequest<AudioSpeakResponse>('/api/audio/speak', { method: 'POST', body: { text }, timeoutMs: 180_000 })
}

export function getLearningNode(id: string): Promise<LearningNodeDetail> {
  return apiRequest<LearningNodeDetail>(`/api/learning/node?id=${encodeURIComponent(id)}`)
}

export function editLearningNode(id: string, content: string): Promise<{ message: string; ok: boolean }> {
  return apiRequest<{ message: string; ok: boolean }>('/api/learning/node', { method: 'PUT', body: { id, content } })
}

export function deleteLearningNode(id: string): Promise<{ message: string; ok: boolean }> {
  return apiRequest<{ message: string; ok: boolean }>('/api/learning/node', { method: 'DELETE', body: { id } })
}

export function resetMemory(target: 'all' | 'memory' | 'user'): Promise<{ deleted: string[]; ok: boolean }> {
  return apiRequest<{ deleted: string[]; ok: boolean }>('/api/memory/reset', { method: 'POST', body: { target } })
}

export function getCuratorStatus(): Promise<CuratorStatusResponse> {
  return apiRequest<CuratorStatusResponse>('/api/curator')
}

export function setCuratorPaused(paused: boolean): Promise<{ ok: boolean; paused: boolean }> {
  return apiRequest<{ ok: boolean; paused: boolean }>('/api/curator/paused', { method: 'PUT', body: { paused } })
}

export function runCurator(): Promise<{ ok: boolean; message?: string }> {
  return apiRequest<{ ok: boolean; message?: string }>('/api/curator/run', { method: 'POST', body: {} })
}

export function getTerminalBackends(): Promise<TerminalBackendsResponse> {
  return apiRequest<TerminalBackendsResponse>('/api/tools/terminal/backends')
}

export function selectTerminalBackend(backend: string): Promise<{ ok: boolean; backend: string }> {
  return apiRequest<{ ok: boolean; backend: string }>('/api/tools/terminal/backend', {
    method: 'PUT',
    body: { backend }
  })
}

export function setMcpServerEnabled(name: string, enabled: boolean): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/api/mcp/servers/${encodeURIComponent(name)}/enabled`, {
    method: 'PUT',
    body: { enabled }
  })
}

export function addMcpServer(body: { args?: string[]; auth?: string; command?: string; env?: Record<string, string>; name: string; url?: string }): Promise<McpServerSummary> {
  return apiRequest<McpServerSummary>('/api/mcp/servers', { method: 'POST', body })
}

export function removeMcpServer(name: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/api/mcp/servers/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

export function testMcpServer(name: string): Promise<McpTestResult> {
  return apiRequest<McpTestResult>(`/api/mcp/servers/${encodeURIComponent(name)}/test`, { method: 'POST', timeoutMs: 60_000 })
}

export function installMcpCatalogEntry(name: string, env: Record<string, string> = {}): Promise<{ ok: boolean; name?: string }> {
  return apiRequest<{ ok: boolean; name?: string }>('/api/mcp/catalog/install', {
    method: 'POST',
    body: { name, env, enable: true },
    timeoutMs: STARTUP_TIMEOUT_MS
  })
}

export function getMcpCatalog(): Promise<McpCatalogResponse> {
  return apiRequest<McpCatalogResponse>('/api/mcp/catalog')
}

export function authMcpServer(name: string): Promise<{ flow_id: string; authorization_url: string | null; status: string }> {
  return apiRequest<{ flow_id: string; authorization_url: string | null; status: string }>(`/api/mcp/servers/${encodeURIComponent(name)}/auth`, {
    method: 'POST',
    timeoutMs: STARTUP_TIMEOUT_MS
  })
}

export function getMcpOAuthFlow(flowId: string): Promise<{ flow_id: string; status: string; error?: string | null }> {
  return apiRequest<{ flow_id: string; status: string; error?: string | null }>(`/api/mcp/oauth/flows/${encodeURIComponent(flowId)}`)
}

export function cancelMcpOAuthFlow(flowId: string): Promise<{ ok: boolean; status: string }> {
  return apiRequest<{ ok: boolean; status: string }>(`/api/mcp/oauth/flows/${encodeURIComponent(flowId)}`, { method: 'DELETE' })
}

export function setToolsetEnabled(name: string, enabled: boolean): Promise<{ ok: boolean; name: string; enabled: boolean }> {
  return apiRequest<{ ok: boolean; name: string; enabled: boolean }>(
    `/api/tools/toolsets/${encodeURIComponent(name)}`,
    { method: 'PUT', body: { enabled } }
  )
}

export function getToolsetConfig(name: string): Promise<ToolsetConfig> {
  return apiRequest<ToolsetConfig>(`/api/tools/toolsets/${encodeURIComponent(name)}/config`)
}

export function getToolsetModels(name: string, provider?: string): Promise<ToolsetModelsResponse> {
  const query = provider ? `?provider=${encodeURIComponent(provider)}` : ''
  return apiRequest<ToolsetModelsResponse>(`/api/tools/toolsets/${encodeURIComponent(name)}/models${query}`)
}

export function selectToolsetProvider(name: string, provider: string, capability?: 'search' | 'extract'): Promise<{ ok: boolean; name: string; provider: string; capability?: string; needs_nous_auth?: boolean; feature?: string }> {
  return apiRequest(`/api/tools/toolsets/${encodeURIComponent(name)}/provider`, {
    method: 'PUT', body: capability ? { provider, capability } : { provider }
  })
}

export function selectToolsetModel(name: string, model: string, provider?: string): Promise<{ ok: boolean; name: string; model: string }> {
  return apiRequest(`/api/tools/toolsets/${encodeURIComponent(name)}/model`, { method: 'PUT', body: { model, provider } })
}

export function runToolsetPostSetup(name: string, key: string): Promise<{ ok: boolean; key: string; message?: string }> {
  return apiRequest(`/api/tools/toolsets/${encodeURIComponent(name)}/post-setup`, { method: 'POST', body: { key } })
}

export function restartGateway(): Promise<{ ok: boolean; message?: string }> {
  return apiRequest<{ ok: boolean; message?: string }>('/api/gateway/restart', { method: 'POST' })
}

export function getSkills(): Promise<SkillInfo[]> {
  return apiRequest<SkillInfo[]>('/api/skills')
}

export function getSkillContent(name: string): Promise<{ content: string; name: string; path: string }> {
  return apiRequest<{ content: string; name: string; path: string }>(`/api/skills/content?name=${encodeURIComponent(name)}`)
}

export function getSkillHubSources(): Promise<SkillHubSourcesResponse> {
  return apiRequest<SkillHubSourcesResponse>('/api/skills/hub/sources', { timeoutMs: 45_000 })
}

export function searchSkillsHub(query: string, source = 'all', limit = 20): Promise<SkillHubSearchResponse> {
  const params = new URLSearchParams({ q: query, source, limit: String(limit) })
  return apiRequest<SkillHubSearchResponse>(`/api/skills/hub/search?${params.toString()}`, { timeoutMs: 45_000 })
}

export function previewSkillHub(identifier: string): Promise<SkillHubPreview> {
  return apiRequest<SkillHubPreview>(`/api/skills/hub/preview?identifier=${encodeURIComponent(identifier)}`, { timeoutMs: 45_000 })
}

export function scanSkillHub(identifier: string): Promise<SkillHubScanResult> {
  return apiRequest<SkillHubScanResult>(`/api/skills/hub/scan?identifier=${encodeURIComponent(identifier)}`, { timeoutMs: 45_000 })
}

export function installSkillFromHub(identifier: string): Promise<{ ok: boolean; message?: string }> {
  return apiRequest<{ ok: boolean; message?: string }>('/api/skills/hub/install', { method: 'POST', body: { identifier }, timeoutMs: 60_000 })
}

export function uninstallSkillFromHub(name: string): Promise<{ ok: boolean; message?: string }> {
  return apiRequest<{ ok: boolean; message?: string }>('/api/skills/hub/uninstall', { method: 'POST', body: { name }, timeoutMs: 60_000 })
}

export function updateSkillsFromHub(): Promise<{ ok: boolean; message?: string }> {
  return apiRequest<{ ok: boolean; message?: string }>('/api/skills/hub/update', { method: 'POST', body: {}, timeoutMs: 60_000 })
}

export function setSkillEnabled(name: string, enabled: boolean): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/api/skills/toggle', {
    method: 'PUT',
    body: { name, enabled }
  })
}

export function getCronJobs(): Promise<CronJob[]> {
  return apiRequest<CronJob[]>('/api/cron/jobs', { timeoutMs: STARTUP_TIMEOUT_MS })
}

export async function getCronJobRuns(jobId: string, limit = 20): Promise<SessionInfo[]> {
  const result = await apiRequest<{ runs?: SessionInfo[] }>(`/api/cron/jobs/${encodeURIComponent(jobId)}/runs?limit=${Math.max(1, limit)}`)
  return result.runs ?? []
}

export async function getAutomationBlueprints(): Promise<AutomationBlueprint[]> {
  const result = await apiRequest<{ blueprints?: AutomationBlueprint[] }>('/api/cron/blueprints', {
    timeoutMs: STARTUP_TIMEOUT_MS
  })
  return result.blueprints ?? []
}

export function instantiateAutomationBlueprint(blueprint: string, values: Record<string, string>): Promise<CronJob> {
  return apiRequest<CronJob>('/api/cron/blueprints/instantiate', {
    method: 'POST',
    body: profileBody({ blueprint, values })
  })
}

export async function getCronDeliveryTargets(): Promise<CronDeliveryTarget[]> {
  const result = await apiRequest<{ targets?: CronDeliveryTarget[] }>('/api/cron/delivery-targets', {
    timeoutMs: STARTUP_TIMEOUT_MS
  })
  return result.targets ?? []
}

export function createCronJob(body: CronJobCreatePayload): Promise<CronJob> {
  return apiRequest<CronJob>('/api/cron/jobs', { method: 'POST', body })
}

export function updateCronJob(jobId: string, updates: CronJobUpdates): Promise<CronJob> {
  return apiRequest<CronJob>(`/api/cron/jobs/${encodeURIComponent(jobId)}`, {
    method: 'PUT',
    body: { updates }
  })
}

export function pauseCronJob(jobId: string): Promise<CronJob> {
  return apiRequest<CronJob>(`/api/cron/jobs/${encodeURIComponent(jobId)}/pause`, {
    method: 'POST'
  })
}

export function resumeCronJob(jobId: string): Promise<CronJob> {
  return apiRequest<CronJob>(`/api/cron/jobs/${encodeURIComponent(jobId)}/resume`, {
    method: 'POST'
  })
}

export function triggerCronJob(jobId: string): Promise<CronJob> {
  return apiRequest<CronJob>(`/api/cron/jobs/${encodeURIComponent(jobId)}/trigger`, {
    method: 'POST',
    timeoutMs: CRON_TRIGGER_TIMEOUT_MS
  })
}

export function deleteCronJob(jobId: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/api/cron/jobs/${encodeURIComponent(jobId)}`, {
    method: 'DELETE'
  })
}

export function getPairing(): Promise<PairingResponse> {
  return apiRequest<PairingResponse>('/api/pairing')
}

export function getMessagingPlatforms(): Promise<MessagingPlatformsResponse> {
  return apiRequest<MessagingPlatformsResponse>('/api/messaging/platforms')
}

export function updateMessagingPlatform(
  platformId: string,
  body: MessagingPlatformUpdate
): Promise<{ ok: boolean; platform: string }> {
  return apiRequest<{ ok: boolean; platform: string }>(
    `/api/messaging/platforms/${encodeURIComponent(platformId)}`,
    { method: 'PUT', body }
  )
}

export function testMessagingPlatform(platformId: string): Promise<{ ok: boolean; message: string; state?: string | null }> {
  return apiRequest<{ ok: boolean; message: string; state?: string | null }>(
    `/api/messaging/platforms/${encodeURIComponent(platformId)}/test`,
    { method: 'POST' }
  )
}

export function approvePairing(platform: string, requestId: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/api/pairing/approve', {
    method: 'POST',
    body: { platform, request_id: requestId }
  })
}

export function revokePairing(platform: string, userId: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/api/pairing/revoke', {
    method: 'POST',
    body: { platform, user_id: userId }
  })
}

export function fsList(dirPath: string): Promise<FsListResponse> {
  return apiRequest<FsListResponse>(`/api/fs/list?path=${encodeURIComponent(dirPath)}`)
}

export function fsReadText(filePath: string): Promise<{ content: string }> {
  return apiRequest<{ content: string }>(`/api/fs/read-text?path=${encodeURIComponent(filePath)}`)
}

/** Read a small remote binary through the authenticated Gateway bridge. The
 * returned data URL is safe to hand to an image/PDF preview and never exposes
 * a client-local `file:` path. */
export async function fsReadDataUrl(filePath: string): Promise<string> {
  const result = await apiRequest<string | { dataUrl?: string }>(
    `/api/fs/read-data-url?path=${encodeURIComponent(filePath)}`
  )
  const dataUrl = typeof result === 'string' ? result : result.dataUrl ?? ''
  if (!dataUrl.startsWith('data:')) throw new Error('Gateway did not return a file preview')
  return dataUrl
}

export function fsWriteText(filePath: string, content: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/api/fs/write-text', {
    method: 'POST',
    body: { path: filePath, content }
  })
}

export function gitStatus(repoPath?: string): Promise<GitStatusResponse | null> {
  const suffix = repoPath ? `?path=${encodeURIComponent(repoPath)}` : ''

  return apiRequest<GitStatusResponse | null>(`/api/git/status${suffix}`)
}

export function getGhAuthStatus(refresh = false): Promise<{ available: boolean; authenticated: boolean }> {
  return apiRequest<{ available: boolean; authenticated: boolean }>(`/api/git/gh-auth${refresh ? '?refresh=true' : ''}`)
}

export function gitFileDiff(filePath: string, repoPath: string): Promise<GitFileDiffResponse> {
  const params = new URLSearchParams({ file: filePath, path: repoPath })

  return apiRequest<GitFileDiffResponse>(`/api/git/file-diff?${params.toString()}`)
}

export function gitStage(filePath: string | null, repoPath: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/api/git/review/stage', {
    method: 'POST',
    body: { file: filePath, path: repoPath }
  })
}

export function gitUnstage(filePath: string | null, repoPath: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/api/git/review/unstage', {
    method: 'POST',
    body: { file: filePath, path: repoPath }
  })
}

export function gitCommit(message: string, repoPath: string, push = false): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/api/git/review/commit', {
    method: 'POST',
    body: { message, path: repoPath, push }
  })
}

export function gitPush(repoPath: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/api/git/review/push', {
    method: 'POST',
    body: { path: repoPath }
  })
}

export function gitRevert(filePath: string | null, repoPath: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/api/git/review/revert', {
    method: 'POST',
    body: { file: filePath, path: repoPath }
  })
}

export function transcribeAudio(dataUrl: string): Promise<{ ok: boolean; transcript: string }> {
  return apiRequest<{ ok: boolean; transcript: string }>('/api/audio/transcribe', {
    method: 'POST',
    body: { data_url: dataUrl },
    timeoutMs: 180_000
  })
}
