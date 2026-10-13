#!/usr/bin/env bash
# Repair Vercel production auth env — removes legacy/duplicate keys and re-pushes
# canonical Auth.js v5 vars from .env.local. Run after a bad sync left empty values.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-.env.local}"
PRODUCTION_URL="${1:-https://forgecinema.vercel.app}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ $ENV_FILE not found"
  exit 1
fi

if command -v vercel &>/dev/null; then
  VERCEL=(vercel)
else
  VERCEL=(npx vercel)
fi

[[ -f .vercel/project.json ]] || "${VERCEL[@]}" link --yes

get_env() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'
}

set_prod() {
  local key="$1" value="$2"
  if [[ -z "$value" ]]; then
    echo "  ✗ $key missing in $ENV_FILE — not setting"
    return 1
  fi
  "${VERCEL[@]}" env rm "$key" production -y >/dev/null 2>&1 || true
  printf '%s' "$value" | "${VERCEL[@]}" env add "$key" production --force
  echo "  ✓ $key → production (${#value} chars)"
}

echo "→ Removing legacy/duplicate auth keys from production…"
for legacy in NEXTAUTH_URL NEXTAUTH_SECRET AUTH_URL BETTER_AUTH_SECRET; do
  if "${VERCEL[@]}" env rm "$legacy" production -y >/dev/null 2>&1; then
    echo "  ✓ removed $legacy"
  else
    echo "  · $legacy (not present or already removed)"
  fi
done

AUTH_SECRET_VAL="$(get_env AUTH_SECRET)"
[[ -z "$AUTH_SECRET_VAL" ]] && AUTH_SECRET_VAL="$(get_env NEXTAUTH_SECRET)"

echo "→ Setting canonical Auth.js v5 production vars…"
set_prod AUTH_SECRET "$AUTH_SECRET_VAL"
set_prod GOOGLE_CLIENT_ID "$(get_env GOOGLE_CLIENT_ID)"
set_prod GOOGLE_CLIENT_SECRET "$(get_env GOOGLE_CLIENT_SECRET)"
set_prod NEXT_PUBLIC_APP_URL "$PRODUCTION_URL"

echo ""
echo "Done. Redeploy production so functions pick up the repaired env:"
echo "  npx vercel deploy --prod"
