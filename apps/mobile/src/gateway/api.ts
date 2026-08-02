import type {
  CronJob,
  CronJobCreatePayload,
  CronJobUpdates,
  FsListResponse,
  GitFileDiffResponse,
  GitStatusResponse,
  HermesConfig,
  ModelInfoResponse,
  ModelOptionsResponse,
  PaginatedSessions,
  PairingResponse,
  ProfilesResponse,
  SessionCreateResponse,
  SessionInfo,
  SessionMessagesResponse,
  SessionResumeResponse,
  SessionSearchResponse,
  SkillInfo,
  StatusResponse
} from '@/types/hermes'
import { apiRequest } from './http-client'
import { getGateway } from './ws-client'

const SESSION_LIST_TIMEOUT_MS = 60_000
const STARTUP_TIMEOUT_MS = 60_000

export function getStatus(): Promise<StatusResponse> {
  return apiRequest<StatusResponse>('/api/status')
}

export function listSessions(
  limit = 40,
  archived: 'exclude' | 'include' | 'only' = 'exclude',
  order: 'created' | 'recent' = 'recent'
): Promise<PaginatedSessions> {
  return apiRequest<PaginatedSessions>(
    `/api/sessions?limit=${limit}&offset=0&min_messages=1&archived=${archived}&order=${order}`,
    { timeoutMs: SESSION_LIST_TIMEOUT_MS }
  )
}

export function getSession(id: string): Promise<SessionInfo> {
  return apiRequest<SessionInfo>(`/api/sessions/${encodeURIComponent(id)}`)
}

export function getSessionMessages(id: string): Promise<SessionMessagesResponse> {
  return apiRequest<SessionMessagesResponse>(
    `/api/sessions/${encodeURIComponent(id)}/messages`
  )
}

export function searchSessions(query: string): Promise<SessionSearchResponse> {
  return apiRequest<SessionSearchResponse>(
    `/api/sessions/search?q=${encodeURIComponent(query)}`
  )
}

export function setSessionArchived(id: string, archived: boolean): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/api/sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { archived }
  })
}

export function setSessionPinned(id: string, pinned: boolean): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/api/sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { pinned }
  })
}

export function renameSession(id: string, title: string): Promise<{ ok: boolean; title: string }> {
  return apiRequest<{ ok: boolean; title: string }>(`/api/sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { title }
  })
}

export function deleteSession(id: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/api/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  })
}

export async function resumeSession(storedSessionId: string): Promise<SessionResumeResponse> {
  const gateway = getGateway()

  if (!gateway) {
    throw new Error('Gateway not connected')
  }

  return gateway.request<SessionResumeResponse>('session.resume', {
    session_id: storedSessionId
  })
}

export async function createSession(cwd?: string): Promise<SessionCreateResponse> {
  const gateway = getGateway()

  if (!gateway) {
    throw new Error('Gateway not connected')
  }

  const params: Record<string, unknown> = {}

  if (cwd) {
    params.cwd = cwd
  }

  return gateway.request<SessionCreateResponse>('session.create', params)
}

export async function submitPrompt(
  sessionId: string,
  text: string,
  options?: {
    model?: string
    provider?: string
    reasoningEffort?: string
    attachments?: Array<{ data_url: string; filename: string }>
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

  return gateway.request('prompt.submit', params, 1_800_000)
}

export async function interruptSession(sessionId: string): Promise<unknown> {
  const gateway = getGateway()

  if (!gateway) {
    throw new Error('Gateway not connected')
  }

  return gateway.request('session.interrupt', { session_id: sessionId })
}

export function getModelInfo(): Promise<ModelInfoResponse> {
  return apiRequest<ModelInfoResponse>('/api/model/info', { timeoutMs: STARTUP_TIMEOUT_MS })
}

export function getModelOptions(): Promise<ModelOptionsResponse> {
  return apiRequest<ModelOptionsResponse>('/api/model/options?explicit_only=1', {
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

export function getConfig(): Promise<HermesConfig> {
  return apiRequest<HermesConfig>('/api/config', { timeoutMs: STARTUP_TIMEOUT_MS })
}

export function getSkills(): Promise<SkillInfo[]> {
  return apiRequest<SkillInfo[]>('/api/skills')
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
    method: 'POST'
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

export function fsWriteText(filePath: string, content: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/api/fs/write-text', {
    method: 'POST',
    body: { path: filePath, content }
  })
}

export function gitStatus(repoPath?: string): Promise<GitStatusResponse> {
  const suffix = repoPath ? `?path=${encodeURIComponent(repoPath)}` : ''

  return apiRequest<GitStatusResponse>(`/api/git/status${suffix}`)
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
    body: { audio: dataUrl },
    timeoutMs: 180_000
  })
}
