# Forge Cinema forensic audit

Date: 2026-09-30. Read-only. No product file, migration, or database row was changed. The only file written is this report.

Scope: the attached `MANIFEST.md` against the tree at `/Users/imac/cinema/cinema`, the desktop app at `cinematic-forge-v3`, and the Expo app at `/Users/imac/cinema/cinema-mobile`. Database figures are exact `SELECT` counts against the live Postgres schema, grouped so no email, token, payment id, or host is copied here. `pg_stat` row estimates are stale (they report `User` as 0). Use the exact counts below.

The dependency graph tool was unavailable (its graph database was not listening), so orphan detection is from the file tree and route table, not a full import graph.

---

## 1. Manifest versus the tree

`MANIFEST.md` is a document index for a 20-file build-prompt set. It says that if a file exists it is listed, and that nothing lives outside its two tables. That claim does not match this checkout.

### 1.1 Status the manifest still shows as open

The manifest’s “still to feed” order is: run 2, 5, 6, 7, 10, 11, 15 (deep audio), 16b, 17, L.

Those prompt files are not in the repo. The code for those runs is already in the tree. Later indexes (through run 26) are also not in this manifest. The manifest is behind the code.

| Manifest run | Manifest status | What is in the tree |
|---|---|---|
| F-gate, 1, 3, 4, 8, 9, 12, 13, 14 | DONE | Matching routes and schema exist. Prompt files are not stored in `docs/spec-references` except Wave B library and Wave 7. |
| 2 wizard | FEED, maybe closed by Wave 7 | Director routes, gates, angles, keyframes, variations, pre-production board, ingest. |
| 5 editor | FEED | Dockview editor, workspaces, keymap presets, three-point edit, transcript panel. |
| 6 post suite | FEED | Grade, effects, timeline render, export routes. Web is the core grade. Desktop has the deep grade panel. |
| 7 templates | FEED | `POST/GET /api/studio/templates`. Template gallery is mounted in the editor. Database `FilmTemplate` count is 0. |
| 10 generative timeline | FEED | `/api/studio/timeline/edit` (inpaint, bridge, extend, tools). |
| 11 AI tools | FEED | Upscale, denoise, relight, isolate, reframe, library search on the tools panel. Scene-cut detect is an honest “not on the gateway” note, not a live detector. |
| 15 desktop parity | PARTIAL | `@cinema/core` exists. Desktop has mixer, 3D-capable viewer, crash path, ship hooks. Deep audio is the desktop mixer, not a second web mixer. |
| 16 moat | PARTIAL | Overlays, planar route, keyframes exist. Compositor is a separate route, not only a pointer. |
| 16b compositor | FEED | `src/lib/compositor/` plus `POST /api/studio/compositor/render`. Cryptomatte, deep-EXR, and vector-warp are recorded as future depth and are not a working comp. |
| 17 tier-2 | FEED | Settings memory, clip remove route, training picker, subtitle path. Per-stage model picker is still absent, matching the deferred register. |
| L entitlement | FEED | `Subscription`, `DesktopActivation`, `/api/entitlement/*`. All three tables are empty of payment and activation rows. |

Runs 18–26 are absent from this manifest and present in code: local-model isolation, extension SDK, review portal, NLE proxies/nests, desktop ship pipeline, deep grade, VFX nodes, local model enable, and the gap-fix keymap / transcript / beats / assemble / crosstalk / soundscape pass.

### 1.2 Manifest files missing from the repo

These names are in the manifest and are not under `docs/spec-references`:

- `BUILD-F1-timeline-project-and-reconcile-guard.md`
- `FIX-orchestrator-audit-reconcile.md`
- `BUILD-director-control-wizard.md`
- `BUILD-WAVE-1-close-now.md`
- `BUILD-editor-foundation.md`
- `BUILD-WAVE-B-post-production-suite.md`
- `BUILD-templates.md`
- `BUILD-WAVE-B5-voiceover-finetune-panel.md`
- `BUILD-WAVE-2-chained-continuity.md`
- `BUILD-timeline-generative-editing.md`
- `BUILD-post-ai-tools.md`
- `BUILD-WAVE-3-orchestrator-intelligence.md`
- `BUILD-WAVE-4-training-lane.md` (a `BUILD-WAVE-4-training-lane-2.md` exists instead)
- `BUILD-WAVE-5-desktop-parity.md`
- `BUILD-WAVE-6-moat-control-layer.md`
- `BUILD-WAVE-6.4-node-compositor.md`
- `BUILD-WAVE-TIER2-controls-and-polish.md`
- `BUILD-ACCOUNT-entitlement-and-desktop-license.md`
- `RUN-INDEX-cursor.md`, `HANDOVER.md`, `MANIFEST.md`
- `DEFERRED-EXECUTION-PROGRAM.md`, `CLOSING-PLAN-post-pipeline.md`
- `MASTER-TOOLS-and-panels.md`
- `GAP-REGISTER-consolidated.md`, `GAP-DaVinci-Resolve.md`, `GAP-Adobe-Premiere.md`
- `SCOPE-capcut-creator-tier.md`, `SCOPE-ui-workspace-docking.md`
- `FIX-orchestrator-llm-call-explosion.md`

