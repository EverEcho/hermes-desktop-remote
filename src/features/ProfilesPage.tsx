import { useCallback, useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'

import { $authState, switchProfile } from '@/auth'
import * as api from '@/gateway/api'
import { refreshProfiles } from '@/store/profiles'
import type { ProfileInfo } from '@/types/hermes'
import { Button } from '@/ui/Button'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'
import { Switch } from '@/ui/Switch'
import { useI18n } from '@/i18n'

interface ProfilesPageProps {
  onClose: () => void
  open: boolean
}

/** Remote Gateway profile administration. The page intentionally has no
 * client-local profile directory assumptions: the Gateway owns all profile
 * creation and deletion. */
export function ProfilesPage({ onClose, open }: ProfilesPageProps) {
  const { t } = useI18n()
  const p = t.profiles
  const authState = useStore($authState)
  const [profiles, setProfiles] = useState<ProfileInfo[]>([])
  const [name, setName] = useState('')
  const [cloneFrom, setCloneFrom] = useState('')
  const [withoutSkills, setWithoutSkills] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [soulProfile, setSoulProfile] = useState<string | null>(null)

  const exportProfile = async (profile: ProfileInfo) => {
    if (working) return
    setWorking(true); setError('')
    try {
      const result = await api.exportProfileArchive(profile.name)
      window.prompt(p.exportArchivePath, result.archive)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : p.errors.exportProfile)
    } finally { setWorking(false) }
  }

  const importProfile = async () => {
    if (working) return
    const archive = window.prompt(p.importArchivePath)?.trim()
    if (!archive) return
    const requestedName = window.prompt(p.importNewName)?.trim()
    setWorking(true); setError('')
    try {
      await api.importProfileArchive(archive, requestedName)
      await refresh()
      void refreshProfiles()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : p.errors.importProfile)
    } finally { setWorking(false) }
  }

  const showSetupCommand = async (profile: ProfileInfo) => {
    if (working) return
    setWorking(true); setError('')
    try {
      const result = await api.getProfileSetupCommand(profile.name)
      window.prompt(p.setupCommandTitle(profile.name), result.command)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : p.errors.loadSetupCommand)
    } finally { setWorking(false) }
  }

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api.getProfiles()
      setProfiles(response.profiles)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : p.errors.loadProfiles)
    } finally {
      setLoading(false)
    }
  }, [p.errors.loadProfiles])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  const create = async () => {
    const next = name.trim()
    if (!next || working) return
    setWorking(true)
    setError('')
    try {
      await api.createProfile({ name: next, ...(cloneFrom ? { clone_from: cloneFrom } : {}), ...(withoutSkills ? { no_skills: true } : {}) })
      setName('')
      setCloneFrom('')
      setWithoutSkills(false)
      await refresh()
      void refreshProfiles()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : p.errors.createProfile)
    } finally {
      setWorking(false)
    }
  }

  const select = async (profile: string) => {
    if (working) return
    setWorking(true)
    setError('')
    try {
      await switchProfile(profile)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : p.errors.switchProfile)
    } finally {
      setWorking(false)
    }
  }

  const rename = async (profile: ProfileInfo) => {
    const next = window.prompt(p.renamePrompt, profile.name)?.trim()
    if (!next || next === profile.name || working) return
    setWorking(true)
    setError('')
    try {
      await api.renameProfile(profile.name, next)
      if (authState.status === 'authenticated' && authState.profile === profile.name) {
        await switchProfile(next)
      }
      await refresh()
      void refreshProfiles()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : p.errors.renameProfile)
    } finally {
      setWorking(false)
    }
  }

  const remove = async (profile: ProfileInfo) => {
    if (profile.is_default || working || !window.confirm(p.deleteConfirm(profile.name))) return
    setWorking(true)
    setError('')
    try {
      if (authState.status === 'authenticated' && authState.profile === profile.name) {
        await switchProfile('default')
      }
      await api.deleteProfile(profile.name)
      await refresh()
      void refreshProfiles()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : p.errors.deleteProfile)
    } finally {
      setWorking(false)
    }
  }

  const activeProfile = authState.status === 'authenticated' ? authState.profile : ''

  return (
    <ResponsiveSheet onClose={onClose} open={open} title={p.title}>
      <div className="space-y-3">
        <p className="text-xs leading-relaxed text-(--ui-text-tertiary)">{p.description}</p>
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) px-2.5 py-1.5 text-xs text-(--ui-text-primary) outline-none focus:border-(--ui-accent)"
            disabled={working}
            onChange={event => setName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') void create() }}
            placeholder={p.namePlaceholder}
            value={name}
          />
          <Button disabled={!name.trim() || working} onClick={() => void create()} size="sm">{p.create}</Button>
          <Button disabled={working} onClick={() => void importProfile()} size="sm" variant="secondary">{p.import}</Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select className="rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) px-2.5 py-1.5 text-xs text-(--ui-text-primary)" disabled={working} onChange={event => setCloneFrom(event.target.value)} value={cloneFrom}>
            <option value="">{p.startEmpty}</option>
            {profiles.map(profile => <option key={profile.name} value={profile.name}>{p.cloneFrom(profile.display_name || profile.name)}</option>)}
          </select>
          <label className="flex items-center justify-between rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) px-2.5 py-1.5 text-xs text-(--ui-text-secondary) cursor-pointer select-none">
            <span>{p.noSkills}</span>
            <Switch
              checked={withoutSkills}
              disabled={working}
              onChange={setWithoutSkills}
              size="sm"
            />
          </label>
        </div>
        {error ? <div className="rounded-md bg-(--ui-red)/10 px-2.5 py-2 text-xs text-(--ui-red)">{error}</div> : null}
        <div className="overflow-hidden rounded-lg border border-(--ui-stroke-tertiary)">
          {loading ? <div className="px-3 py-5 text-center text-xs text-(--ui-text-quaternary)">{p.loadingProfiles}</div> : null}
          {!loading && profiles.map(profile => {
            const selected = profile.name === activeProfile
            return (
              <div className="flex items-center gap-2 border-b border-(--ui-stroke-tertiary) px-3 py-2.5 last:border-b-0" key={profile.name}>
                <button className="min-w-0 flex-1 text-left" disabled={working} onClick={() => void select(profile.name)} type="button">
                  <span className="block truncate text-xs font-medium text-(--ui-text-primary)">{profile.display_name || profile.name}</span>
                  <span className="block truncate pt-0.5 text-[0.68rem] text-(--ui-text-quaternary)">{profile.is_default ? p.defaultProfile : profile.path || profile.name}</span>
                </button>
                {selected ? <span className="text-[0.65rem] text-(--ui-accent)">{p.activeBadge}</span> : null}
                <button className="text-[0.68rem] text-(--ui-text-tertiary) hover:text-(--ui-text-primary) disabled:opacity-40" disabled={working} onClick={() => void rename(profile)} type="button">{p.rename}</button>
                <button className="text-[0.68rem] text-(--ui-accent) disabled:opacity-40" disabled={working} onClick={() => setSoulProfile(profile.name)} type="button">{p.soul}</button>
                <button className="text-[0.68rem] text-(--ui-text-tertiary) disabled:opacity-40" disabled={working} onClick={() => void showSetupCommand(profile)} type="button">{p.setup}</button>
                <button className="text-[0.68rem] text-(--ui-text-tertiary) disabled:opacity-40" disabled={working} onClick={() => void exportProfile(profile)} type="button">{p.export}</button>
                {!profile.is_default ? <button className="text-[0.68rem] text-(--ui-red) disabled:opacity-40" disabled={working} onClick={() => void remove(profile)} type="button">{p.delete}</button> : null}
              </div>
            )
          })}
          {!loading && !profiles.length ? <div className="px-3 py-5 text-center text-xs text-(--ui-text-quaternary)">{p.noProfiles}</div> : null}
        </div>
        {soulProfile ? <ProfileSoulEditor onClose={() => setSoulProfile(null)} profileName={soulProfile} /> : null}
      </div>
    </ResponsiveSheet>
  )
}

