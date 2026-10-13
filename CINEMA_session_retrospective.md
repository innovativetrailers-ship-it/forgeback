# CINÉMA — Session Retrospective (Errors & Working Fixes)

Distilled from the full agent chatlog. Each entry: **Symptom → Root cause → Fix that worked → Lesson.**
Purpose: internalised knowledge so the same class of bug is diagnosed in minutes, not hours.

---

## 1. Redis / Upstash (the longest saga)

### 1a. Wrong TLS port (the silent killer)
- **Symptom:** `ETIMEDOUT` to Redis from everywhere; health `degraded`; jobs never enqueue.
- **Root cause:** `buildRedisUrl()` in `src/lib/redis.ts` hardcoded Upstash TLS port **`:6380`**, which times out. Upstash's Redis-protocol TLS endpoint is on **`:6379`**.
- **Fix:** Normalize port to `:6379` in `redis.ts` (rewrite any `:6380→:6379`, force IPv4 + TLS). Proven from inside a Railway container: **6379 connects ~94ms, 6380 times out**.
- **Lesson:** When a connection times out *identically from every host* (local + cloud), suspect a wrong port/endpoint, not a network block. Prove it with a raw TCP test before architectural changes.

### 1b. Cold-start race
- **Symptom:** First command on each Vercel cold start rejected with *"Stream isn't writeable."*
- **Root cause:** app ioredis client used `lazyConnect: true` + `enableOfflineQueue: false`.
- **Fix:** `enableOfflineQueue: true`, `maxRetriesPerRequest: 3`, `connectTimeout: 10000` on the app client.
- **Lesson:** Serverless producers must buffer the first command while the socket connects.

### 1c. BullMQ keyPrefix → 503 on `/api/jobs/create` (separate from the port bug)
- **Symptom:** Vercel `renderQueue.add()` → 503, even after the port fix. Railway workers fine.
- **Root cause:** API queues were built on the app `redis` connection that sets ioredis `keyPrefix: 'cinema:'`. **BullMQ forbids ioredis `keyPrefix`** and throws at `new Queue()`. Workers used `bullmqRedis` (no keyPrefix) + BullMQ's own `prefix` option, so they never hit it.
- **Fix:** Dedicated **prefix-free `queueConnection`** (`enableOfflineQueue: true`, `lazyConnect: true`) + BullMQ `prefix: 'cinema:'` to match workers. Local repro: `ADD OK jobId=1 in 495ms`.
- **Lesson:** Reproduce the producer call locally against the same instance to get the *real* error string; don't guess from truncated cloud logs.

### 1d. Upstash request-limit + "are we even on the same instance?"
- **Symptom:** Workers alive but every `bzpopmin` rejected at `500,000/500,000`.
- **Root cause:** Free-tier monthly request cap. Plan upgrade (Pay-as-you-go) lifts it; workers needed a redeploy to drop stale errored ioredis connections. Confirmed Railway + local share `profound-baboon-75253.upstash.io`.
- **Lesson:** A plan change doesn't reset live connections — bounce the workers. Verify both sides point at the same hostname before debating "different instance" theories.

---

## 2. Railway worker deploys kept reverting to a stale image
- **Symptom:** Every fix "deployed" but behaviour unchanged; running container still the **May-30 image** (port 6380).
- **Root causes (stacked):**
  1. `tsx`/`concurrently` were in **devDependencies**; NIXPACKS prod install (884 pkgs) omitted them → `tsx: not found` → worker crash → Railway reverts to last-good image.
  2. Build ran bare `pip install` → **`pip: command not found` (exit 127)** → Node-worker build died *after* Prisma generated.
- **Fixes:** Move `tsx`/`concurrently` to runtime `dependencies`; make the Python step non-fatal (`|| true`). First successful new deploy since May-30; Redis connected.
- **Lesson:** "Deploy failed" + unchanged behaviour = the platform is silently keeping the old image. Check the *running* container's start command/commit, not just "build succeeded."

---

