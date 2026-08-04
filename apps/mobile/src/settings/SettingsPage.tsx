import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import * as api from '@/gateway/api'
import { useI18n } from '@/i18n'
import { BottomSheet } from '@/ui/BottomSheet'
import { useIsDesktop } from '@/ui/useMediaQuery'
import { cn } from '@/ui/utils'

import { SECTIONS } from './constants'
import {
  ArchiveIcon,
  BarChartIcon,
  BellIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  GlobeIcon,
  type IconComponent,
  InfoIcon,
  KeyboardIcon,
  KeyRoundIcon,
  PackageIcon,
  RefreshIcon,
  UploadIcon,
  XIcon,
  ZapIcon
} from './icons'
import { AppearancePage } from './pages/AppearancePage'
import { ConfigSectionPage } from './pages/ConfigSectionPage'
import { KeysPage } from './pages/KeysPage'
import { MiscPages } from './pages/MiscPages'
import { ModelsPage } from './pages/ModelsPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { ProvidersPage } from './pages/ProvidersPage'
import { SessionsPage } from './pages/SessionsPage'
import { Caption } from './ui'

type SettingsView =
  | 'about'
  | 'billing'
  | 'gateway'
  | 'keybinds'
  | 'keys'
  | 'notifications'
  | 'plugins'
  | 'providers'
  | 'root'
  | 'sessions'
  | `config:${string}`

interface SettingsPageProps {
  open: boolean
  onClose: () => void
}

