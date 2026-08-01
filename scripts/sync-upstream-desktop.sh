#!/usr/bin/env sh

# Import only the Hermes Desktop sources that this fork owns. `upstream` is
# deliberately the complete NousResearch repository; never merge it directly.
set -eu

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree is not clean. Commit or stash changes before syncing." >&2
  exit 1
fi

FORK_BASE=$(git rev-list --max-parents=0 HEAD | head -n 1)

TMP_LOCAL=$(mktemp)
TMP_UPSTREAM=$(mktemp)
trap 'rm -f "$TMP_LOCAL" "$TMP_UPSTREAM"' EXIT

# Get list of files locally modified since fork initialization
git diff --name-only "$FORK_BASE" HEAD -- apps/desktop apps/shared | sort > "$TMP_LOCAL" || true

git fetch upstream main

# Get recent upstream commit log for desktop & shared
UPSTREAM_LOGS=$(git log -n 15 --format="- %h %s (%cr)" upstream/main -- apps/desktop apps/shared 2>/dev/null || echo "- Unable to fetch commit log")

# Execute sync
git restore --source=upstream/main -- apps/desktop apps/shared
npm install --package-lock-only --ignore-scripts --legacy-peer-deps

# Get list of updated files & diff stats
git diff --name-only HEAD -- apps/desktop apps/shared | sort > "$TMP_UPSTREAM" || true
DIFF_STAT=$(git diff --stat HEAD -- apps/desktop apps/shared package-lock.json || true)

# Find intersection (files modified locally AND updated by upstream)
CONFLICTS=$(comm -12 "$TMP_LOCAL" "$TMP_UPSTREAM" 2>/dev/null || true)

# Generate SYNC_SUMMARY.md for PR body / log inspection
cat << EOF > SYNC_SUMMARY.md
## 🔄 Upstream Sync Summary

Automated sync from \`NousResearch/hermes-agent:main\` for \`apps/desktop\` and \`apps/shared\`.

### 📝 Recent Upstream Commits
$UPSTREAM_LOGS

### 📊 Changed Files Stats
\`\`\`text
$DIFF_STAT
\`\`\`

### ⚠️ Conflict & Overlap Check
EOF

if [ -n "$CONFLICTS" ]; then
  cat << EOF >> SYNC_SUMMARY.md
> **Warning**: The following files contain local customizations AND were updated by upstream:
$(echo "$CONFLICTS" | sed 's/^/* /')

*Please review differences in these files carefully.*
EOF
else
  cat << EOF >> SYNC_SUMMARY.md
✅ **No potential file conflicts detected.**
EOF
fi

echo
cat SYNC_SUMMARY.md

echo
echo "Review the diff, test, then commit:"
echo "  git diff --stat"
echo "  git add apps/desktop apps/shared package-lock.json"
echo "  git commit -m 'chore(sync): import upstream Desktop changes'"
