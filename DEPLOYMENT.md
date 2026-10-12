# Growth Engine Cinema — Deployment Guide

## Quick Start (Local Development)

```bash
# 1. Clone and enter the project
cd growth_engine/cinema

# 2. Run the automated setup (Docker + DB + seed)
./scripts/dev-setup.sh

# 3. Fill in your API keys
nano .env.local

# 4. Start the web app
npm run dev          # http://localhost:3000

# 5. Start BullMQ workers (separate terminal)
npm run workers
```

---

## Production Deployment (Vercel)

### Prerequisites

| Service | Recommended | Notes |
|---------|-------------|-------|
| **PostgreSQL** | [Neon](https://neon.tech) | Serverless, free tier. Enable connection pooling. |
| **Redis** | [Upstash](https://upstash.com) | Serverless Redis, pay-per-request. |
| **Object Storage** | Cloudflare R2 | S3-compatible, zero egress fees. |
| **Workers** | Fly.io / Railway | Run BullMQ workers as long-lived processes. |

### Step 1 — Cloudflare R2 Bucket

```bash
# Set your credentials
export R2_ACCOUNT_ID=xxx
export R2_ACCESS_KEY_ID=xxx
export R2_SECRET_ACCESS_KEY=xxx

./scripts/setup-r2.sh
```

Then add a custom domain in the Cloudflare dashboard:
`media.cinema.growthengine.ai` → R2 bucket `cinema-media`

### Step 2 — Database

Create a Postgres database on Neon and copy the connection string, then:

```bash
export DATABASE_URL="postgresql://..."
./scripts/setup-db.sh --seed
```

### Step 3 — Vercel (Gap 3)

Full checklist: **`deploy/vercel/CHECKLIST.md`**

```bash
# Link project, sync env (production URL for OAuth), deploy
./scripts/setup-vercel.sh https://your-app.vercel.app

# Or step by step:
npm run env:vercel -- https://your-app.vercel.app
npm run deploy:vercel -- https://your-app.vercel.app
```

**Preview deploys:** leave `NEXTAUTH_URL` unset on preview — auth uses `trustHost: true`.

**Crons:** set `CRON_SECRET` in Vercel production; routes use `src/lib/cron-guard.ts`.

### Required GitHub Secrets

Add these in **GitHub → Settings → Secrets → Actions**:

| Secret | Value |
|--------|-------|
| `VERCEL_TOKEN` | From vercel.com/account/tokens |
| `VERCEL_ORG_ID` | From `.vercel/project.json` after `vercel link` |
| `VERCEL_PROJECT_ID` | From `.vercel/project.json` |
| `DATABASE_URL` | Production Postgres URL |
| `WORKER_HEALTH_TOKEN` | Random string for health check auth |
| `EXPO_TOKEN` | From expo.dev account settings |

### Step 4 — Workers + Python services (Railway recommended)

Vercel cannot run BullMQ workers or Flask processes. Use **Railway** (see `deploy/railway/README.md` and root `Procfile`).

**Node workers** — one Railway service each:

| Start command | Queue |
|---------------|-------|
| `npm run worker:render` | render |
| `npm run worker:training` | training |
| `npm run worker:export` | export |
| `npm run worker:das` | das-pull |

Build: `npm ci && npx prisma generate`

**Python microservices** — ports 7432–7435:

```bash
bash scripts/install-python-services.sh
bash scripts/start_services.sh
bash scripts/check-services.sh
```

Docker (local): `npm run workers:docker`

Set on Vercel after Railway deploy:

```
OTIO_SERVICE_URL=https://<otio-service>.up.railway.app
IMF_SERVICE_URL=https://<imf-service>.up.railway.app
SHOTGRID_SERVICE_URL=https://<shotgrid-service>.up.railway.app
EXR_SERVICE_URL=https://<exr-service>.up.railway.app
```

Alternative: **Fly.io** — same start commands, `flyctl launch` per worker.

---

## Mobile App (EAS Build)

```bash
cd cinema-mobile

# Install EAS CLI
npm install -g eas-cli

# Authenticate
eas login

# Development build (simulator)
eas build --platform ios --profile development

# Preview build (TestFlight / internal track)
eas build --platform all --profile preview

# Production build + submit
eas build --platform all --profile production
eas submit --platform all
```

---

## Environment Variables Reference

See `.env.example` for all required variables with descriptions.

### Critical variables (app won't start without these)

- `DATABASE_URL` — Postgres connection string
- `REDIS_URL` — Redis connection string
- `NEXTAUTH_SECRET` — Generate: `openssl rand -base64 32`
- `NEXTAUTH_URL` — Your production URL
- `FAL_KEY` — fal.ai API key (core AI processing). Server only. The desktop app does not have this value.
- `FAL_WEBHOOK_SECRET` — signs provider webhooks. The value must be identical on Vercel and every Railway service that submits a paid job.
- `R2_*` — Cloudflare R2 credentials (file storage)

### Optional but recommended

- `ANTHROPIC_API_KEY` — AI Director, Continuity Checker, Storyboard
- `STRIPE_*` — Credit purchases
- `GOOGLE_CLIENT_*` — Google OAuth
- `SENTRY_DSN` — Error tracking

---

## Architecture Notes

### Request Flow
```
Browser/Mobile → Vercel Edge (middleware + rate limit)
  → Next.js API Route (auth, credit check, job creation)
  → BullMQ Queue (Redis)
  → Worker Process (Fly.io/Railway)
    → fal.ai / Kling / Veo3 / Runway etc.
    → Cloudflare R2 (output storage)
  → SSE stream → Browser
```

### Worker Scaling

| Queue | Concurrency | Recommended replicas |
|-------|-------------|---------------------|
| `render` | 5 per worker | 2–4 |
| `training` | 2 per worker | 1–2 |
| `export` | 3 per worker | 1–2 |

### Monitoring

- Health endpoint: `GET /api/health`
- Queue depths: `GET /api/health/queues` (requires `WORKER_HEALTH_TOKEN`)
- Worker liveness: `GET /api/health/workers`
- GitHub Actions worker ping runs every 15 minutes

---

## Cron Jobs (Vercel)

Configured in `vercel.json`:

| Schedule | Endpoint | Purpose |
|----------|----------|---------|
| `0 3 * * *` | `/api/cron/cleanup-jobs` | Archive old jobs, clean BullMQ |
| `0 2 * * 0` | `/api/cron/process-rlhf` | Aggregate RLHF win rates for model router |

Set `CRON_SECRET` env var — Vercel sends it as `Authorization: Bearer <secret>`.
