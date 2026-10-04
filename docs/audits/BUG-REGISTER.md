# BUG REGISTER — status after FIX WAVE 3 (2026-10-04)

Wave 3 closed the 2026-10-04 audit residuals. Job counts now: CANCELLED 90 (tagged historical residue, not re-queued), NEEDS_ATTENTION 8, FAILED 7, COMPLETE 2, PROCESSING 0. Plates link to Asset kind `location`. `VaultLocation` is empty by design. Legacy `needs_action` / `resolved` asset states are rewritten to `unresolved` / `imported` / `generated`. Internal accounts stay balance 0 and are excluded from the ledger rewrite. The 90 cancelled jobs are the pre-fix double-worker residue.

# BUG REGISTER — status after FIX WAVE 2 (2026-09-30)

Source of the rows: the fed `BUG-REGISTER-3.md`. Wave 1 fixed the code paths. Wave 2 reconciled the data those paths left behind. The reconciler is `src/lib/reconcile/wave2.ts` (`runWave2Reconcile`). It also runs inside `/api/cron/cleanup-jobs`, and it can be run again safely: a second run changes nothing.

| ID | Status | What landed |
|---|---|---|
| P0-1 | ✅ code | `src/workers/index.ts` no longer starts a render worker. The only `render` consumer is `src/lib/queue/workers/render.worker.ts` (`npm run worker:render`). Unknown job types throw. A paused job is marked failed and releases its hold. |
| P0-2 | ✅ code | Project routes live only under `src/app/api/projects/[projectId]`. The `[id]` segment is gone. |
| P0-3 | ✅ | Canonical set is Prisma `User` / `Account` / `Session` via NextAuth `PrismaAdapter`. Session strategy is JWT, so `Session` stays empty. This database has no lowercase `user` / `account` / `session` tables. |
| P1-1 | ✅ code + data | Every terminal failure releases the hold. Completion writes a typed release plus a typed deduction. Holds today: 5 SETTLED, 13 REFUNDED, 0 ACTIVE. |
| P1-2 | ✅ | All 12 completed clips have a storage key. Completed clips left on a provider URL alone: 0. A dead provider URL is marked media-lost and kept. |
| P1-3 | ✅ | Scenes roll up from the full clip mix. A scene with completed clips and clips still awaiting direction is PARTIAL. Today: 1 GENERATED, 6 PARTIAL, 14 FAILED, 0 PENDING. |
| P1-4 | ✅ code | `TranscriptEditor` calls `POST /api/studio/audio/gap` (`op: transcribe`). First click prices. Second click confirms. |
| P2-1 | ✅ | `totalGenerated` increments once per clip on first completion. Wave 2 reconciled every counter against completed clips: 0 needed correction. |
| P2-2 | ✅ | Internal accounts are unmetered with balance 0. The ledger rewrite skips `isInternal`. Historical signup grants on an internal account are not a live balance. External balances match the ledger. |
| P2-3 | ✅ code, needs a new sign-in | Google requests offline access with consent. The JWT callback keeps `refresh_token` on the token when Google returns one. The first refresh token appears on the next Google sign-in. |
| P2-4 | ✅ | Characters stuck at TRAINING are closed as FAILED after 6 hours or when there is no LoRA id. The reason is stored in `VaultCharacter.loraError` and shown under the Failed label in `VaultPanel`. The one failed character now has its reason. |
| P2-5 | ✅ data, resubmit waits on pause | Failed clips keep a `statusReason`. Jobs today: 2 COMPLETE, 90 CANCELLED (historical residue, not re-queued), 7 FAILED, 8 NEEDS_ATTENTION, 0 PROCESSING. |
| P2-6 | ✅ | The 12 `LocationPlate` rows were copied into `Asset` (`kind: location`) and linked through `LocationPlate.assetId`. `VaultLocation` stays empty. No third representation was added. |
| P2-7 | ✅ | Asset states are imported 12, unresolved 7, generated 1. The 7 unresolved rows carry `boundary.needsAction`. No row remains on `needs_action` or `resolved`. |

Schema for wave 2 is additive (`20260930234000_fix_wave_2`): `StudioClip.statusReason`, `StudioClip.retryEligible`, `VaultCharacter.loraError`, `LocationPlate.assetId`.

Pause rule was not changed: an unset `GENERATION_PAUSED` still means paused.

## Fix wave 2

| ID | Status | What landed |
|---|---|---|
| P2-5 | ✅ | Pending clips with no video are `FAILED` and kept. 43 are marked retryable. They were not resubmitted, because generation is paused. No clip was deleted. Processing jobs older than an hour with no output are failed with a reason. The cleanup cron runs this reconcile and no longer rewrites finished jobs to cancelled. |
| P2-2 | ✅ | Credit rows are typed. Non-internal balances match the sum of the ledger. Internal accounts are skipped. |
| P2-1 | ✅ | `totalGenerated` matches completed clips. The 12 completed clips belong to the internal accounts. |
| P2-4 | ✅ | The stuck character is `FAILED` with the training job's reason. A training still marked training after six hours is closed the same way. |
| P2-6 | ✅ | The 12 location plates stay, because shots point at them, and each is linked to one `Asset` of kind `location`. `VaultLocation` is empty. |
| P2-7 | ✅ | Legacy `needs_action` becomes `unresolved` with `boundary.needsAction`. Legacy `resolved` locations become `imported`. A resolved character with an image becomes `generated`. |
| P2-3 | ✅ code | Google offline access was already requested. The JWT callback now refreshes the Google access token before it expires. The app session stays a JWT, so an expired Google token does not sign the person out. A refresh token appears on the next Google sign-in. |
