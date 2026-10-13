# Vercel production checklist — Cinematic Forge

## 1. Connect GitHub

1. [Vercel Dashboard](https://vercel.com) → Import `innovativetrailers-ship-it/forgecinema`
2. Framework: **Next.js** (auto-detected)
3. Production branch: `main`

Or CLI:

```bash
vercel link
./scripts/sync-vercel-env.sh https://YOUR-PRODUCTION-DOMAIN
./scripts/deploy-vercel.sh https://YOUR-PRODUCTION-DOMAIN
```

## 2. Required env vars (production)

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | Neon pooler URL (`?sslmode=require`) |
| `REDIS_URL` | Upstash `rediss://` (TLS) |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_SECRET` | Same as `NEXTAUTH_SECRET` |
| `NEXTAUTH_URL` | **Production only** — e.g. `https://your-app.vercel.app` |
| `AUTH_URL` | Same as `NEXTAUTH_URL` |
| `NEXT_PUBLIC_APP_URL` | Same as production URL |
| `FAL_KEY` | fal.ai |
| `R2_*` | Cloudflare R2 |
| `CRON_SECRET` | `openssl rand -hex 32` — Vercel crons use this |
| `WORKER_HEALTH_TOKEN` | Random string for `/api/health/workers` |
| `GOOGLE_CLIENT_ID` / `SECRET` | OAuth callback: `{NEXTAUTH_URL}/api/auth/callback/google` |
| `STRIPE_*` / `PAYPAL_*` | If billing enabled |

**Preview:** Do **not** set `NEXTAUTH_URL` on preview — `trustHost: true` in auth config uses `VERCEL_URL`.

**Railway (after Gap 2):** `OTIO_SERVICE_URL`, `IMF_SERVICE_URL`, `SHOTGRID_SERVICE_URL`, `EXR_SERVICE_URL`

## 3. Vercel project settings

- **Node.js:** 22.x
- **Build command:** `npx prisma generate && npm run build` (in `vercel.json`)
- **Install command:** `npm install`
- **Fluid Compute:** Enable for long API routes (generate, jobs stream, timeline render)
- **Cron jobs:** Enabled (Pro plan) — paths in `vercel.json`

## 4. GitHub Actions secrets

Sync from `.env.local` (after `gh auth login`):

```bash
./scripts/sync-github-secrets.sh
```

| Secret | Source |
|--------|--------|
| `FAL_KEY` | fal.ai — **required** for `verify-fal` CI job |
| `R2_ACCOUNT_ID` | Cloudflare |
| `R2_ACCESS_KEY_ID` | R2 API token |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_RELEASES_BUCKET` | e.g. `forge` |
| `R2_RELEASES_PREFIX` | e.g. `releases` |
| `VERCEL_TOKEN` | vercel.com/account/tokens |
| `VERCEL_ORG_ID` | `.vercel/repo.json` → `orgId` |
| `VERCEL_PROJECT_ID` | `.vercel/repo.json` → `projects[0].id` |
| `DATABASE_URL` | Production Neon URL (migrations job) |
| `APPLE_*`, `CSC_*`, `WIN_CSC_*` | Desktop signing (tag releases only) |

Workflows: `.github/workflows/ci.yml` (verify-fal + deploy) · `desktop-release.yml` (tag `v*`).

## 5. Post-deploy verification

```bash
curl https://YOUR-DOMAIN/api/health
curl -H "Authorization: Bearer $WORKER_HEALTH_TOKEN" https://YOUR-DOMAIN/api/health/queues
```

- Sign in with Google on production URL
- Create a test job (requires Railway workers + Redis)
- Stripe/PayPal webhooks → `{NEXTAUTH_URL}/api/webhooks/stripe`

## 6. Common build failures

| Error | Fix |
|-------|-----|
| `@prisma/client` missing | `postinstall`: `prisma generate` in `package.json` |
| `DATABASE_URL` at build | Add to Vercel **Build** environment |
| Cron 401 | Set `CRON_SECRET` in production |
| OAuth redirect mismatch | Add preview + prod callback URLs in Google Console |
| Jobs stuck pending | Deploy Railway workers (`deploy/railway/README.md`) |
