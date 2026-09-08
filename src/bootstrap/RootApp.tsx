import { lazy, Suspense } from 'react'

import type { AppSurface } from './runtime'
import { AppSurfaceProvider } from './surface-context'

const DesktopApp = lazy(async () => {
  const module = await import('@/desktop')
  return { default: module.DesktopApp }
})

const MobileApp = lazy(async () => {
  const module = await import('@/mobile')
  return { default: module.MobileApp }
})

export function RootApp({ surface }: { surface: AppSurface }) {
  const Surface = surface === 'desktop' ? DesktopApp : MobileApp

  return (
    <AppSurfaceProvider surface={surface}>
      <Suspense fallback={<SurfaceBootPlaceholder />}>
        <Surface />
      </Suspense>
    </AppSurfaceProvider>
  )
}

function SurfaceBootPlaceholder() {
  return (
    <div className="flex h-full items-center justify-center bg-(--ui-bg-chrome)" aria-label="Loading RHermes">
      <span className="size-1.5 rounded-full bg-(--ui-accent) animate-pulse" />
    </div>
  )
}
