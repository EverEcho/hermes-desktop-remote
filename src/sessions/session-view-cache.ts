import type { MobileMessage } from '@/types/mobile'

export interface SessionViewSnapshot {
  awaitingResponse: boolean
  busy: boolean
  cwd: string
  fast: boolean
  hasEarlier: boolean
  messages: MobileMessage[]
  model: string
  provider: string
  reasoningEffort: string
  runtimeId: string | null
  title: string | null
  transcriptOffset: number
}

/** Small LRU of hot conversation views. Durable truth remains on the Gateway;
 * this only avoids blanking a tab while resume/transcript revalidation runs. */
export class SessionViewCache {
  private readonly snapshots = new Map<string, SessionViewSnapshot>()

  constructor(private readonly capacity = 12) {}

  clear(): void {
    this.snapshots.clear()
  }

  get(sessionId: string): SessionViewSnapshot | undefined {
    const snapshot = this.snapshots.get(sessionId)
    if (!snapshot) return undefined
    this.snapshots.delete(sessionId)
    this.snapshots.set(sessionId, snapshot)
    return snapshot
  }

  set(sessionId: string, snapshot: SessionViewSnapshot): void {
    this.snapshots.delete(sessionId)
    this.snapshots.set(sessionId, snapshot)
    while (this.snapshots.size > this.capacity) {
      const oldest = this.snapshots.keys().next().value
      if (oldest === undefined) break
      this.snapshots.delete(oldest)
    }
  }
}