The manifest says the two registers live in `/mnt/user-data/outputs/`. On this machine they live in `docs/spec-references/` as `DEFERRED-REGISTER.md` and `IDEAS-BACKLOG.md` (the manifest name is `IDEAS-BACKLOG-register.md`).

### 1.3 Files in the repo the manifest does not list

`docs/spec-references/` has 56 files. The manifest does not list the control specs (`SPEC-00` through `SPEC-10`), the layer specs (`spec-1` through `spec-6`), `spec-reconciliation-overlay.md`, the training-studio specs, the workflow specs (`SPEC-A1` through `SPEC-A3`), or `BUILD-WAVE-7-production-workflow-2.md`. The manifest’s “nothing lives outside these two lists” line is false for this checkout.

---

## 2. Database forensic (exact counts)

Prisma schema: `prisma/schema.prisma`. Client output: `src/generated/prisma`. Driver: Prisma 7 with `@prisma/adapter-pg`. Migrations: 47 applied, 0 unfinished. Latest finished migration timestamp: 2026-09-29 23:52 UTC. Additive history from 2026-09-23 through the review-portal migration. No invoice table exists.

Pause flag in the env files read for this audit: unset. Paid-call code treats unset as paused:

```ts
export function generationPausedFromEnv(value: string | undefined): boolean {
  if (value === 'false' || value === '0' || value?.toLowerCase() === 'off') return false
  return true
}
```

`packages/core/src/adapters/chokepoints.ts`. Production may set the variable differently. This audit did not read production env.

### 2.1 Accounts and tokens

| Fact | Count |
|---|---|
| Users | 3 |
| Role ADMIN, tier `free`, status `trial` | 2 |
| Role FREE, tier `free`, status `trial` | 1 |
| Combined credit balance | 20,000,968 |
| Held credits | 0 |
| `totalGenerated` | 0 on every user |
| Password hashes | 0 |
| Email verified | 0 |
| Desktop trial flag used | 0 |
| OAuth `Account` rows | 3, all provider `google` |
| Accounts with an access token stored | 3 |
| Accounts with a refresh token | 0 |
| `Session` rows | 0 |
| `Subscription` rows | 0 |
| `StripeCustomer` rows | 0 |
| `StripeDeposit` rows | 0 |
| `DesktopActivation` rows | 0 |
| `SocialConnection` rows | 0 |

Account status in the product is `User.subscriptionStatus`, and every account is `trial` on tier `free`. The two admin rows carry almost the entire credit balance while the subscription table is empty. There is no separate invoice ledger. Payment evidence would be `StripeDeposit` (empty) and `CreditTransaction` (below).

OAuth access tokens are stored on `Account`. This report does not copy them. There are no refresh tokens and no live sessions, so a Google login must create a session at sign-in; none are persisted right now.

A second, lowercase table set is visible to Postgres statistics: `user`, `account`, `session`, `organization`, `member`, `invitation`, `jwks`, `verification`, `project_config`. Estimates are 0. An exact count of that set failed in this pass, so those row counts are unconfirmed. They are not the Prisma models the app writes (`User`, `Account`, `Session`). Treat them as an orphan auth schema until someone confirms they are unused.

### 2.2 Credits and payments

| Credit transaction type | Rows | Amount sum |
|---|---|---|
| type null | 28 | +970 |
| `deduction` | 1 | −2 |

`CreditHold`: 13 `ACTIVE`, 5 `SETTLED`. The amount column is `amountHeld`. This pass did not sum it. Thirteen open holds against a job table that has no in-flight work from the last day is a leak risk: credits can sit reserved after the job is no longer running.

`VendorUsageLog`: 0. No vendor cost ledger has been written.

There is no invoice model, no succeeded deposit, and no subscription period.

### 2.3 Projects, saved timelines, files

| Fact | Count |
|---|---|
| Projects | 34, all `draft` |
| Projects with `timelineJson` | 34 |
| Media folders | 2 |
| Media bins | 0 |
| Bin clip entries | 0 |
| Assets | 8 |
| Playbooks | 0 |
| Film templates | 0 |
| Review links | 0 |
| Cloned voices | 0 |

Assets:

| Kind | Resolution | Rows | With generated image | With weights |
|---|---|---|---|---|
| video | unresolved | 7 | 0 | 0 |
| character | unresolved | 1 | 1 | 0 |

