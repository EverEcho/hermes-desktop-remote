#!/usr/bin/env sh

# Import only the Hermes Desktop sources that this fork owns.  `upstream` is
# deliberately the complete NousResearch repository; never merge it directly.
set -eu

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree is not clean. Commit or stash changes before syncing." >&2
  exit 1
fi

git fetch upstream main
git restore --source=upstream/main -- apps/desktop apps/shared
npm install --package-lock-only --ignore-scripts --legacy-peer-deps

echo
echo "Imported Desktop and shared changes from upstream/main. Review the diff, test, then commit:"
echo "  git diff --stat"
echo "  git add apps/desktop apps/shared package-lock.json"
echo "  git commit -m 'chore(sync): import upstream Desktop changes'"
