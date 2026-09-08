# RHermes

RHermes is a mobile-first iOS, Android, macOS, Windows, Linux, and Web client
for an already-running Hermes Gateway. The repository contains only the
client; it does not bundle or start the Python agent, CLI, TUI, or Gateway.

## Requirements

- Node.js 22.22.2 (pinned in `.vfox.toml`)
- A reachable Hermes Gateway
- Xcode for iOS builds
- Android Studio, Android SDK, and JDK for Android builds
- Rust and the current platform's Tauri prerequisites for desktop builds

## Development

```bash
npm install
npm run dev
```

The development server listens on port 5175. Enter the real Gateway URL in the
login screen; the Vite middleware proxies HTTP and WebSocket traffic during
local development.

## Verification

```bash
npm run check
npm run build
```

## Native projects

Generate each native project once, then keep it in version control:

```bash
npm run build
npm run cap:add:ios
npm run cap:add:android
npm run cap:sync
```

Open the generated projects with `npm run cap:ios` or
`npm run cap:android`. Native version numbers, signing, store metadata, and
store update integration live in those projects.

## Desktop with Tauri

The desktop app uses the Capawesome Capacitor Tauri platform, so it shares the
same Capacitor runtime and frontend as iOS and Android. `Capacitor.getPlatform()`
returns `tauri` in desktop builds.

```bash
npm run cap:tauri
npm run tauri:build
```

`tauri:build` builds the frontend, synchronizes it into `src-tauri/`, and
creates the native installer for the current operating system. Tauri uses the
system webview and does not bundle the local Hermes Gateway or Python agent.

## Web deployment

`npm run build` writes the static app to `dist/`. See
[`doc/mobile-h5-nginx-deployment.md`](doc/mobile-h5-nginx-deployment.md) for a
same-origin Gateway proxy example.

The Web build can also be installed as a desktop PWA. Native desktop packages
are produced by the Tauri platform under `src-tauri/`.

## Distribution

- iOS binary updates are distributed through the App Store or TestFlight.
- Google Play builds can use Play In-App Updates (flexible or immediate).
- Web/PWA deployments update their static assets through the hosting layer.

## Upstream and licensing

RHermes is an independently maintained derivative of Hermes Agent. The
upstream project and license are retained in [`LICENSE`](LICENSE).
