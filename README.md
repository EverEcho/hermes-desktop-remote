# Hermes Desktop — Remote-first fork

This repository contains only the Electron Desktop client and its shared
TypeScript transport library from [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent).
It is intended to connect to an already-running remote Hermes Gateway; it does
not contain the Python agent, CLI, TUI, web app, gateway implementation, or
plugins from the upstream monorepo.

## Repository layout

```text
apps/desktop/  Electron + React Desktop application
apps/shared/   Shared JSON-RPC/WebSocket transport code
scripts/       Upstream synchronization helpers
```

`main` is intentionally Desktop-only. Development work happens on feature
branches, currently `codex/remote-first-desktop`.

## Development

Requires Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

The repository's `.npmrc` intentionally enables npm's legacy peer dependency
resolution because the current upstream Desktop dependency set has a known
peer-range mismatch.

The Desktop app can connect to a remote token-authenticated Gateway by setting:

```bash
export HERMES_DESKTOP_REMOTE_URL='https://gateway.example.com'
export HERMES_DESKTOP_REMOTE_TOKEN='your-session-token'
npm run dev
```

For normal use, configure the remote Gateway through the Desktop UI so the
token is stored using the operating system credential store instead of an
environment variable.

## Syncing upstream Desktop changes

The `upstream` remote points to the complete NousResearch repository. Do not
run `git merge upstream/main`: that would reintroduce Python and unrelated
applications. Instead, on a clean Desktop branch run:

```bash
npm run sync:upstream
```

The script fetches `upstream/main`, imports only `apps/desktop` and
`apps/shared`, and regenerates the lockfile for this reduced workspace. Review,
test, and commit the resulting diff.

```bash
git diff --stat
npm run typecheck
npm run test
git add apps/desktop apps/shared package-lock.json
git commit -m "chore(sync): import upstream Desktop changes"
```

When an upstream change requires a new root-level build convention, add the
minimal equivalent here rather than importing the entire upstream workspace.

## Upstream and licensing

This is an independently maintained derivative of Hermes Agent. The upstream
source and license are retained in [LICENSE](LICENSE). Keep the `upstream`
remote so changes can be selectively imported and credited.
