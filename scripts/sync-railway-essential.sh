#!/usr/bin/env bash
# Push worker-critical keys from .env.local to all Railway services (faster subset).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export RAILWAY_TOKEN="${RAILWAY_TOKEN:?Set RAILWAY_TOKEN}"
ENV_FILE="${ENV_FILE:-.env.local}"
RAILWAY="${RAILWAY:-$(command -v railway >/dev/null && echo railway || echo 'npx @railway/cli')}"

ESSENTIAL_KEYS=(
  DATABASE_URL REDIS_URL FAL_KEY
  R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_NAME R2_PUBLIC_URL
  OPENROUTER_API_KEY ANTHROPIC_API_KEY
  CRON_SECRET WORKER_HEALTH_TOKEN
  KLING_API_KEY KLING_API_SECRET RUNWAY_API_SECRET LUMA_API_KEY
  MINIMAX_API_KEY SEEDANCE_API_KEY
  OTIO_SERVICE_URL IMF_SERVICE_URL SHOTGRID_SERVICE_URL EXR_SERVICE_URL
)

SERVICES=(
  worker-render worker-training worker-export worker-das worker-intelligence
  py-otio py-imf py-shotgrid py-exr
)

get_env() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'
}

echo "Essential sync → ${#SERVICES[@]} services…"
for key in "${ESSENTIAL_KEYS[@]}"; do
  value="$(get_env "$key" || true)"
  [[ -z "$value" ]] && continue
  ok=0
  for svc in "${SERVICES[@]}"; do
    printf '%s' "$value" | $RAILWAY variable set "$key" --stdin --service "$svc" --skip-deploys >/dev/null 2>&1 && ok=$((ok + 1))
  done
  echo "  ✓ $key → ${ok}/${#SERVICES[@]}"
done
echo "Done."
