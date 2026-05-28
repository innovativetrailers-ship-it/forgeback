#!/usr/bin/env bash
# Push .env.local → every Railway service in passionate-dream (same pattern as sync-vercel-env.sh).
# Requires RAILWAY_TOKEN (project token).
#
# Usage:
#   export RAILWAY_TOKEN="your-project-token"
#   ./scripts/sync-railway-env.sh
#
# Single service only:
#   SERVICE=worker-render ./scripts/sync-railway-env.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-.env.local}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ $ENV_FILE not found"
  exit 1
fi

if [[ -z "${RAILWAY_TOKEN:-}" ]]; then
  echo "✗ Set RAILWAY_TOKEN (project token)"
  exit 1
fi

if command -v railway &>/dev/null; then
  RAILWAY="railway"
else
  RAILWAY="npx @railway/cli"
fi

ALL_SERVICES=(
  worker-render worker-training worker-export worker-das worker-intelligence
  py-otio py-imf py-shotgrid py-exr
)

if [[ -n "${SERVICE:-}" ]]; then
  SERVICES=("$SERVICE")
else
  SERVICES=("${ALL_SERVICES[@]}")
fi

SKIP_KEYS=(GOOGLE_APPLICATION_CREDENTIALS DEV_ACCOUNT_EMAIL)
SKIP_PREFIXES=(NEXT_PUBLIC_ PAYPAL_PLAN_ STRIPE_PRICE_ DATABASE_DAS_URL)

should_skip() {
  local key="$1"
  for k in "${SKIP_KEYS[@]}"; do [[ "$key" == "$k" ]] && return 0; done
  for p in "${SKIP_PREFIXES[@]}"; do [[ "$key" == "$p"* ]] && return 0; done
  return 1
}

set_var_on_service() {
  local key="$1" value="$2" svc="$3"
  if printf '%s' "$value" | $RAILWAY variable set "$key" --stdin --service "$svc" --skip-deploys >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

echo "Syncing $ENV_FILE → Railway services (${#SERVICES[@]} services)…"

while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%%#*}"
  line="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [[ -z "$line" ]] && continue
  [[ "$line" != *"="* ]] && continue

  key="${line%%=*}"
  value="${line#*=}"
  key="$(echo "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  value="$(echo "$value" | sed -e 's/^["'\'']//' -e 's/["'\'']$//')"

  [[ -z "$value" ]] && continue
  should_skip "$key" && continue

  ok=0
  fail=0
  for svc in "${SERVICES[@]}"; do
    if set_var_on_service "$key" "$value" "$svc"; then
      ok=$((ok + 1))
    else
      fail=$((fail + 1))
    fi
  done
  echo "  ✓ $key → ${ok}/${#SERVICES[@]} services"
  [[ "$fail" -gt 0 ]] && echo "    (${fail} failed)"
done < "$ENV_FILE"

echo "Done. Redeploy in Railway dashboard or: railway redeploy --service worker-render"