Saved work is the 34 timeline JSON documents plus 8 asset rows. Nothing in `Asset` is marked resolved. No weights file key is stored.

### 2.4 Characters, locations, wardrobe

| Fact | Count |
|---|---|
| `VaultCharacter` | 1 |
| LoRA status | `TRAINING` |
| LoRA model id | none |
| Voice id | none |
| Reference URLs | present |
| Wardrobe items | 0 |
| `VaultLocation` | 0 |
| `LocationPlate` | 12 |
| Film locations / film cast | 0 |

One character is stuck in `TRAINING` with references and no resulting LoRA id. Locations the app can render are plates (12), not vault locations (0).

### 2.5 Generated video and images

`StudioClip` total 61.

| Status | Rows | With `videoUrl` | With storage key | With raw URL | With keyframe |
|---|---|---|---|---|---|
| PENDING | 43 | 0 | 0 | 0 | 21 |
| COMPLETED | 12 | 12 | 3 | 3 | 3 |
| AWAITING_DIRECTION | 4 | 1 | 0 | 0 | 0 |
| FAILED | 2 | 0 | 0 | 0 | 0 |

Of the clips that have a `videoUrl`: 3 look like object storage, 10 look like the provider CDN. Only 3 have `storageKey`. Most finished videos were not mirrored off the provider.

Scenes: 21, all `PENDING`, including scenes that contain completed clips. Scene status is not updated when a clip completes.

Assigned model strings on clips (historical, not a live routing table):

| Model string | Clips |
|---|---|
| none | 20 |
| pixverse-v6 | 11 |
| wan-2.2 | 9 |
| kling-3.0 | 7 |
| minimax-2.3 | 4 |
| hunyuan-video-1.5 | 3 |
| ltx-2.3 | 3 |
| luma-ray3 | 2 |
| pika-2.5 | 1 |
| wan-2.6 | 1 |

`pixverse-v6`, `hunyuan-video-1.5`, `luma-ray3`, and `pika-2.5` are stored as if they were selected models. The architecture rule is that those names are not distinct council models. The rows are history, not proof the current router would submit them.

Keyframes or image-like URLs: 24 clips. There is no `GeneratedImage` table. The one generated still is `Asset.generatedImage` on the character asset.

`RenderJob` total 107.

| Type | Status | Rows | Older than 1 day | Older than 7 days |
|---|---|---|---|---|
| GENERATE | CANCELLED | 70 | 70 | 19 |
| GENERATE | FAILED | 11 | 11 | 0 |
| GENERATE | PROCESSING | 11 | 11 | 5 |
| GENERATE | NEEDS_ATTENTION | 8 | 8 | 7 |
| GENERATE | COMPLETE | 6 | 5 | 0 |
| LORA_TRAIN | FAILED | 1 | (in the 12 failed) | 0 |

Failed jobs in the age query total 12, which is the 11 generate failures plus the 1 LoRA failure.

Eleven `PROCESSING` jobs are all older than a day, five older than a week. Nothing is actively rendering. Those rows are zombies. `User.totalGenerated` is 0 even though 12 clips and 6 jobs reached a completed state, so the counter is not wired to completion.

`ShotError`: 57. `SegmentCheckpoint`: about 124 estimated. `SegmentLedger`: about 12. `ApiUsageLog`: about 13. `RewardSignal`: about 56. `EpisodicMemory`: about 48. `ModelConstraint`: about 60.

Audio: 1 track, type `MUSIC`, status `READY`, provider `ELEVENLABS`.

### 2.6 LoRA training

| Table | Rows |
|---|---|
| `TrainingRun` | 0 |
| `TrainedAsset` | 0 |
| `TrainingData` | about 5 |
| `TrainingSignal` | 0 |
| Render job `LORA_TRAIN` | 1, status `FAILED` |
| Character `loraStatus` | 1 stuck at `TRAINING` |

No trained weights are stored. The training pipeline can be called from `/api/studio/training` and `/api/studio/production/train`, and the worker is `src/workers/training-pipeline.ts`. It has not produced a stored LoRA in this database.

---

## 3. Architecture and wiring

Three hosts:

| Host | Path | Role |
|---|---|---|
| Web | `/Users/imac/cinema/cinema` | Next.js App Router, Prisma, BullMQ workers, the paid spine |
| Desktop | `cinematic-forge-v3` (symlink inside the web repo) | Electron flagship. Deep grade, mixer, local models, ship, keychain |
| Mobile | `/Users/imac/cinema/cinema-mobile` | Expo. Login, generate, vault, jobs, camera. Thin client of the web API |

Shared package: `packages/core` (`@cinema/core`). The app resolves it to `dist`. Jest resolves it to `packages/core/src/index.ts`.

### 3.1 Paid-call spine