export function SettingsPage({ open, onClose }: SettingsPageProps) {
  const { t } = useI18n()
  const isDesktop = useIsDesktop()
  const [view, setView] = useState<SettingsView>('root')
  const [notice, setNotice] = useState('')
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const close = () => {
    setView('root')
    onClose()
  }

  useEffect(() => {
    if (!open || !isDesktop) {
      return
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
      }
    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [open, isDesktop])

  if (!open) {
    return null
  }

  const exportConfig = async () => {
    try {
      const config = await api.getConfigRecord()
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')

      a.href = url
      a.download = 'hermes-config.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t.settings.footer.exportFailed)
    }
  }

  const importConfig = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      try {
        const config = JSON.parse(String(reader.result)) as Record<string, unknown>

        void api.saveConfig(config).then(() => {
          setNotice(t.settings.footer.imported)
          setView('root')
        })
      } catch {
        setNotice(t.settings.footer.invalidJson)
      }
    }

    reader.readAsText(file)
    event.target.value = ''
  }

  const resetConfig = async () => {
    if (!window.confirm(t.settings.footer.resetConfirm)) {
      return
    }

    try {
      await api.saveConfig(await api.getConfigDefaults())
      setNotice(t.settings.footer.imported)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t.settings.footer.resetFailed)
    }
  }

  const navItems: { icon: IconComponent; label: string; view: SettingsView }[] = [
    ...SECTIONS.map(section => ({
      icon: section.icon,
      label: t.settings.sections[section.id as keyof typeof t.settings.sections],
      view: `config:${section.id}` as SettingsView
    })),
    { icon: BellIcon, label: t.settings.nav.notifications, view: 'notifications' },
    { icon: BarChartIcon, label: t.settings.nav.billing, view: 'billing' },
    { icon: ZapIcon, label: t.settings.nav.providers, view: 'providers' },
    { icon: GlobeIcon, label: t.settings.nav.gateway, view: 'gateway' },
    { icon: KeyboardIcon, label: t.settings.nav.keybinds, view: 'keybinds' },
    { icon: KeyRoundIcon, label: t.settings.nav.apiKeys, view: 'keys' },
    { icon: PackageIcon, label: t.settings.nav.plugins, view: 'plugins' },
    { icon: ArchiveIcon, label: t.settings.nav.archivedChats, view: 'sessions' },
    { icon: InfoIcon, label: t.settings.nav.about, view: 'about' }
  ]

  const activeView: SettingsView = view === 'root' ? 'config:model' : view
  const activeItem = navItems.find(item => item.view === activeView)

  const renderContent = (target: SettingsView) => {
    if (target === 'config:model') {
      return (
        <>
          <ModelsPage />
          <ConfigSectionPage sectionId="model" />
        </>
      )
    }

    if (target === 'config:appearance') {
      return <AppearancePage />
    }

    if (target.startsWith('config:')) {
      return <ConfigSectionPage sectionId={target.slice('config:'.length)} />
    }

    if (target === 'notifications') {
      return <NotificationsPage />
    }

    if (target === 'providers') {
      return <ProvidersPage />
    }

    if (target === 'keys') {
      return <KeysPage />
    }

    if (target === 'sessions') {
      return <SessionsPage />
    }

    if (target === 'about' || target === 'billing' || target === 'gateway' || target === 'keybinds' || target === 'plugins') {
      return <MiscPages view={target} />
    }

    return null
  }

  const noticeBanner = notice && (
    <Caption className="mb-3 rounded-md bg-(--ui-bg-quaternary) px-2.5 py-1.5">{notice}</Caption>
  )

  const importInput = (
    <input accept=".json,application/json" className="hidden" onChange={importConfig} ref={importInputRef} type="file" />
  )

  if (isDesktop) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
        <div className="absolute inset-0 bg-black/40" onClick={close} />
        <div className="relative flex h-[min(54rem,100%)] w-[min(66rem,100%)] overflow-hidden rounded-xl border border-(--stroke-nous) shadow-(--shadow-nous) bg-(--ui-bg-elevated)">
          <div className="flex w-56 shrink-0 flex-col border-r border-(--ui-stroke-tertiary) bg-(--ui-bg-chrome)">
            <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
              <span className="text-sm font-semibold text-(--ui-text-primary)">{t.settings.title}</span>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar px-2 pb-2">
              {navItems.map(item => (
                <button
                  className={cn(
                    'w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors',
                    activeView === item.view
                      ? 'bg-(--ui-row-active-background) text-(--ui-text-primary) font-medium'
                      : 'text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)'
                  )}
                  key={item.view}
                  onClick={() => setView(item.view)}
                  type="button"
                >
                  <item.icon className="size-4 shrink-0 text-(--ui-text-tertiary)" />
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 border-t border-(--ui-stroke-tertiary) px-3 py-2 shrink-0">
              <DesktopFooterButton label={t.settings.footer.exportConfig} onClick={() => void exportConfig()}>
                <DownloadIcon className="size-4" />
              </DesktopFooterButton>
              <DesktopFooterButton label={t.settings.footer.importConfig} onClick={() => importInputRef.current?.click()}>
                <UploadIcon className="size-4" />
              </DesktopFooterButton>
              <DesktopFooterButton label={t.settings.footer.resetToDefaults} onClick={() => void resetConfig()}>
                <RefreshIcon className="size-4" />
              </DesktopFooterButton>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between px-6 pt-4 pb-1 shrink-0">
              <span className="text-sm font-semibold text-(--ui-text-primary)">{activeItem?.label}</span>
              <button
                className="size-7 grid place-items-center rounded-[4px] text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)"
                onClick={close}
                title={t.common.close}
                type="button"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar px-6 pb-6">
              {noticeBanner}
              {renderContent(activeView)}
            </div>
          </div>
          {importInput}
        </div>
      </div>
    )
  }

  return (
    <BottomSheet open={open} onClose={close} title={t.settings.title} fullScreen>
      {view !== 'root' && (
        <button
          className="sticky top-0 z-10 -mx-4 px-4 py-2 mb-1 flex items-center gap-1 bg-(--ui-bg-elevated) text-(--conversation-text-font-size) text-(--ui-text-secondary) active:bg-(--chrome-action-hover)"
          onClick={() => setView('root')}
          type="button"
        >
          <ChevronLeftIcon className="size-4" />
          <span className="truncate">{navItems.find(item => item.view === view)?.label ?? t.settings.title}</span>
        </button>
      )}

      {noticeBanner}

      {view === 'root' ? (
        <div>
          {navItems.map(item => (
            <button
              className="w-full flex items-center gap-3 py-3 min-h-[2.9rem] active:bg-(--ui-row-active-background) rounded-lg px-1 text-left"
              key={item.view}
              onClick={() => setView(item.view)}
              type="button"
            >
              <item.icon className="size-4 shrink-0 text-(--ui-text-tertiary)" />
              <span className="flex-1 min-w-0 truncate text-(--conversation-text-font-size) text-(--ui-text-primary)">
                {item.label}
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-(--ui-text-quaternary)" />
            </button>
          ))}

          <div className="mt-4 pt-3 border-t border-(--ui-stroke-tertiary) flex items-center gap-2">
            <FooterButton label={t.settings.footer.exportConfig} onClick={() => void exportConfig()}>
              <DownloadIcon className="size-4" />
            </FooterButton>
            <FooterButton label={t.settings.footer.importConfig} onClick={() => importInputRef.current?.click()}>
              <UploadIcon className="size-4" />
            </FooterButton>
            <FooterButton label={t.settings.footer.resetToDefaults} onClick={() => void resetConfig()}>
              <RefreshIcon className="size-4" />
            </FooterButton>
          </div>
          {importInput}
        </div>
      ) : (
        renderContent(view)
      )}
    </BottomSheet>
  )
}

function FooterButton({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className="flex items-center gap-1.5 rounded-[var(--btn-radius)] px-2.5 py-1.5 text-(--conversation-caption-font-size) text-(--ui-text-tertiary) active:bg-(--chrome-action-hover)"
      onClick={onClick}
      type="button"
    >
      {children}
      {label}
    </button>
  )
}

function DesktopFooterButton({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className="grid size-7 place-items-center rounded-[4px] text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  )
}
