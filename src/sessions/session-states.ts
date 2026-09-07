import { atom } from 'nanostores'

export type SessionDotState = 'needs-input' | 'working'

/* Per-session live state for sidebar dots (Desktop session-states parity,
 * simplified). Keyed by runtime session id; the runtime→stored mapping is
 * recorded from session.info so sidebar rows (keyed by stored id) resolve. */
export const $sessionStates = atom<Map<string, SessionDotState>>(new Map())

const runtimeToStored = new Map<string, string>()

function keysFor(runtimeId: string): string[] {
  const stored = runtimeToStored.get(runtimeId)

  return stored && stored !== runtimeId ? [runtimeId, stored] : [runtimeId]
}

export function recordSessionMapping(runtimeId: string, storedId: string): void {
  if (!runtimeId || !storedId || runtimeId === storedId) {
    return
  }

  runtimeToStored.set(runtimeId, storedId)

  const states = $sessionStates.get()
  const existing = states.get(runtimeId)

  if (existing && states.get(storedId) !== existing) {
    const next = new Map(states)
    next.set(storedId, existing)
    $sessionStates.set(next)
  }
}

export function setSessionDot(runtimeId: string, state: SessionDotState | null): void {
  if (!runtimeId) {
    return
  }

  const current = $sessionStates.get()
  const next = new Map(current)
  let changed = false

  for (const key of keysFor(runtimeId)) {
    const existing = next.get(key) ?? null

    if (existing !== state) {
      if (state === null) {
        next.delete(key)
      } else {
        next.set(key, state)
      }

      changed = true
    }
  }

  if (changed) {
    $sessionStates.set(next)
  }
}

export function clearSessionDots(): void {
  runtimeToStored.clear()

  if ($sessionStates.get().size > 0) {
    $sessionStates.set(new Map())
  }
}
