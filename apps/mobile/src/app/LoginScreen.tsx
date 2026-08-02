import { useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'

import { $authState, checkGatewayStatus, loginWithToken, startOAuthLogin } from '@/auth'
import { Button, Spinner } from '@/ui/Button'
import { Input } from '@/ui/Input'

interface LoginScreenProps {
  error?: string
}

type ProbeStatus = 'idle' | 'probing' | 'done' | 'error'

export function LoginScreen({ error: externalError }: LoginScreenProps) {
  const authState = useStore($authState)
  const [remoteUrl, setRemoteUrl] = useState('')
  const [remoteToken, setRemoteToken] = useState('')
  const [probeStatus, setProbeStatus] = useState<ProbeStatus>('idle')
  const [needsOAuth, setNeedsOAuth] = useState(false)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const probeSeq = useRef(0)

  const trimmedUrl = remoteUrl.trim()
  const authMode: 'oauth' | 'token' = needsOAuth ? 'oauth' : 'token'
  const authResolved = probeStatus === 'done'
  const canSubmit = authMode === 'oauth' || remoteToken.trim().length > 0
  const displayError = actionError || probeError || externalError

  useEffect(() => {
    const seq = ++probeSeq.current

    if (!trimmedUrl || !/^https?:\/\//i.test(trimmedUrl)) {
      setProbeStatus('idle')
      setNeedsOAuth(false)
      setProbeError(null)

      return
    }

    setProbeStatus('probing')
    setActionError(null)

    const timer = setTimeout(() => {
      checkGatewayStatus(trimmedUrl)
        .then(status => {
          if (seq !== probeSeq.current) {
            return
          }

          setNeedsOAuth(status.authRequired && status.flows.includes('native_pkce'))
          setProbeError(null)
          setProbeStatus('done')
        })
        .catch(err => {
          if (seq !== probeSeq.current) {
            return
          }

          setProbeError(err instanceof Error ? err.message : 'Cannot reach gateway')
          setProbeStatus('error')
        })
    }, 500)

    return () => clearTimeout(timer)
  }, [trimmedUrl])

  async function handleSubmit() {
    if (!canSubmit || submitting) {
      return
    }

    setSubmitting(true)
    setActionError(null)

    try {
      if (authMode === 'oauth') {
        await startOAuthLogin(trimmedUrl)
      } else {
        await loginWithToken(trimmedUrl, remoteToken.trim())
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setSubmitting(false)
    }
  }

  const signedIn = authState.status === 'authenticated'

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-(--ui-bg-chrome) p-5">
      <div className="ambient-wash pointer-events-none absolute inset-0" />

      <div className="rise relative z-10 w-full max-w-[22rem] rounded-xl border border-(--stroke-nous) bg-(--ui-bg-card) p-6 shadow-(--shadow-nous)">
        <div className="flex items-start gap-3.5">
          <div className="size-11 shrink-0 rounded-lg bg-white shadow-sm grid place-items-center">
            <span className="text-(--theme-primary) font-bold text-lg leading-none">R</span>
          </div>
          <div className="min-w-0 pt-0.5">
            <h1 className="text-lg font-semibold tracking-tight text-(--ui-text-primary)">Connect to a gateway</h1>
            <p className="mt-1 text-xs leading-relaxed text-(--ui-text-tertiary)">
              The same account, profiles and sessions as RHermes Desktop.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3.5" style={{ animationDelay: '70ms' }}>
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-(--ui-text-tertiary)">Gateway URL</span>
            <Input
              autoComplete="url"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="https://gateway.example.com"
              value={remoteUrl}
              onChange={e => setRemoteUrl(e.target.value)}
            />
            {probeStatus === 'probing' ? (
              <span className="flex items-center gap-1.5 text-xs text-(--ui-text-tertiary)">
                <Spinner className="size-3" />
                Checking gateway…
              </span>
            ) : probeStatus === 'idle' ? (
              <span className="text-xs text-(--ui-text-tertiary)">The full https:// address of your gateway.</span>
            ) : null}
          </label>

          {authResolved && authMode === 'oauth' ? (
            <div className="rounded-md border border-(--ui-stroke-tertiary) p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-(--ui-text-primary)">Authentication</div>
                  <p className="mt-0.5 text-[0.6875rem] leading-snug text-(--ui-text-tertiary)">
                    {signedIn ? 'Signed in to your identity provider.' : 'Sign in to your identity provider to continue.'}
                  </p>
                </div>
                {signedIn ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-(--ui-green)">
                    <CheckIcon />
                    Connected
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {authResolved && authMode === 'token' ? (
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-(--ui-text-tertiary)">Session token</span>
              <Input
                autoComplete="off"
                autoCapitalize="none"
                type="password"
                placeholder="Paste your session token"
                value={remoteToken}
                onChange={e => setRemoteToken(e.target.value)}
                className="font-mono"
              />
              <span className="text-xs text-(--ui-text-tertiary)">Stored encrypted on this device.</span>
            </label>
          ) : null}

          {displayError ? (
            <div className="flex items-start gap-2 text-xs text-(--ui-red)">
              <AlertIcon />
              <span className="leading-snug">{displayError}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-end" style={{ animationDelay: '140ms' }}>
          <Button size="lg" disabled={!authResolved || !canSubmit || submitting} onClick={() => void handleSubmit()}>
            {submitting ? <Spinner className="size-3.5" /> : null}
            {authMode === 'oauth' ? 'Sign in' : 'Connect'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg className="mt-0.5 size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  )
}
