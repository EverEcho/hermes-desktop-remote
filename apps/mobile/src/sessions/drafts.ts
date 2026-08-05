const STORAGE_KEY = 'rhermes.mobile.drafts'

type DraftMap = Record<string, string>

function loadDrafts(): DraftMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (raw) {
      const parsed = JSON.parse(raw) as DraftMap

      if (parsed && typeof parsed === 'object') {
        return parsed
      }
    }
  } catch {
    // storage unavailable
  }

  return {}
}

function persist(drafts: DraftMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts))
  } catch {
    // storage unavailable
  }
}

export function getDraft(sessionId: string): string {
  return loadDrafts()[sessionId] ?? ''
}

export function setDraft(sessionId: string, text: string): void {
  const drafts = loadDrafts()

  if (text.trim()) {
    if (drafts[sessionId] === text) {
      return
    }

    drafts[sessionId] = text
  } else {
    if (!(sessionId in drafts)) {
      return
    }

    delete drafts[sessionId]
  }

  persist(drafts)
}
