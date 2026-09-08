import { atom } from 'nanostores'
import { $gateway, $connectionState } from '@/gateway'

export type ApprovalMode = 'manual' | 'off' | 'smart'

const STORAGE_KEY = 'rhermes.approval-mode'
const VALID_MODES = new Set<ApprovalMode>(['manual', 'smart', 'off'])

function getInitialApprovalMode(): ApprovalMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && VALID_MODES.has(saved as ApprovalMode)) {
      return saved as ApprovalMode
    }
  } catch {
    // ignore
  }
  return 'smart'
}

export const $approvalMode = atom<ApprovalMode>(getInitialApprovalMode())

export async function setApprovalMode(mode: ApprovalMode): Promise<void> {
  $approvalMode.set(mode)
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // ignore
  }

  const gateway = $gateway.get()
  const state = $connectionState.get()
  if (gateway && state === 'open') {
    try {
      await gateway.request('config.set', {
        key: 'approvals.mode',
        value: mode
      })
    } catch {
      // ignore
    }
  }
}

export async function syncApprovalMode(): Promise<ApprovalMode> {
  const gateway = $gateway.get()
  const state = $connectionState.get()
  if (gateway && state === 'open') {
    try {
      const res = (await gateway.request('config.get', { key: 'approvals.mode' })) as { value?: string }
      if (res && typeof res.value === 'string' && VALID_MODES.has(res.value as ApprovalMode)) {
        const mode = res.value as ApprovalMode
        $approvalMode.set(mode)
        try {
          localStorage.setItem(STORAGE_KEY, mode)
        } catch {
          // ignore
        }
        return mode
      }
    } catch {
      // ignore
    }
  }
  return $approvalMode.get()
}
