import { describe, expect, it } from 'vitest'

import type { GitStatusResponse } from '@/types/hermes'
import { normalizeGitStatus } from '@/workspace/git-status'

describe('normalizeGitStatus', () => {
  it('adapts the original HermesRepoStatus response into workspace groups', () => {
    const status: GitStatusResponse = {
      branch: 'feature/review',
      defaultBranch: 'main',
      detached: false,
      ahead: 2,
      behind: 1,
      staged: 2,
      unstaged: 2,
      untracked: 1,
      conflicted: 1,
      changed: 4,
      added: 12,
      removed: 3,
      files: [
        { path: 'both.ts', staged: true, unstaged: true, untracked: false, conflicted: false },
        { path: 'staged.ts', staged: true, unstaged: false, untracked: false, conflicted: false },
        { path: 'new.ts', staged: false, unstaged: false, untracked: true, conflicted: false },
        { path: 'conflict.ts', staged: false, unstaged: false, untracked: false, conflicted: true }
      ]
    }

    expect(normalizeGitStatus(status)).toEqual({
      branch: 'feature/review',
      staged: ['both.ts', 'staged.ts'],
      modified: ['both.ts', 'conflict.ts'],
      untracked: ['new.ts'],
      changed: 4,
      ahead: 2,
      behind: 1
    })
  })

  it('keeps the legacy array response usable during migration', () => {
    expect(normalizeGitStatus({
      branch: 'main',
      staged: ['a.ts'],
      modified: ['b.ts'],
      untracked: ['c.ts']
    })).toMatchObject({
      staged: ['a.ts'],
      modified: ['b.ts'],
      untracked: ['c.ts'],
      changed: 3
    })
  })
})