```
UI / route
  → checkAccess(userId, credits)          src/lib/access/guard.ts
  → runFal / submitToFal / providerSubmit src/lib/fal/client.ts
       → guardedFalSubmit                 packages/core/src/fal/guardedSubmit.ts
            → generationPausedFromEnv
            → fal.queue.submit
  → LLM: postFalRouterChat / claudeCall   packages/core/src/llm/falRouter.ts
  → endpoint id: falEndpoint(key)         packages/core/src/logic/endpointCatalog.ts
  → mirror: storage key on completion     R2 via src/lib/storage/r2.ts
  → timeline: one web recipe              usePlaybackStore.recipe
  → reconcile: DB shot is truth           reconcileTimeline
```

A missing catalog key throws `Unknown submitted endpoint`. Feature code is supposed to pass catalog keys, not raw `fal-ai/` strings. The endpoint checker last run in the build session reported 0 strings outside `packages/core/src/logic/`.

Local models are a separate leaf: `submitLocalTask` in `packages/core/src/logic/localIsolation.ts`. Payload whitelist is `shotPrompt`, `seed`, `referenceImages`, `duration`, `params`. Endpoint must be loopback or an allowlist. Pause throws before fetch. Cost is logged as 0. `requireLocalModel` throws if the model is unknown, disabled, or down. It does not substitute a hosted model.

### 3.2 Generation routing

```
POST /api/generate          mode director → job name orchestrate on queue render
POST /api/generate/dispatch
POST /api/studio/director/run
POST /api/studio/shot/generate
POST /api/studio/shot/direct
POST /api/studio/production/direct
POST /api/studio/production/auto-gen   credit estimate, confirm, then guarded submit
```

Worker entry `src/workers/index.ts` starts two BullMQ `Worker` instances on the same queue name `render`:

```ts
const orchestrationWorker = new Worker('render', async (job) => {
  if (job.name !== 'orchestrate') return
  // processOrchestrateJobWithRefund
})

const simpleWorker = new Worker('render', async (job) => {
  if (job.name !== 'render-simple') return
  // submitEngineVideo
})
```

BullMQ delivers each job to one consumer. If `orchestrate` lands on `simpleWorker`, the handler returns without throwing, and the job is completed without rendering. The reverse drops `render-simple`. This is a real logic bug and a credible cause of the 70 cancelled and 11 stuck `PROCESSING` rows. It was not changed in this audit.

Other workers, separate processes on Railway:

| Process | File | Queue / role |
|---|---|---|
| worker-render | `src/workers/index.ts` | queue `render` |
| worker-training | `src/workers/training-pipeline.ts` | training |
| worker-export | export queue consumer | timeline export |
| worker-das | `src/workers/das-pull.ts` | local DAS pull |
| worker-intelligence | `src/workers/intelligence-cron.ts` | debates, probes. Triple-gated |
| quality | `src/workers/quality-gate.ts` | quality gate |
| distillation | `src/workers/distillation.ts` | present, not a Railway service in the deploy set |

### 3.3 Timeline and editor

Web pages:

| Path | Role |
|---|---|
| `/` | marketing / entry |
| `/(auth)/login`, `/register`, `/signup` | auth |
| `/(editor)/simple` | simple editor |
| `/(editor)/ultimate` | ultimate editor, Dockview |
| `/(editor)/advanced` | advanced |
| `/settings` | memory and account |
| `/upgrade`, `/upgrade/success` | purchase |
| `/desktop-activate` | desktop licence |
| `/download` | desktop download |
| `/review/[token]` | guest review |
| `/watch/[embedId]`, `/branch/[embedId]` | embeds |
| `/location/aerial` | aerial location |
| `/camera/[sessionId]` | camera ingest |
| `/(legal)/terms` | terms |

Editor dock panels (`src/components/editor/EditorDock.tsx`): program, timeline, inspector, source, tools, transitions, titles, templates, extensions, transcript. Workspaces: Creator, Director, Editor, Colour, Audio, VFX, Review. Layout and keymap persist in `localStorage` key `cinema-editor:${userId}`.

Keymap presets in `src/lib/editor/keymap.ts`: Premiere, Resolve, Final Cut, Forge. Commands include transport, insert, overwrite, replace, append, ripple delete, blade, razor, slip, slide, snap, match. Import keeps only known command names.

Timeline functions that matter:

