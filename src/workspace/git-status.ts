import type { GitStatusResponse } from '@/types/hermes'

export interface WorkspaceGitStatus {
  branch: string | null
  staged: string[]
  modified: string[]
  untracked: string[]
  changed: number
  ahead: number
  behind: number
}

interface LegacyGitStatusResponse {
  branch?: string | null
  staged?: string[]
  modified?: string[]
  untracked?: string[]
}

function unique(paths: string[]) {
  return [...new Set(paths)]
}

/**
 * Adapts the Gateway's original HermesRepoStatus contract into the groups used
 * by both workspace views. The legacy array shape remains accepted so clients
 * can still connect to older migrated Gateways during rollout.
 */
export function normalizeGitStatus(
  raw: GitStatusResponse | LegacyGitStatusResponse | null
): WorkspaceGitStatus | null {
  if (!raw) return null

  if (!('files' in raw) || !Array.isArray(raw.files)) {
    const legacy = raw as LegacyGitStatusResponse
    const staged = unique(Array.isArray(legacy.staged) ? legacy.staged : [])
    const modified = unique(Array.isArray(legacy.modified) ? legacy.modified : [])
    const untracked = unique(Array.isArray(legacy.untracked) ? legacy.untracked : [])
    return {
      branch: (raw as LegacyGitStatusResponse).branch ?? null,
      staged,
      modified,
      untracked,
      changed: new Set([...staged, ...modified, ...untracked]).size,
      ahead: 0,
      behind: 0
    }
  }

  const staged: string[] = []
  const modified: string[] = []
  const untracked: string[] = []

  for (const file of raw.files) {
    if (!file?.path) continue
    if (file.staged) staged.push(file.path)
    if (file.untracked) untracked.push(file.path)
    if (!file.untracked && (file.unstaged || file.conflicted)) modified.push(file.path)
  }

  return {
    branch: raw.branch,
    staged: unique(staged),
    modified: unique(modified),
    untracked: unique(untracked),
    changed: Number.isFinite(raw.changed)
      ? raw.changed
      : new Set([...staged, ...modified, ...untracked]).size,
    ahead: raw.ahead ?? 0,
    behind: raw.behind ?? 0
  }
}
