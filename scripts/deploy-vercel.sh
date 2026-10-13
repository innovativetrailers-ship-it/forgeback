#!/usr/bin/env bash
# Production deploy to Vercel (build runs remotely).
# Usage: ./scripts/deploy-vercel.sh [production-url]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PRODUCTION_URL="${1:-${PRODUCTION_URL:-}}"

if command -v vercel &>/dev/null; then
  VERCEL=(vercel)
else
  VERCEL=(npx vercel)
fi

if [[ -f .env.local ]]; then
  echo "→ Syncing environment variables…"
  bash scripts/sync-vercel-env.sh "$PRODUCTION_URL"
else
  echo "⚠ No .env.local — ensure Vercel env vars are set in the dashboard"
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "→ Running Prisma migrate deploy…"
  npx prisma migrate deploy
elif [[ -f .env.local ]]; then
  # Avoid sourcing .env.local — pipe chars and other shell metacharacters break `source`.
  DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
  export DATABASE_URL
  if [[ -n "${DATABASE_URL:-}" ]]; then
    echo "→ Running Prisma migrate deploy…"
    npx prisma migrate deploy
  fi
fi

echo "→ Deploying to Vercel production…"
"${VERCEL[@]}" deploy --prod

echo ""
echo "✓ Deploy triggered. Dashboard: https://vercel.com/dashboard"