| Function | File | Behaviour |
|---|---|---|
| `mergeTimelineClips` | timeline store | one merge |
| `reconcileTimeline` | timeline | DB wins, `videoUrl` → `sourceUrl` |
| `rippleDelete`, `threePointEdit` | `src/lib/editor/foundation.ts` | editor edits |
| `rippleRemoveRange`, `removeFillers`, `assembleFromTranscript` | `src/lib/editor/gapFixes.ts` | transcript edits. Alternates track is muted and locked |
| `detectBeats`, `alignCutsToBeats` | `gapFixes.ts` | local energy peaks, no paid model |
| `expandForExport` | `src/lib/timeline/nleDepth.ts` | export uses `sourceUrl`, edit may play `proxyUrl` |
| `deepGradeFragment` | `packages/core/src/logic/deepGrade.ts` | ffmpeg fragment. DCTL name is stored and not executed |

### 3.4 Audio, review, entitlement

| Route | Function |
|---|---|
| `POST /api/studio/audio/gap` | `transcribe` (Whisper, word chunks), `crosstalk` (speech-to-text diarize, same source URL), `soundscape` (ElevenLabs sound effects). No `confirm` returns `{ estimateCredits: 8 }`. Confirm calls `checkAccess` then `runFal`. |
| `POST /api/studio/voice/take`, `/lipsync`, `/select` | voice placement |
| `POST /api/audio/speech`, `/music`, `/stems`, `/clone-voice`, `/remove-fillers` | older audio routes. Filler removal calls Whisper inside `FillerRemover` |
| `POST /api/review/create` | PIN hash, expiry, watermark. Guest payload has no project id |
| `POST /api/review/[token]/approve` | approval chain Director → Producer → Client |
| `GET/POST /api/entitlement`, `/trial`, `/activate`, `/heartbeat` | desktop licence |
| `POST /api/webhooks/stripe` | Stripe webhook |
| `POST /api/payments/subscribe`, `/deposit`, `/portal`, `/credit-pack` | checkout. No rows have landed in `StripeDeposit` or `Subscription` |
| `POST /api/credits/purchase`, `/purchase/stripe`, `/subscribe`, `GET /api/credits/balance` | credits |

---

## 4. API route tree

268 `route.ts` files under `src/app/api`. Grouped by prefix. Each line is `METHOD` implied by the file; staff should open the file for the verb.

### Auth, account, money

- `/api/auth/[...nextauth]`, `/api/auth/activate`, `/api/auth/mobile/login`, `/api/auth/register`
- `/api/admin/promote`
- `/api/credits/balance`, `/api/credits/purchase`, `/api/credits/purchase/stripe`, `/api/credits/subscribe`
- `/api/payments/credit-pack`, `/api/payments/deposit`, `/api/payments/portal`, `/api/payments/subscribe`
- `/api/webhooks/stripe`, `/api/webhooks/fal`
- `/api/entitlement`, `/api/entitlement/activate`, `/api/entitlement/heartbeat`, `/api/entitlement/trial`
- `/api/privacy`

### Generate and director

- `/api/generate`, `/api/generate/[projectId]/stream`, `/api/generate/decompose`, `/api/generate/dispatch`, `/api/generate/estimate`, `/api/generate/image`
- `/api/studio/director`, `/api/studio/director/angles`, `/api/studio/director/keyframe`, `/api/studio/director/resume`, `/api/studio/director/run`, `/api/studio/director/variation`
- `/api/studio/shot/generate`, `/api/studio/shot/direct`, `/api/studio/shot/manual`, `/api/studio/shot/anchor`, `/api/studio/shot/anchor/generate`
- `/api/studio/shot/[id]/chain`, `/api/studio/shot/[id]/error`, `/api/studio/shot/[id]/error/autofix`, `/api/studio/shot/[id]/fail`, `/api/studio/shot/[id]/library`, `/api/studio/shot/[id]/lipsync`, `/api/studio/shot/[id]/lipsync/revert`, `/api/studio/shot/[id]/rate`, `/api/studio/shot/[id]/remove`, `/api/studio/shot/[id]/reset`, `/api/studio/shot/[id]/settings`
- `/api/studio/scene/generate`, `/api/studio/continuity`, `/api/studio/storyboard`, `/api/studio/parse`
- `/api/studio/production/ingest`, `/api/studio/production/resolve`, `/api/studio/production/board`, `/api/studio/production/direct`, `/api/studio/production/auto-gen`, `/api/studio/production/train`
- `/api/jobs/create`, `/api/jobs/list`, `/api/jobs/[jobId]/status`, `/api/jobs/[jobId]/stream`, `/api/jobs/[jobId]/progress`, `/api/jobs/[jobId]/playback`

### Projects — broken dynamic segment

These two folders sit at the same URL level with different parameter names:

- `/api/projects/[id]`
- `/api/projects/[id]/save`
- `/api/projects/[id]/members`
- `/api/projects/[id]/ingest`
- `/api/projects/[id]/collab/doc`
- `/api/projects/[id]/collab/stream`
- `/api/projects/[projectId]/shots`
- `/api/projects/[projectId]/scenes`
- `/api/projects/[projectId]/rate`

