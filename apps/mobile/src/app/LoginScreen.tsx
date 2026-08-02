import { useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'

import { $authState, checkGatewayStatus, loginWithCookie, loginWithToken, startOAuthLogin } from '@/auth'
import { Button, Spinner } from '@/ui/Button'
import { Input } from '@/ui/Input'
import { isNativePlatform } from '@/native'
import { gatewayTargetHeaders, resolveGatewayRequestUrl } from '@/gateway/request-url'

interface LoginScreenProps {
  error?: string
  initialGatewayUrl?: string
  onClose?: () => void
  open: boolean
}

type Probe = { authMode: 'oauth' | 'token'; providers: Array<{ name: string; displayName: string; supportsPassword: boolean }> }

export function LoginScreen({ error: externalError, initialGatewayUrl = '', onClose, open }: LoginScreenProps) {
  const authState = useStore($authState)
  const [remoteUrl, setRemoteUrl] = useState(() => initialGatewayUrl || window.sessionStorage.getItem('rhermes.pending_gateway_url') || '')
  const [remoteToken, setRemoteToken] = useState('')
  const [probe, setProbe] = useState<Probe | null>(null)
  const [probing, setProbing] = useState(false)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [testing, setTesting] = useState(false)
  const [applying, setApplying] = useState(false)
  const [tested, setTested] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const probeSeq = useRef(0)

  const url = remoteUrl.trim()
  const tokenOnly = false
  // H5 is a token-testing surface: let the user enter the token first. The
  // background probe is diagnostic only and must not replace the form with an
  // OAuth/cookie warning before the user has attempted authentication.
  const authMode = !isNativePlatform() ? 'cookie' : probe?.authMode ?? null
  const passwordLogin = Boolean(probe?.providers.length && probe.providers.every(provider => provider.supportsPassword))
  const oauthConnected = authState.status === 'authenticated' && authState.authMode === 'oauth' && authState.gatewayUrl === url
  const cookieConnected = authState.status === 'authenticated' && authState.authMode === 'cookie' && authState.gatewayUrl === url
  const canTest = Boolean(url && authMode && (authMode === 'oauth' ? oauthConnected : authMode === 'cookie' ? cookieConnected || url : remoteToken.trim()))
  const canApply = tested && !applying

  useEffect(() => {
    if (!open) return
    setRemoteUrl(initialGatewayUrl || window.sessionStorage.getItem('rhermes.pending_gateway_url') || '')
    setRemoteToken('')
    setProbe(null)
    setProbeError(null)
    setActionError(null)
    setSuccess(null)
    setTested(false)
  }, [initialGatewayUrl, open])

  useEffect(() => {
    const seq = ++probeSeq.current
    if (!/^https?:\/\//i.test(url)) {
      setProbe(null)
      setProbeError(null)
      setProbing(false)
      return
    }
    setProbing(true)
    const timer = window.setTimeout(() => {
      void checkGatewayStatus(url).then(result => {
        if (seq !== probeSeq.current) return
        setProbe(result)
        setProbeError(null)
      }).catch(error => {
        if (seq === probeSeq.current) {
          setProbe(null)
          setProbeError(error instanceof Error ? error.message : 'Could not reach this gateway.')
        }
      }).finally(() => {
        if (seq === probeSeq.current) setProbing(false)
      })
    }, 500)
    return () => window.clearTimeout(timer)
  }, [url])

  const invalidate = () => {
    setActionError(null)
    setSuccess(null)
    setTested(false)
  }

  const signIn = async () => {
    if (!url) return
    if (!isNativePlatform()) {
      window.sessionStorage.setItem('rhermes.pending_gateway_url', url)
      window.location.assign(`${resolveGatewayRequestUrl(url)}/login?__gateway_target=${encodeURIComponent(url)}&next=${encodeURIComponent(window.location.href)}`)
      return
    }
    setSigningIn(true)
    setActionError(null)
    await startOAuthLogin(url)
    // Browser.open returns after presentation; completion is observed from the
    // validated app callback above, exactly as Desktop waits for its login window.
    setSigningIn(false)
  }

  const testConnection = async () => {
    if (!canTest || !authMode) return
    setTesting(true); setActionError(null); setSuccess(null); setTested(false)
    try {
      if (authMode === 'cookie') {
        const response = await fetch(`${resolveGatewayRequestUrl(url)}/api/sessions?limit=1&offset=0&min_messages=1&archived=exclude&order=recent`, { credentials: 'include', headers: gatewayTargetHeaders(url) })
        if (!response.ok) throw new Error(`Test failed (${response.status})`)
        // A successful cookie probe is the browser-login completion signal.
        // Persist the connection state immediately so the Authentication row
        // changes to "Connected" before the user applies the connection.
        await loginWithCookie(url)
      } else if (authMode === 'token') {
        const response = await fetch(`${resolveGatewayRequestUrl(url)}/api/sessions?limit=1&offset=0&min_messages=1&archived=exclude&order=recent`, { headers: { 'X-Hermes-Session-Token': remoteToken.trim(), ...gatewayTargetHeaders(url) } })
        if (!response.ok) throw new Error(`Test failed (${response.status})`)
      }
      setSuccess(`Connected to ${url}.`)
      setTested(true)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Test failed')
    } finally { setTesting(false) }
  }

  const apply = async () => {
    if (!canApply || !authMode) return
    setApplying(true); setActionError(null)
    try {
      if (authMode === 'cookie') await loginWithCookie(url)
      else if (authMode === 'token') await loginWithToken(url, remoteToken.trim())
      onClose?.()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not apply connection')
    } finally { setApplying(false) }
  }

  if (!open) return null
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--ui-base)_18%,transparent)] p-4 backdrop-blur-sm">
    <div className="flex w-full max-w-xl flex-col rounded-xl border border-(--stroke-nous) bg-(--ui-bg-card) p-5 shadow-(--shadow-nous) sm:p-8">
      <div className="flex items-start gap-3 sm:gap-4">
        <span className="size-10 shrink-0 overflow-hidden rounded-md bg-white sm:size-11"><img alt="" className="size-full object-contain" src="/nous-girl.jpg" /></span>
        <div className="min-w-0"><h2 className="text-base font-semibold tracking-tight sm:text-xl">Connect to existing Hermes</h2><p className="mt-1 text-xs text-(--ui-text-tertiary) sm:text-sm">{tokenOnly ? 'Enter your gateway URL and session token to test Hermes in this browser.' : 'Enter your gateway URL. Hermes Desktop will detect whether it needs a token or browser sign-in.'}</p></div>
      </div>
      <div className="mt-5 grid gap-4 sm:mt-6">
        <label className="grid gap-1.5"><span className="text-xs font-medium text-(--ui-text-tertiary)">Gateway URL</span><Input disabled={applying} placeholder="https://gateway.example.com/hermes" value={remoteUrl} onChange={event => { invalidate(); setRemoteUrl(event.target.value) }} /><span className="text-xs text-(--ui-text-tertiary)">Use the base URL of the Hermes gateway, including https:// when remote.</span></label>
        {probing ? <div className="flex items-center gap-2 text-xs text-(--ui-text-tertiary)"><Spinner className="size-3" />Checking gateway…</div> : null}
        {probeError ? <Notice text={probeError} error /> : null}
        {authMode === 'oauth' || authMode === 'cookie' ? <div className="rounded-[var(--btn-radius)] border border-(--ui-stroke-tertiary) p-3"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-medium">Authentication</div><p className="mt-1 text-xs text-(--ui-text-tertiary)">{oauthConnected || cookieConnected ? 'Browser sign-in completed.' : passwordLogin ? 'Sign in with Username & Password before testing this gateway.' : 'Sign in with your browser before testing this gateway.'}</p></div>{oauthConnected || cookieConnected ? <span className="text-sm text-(--theme-primary)">✓&nbsp; Connected</span> : <Button disabled={signingIn || applying} size="sm" onClick={() => void signIn()}>{signingIn ? <Spinner className="size-3" /> : <span aria-hidden="true">↪</span>} Sign in</Button>}</div></div> : null}
        {authMode === 'token' ? <label className="grid gap-1.5"><span className="text-xs font-medium text-(--ui-text-tertiary)">Session token</span><Input disabled={applying} type="password" placeholder="Paste your session token" value={remoteToken} onChange={event => { invalidate(); setRemoteToken(event.target.value) }} className="font-mono" /><span className="text-xs text-(--ui-text-tertiary)">{tokenOnly ? 'Kept only for this browser tab.' : 'Stored securely on this device.'}</span></label> : null}
        {actionError || externalError ? <Notice text={actionError || externalError || ''} error /> : null}
        {success ? <Notice text={success} /> : null}
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:mt-7 sm:flex-row sm:items-center sm:justify-between"><Button disabled={applying} onClick={onClose} size="sm" variant="ghost">Back</Button><div className="flex justify-end gap-2"><Button disabled={testing || applying || !canTest} onClick={() => void testConnection()} size="sm" variant="secondary">{testing ? <Spinner className="size-3" /> : null}Test connection</Button><Button disabled={!canApply} onClick={() => void apply()} size="sm">{applying ? <Spinner className="size-3" /> : null}Apply and reconnect</Button></div></div>
    </div>
  </div>
}

function Notice({ text, error = false }: { text: string; error?: boolean }) { return <div className={error ? 'text-xs text-(--ui-red)' : 'text-xs text-(--theme-primary)'}>{error ? '!' : '✓'}&nbsp; {text}</div> }
