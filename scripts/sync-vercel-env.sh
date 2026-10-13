#!/usr/bin/env bash
# Push .env.local → Vercel (production + preview + development).
# Usage:
#   ./scripts/sync-vercel-env.sh
#   ./scripts/sync-vercel-env.sh https://your-app.vercel.app
#
# Production-only URLs (NEXTAUTH_URL, AUTH_URL, NEXT_PUBLIC_APP_URL) are set
# only on the production environment when you pass the production URL argument.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-.env.local}"
PRODUCTION_URL="${1:-}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ $ENV_FILE not found — copy .env.example first"
  exit 1
fi

if command -v vercel &>/dev/null; then
  VERCEL=(vercel)
elif command -v npx &>/dev/null; then
  VERCEL=(npx vercel)
else
  echo "Install Vercel CLI: npm i -g vercel"
  exit 1
fi

if [[ ! -f .vercel/project.json ]]; then
  echo "→ Linking project…"
  "${VERCEL[@]}" link --yes
fi

PRODUCTION_ONLY=(NEXT_PUBLIC_APP_URL)
# Auth.js v5: trustHost handles URL; use repair-vercel-auth-env.sh for auth secrets.
SKIP_KEYS=(NEXTAUTH_URL NEXTAUTH_SECRET AUTH_URL BETTER_AUTH_SECRET DEV_ACCOUNT_EMAIL GOOGLE_APPLICATION_CREDENTIALS)
SKIP_PREFIXES=(DATABASE_DAS_URL NEXT_PUBLIC_ PAYPAL_PLAN_ STRIPE_PRICE_)

should_skip_key() {
  local key="$1"
  for k in "${SKIP_KEYS[@]}"; do
    [[ "$key" == "$k" ]] && return 0
  done
  for p in "${SKIP_PREFIXES[@]}"; do
    [[ "$key" == "$p"* ]] && return 0
  done
  return 1
}

is_production_only() {
  local key="$1"
  for k in "${PRODUCTION_ONLY[@]}"; do
    [[ "$key" == "$k" ]] && return 0
  done
  return 1
}

add_env() {
  local key="$1" value="$2" target="$3"
  printf '%s' "$value" | "${VERCEL[@]}" env add "$key" "$target" --force >/dev/null 2>&1 \
    && echo "  ✓ $key → $target" \
    || echo "  · $key → $target (skipped or unchanged)"
}

echo "Syncing $ENV_FILE to Vercel…"

while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// }" ]] && continue
  key="${line%%=*}"
  value="${line#*=}"
  key="${key// /}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  value="${value%%#*}"
  value="${value%"${value##*[![:space:]]}"}"
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"

  [[ -z "$key" || -z "$value" ]] && continue
  # Auth secrets: never bulk-sync — use scripts/repair-vercel-auth-env.sh
  if [[ "$key" == "AUTH_SECRET" || "$key" == "GOOGLE_CLIENT_ID" || "$key" == "GOOGLE_CLIENT_SECRET" ]]; then
    continue
  fi
  # Never push a mistaken S3 endpoint as the R2 secret.
  if [[ "$key" == "R2_SECRET_ACCESS_KEY" && "$value" == *"://"* ]]; then
    echo "  ✗ $key skipped — value looks like a URL, not an API token secret"
    continue
  fi
  # Canonical name on Vercel is FAL_KEY (legacy FAL_API_KEY is remapped)
  if [[ "$key" == "FAL_API_KEY" ]]; then
    key="FAL_KEY"
  fi
  should_skip_key "$key" && continue

  if is_production_only "$key"; then
    if [[ -n "$PRODUCTION_URL" ]]; then
      add_env "$key" "$PRODUCTION_URL" production
    else
      echo "  · $key — production only (pass production URL as arg 1 to set)"
    fi
    continue
  fi

  for target in production preview development; do
    add_env "$key" "$value" "$target"
  done
done < "$ENV_FILE"

# Preview: trustHost handles auth URL; optional explicit preview app URL
if [[ -n "$PRODUCTION_URL" ]]; then
  add_env "NEXT_PUBLIC_APP_URL" "$PRODUCTION_URL" production
fi

echo ""
echo "Done. Auth vars (AUTH_SECRET, GOOGLE_*) are NOT bulk-synced — run:"
echo "  ./scripts/repair-vercel-auth-env.sh"
echo ""
echo "Preview deploys: trustHost + VERCEL_URL (no NEXTAUTH_URL needed)."
echo "Google OAuth callback: https://forgecinema.vercel.app/api/auth/callback/google"