/** SOUL.md is a profile-owned instruction document stored by the Gateway. */
function ProfileSoulEditor({ onClose, profileName }: { onClose: () => void; profileName: string }) {
  const { t } = useI18n()
  const p = t.profiles
  const c = t.common
  const [content, setContent] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void api.getProfileSoul(profileName).then(result => {
      if (!cancelled) { setContent(result.content); setLoaded(true) }
    }).catch(reason => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : p.errors.loadSoul)
    })
    return () => { cancelled = true }
  }, [p.errors.loadSoul, profileName])

  const save = async () => {
    setSaving(true); setError('')
    try { await api.updateProfileSoul(profileName, content); onClose() } catch (reason) { setError(reason instanceof Error ? reason.message : p.errors.saveSoul) } finally { setSaving(false) }
  }

  return (
    <ResponsiveSheet compact onClose={onClose} open title={`${profileName} · SOUL.md`}>
      <div className="space-y-3">
        {!loaded && !error ? <div className="text-xs text-(--ui-text-quaternary)">{p.loadingSoul}</div> : null}
        <textarea
          className="webhook-input min-h-64 resize-y font-mono text-[0.72rem]"
          disabled={!loaded || saving}
          onChange={event => setContent(event.target.value)}
          placeholder={p.soulPlaceholder}
          value={content}
        />
        {error ? <div className="rounded-md bg-(--ui-red)/10 px-2.5 py-2 text-xs text-(--ui-red)">{error}</div> : null}
        <div className="flex justify-end gap-2">
          <Button disabled={saving} onClick={onClose} size="sm" variant="secondary">{c.cancel}</Button>
          <Button disabled={!loaded || saving} onClick={() => void save()} size="sm">{saving ? p.savingSoul : p.saveSoul}</Button>
        </div>
      </div>
    </ResponsiveSheet>
  )
}
