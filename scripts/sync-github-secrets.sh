#!/usr/bin/env bash
# Push selected .env.local values → GitHub Actions repository secrets.
# Requires: gh auth login (https://cli.github.com)
#
# Usage:
#   ./scripts/sync-github-secrets.sh
#   ./scripts/sync-github-secrets.sh innovativetrailers-ship-it/forgecinema
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-.env.local}"
REPO="${1:-}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ $ENV_FILE not found"
  exit 1
fi

GH_BIN=""
if command -v gh &>/dev/null; then
  GH_BIN="gh"
elif [[ -x /tmp/gh/gh_2.67.0_macOS_arm64/bin/gh ]]; then
  GH_BIN="/tmp/gh/gh_2.67.0_macOS_arm64/bin/gh"
elif [[ -x /tmp/gh/gh_2.67.0_macOS_amd64/bin/gh ]]; then
  GH_BIN="/tmp/gh/gh_2.67.0_macOS_amd64/bin/gh"
fi

if [[ -z "$GH_BIN" ]]; then
  echo "✗ GitHub CLI (gh) not found. Install: https://cli.github.com"
  exit 1
fi

if ! "$GH_BIN" auth status &>/dev/null; then
  echo "✗ Not logged in. Run: $GH_BIN auth login"
  exit 1
fi

if [[ -z "$REPO" ]]; then
  REPO="$("$GH_BIN" repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
fi
if [[ -z "$REPO" ]]; then
  REPO="innovativetrailers-ship-it/forgecinema"
  echo "→ Using default repo: $REPO"
fi

get_env() {
  node -e "
    const fs = require('fs');
    const key = process.argv[1];
    const lines = fs.readFileSync(process.argv[2], 'utf8').split('\n');
    for (const line of lines) {
      if (!line || line.trim().startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      if (k !== key) continue;
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('\"') && v.endsWith('\"')) || (v.startsWith(\"'\") && v.endsWith(\"'\"))) v = v.slice(1, -1);
      process.stdout.write(v);
      process.exit(0);
    }
    process.exit(1);
  " "$1" "$ENV_FILE" 2>/dev/null || true
}

set_secret() {
  local key="$1" val="$2"
  printf '%s' "$val" | "$GH_BIN" secret set "$key" --repo "$REPO"
}

SECRET_KEYS=(
  FAL_KEY
  FAL_API_KEY
  DATABASE_URL
  R2_ACCOUNT_ID
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_RELEASES_BUCKET
  R2_RELEASES_PREFIX
  VERCEL_TOKEN
  APPLE_ID
  APPLE_APP_SPECIFIC_PASSWORD
  APPLE_TEAM_ID
  CSC_LINK
  CSC_KEY_PASSWORD
  WIN_CSC_LINK
  WIN_CSC_KEY_PASSWORD
)

echo "Syncing secrets to $REPO…"

FAL_KEY_VAL="$(get_env FAL_KEY)"
[[ -z "$FAL_KEY_VAL" ]] && FAL_KEY_VAL="$(get_env FAL_API_KEY)"
if [[ -n "$FAL_KEY_VAL" ]]; then
  set_secret FAL_KEY "$FAL_KEY_VAL"
  echo "  ✓ FAL_KEY"
else
  echo "  · FAL_KEY — skipped (not in $ENV_FILE)"
fi

for key in "${SECRET_KEYS[@]}"; do
  [[ "$key" == "FAL_KEY" || "$key" == "FAL_API_KEY" ]] && continue
  val="$(get_env "$key")"
  if [[ -z "$val" ]]; then
    echo "  · $key — skipped"
    continue
  fi
  if [[ "$key" == "R2_SECRET_ACCESS_KEY" && "$val" == *"://"* ]]; then
    echo "  ✗ $key skipped — value looks like a URL"
    continue
  fi
  set_secret "$key" "$val"
  echo "  ✓ $key"
done

if [[ -f .vercel/repo.json ]]; then
  ORG_ID="$(node -e "console.log(require('./.vercel/repo.json').projects?.[0]?.orgId||'')")"
  PROJ_ID="$(node -e "console.log(require('./.vercel/repo.json').projects?.[0]?.id||'')")"
  if [[ -n "$ORG_ID" ]]; then set_secret VERCEL_ORG_ID "$ORG_ID"; echo "  ✓ VERCEL_ORG_ID (from .vercel/repo.json)"; fi
  if [[ -n "$PROJ_ID" ]]; then set_secret VERCEL_PROJECT_ID "$PROJ_ID"; echo "  ✓ VERCEL_PROJECT_ID (from .vercel/repo.json)"; fi
fi

echo ""
echo "Done."
