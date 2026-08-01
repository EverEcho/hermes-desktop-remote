#!/usr/bin/env sh

# Import only the Hermes Desktop sources that this fork owns. `upstream` is
# deliberately the complete NousResearch repository; never merge it directly.
set -eu

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree is not clean. Commit or stash changes before syncing." >&2
  exit 1
fi

# Find the root commit of this fork repository to identify locally modified files
FORK_BASE=$(git rev-list --max-parents=0 HEAD | head -n 1)

TMP_LOCAL=$(mktemp)
TMP_UPSTREAM=$(mktemp)
trap 'rm -f "$TMP_LOCAL" "$TMP_UPSTREAM"' EXIT

# Get list of files locally modified since fork initialization
git diff --name-only "$FORK_BASE" HEAD -- apps/desktop apps/shared | sort > "$TMP_LOCAL" || true

git fetch upstream main
git restore --source=upstream/main -- apps/desktop apps/shared
npm install --package-lock-only --ignore-scripts --legacy-peer-deps

# Get list of files updated by upstream in this sync
git diff --name-only HEAD -- apps/desktop apps/shared | sort > "$TMP_UPSTREAM" || true

# Find intersection (files modified locally AND updated by upstream)
CONFLICTS=$(comm -12 "$TMP_LOCAL" "$TMP_UPSTREAM" 2>/dev/null || true)

echo
if [ -n "$CONFLICTS" ]; then
  echo "⚠️  WARNING: Potential file conflicts/overlaps detected!"
  echo "The following files contain local customizations AND were updated by upstream:"
  echo "$CONFLICTS" | sed 's/^/  - /'
  echo
  echo "Please carefully review git diff for these files before committing!"
else
  echo "Imported Desktop and shared changes from upstream/main with 0 local conflicts."
fi

echo
echo "Review the diff, test, then commit:"
echo "  git diff --stat"
echo "  git add apps/desktop apps/shared package-lock.json"
echo "  git commit -m 'chore(sync): import upstream Desktop changes'"