## 3. Postgres / Neon from Railway (IPv6)
- **Symptom:** Worker reaches Redis but `prisma.renderJob.update()` fails with a cryptic empty error, then `ETIMEDOUT` (~750ms — too fast for a real timeout).
- **Root cause:** Railway has **no IPv6 egress**; Neon resolves to both A/AAAA. Node "Happy Eyeballs" (`autoSelectFamily`) raced the unroutable IPv6 and killed the connection. Confirmed via SSH: IPv4 276ms, IPv6 "Network is unreachable."
- **Fix:** In `db.ts`, top-of-module `dns.setDefaultResultOrder('ipv4first')` **and** `net.setDefaultAutoSelectFamily(false)`.
- **Lesson:** Fast `ETIMEDOUT` after a successful TCP = TLS/family selection, not latency. Mirror IPv4-forcing across *every* outbound TCP layer (Redis and Postgres).
- **Red herring:** Neon `-pooler` PgBouncer prepared-statement collisions were suspected under concurrency — but the real cause was IPv6.

---

## 4. NextAuth v5 (Google sign-in)
- **Symptom A:** Build hangs at "Creating an optimized production build…"; later Vercel `tsc` SIGTERM.
- **Root cause A:** `session` callback called `db.user.findUnique()` during **static generation** (DB connect at build).
- **Fix A:** Remove the live DB sync from `session` (UI already reads `/api/credits/balance` via React Query).
- **Symptom B:** Redirect loop; protected routes never see `userId`.
- **Root cause B:** Missing `session` callback in `auth.config.ts` → middleware got only name/email, **not `id`**.
- **Fix B:** Add `session` callback copying `token.id`/`token.sub` → `session.user.id`.
- **Lesson:** Never do DB I/O in a path that runs at build/static-render. In NextAuth v5, the middleware only knows what the JWT/session callbacks copy in.
- **Edge note:** `db.ts` module-level `process.on` is **not Edge-compatible** — keep auth middleware on an Edge-safe config split.

---

## 5. fal.ai model clients
### 5a. `wan` result 404
- **Symptom:** Job submits + completes, but `fal.queue.result()` → `404 "Path /v2.2/t2v not found"`.
- **Root cause:** Outdated endpoint id `fal-ai/wan/v2.2/t2v` — accepts submits/status but its **result path doesn't exist**.
- **Fix:** `fal-ai/wan/v2.2-a14b/text-to-video` (+ `…/image-to-video`). Verified end-to-end: real video URL returned.
### 5b. Kling
- **Root cause:** Blocking sync `fal.run`; `pollStatus` hardcoded the PRO tier path regardless of submit tier.
- **Fix:** Async queue API (submit→poll→result) like `wan`; thread the tier through polling. Kept v1.6 (a prior 403-balance, not 404, proved the endpoint resolves).
- **Lesson:** A 403 means the endpoint resolves (billing); a path-404 means the endpoint id is wrong. Use that to tell "account problem" from "code problem" without spending balance.

---

## 6. Cost-safety / runaway charges
- **Symptom:** A job that timed out (fal `IN_QUEUE`) was re-submitted to fal **3×**, each a fresh charge.
- **Root cause:** `renderQueue` `attempts: 3` + BullMQ stalled-job recovery (each redeploy mid-render = another submit).
- **Fix:** `attempts: 1` + **`maxStalledCount: 0`** on the render worker → each generation hits fal **at most once**. Fail fast (~25s) with a clear extracted error + credit refund.
- **Lesson:** Never auto-retry paid AI generations. A "stalled" job is a *second charge* — guard it explicitly. (Kept `maxStalledCount: 0` on the active worker even when a prompt suggested `1`.)

---

## 7. SSE / live progress
- **Symptom:** Cards stuck "Generating…"; 6× Vercel Runtime Timeout on `/api/jobs/[jobId]/stream`.
- **Root causes:** SSE on Vercel serverless always exceeds the function timeout for multi-minute jobs; `subscribeToJob` only caught *future* pub/sub events (missed already-finished jobs); status **case mismatch** (worker emits lowercase `complete`/`failed`, UI checked uppercase).
- **Fix:** DB poller that emits current status immediately + polls every 2s (EventSource auto-reconnect); align status casing; soften over-eager `onerror` that marked jobs failed on transient disconnects.
- **Lesson:** Don't hold long-lived SSE on serverless. Poll DB state; emit-current-then-watch beats watch-only.

