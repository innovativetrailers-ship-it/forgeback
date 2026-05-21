# Railway deployment — workers & Python services

Vercel runs the Next.js app. **Railway** (or Fly.io) runs long-lived processes from this repo.

## Create a Railway project

1. Connect GitHub repo **`innovativetrailers-ship-it/forgeback`** (workers + Python only — not `forgecinema`).
2. Add **shared variables** (same as Vercel production): `DATABASE_URL`, `REDIS_URL`, `FAL_KEY`, `R2_*`, `NEXTAUTH_SECRET`, etc.
3. Set Python service URLs on Vercel after deploy:
   - `OTIO_SERVICE_URL=https://otio-production.up.railway.app`
   - `IMF_SERVICE_URL`, `SHOTGRID_SERVICE_URL`, `EXR_SERVICE_URL`

## Node workers (4 services)

Create one Railway service per row. Root directory: `/`. No public port.

| Service name      | Start command              |
|-------------------|----------------------------|
| `worker-render`   | `npm run worker:render`    |
| `worker-training` | `npm run worker:training`  |
| `worker-export`   | `npm run worker:export`    |
| `worker-das`      | `npm run worker:das`       |

Build command (each): `npm ci` (runs `postinstall` → Prisma generate with a placeholder URL if `DATABASE_URL` is unset).

**Required shared variables** (project → Variables, or `railway variables` after `railway service` link): at minimum `DATABASE_URL`, `REDIS_URL`. Without `DATABASE_URL`, builds fail at `prisma generate`.

**CLI auth:** Use a **project token** from Project → Settings → Tokens as `RAILWAY_TOKEN` (not account Bearer tokens). Local dev: `railway login` stores auth in `~/.railway/config.json`.

Optional: `worker-intelligence` → `npm run worker:intelligence`

## Python microservices (4 services)

| Service     | Start command | `PORT` |
|-------------|---------------|--------|
| `py-otio`   | See Procfile `py-otio` | Railway assigns → set on service |
| `py-imf`    | `py-imf`      | 7433   |
| `py-shotgrid` | `py-shotgrid` | 7434 |
| `py-exr`    | `py-exr`      | 7435   |

Install step: `pip install -r src/services/requirements.txt`

Health checks: `/health` on each service.

ShotGrid returns **503** when `shotgun-api3` is not installed or credentials are missing — the main app keeps running.

## Local parity

```bash
docker compose up -d                                    # Postgres + Redis
bash scripts/install-python-services.sh
bash scripts/start_services.sh                          # Python :7432–7435
npm run workers                                         # BullMQ workers
bash scripts/check-services.sh
```

Or Docker workers profile:

```bash
docker compose -f docker-compose.yml -f docker-compose.workers.yml --profile workers --profile python up -d
```
