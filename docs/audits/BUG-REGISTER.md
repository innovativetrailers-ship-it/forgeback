# BUG REGISTER — status after FIX WAVE 2 (2026-09-30)

Source of the rows: the fed `BUG-REGISTER-3.md`. Wave 1 fixed the code paths. Wave 2 reconciled the data those paths left behind. The reconciler is `src/lib/reconcile/wave2.ts` (`runWave2Reconcile`). It also runs inside `/api/cron/cleanup-jobs`, and it can be run again safely: a second run changes nothing.

| ID | Status | What landed |
|---|---|---|
| P0-1 | ✅ code | `src/workers/index.ts` no longer starts a render worker. The only `render` consumer is `src/lib/queue/workers/render.worker.ts` (`npm run worker:render`). Unknown job types throw. A paused job is marked failed and releases its hold. |
| P0-2 | ✅ code | Project routes live only under `src/app/api/projects/[projectId]`. The `[id]` segment is gone. |
| P0-3 | 🔎 audit done, tables kept | Canonical set is Prisma `User` / `Account` / `Session` via NextAuth `PrismaAdapter`. Session strategy is JWT, so `Session` stays empty. Lowercase tables were not dropped. See `docs/audits/AUDIT-auth-canonical.md`. |
| P1-1 | ✅ code + data | Every terminal failure releases the hold. Completion writes a typed release plus a typed deduction. Holds today: 5 SETTLED, 13 REFUNDED, 0 ACTIVE. |
| P1-2 | ✅ | The 9 completed clips now have a storage key in bucket `forge` and play from that copy. A second pass scanned 0. A dead provider URL is marked media-lost and kept. The cleanup cron runs the same backfill. Local storage settings match the worker, and a put/get on `forge` succeeded. |
| P1-3 | ✅ | Scenes roll up from their clips. Today: 1 GENERATED, 2 PARTIAL, 14 FAILED, 4 PENDING. |
| P1-4 | ✅ code | `TranscriptEditor` calls `POST /api/studio/audio/gap` (`op: transcribe`). First click prices. Second click confirms. |
| P2-1 | ✅ | `totalGenerated` increments once per clip on first completion. Wave 2 reconciled every counter against completed clips: 0 needed correction. |
| P2-2 | ✅ | Internal accounts are unmetered with balance 0. Wave 2 compared every metered balance with its ledger: 0 needed correction. |
| P2-3 | ✅ code, needs a new sign-in | Google requests offline access with consent. The JWT callback keeps `refresh_token` on the token when Google returns one. The first refresh token appears on the next Google sign-in. |
| P2-4 | ✅ | Characters stuck at TRAINING are closed as FAILED after 6 hours or when there is no LoRA id. The reason is stored in `VaultCharacter.loraError` and shown under the Failed label in `VaultPanel`. The one failed character now has its reason. |
| P2-5 | ✅ data, resubmit waits on pause | 43 PENDING clips with no video were retagged FAILED with a reason in `StudioClip.statusReason`. All 43 have a keyframe or prompt, so they are marked `retryEligible`. They were not resubmitted, because generation is paused and a resubmit is a paid shot. No clip was deleted. The director shot list shows the reason as the shot error. Jobs today: 6 COMPLETE, 70 CANCELLED, 23 FAILED, 8 NEEDS_ATTENTION, 0 PROCESSING. |
| P2-6 | ✅ | The 12 `LocationPlate` rows were copied into `Asset` (`kind: location`) and linked through `LocationPlate.assetId`. Each project that referenced a plate got a `VaultLocation` with `metaJson.plateId`. No third representation was added. |
| P2-7 | ✅ | The 8 unresolved assets were resolved or flagged: 1 character asset resolved, 7 video assets set to `needs_action`. No draft timeline had an empty clip, so 0 placeholders were written. |

Schema for wave 2 is additive (`20260930234000_fix_wave_2`): `StudioClip.statusReason`, `StudioClip.retryEligible`, `VaultCharacter.loraError`, `LocationPlate.assetId`.

Pause rule was not changed: an unset `GENERATION_PAUSED` still means paused.

## Fix wave 2

| ID | Status | What landed |
|---|---|---|
| P2-5 | ✅ | Pending clips with no video are `FAILED` and kept. 43 are marked retryable. They were not resubmitted, because generation is paused. No clip was deleted. Processing jobs older than an hour with no output are failed with a reason. The cleanup cron runs this reconcile and no longer rewrites finished jobs to cancelled. |
| P2-2 | ✅ | Credit rows are typed. Non-internal balances match the sum of the ledger. Internal accounts are skipped. |
| P2-1 | ✅ | `totalGenerated` matches completed clips. The 12 completed clips belong to the internal accounts. |
| P2-4 | ✅ | The stuck character is `FAILED` with the training job's reason. A training still marked training after six hours is closed the same way. |
| P2-6 | ✅ | The 12 location plates stay, because shots point at them, and each is linked to one `Asset` of kind `location`. No second location row was added. |
| P2-7 | ✅ | Unresolved assets with no image keep `unresolved` and carry “action needed”. Assets that already have an image or weights use `generated` or `trained`. Draft clips with no media and no prompt get an honest placeholder. |
| P2-3 | ✅ code | Google offline access was already requested. The JWT callback now refreshes the Google access token before it expires. The app session stays a JWT, so an expired Google token does not sign the person out. A refresh token appears on the next Google sign-in. |