---

## 8. TypeScript / build
- `@fal-ai/serverless-client` → installed pkg is **`@fal-ai/client`**.
- Kling `duration` must be string literal `"5"`/`"10"`, not a number.
- Prisma `Json` field rejects typed arrays → cast via `as unknown as Prisma.InputJsonValue`.
- Editor-store `Clip` vs schema `Clip` field drift (`sourceUrl`/`videoUrl`, `endTime`/`duration`).
- `UltimateTab` union missing `'locations'` — surfaced because a **`StrReplace` silently failed** the first time (wrong context) and the type comparison flagged it.
- RunwayML `ImageToVideoCreateParams` needs `ratio` + a guaranteed `promptImage`.
- **Lesson:** After every `StrReplace`, verify it actually landed. A type error elsewhere is often the tell.

---

## 9. Prisma migration drift (the recurring trap)
- **Symptom:** `/api/vault/location/list` 500; `migrate status` says **"up to date"** yet the table doesn't exist.
- **Root cause:** Models (`LocationPlate`, `ClipComment`, `SocialConnection`, `ConflictLog`, `ShoppableEmbed`, `BranchingEmbed`, plus `RenderJob` columns) were added to `schema.prisma` but **never given a migration**. `migrate status` only tracks migration *files*, not schema↔DB drift.
- **Fix:** `prisma migrate diff --from-config-datasource --to-schema … --script` (Prisma v7 dropped `--from-url`) → review (additive only) → write as migration `20260603120000_add_drifted_tables` → `migrate deploy`. Verified: status "up to date", fresh diff "empty migration."
- **Env gotcha:** `prisma.config.ts` loads `.env` (localhost) via `dotenv/config`; dotenv won't override an already-set var, so pass the Neon URL inline: `DATABASE_URL="$NEON" npx prisma …`.
- **Lesson:** Trust `migrate diff` over `migrate status` to detect real drift. Always review generated SQL for drops before deploying to prod.

---

## 10. Three-fixes round
- **Model Council** only showed 6 hardcoded models → added registry `MODEL_COUNCIL_DISPLAY` (all 17) and made `AIDirectorPanel` map over it. The director API ignores `modelCouncil` (zod-stripped), so the id change is display-only.
- **Vault 500** → crash-proof route returns `{ plates: [] }`; new `fetchJsonSafe` (`res.text()` then `JSON.parse`) kills "Unexpected end of JSON input."
- **Panel width** → shared left panel was fixed `w-72` (288px) → `w-[360px]`; `AIDirectorPanel` root `w-full`.
- **slider-vertical** → already modern (`writing-mode: vertical-lr`); the console warning was stale/cached.

---

## 11. Orchestra meta-lessons
- **`dispatch_task` has no repo file access** and previously returned a **hallucinated, non-matching schema** (e.g., different `StructuredShot` shape). Treat its codegen as advisory only — drive real edits directly.
- **ChromaDB/Neo4j go offline intermittently** → `index_file`/`semantic_search`/`workspace_stats` fail with infra errors (not code). When down, proceed with direct implementation and retry indexing later.
- **What works reliably:** `index_file` (when ChromaDB up), `semantic_search` for retrieval verification, `trigger_swarm` (accuracy snapshot), `get_orchestra_status`/`swarm_status`.
- **Lesson:** Use Orchestra for indexing + swarm verification; keep code authority in-repo.

---

## Diagnostic heuristics worth keeping
1. Identical timeout from *all* hosts → wrong port/endpoint, not a firewall.
2. Fast `ETIMEDOUT` after TCP connects → TLS/IPv6 family selection.
3. `403` = endpoint resolves (billing); path-`404` = wrong endpoint id.
4. "Deploy failed" + unchanged behaviour → platform kept the old image; inspect the running container.
5. `migrate status` "up to date" ≠ no drift → use `migrate diff`.
6. Truncated cloud logs → reproduce the exact call locally against the same backend.
7. Paid AI jobs: `attempts: 1` + `maxStalledCount: 0`; never auto-retry.
8. No DB I/O during static generation / build.
