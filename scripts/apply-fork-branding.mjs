import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')

console.log('🏷️  Applying RHermes branding to synced upstream files...')

// 1. Patch apps/desktop/package.json
const pkgPath = resolve(rootDir, 'apps/desktop/package.json')
try {
  const pkgContent = readFileSync(pkgPath, 'utf8')
  const pkg = JSON.parse(pkgContent)

  if (pkg.build) {
    pkg.build.productName = 'RHermes'
    pkg.build.executableName = 'RHermes'
    pkg.build.appId = 'cn.13bit.rhermes'
    pkg.build.artifactName = 'RHermes-${version}-${os}-${arch}.${ext}'
    
    if (Array.isArray(pkg.build.protocols) && pkg.build.protocols[0]) {
      pkg.build.protocols[0].name = 'RHermes Protocol'
      pkg.build.protocols[0].schemes = ['rhermes']
    }

    if (pkg.build.mac?.extendInfo) {
      pkg.build.mac.extendInfo.CFBundleDisplayName = 'RHermes'
      pkg.build.mac.extendInfo.CFBundleExecutable = 'RHermes'
      pkg.build.mac.extendInfo.CFBundleName = 'RHermes'
      pkg.build.mac.extendInfo.NSAudioCaptureUsageDescription = 'RHermes uses audio capture for voice conversations.'
      pkg.build.mac.extendInfo.NSCameraUsageDescription = 'RHermes uses the camera when a plugin or feature you enable requests it.'
      pkg.build.mac.extendInfo.NSMicrophoneUsageDescription = 'RHermes uses the microphone for voice input and voice conversations.'
    }

    if (pkg.build.dmg) {
      pkg.build.dmg.title = 'Install RHermes'
    }

    if (pkg.build.win) {
      pkg.build.win.legalTrademarks = 'RHermes'
    }

    if (pkg.build.linux) {
      pkg.build.linux.maintainer = '13bit'
      pkg.build.linux.synopsis = 'Native desktop client for a remote Hermes Gateway.'
    }

    if (pkg.build.nsis) {
      pkg.build.nsis.shortcutName = 'RHermes'
      pkg.build.nsis.uninstallDisplayName = 'RHermes'
    }
  }

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  console.log('  ✓ apps/desktop/package.json patched')
} catch (e) {
  console.error('  ✗ Failed to patch package.json:', e.message)
}

// 2. Patch apps/desktop/scripts/set-exe-identity.mjs
const exeScriptPath = resolve(rootDir, 'apps/desktop/scripts/set-exe-identity.mjs')
try {
  let content = readFileSync(exeScriptPath, 'utf8')
  content = content
    .replace(/ProductName:\s*['"]Hermes['"]/g, "ProductName: 'RHermes'")
    .replace(/FileDescription:\s*['"]Hermes['"]/g, "FileDescription: 'RHermes'")
    .replace(/CompanyName:\s*['"]Nous Research['"]/g, "CompanyName: '13bit'")
    .replace(/LegalCopyright:\s*['"]Copyright \(c\) \d{4} Nous Research['"]/g, "LegalCopyright: 'Copyright (c) 2026 13bit'")
    .replace(/\[set-exe-identity\] done — Hermes icon \+ identity stamped/g, '[set-exe-identity] done — RHermes icon + identity stamped')

  writeFileSync(exeScriptPath, content, 'utf8')
  console.log('  ✓ apps/desktop/scripts/set-exe-identity.mjs patched')
} catch (e) {
  console.error('  ✗ Failed to patch set-exe-identity.mjs:', e.message)
}

// 3. Patch apps/desktop/electron/main.ts
const mainTsPath = resolve(rootDir, 'apps/desktop/electron/main.ts')
try {
  let content = readFileSync(mainTsPath, 'utf8')
  content = content
    .replace(/process\.env\.HERMES_DESKTOP_APP_NAME \|\| 'Hermes'/g, "process.env.HERMES_DESKTOP_APP_NAME || 'RHermes'")
    .replace(/app\.setAppUserModelId\('com\.nousresearch\.hermes'\)/g, "app.setAppUserModelId('cn.13bit.rhermes')")
    .replace(/copyright:\s*'Copyright © \d{4} Nous Research'/g, "copyright: 'Copyright © 2026 13bit'")
    .replace(/const HERMES_PROTOCOL = 'hermes'/g, "const HERMES_PROTOCOL = 'rhermes'")

  writeFileSync(mainTsPath, content, 'utf8')
  console.log('  ✓ apps/desktop/electron/main.ts patched')
} catch (e) {
  console.error('  ✗ Failed to patch main.ts:', e.message)
}

// 4. Patch apps/desktop/README.md
const readmePath = resolve(rootDir, 'apps/desktop/README.md')
try {
  let content = readFileSync(readmePath, 'utf8')
  if (content.startsWith('# Hermes Desktop')) {
    content = content.replace('# Hermes Desktop', '# RHermes Desktop')
    writeFileSync(readmePath, content, 'utf8')
    console.log('  ✓ apps/desktop/README.md patched')
  }
} catch (e) {
  console.error('  ✗ Failed to patch desktop README.md:', e.message)
}

console.log('✨ RHermes branding successfully re-applied!')
