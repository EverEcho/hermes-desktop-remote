import { createContext, useContext, type ReactNode } from 'react'

import type { AppSurface } from './runtime'

const AppSurfaceContext = createContext<AppSurface | null>(null)

export function AppSurfaceProvider({ children, surface }: { children: ReactNode; surface: AppSurface }) {
  return <AppSurfaceContext.Provider value={surface}>{children}</AppSurfaceContext.Provider>
}

/** The bootstrap surface is immutable for a mounted app. Components that need
 * a presentation variant must consult this instead of viewport breakpoints. */
export function useAppSurface(): AppSurface {
  return useContext(AppSurfaceContext) ?? 'mobile'
}