Next.js does not allow `[id]` and `[projectId]` as siblings. Local `next dev` fails on this conflict. Production may be serving one of the two and dropping the other. This is the highest-confidence routing bug in the tree.

### Library, assets, characters, locations

- `/api/studio/library`, `/api/studio/library/compose`, `/api/studio/library/folders`, `/api/studio/library/items`
- `/api/studio/assets`, `/api/studio/assets/[id]`, `/api/studio/assets/[id]/use`, `/api/studio/assets/t2i`
- `/api/library/delete`, `/api/media/[id]`, `/api/media/bins`
- `/api/upload/image`, `/api/upload/audio`, `/api/upload/video`
- `/api/vault/character/create`, `/api/vault/character/list`, `/api/vault/character/import`, `/api/vault/character/[id]`
- character subroutes: `anime`, `appearance`, `bake`, `behavioral`, `choreography`, `export`, `ingest`, `ingest-sketch`, `ingest-video`, `mocap`, `roto`, `voice`, `wardrobe`
- `/api/vault/location/list`, `/api/vault/location/save`, `/api/vault/location/search`, `/api/vault/location/cesium-path`
- `/api/location/search`, `/api/location/aerial-path`, `/api/location/cesium`, `/api/location/imagery`, `/api/location/mapillary`, `/api/location/osm`

### Timeline, grade, VFX, compositor

- `/api/timeline/render`, `/api/timeline/edit`, `/api/timeline/extend`, `/api/timeline/analyse`, `/api/timeline/harmonise`, `/api/timeline/morphcut`, `/api/timeline/offline-proxy`, `/api/timeline/proxy`, `/api/timeline/reframe`, `/api/timeline/retime`, `/api/timeline/stabilise`, `/api/timeline/planar`
- `/api/studio/timeline/edit`
- `/api/studio/colour`, `/api/color/grade`, `/api/color/grade/lock`, `/api/color/grade/stream`, `/api/color/cdl`, `/api/color/lut`
- `/api/studio/compositor/render`
- `/api/vfx/motion-brush`, `/api/vfx/object-remove`, `/api/vfx/track`
- `/api/cgi/insert`, `/api/greenscreen/composite`, `/api/makeup/apply`, `/api/mogrt`
- `/api/upscale/image`, `/api/upscale/clip`, `/api/upscale/batch`

### Audio and transcript

- `/api/studio/audio/gap`
- `/api/studio/voice/take`, `/api/studio/voice/lipsync`, `/api/studio/voice/select`, `/api/studio/voices`
- `/api/audio/speech`, `/api/audio/music`, `/api/audio/music/[jobId]`, `/api/audio/track`, `/api/audio/track/[id]`, `/api/audio/track/[id]/generate`
- `/api/audio/beats`, `/api/audio/foley`, `/api/audio/stems`, `/api/audio/overdub`, `/api/audio/synthesise`, `/api/audio/clone-voice`, `/api/audio/voices`
- `/api/audio/remove-fillers`, `/api/audio/remove-silence`, `/api/audio/test`
- `/api/transcript` (exists)
- `/api/timeline/transcribe` (does not exist). `src/components/editor/TranscriptEditor.tsx` still calls it.

### Training, intelligence, review, collab

- `/api/studio/training`, `/api/studio/training/[id]`, `/api/studio/training/recommend`
- `/api/intelligence/status`, `/api/intelligence/report`, `/api/intelligence/probe`, `/api/intelligence/compare`
- `/api/cron/intelligence`, `/api/cron/process-rlhf`, `/api/cron/cleanup-jobs`, `/api/cron/endpoint-drift`
- `/api/feedback/signal`, `/api/projects/[projectId]/rate`, `/api/studio/shot/[id]/rate`
- `/api/review/create`, `/api/review/[token]`, `/api/review/[token]/approve`, `/api/review/[token]/comments`, `/api/review/stream/[token]`, `/api/review/comment`
- `/api/collab/comments`, `/api/collab/presence`, `/api/collab/permissions`, `/api/collab/conflicts`, `/api/collab/lock`, `/api/collab/lock/[clipId]`
- `/api/playbooks`, `/api/playbooks/[id]`, `/api/playbooks/suggestions`
- `/api/studio/templates`, `/api/studio/templates/[id]`

### Export, delivery, health, desktop bridge

- `/api/timeline/render`, `/api/export/dcp`, `/api/export/imf`, `/api/export/spatial`, `/api/export/stems`, `/api/delivery/imf`, `/api/ue5/export`
- `/api/desktop/download`, `/api/desktop/releases`, `/api/desktop/cognition/think`, `/api/desktop/cognition/learn`, `/api/desktop/cognition/feedback`
- `/api/crash`
- `/api/health`, `/api/health/workers`, `/api/health/queues`, `/api/health/fal`, `/api/health/cognition`, `/api/health/services`
- `/api/dev/errors`, `/api/dev/errors/[id]/replay`, `/api/dev/errors/shot/[shotId]`, `/api/dev/code`, `/api/dev/controls`, `/api/dev/quality`, `/api/debug/pipeline`

