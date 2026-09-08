export { DesktopApp } from './App'

/**
 * The 469 renderer is migrated into this surface incrementally. This module
 * stays intentionally small so browser and mobile builds never import it
 * unless the desktop surface was selected at bootstrap.
 */
