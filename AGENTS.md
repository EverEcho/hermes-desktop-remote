# RHermes AGENTS.md

## Project

Single-page React client for a remote Hermes Gateway. Targets: web (Vite H5), iOS/Android (Capacitor), desktop (Tauri). No backend or Gateway in this repo.

## Commands

```bash
npm run dev                # Vite dev server on 5175 (0.0.0.0)
npm run check              # typecheck + lint + test (required before PR)
npm run build              # tsc --noEmit + vite build → dist/
npm run preview            # serve dist/ on 127.0.0.1:4175
npm run test               # vitest run (src/**/*.test.ts)
```

Native one-time setup (keep generated projects in VCS):
```bash
npm run build
npm run cap:add:ios        # generates ios/
npm run cap:add:android    # generates android/
npm run cap:tauri           # generates/updates Tauri project
npm run cap:sync           # sync web assets into native projects
```

Tauri desktop build:
```bash
npm run tauri:build        # build frontend, sync into src-tauri/, build installer
```

## Architecture

- **Entry**: `src/main.tsx` → `src/bootstrap/RootApp.tsx` lazy-loads `src/desktop/App.tsx` or `src/mobile/App.tsx`.
- **Surface**: `desktop` vs `mobile` UI is resolved once at bootstrap (`src/bootstrap/runtime.ts`). Tauri is always desktop; Capacitor iOS/Android always mobile. Browser defaults to desktop when viewport ≥768px with fine pointer, but surface is *persistent for the session* and does not switch on resize.
- **Override surface**: query param `?surface=desktop|mobile`, env `VITE_APP_SURFACE`, or localStorage key `rhermes.surface`.
- **Path alias**: `@` → `./src` (configured in vite, tsconfig, vitest).
- **State**: nanostores (`@/nanostores/react`). Gateway lifecycle lives in `src/core/gateway/useGatewayBootstrap.ts`; native adapters in `src/native/`.

## Dev Server Proxy

Vite does NOT serve the Gateway. In dev, the browser must talk to Vite (port 5175). Enter the *real* Gateway URL in the login screen. Vite middleware proxies `/api`, `/auth`, `/login` (HTTP + WS) to that Gateway.

- Dev proxy rewrites upstream cookies: strips `Domain=...` and `Secure` so HTTP dev works.
- In production H5, use Nginx same-origin proxy to the Gateway (see `doc/mobile-h5-nginx-deployment.md`). Do not use the dev proxy shape in production.

## Native OAuth

Mobile uses an embedded loopback WebView redirect: `http://127.0.0.1:<random-port>/oauth/callback`. No local server required. Desktop/Tauri also uses loopback via `src/native/oauth-webview.ts`.

## Testing

- Vitest, node environment, `src/**/*.test.ts`, 10s timeout.
- `src/test/` contains contract tests (OAuth, token expiry, session isolation).
- ESLint relaxes `@typescript-eslint/no-explicit-any` for test files.
- Run `npm run check` (lint + typecheck + test) before committing.

## Style / Tooling

- TypeScript strict mode. React 19, Tailwind v4 (no PostCSS plugins beyond the Vite plugin).
- ESLint (`eslint.config.mjs`) warns on `any`, warns on `console` (except `warn`/`error`), ignores `dist/`, `android/`, `ios/`, `node_modules/`.
- `tsconfig.json` includes `src` only; excludes `android`, `ios`.

## Environment

- Node 22.22.2 (pinned in `.vfox.toml`). CI uses `npm ci` + `npm run check` + `npm run build`.
- No `.env` required. The Gateway URL is entered at runtime in the login UI.

## 原来项目参考
../hermes-source-code/