### Older or side surfaces (present, little or no database use)

Film/series: `/api/film/create`, `/api/film/[id]/produce`, `/api/series/create`, `/api/series/[id]/episode`. All film and series tables are empty.

Commerce embeds: `/api/commerce/shopify/products`, `/api/commerce/woocommerce/products`, `/api/commerce/shoppable/create`, `/api/commerce/shoppable/create-with-upload`, `/api/branch/create`, `/api/branch/create-with-upload`. `ShoppableEmbed` and `BranchingEmbed` are empty.

Social: `/api/social/publish`, `/api/auto-social`. `SocialConnection` is empty.

Camera: `/api/camera/session/start`, `/api/camera/session/[sessionId]/stop`, `/api/camera/ingest/[sessionId]`.

Other: `/api/swarm/dispatch`, `/api/swarm/decompose`, `/api/swarm/[projectId]/stream`, `/api/script/parse`, `/api/storyboard`, `/api/rough-cut/generate`, `/api/highlights/extract`, `/api/slides-to-video`, `/api/translate/video`, `/api/emotion/analyse`, `/api/casting/recast`, `/api/avatar/create`, `/api/avatar/generate`, `/api/avatar/list`, `/api/brand`, `/api/stock`, `/api/sfx/assets`, `/api/plugin`, `/api/moderation/check`, `/api/import/detect`, `/api/import/project`, `/api/interchange/import`, `/api/interchange/export`, `/api/spatial/import`, `/api/spatial/export`, `/api/production/frameio`, `/api/production/shotgrid`, `/api/analysis/match-style`, `/api/analysis/reference`, `/api/llm`, `/api/download/[id]`.

---

## 5. Desktop tool list

Electron app. Main, preload, renderer. Panels under `cinematic-forge-v3/src/renderer/components`:

| Panel | System |
|---|---|
| `GeneratePanel` | generation |
| `DirectionPanel` | director |
| `IngestionPanel` | ingest |
| `TimelinePanel` | timeline |
| `TranscriptPanel` | transcript (desktop copy; confirm it calls the web gap route before trusting it) |
| `EffectsPanel` | effects |
| `DeepGradePanel` | deep colour. Web shows a “open on desktop” note |
| `ScopesPanel` | scopes |
| `MicroSliderPanel` | micro colour |
| `MixerPanel` | deep audio: EQ, dynamics, reverb, de-esser, sends, loudness |
| `SfxLibraryPanel` | SFX |
| `ExportPanel` | export |
| `CharacterStudioPanel`, `ApparelPanel` | character and wardrobe |
| `ForgeFlowPanel` | production flow |
| `ForgeReviewPanel` | review |
| `PluginsPanel` | extension host |
| `LocalModelsPanel` | local models, `localStorage` key `cinema-local-models` |
| `MoGRTPanel` | motion graphics |
| `BranchingPanel`, `ShoppablePanel` | embeds |
| `PreferencesPanel`, `LeftPanel` | shell |

Main-process modules: `ipc`, `db` (SQLite), `jobs`, `export`, `media`, `character`, `cognition`, `plugins` (bundled plus sandbox), `keychain` (`safeStorage`, `entitlement.bin`), `osHooks` (single instance, `forge://`, `.forgeproject`), updater, crash redact, commerce, forgeflow, grade sync, review sync, presence, project sync.

IPC names confirmed in the ship and local-model work: `local-model:probe`, `local-model:run`, ship open, licence status. Preload exposes `localModels.probe` and `localModels.run`. A full IPC name dump was not completed in this pass because the preload search timed out. Staff should treat `src/preload` and `src/main/ipc` as the channel list of record.

Ship: electron-builder, dmg/zip (arm64/x64), nsis/portable/zip, AppImage/deb. Unsigned mac and Windows builds are refused unless CI secrets exist. This machine did not notarize. Auto-download is off until a sha512 signature is present.

### Mobile

Expo routes only:

- `app/auth/login.tsx`, `app/auth/register.tsx`
- `app/(tabs)/index.tsx`, `generate.tsx`, `vault.tsx`, `jobs.tsx`, `camera.tsx`
- `app/job/[id].tsx`
- client: `src/api/client.ts`, stores `auth` and `jobs`, hooks `useJobPoller`, `useNotifications`

Mobile does not own a database. It calls the web API, including `/api/auth/mobile/login`.

---

## 6. Bugs, unfinished code, and slop

Severity is for staff triage. Nothing here was patched.

### High

1. **Two consumers on queue `render`.** `src/workers/index.ts`. A job whose name does not match the worker that received it is returned as success. Orchestrate and simple renders can vanish.
2. **Dynamic route clash.** `src/app/api/projects/[id]` and `src/app/api/projects/[projectId]` cannot coexist. Local dev is blocked. One of shots, scenes, rate, save, members, ingest, or collab is unreliable in production.
3. **Zombie jobs and open holds.** 11 jobs `PROCESSING` for more than a day (5 for more than a week). 8 `NEEDS_ATTENTION`, 7 of them older than a week. 13 `ACTIVE` credit holds. 70 `CANCELLED` generate jobs.
4. **Finished video still on the provider CDN.** 10 of 13 video URLs are not object storage. 3 have a storage key. A provider URL expiry loses the picture.

### Medium

5. **`TranscriptEditor` calls a route that does not exist.** `GET /api/timeline/transcribe`. The live transcript path is `POST /api/studio/audio/gap` with `op: "transcribe"`. Two transcript UIs.
6. **Scene status stuck.** All 21 scenes are `PENDING` while 12 clips are `COMPLETED`.
7. **`totalGenerated` is 0** for every user despite completed clips and jobs.
8. **Character LoRA row stuck** at `TRAINING` with no model id, matching the one failed `LORA_TRAIN` job. No `TrainingRun` or `TrainedAsset` row was written, so the failure did not land in the training ledger.
9. **Admin accounts are `trial` / `free` in the database** while holding the credit balance. Entitlement code also treats `ADMIN` as allowed. The subscription table, which the licence feature expects, is empty. Desktop activation count is 0.
10. **OAuth access tokens at rest, no refresh token, no sessions.** Sign-in state is not what the `Session` table suggests.
11. **Orphan lowercase auth tables** beside Prisma `User` / `Account` / `Session`.
12. **Historical model ids** `pixverse-v6`, `hunyuan-video-1.5`, `luma-ray3`, `pika-2.5` stored on clips. Current council rules say those are not distinct models. Do not “fix” history by rewriting rows without a decision.
13. **`GENERATION_PAUSED` unset locally means paused**, not running. Easy to misread in ops.

### Low / unfinished, not dead

14. Cryptomatte, deep-EXR, and vector-warp are a deferred-register sentence, not nodes that comp.
15. Beat detect only runs when `clip.metadata.energy` is a number array. Clips in this database were not checked for that field. The control tells the user when samples are missing.
16. Assemble-from-transcript only matches takes that already have a `prompt` or `metadata.transcript`. It does not generate.
17. Crosstalk returns speaker time ranges on the same source URL. It does not write separate speaker files. Demucs and audio-isolation are not the speaker split.
18. DCTL and OFX script text are stored or ignored. They are not evaluated.
19. Public LUT cubes are not on disk. Film looks are ffmpeg and CSS approximations.
20. CoTracker and several older fal ids were 404 in earlier checks and must not be called. `audio-separator` may still be a catalog string from an earlier pass. Do not add a call.
21. HappyHorse stays out of the council until one clean generation. Seedance 2.5, H3 Max, and Kling 2.6 stay evaluate-only. Wan 3.0 is not the default council. Kling v3 has no `voice_id`.
22. Film, series, commerce embed, social, playbook, template, review-link, and cloned-voice tables are empty. The routes exist. The product has not used them.
23. `pg_stat.n_live_tup` is wrong (User estimate 0, exact count 3). Do not alert from estimates.
24. Manifest and `DEFERRED-REGISTER` still describe runs as unfed that the tree already contains. The register’s future-depth sentence for Cryptomatte is accurate. The manifest’s “still to feed” list is not.

### Code slop, observed not exhaustively listed

- Two transcript components (`TranscriptEditor` and `TranscriptPanel`) and a desktop `TranscriptPanel`.
- Two project id parameter names.
- Two workers, one queue.
- Credit rows with a null `type`.
- Scene status and user `totalGenerated` not maintained.
- A second auth table family.
- Prompt files for the build live in chat attachments, not in the repo the manifest claims is complete.

---

## 7. What this audit did not do

- Did not update, delete, or migrate any row.
- Did not print emails, names, token values, payment ids, or the database host.
- Did not exercise the UI in a browser. Local `next dev` is blocked by the project route clash.
- Did not finish a desktop IPC name inventory or a mobile network trace.
- Did not rebuild the import graph. Orphans above are from schema, routes, and the worker file, not from a compiler call graph.
- Did not re-run typecheck or the chokepoint scripts in this pass. The last build session, earlier the same day, reported typecheck 0, chokepoints 0, swallowed catches 0, endpoint strings outside the registry 0, and the gap-fix tests at 4 passed. That does not cover the two-worker bug or the route clash, which are structural and would still typecheck.
