# AUDIT — COMPLETE SYSTEM VERIFICATION

Date: 2026-10-04, after the register reconcile. The code and data fixes from wave 3 were already in place. This pass updated the manifest, the launch checklist, and the stale bug-register rows so they match those counts. No migration, row, or commit was made for the document edits.

Wave 3 data, re-read this pass: scenes GENERATED 1, PARTIAL 6, FAILED 14; pending-with-completed 0; legacy asset states 0; failed clips missing a reason 0; CDN-only completed clips 0; cancelled jobs tagged historical 90; seed balances 0; external ledger mismatch 0. `verify-static: 0`.

The only process gap left from this wave is the uncommitted working tree. That commit was left for a manual git action. Generation stays paused. Launch stays no-go until that commit, billing, and The Machines.

---

Earlier evening pass, kept below as the record of what was stale before the register edits.

Checked against `docs/spec-references/MANIFEST.md`, `docs/spec-references/RUN-INDEX-cursor.md`, `docs/audits/BUG-REGISTER.md`, and `docs/spec-references/LAUNCH-READINESS.md`. Static gates were run with `node scripts/verify-static.mjs`. Database figures are aggregate counts only.

## Executive summary

The pause guard, the paid-call checkers, the single render worker, the media backfill, and the wave 3 data cleanup all hold. There is no pending clip, no processing job, no active credit hold, no 20,000,000 seed, no completed clip left on a provider URL alone, and no scene that is `PENDING` while it also contains a completed clip.

The system is not launch-ready. Generation is still paused. The working tree is dirty (63 paths) on top of local `main`, which is one commit ahead of `origin/main` (`b1ec30e`). A git rollback would not match production. The manifest and the launch checklist still describe a September inventory and still list closed work as unfed.

| Sev | Finding |
|---|---|
| P1 | Git is behind production. 63 dirty paths, including runs 27–32, wave 3, and the tracking docs. Not committed. |
| P2 | `MANIFEST.md` still marks runs 5, 6, 7, 10, 11, and 16b as unfed, and it does not list runs 18–32. |
| P2 | `LAUNCH-READINESS.md` still says 9 clips need a media backfill, and that the one-worker, route-segment, dormant-auth, and pause checks are not formalised. Those checks exist and passed this pass. The backfill count is 0 CDN-only. |
| P2 | `BUG-REGISTER.md` header matches the database. The older P1-3 and P2-7 rows inside the same file still quote the pre-wave-3 counts and the dead `needs_action` wording. |
| P2 | One internal account has balance 0 and a ledger sum of 968. That is the documented historical signup grants. External mismatch is 0. Zero Google refresh tokens are stored. |
| P2 | Desktop does not host the node graph. The inspector says so (`Workspace.tsx:331`). Launch is still blocked on pause, billing (0 subscription rows), and an unverified signed desktop build. |

## 1. Build matrix

“Exit met” is Y only where this pass could see the exit in code or data. Click-through and paid generations were not run.

| Run | Manifest status | This pass | Evidence | Exit |
|---|---|---|---|---|
| F1 reconcile | DONE | BUILT | `src/lib/timeline/reconcileTimeline.ts` `reconcileTimeline` | UNVERIFIED in a browser |
| 1 orchestrator | DONE | BUILT | `src/lib/orchestration/directedRun.ts` | UNVERIFIED live |
| 2 wizard | FEED | BUILT | `src/components/ultimate/DirectorWizardStep.tsx` | UNVERIFIED all four gates |
| 5 editor | FEED | BUILT | `src/components/editor/EditorDock.tsx` Dockview; `src/lib/editor/keymap.ts` | UNVERIFIED every preset |
| 6 post suite | FEED | PARTIAL | `DEFERRED-REGISTER.md` records Wave B mounted. Not re-walked. | UNVERIFIED |
| 7 templates | FEED | BUILT | `src/components/editor/TemplateGallery.tsx` | UNVERIFIED |
| 8 voiceover | DONE | BUILT | Register and deferred text. Panel not re-opened. | UNVERIFIED |
| 9 continuity | DONE | BUILT | `StudioClip.chainFrom` column exists | UNVERIFIED |
| 10 generative edit | FEED | BUILT | `src/app/api/studio/timeline/edit/route.ts` | UNVERIFIED a paid edit |
| 11 post-AI tools | FEED | PARTIAL | Timeline edit route covers upscale, denoise, sharpen, depth, relight, isolate. Auto-reframe, scene-cut, search, and colour-match were not re-proven. | N |
| 12 intelligence | DONE | BUILT | Deferred register closes RLAIF / debates | UNVERIFIED cron |
| 13 training | DONE | BUILT | `src/lib/queue/workers/training.worker.ts` | UNVERIFIED a train |
| 14 Wave 7 | DONE | BUILT | `src/lib/orchestration/ingestPlan.ts` | UNVERIFIED a full plan |
| 15 desktop parity | PARTIAL | PARTIAL | Desktop `src/main/ai/falQueue.ts` uses `guardedFalSubmit`. Deep audio not re-measured. | UNVERIFIED |
| 16b compositor | FEED | BUILT | `src/lib/compositor/schema.ts`, `src/lib/compositor/nodes/process.ts` | UNVERIFIED preview equals export |
| 18 isolation | not listed | BUILT | `packages/core/src/logic/localModels.ts` | UNVERIFIED |
| 19 extension SDK | not listed | BUILT | `packages/core/src/logic/extensionSdk.ts` | UNVERIFIED |
| 20 review | not listed | PARTIAL | `ReviewLink` and `ReviewComment` tables exist. No live session. | UNVERIFIED |
| 21 NLE depth | not listed | UNVERIFIED | Not re-opened. | UNVERIFIED |
| 22 desktop ship | not listed | PARTIAL | `cinematic-forge-v3/electron-builder.config.cjs`, `scripts/notarize.cjs`. No signed build inspected. | N |
| 23 deep colour | not listed | PARTIAL | `ColorCorrect` and `Grade` node types. No separate colourist suite re-checked. | N |
| 24 VFX + T5 | not listed | PARTIAL | Node types in `schema.ts`. Web note in `src/lib/compositor/vfx.ts:36`. Desktop states the gap at `Workspace.tsx:331`. | N as a desktop surface |
| 25 local/BYO on | not listed | UNVERIFIED | Isolation module exists. The tier was not confirmed on. | UNVERIFIED |
| L entitlement | FEED | PARTIAL | `DesktopActivation` table and `cinematic-forge-v3/src/main/license.ts`. `Subscription` count 0. | N |
| 17 tier-2 | FEED | PARTIAL | Deferred register still lists an unbuilt per-stage model picker and a deferred error dashboard. | N |
| 26 gap fixes | not listed | UNVERIFIED | Not re-walked item by item. | UNVERIFIED |
| 27 music video | not listed | BUILT, uncommitted | `src/app/api/studio/director/music/route.ts` | Y for the rights-gated plan. No render (pause). |
| 28 feature request | not listed | BUILT, uncommitted | `src/app/layout.tsx` mounts `FeatureRequestButton`. Table exists. Row count 0. | Y for the route |
| 29 OmniHuman | not listed | BUILT, uncommitted | Catalog `bytedance/omnihuman/v1.5`. Route `src/app/api/studio/shot/performance/route.ts` | Y for quote/consent. No live call. |
| 30 geo + SAM-3D | not listed | BUILT, uncommitted | `src/app/api/studio/location/aerial/route.ts`, `src/app/api/studio/assets/mesh/route.ts` | Y for quote. No live call. |
| 31 multi-reference | not listed | BUILT, uncommitted | `src/app/api/studio/references/multi/route.ts` and VACE reuse on the timeline edit route | Y for quote. No live call. |
| 32 bulk import | not listed | BUILT, uncommitted | `src/app/api/studio/director/bundle/route.ts:109` calls `ingestBreakdown` for prose. CSV skips it. Confirm does not generate. | Y for normalise-when-unpaused. A live prose call was not made, because generation is paused. |

The manifest’s “still to feed” list (2, 5, 6, 7, 10, 11, 16b, 17, L) does not match the tree. Runs 27–32 are built and absent from the manifest.

## 2. Invariants

`node scripts/verify-static.mjs` ended `verify-static: 0` this pass.

| Rule | Result | Evidence |
|---|---|---|
| INV-1 paid chokepoint | PASS | `check-chokepoints: 0 violations` |
| INV-2 one timeline store | PASS for the named store | `reconcileTimeline` writes `usePlaybackStore` |
| INV-2 one LLM path | UNVERIFIED | A raw `messages.create` sweep was not repeated this pass |
| INV-3 registry | PASS | `check-endpoints: 0 endpoint strings outside the registry` |
| INV-4 honest UI | PASS for the desktop VFX sentence | `Workspace.tsx:331` and `vfx.ts:36` say the desktop app does not host the graph. A full control sweep was not done. |
| INV-5 swallowed catches | PASS | `check-swallowed-catches: 0` |
| INV-6 typed intent | UNVERIFIED | Not a full enum audit |
| INV-7 additive migrations | PASS | `20261004063000_asset_prompt_rules` is `ADD COLUMN IF NOT EXISTS`. No reset was run. |
| INV-8 desktop submit | PASS for submit | Desktop `falQueue.ts` imports `guardedFalSubmit` from `@cinema/core` |
| Pause default | PASS | `packages/core/src/adapters/chokepoints.ts` `generationPausedFromEnv`. Checker passed. |
| §Q no reconcile delete | PASS | `src/lib/reconcile/wave2.ts` has no `.delete(`. |
| One worker per queue | PASS | `check-one-worker: 0`. `src/workers/index.ts` exits 1. |
| No dual route segments | PASS | `check-route-segments: 0` |
| Dormant lowercase auth | PASS | Checker 0. Information-schema count of `user` / `account` / `session` / `organization` tables is 0. |

`scripts/verify.mjs` (tsc plus these gates plus `launch-invariants.test.ts`) was not re-run this pass. tsc is UNVERIFIED tonight. It was 0 on the wave 3 deploy earlier today.

## 3. Data

| Check | Count |
|---|---|
| Users | 3. Two internal ADMIN, trial/free, balance 0. One external FREE, balance 0. |
| Balance of 20,000,000 | 0 |
| Internal non-zero balance | 0 |
| `totalGenerated` vs completed clips | 12 = 12 |
| External ledger vs balance | 1 user, both 0, mismatch 0 |
| Internal ledger vs balance | 2 users, balance 0, ledger sum 968, mismatch 1 |
| Untyped credit rows | 0 |
| Credit holds | SETTLED 5, REFUNDED 13, ACTIVE 0 |
| Clips | COMPLETED 12, FAILED 45, AWAITING_DIRECTION 4, PENDING 0 |
| Completed with `storageKey` | 12. CDN-only completed: 0 |
| Failed with a reason | 45 / 45. `retryEligible`: 43 |
| Jobs | CANCELLED 90, NEEDS_ATTENTION 8, FAILED 7, COMPLETE 2, PROCESSING 0 |
| Cancelled tagged `historicalResidue` | 90 / 90 |
| Processing older than 1 day | 0 |
| Scenes | GENERATED 1, PARTIAL 6, FAILED 14. PENDING scenes that also contain a completed clip: 0 |
| Location plates | 12, all linked. Location assets: 12. `VaultLocation`: 0 |
| Asset states | imported 12, unresolved 7, generated 1. Legacy `needs_action` or `resolved`: 0 |
| Unresolved rows with `boundary.needsAction` | 7 |
| `negativePrompt` and `rules` columns | both present |
| Characters | 1 FAILED, `loraError` set. None in TRAINING |
| `Session` rows | 0 |
| `Account` rows with a refresh token | 0 of 3 |
| `Subscription` rows | 0 |
| `FeatureRequest` rows | 0 |

The internal 968 is historical signup grants beside a zeroed balance. `reconcileLedgers` selects `isInternal: false` (`wave2.ts:74`), so it does not rewrite that account. No external balance was changed.

## 4. Bug register

| ID | Verdict | Evidence |
|---|---|---|
| P0-1 one render worker | VERIFIED-FIXED | Checker: 0 queues with two consumers. `src/workers/index.ts` exits. |
| P0-2 one route segment | VERIFIED-FIXED | Checker: 0 collisions. |
| P0-3 canonical auth | VERIFIED-FIXED in this database | Uppercase `User` / `Account` / `Session` exist. Lowercase auth tables: 0. `Session` rows: 0. The older register sentence that says the lowercase tables were kept does not match this database. |
| P1-1 holds | VERIFIED-FIXED | ACTIVE holds 0. |
| P1-2 media | VERIFIED-FIXED | 12/12 completed clips have `storageKey`. CDN-only: 0. |
| P1-3 scene status | VERIFIED-FIXED | `sceneStatus.ts:10` returns `PARTIAL` when any clip is completed and the scene is not all completed. Pending-with-completed scenes: 0. The older register row that says “4 PENDING” is stale. |
| P1-4 transcript route | VERIFIED-FIXED | `TranscriptEditor.tsx` posts to `/api/studio/audio/gap`. No `src` reference to `/api/timeline/transcribe`. |
| P2-1 `totalGenerated` | VERIFIED-FIXED | 12 = 12 |
| P2-2 credit split | VERIFIED for the policy | No 20,000,000 seed. External mismatch 0. Internal ledger residual remains and is excluded from the rewrite. |
| P2-3 refresh token | CODE PRESENT, DATA NOT PROVEN | `src/lib/auth.ts` requests offline access. Stored refresh tokens: 0. |
| P2-4 training | VERIFIED-FIXED | The only character is FAILED with `loraError` set. |
| P2-5 backlog | VERIFIED-FIXED | PENDING clips 0. PROCESSING jobs 0. 45/45 failed clips have a reason. 90 cancelled jobs are tagged and were not re-queued. |
| P2-6 locations | VERIFIED-FIXED | 12 plates, 12 links, 12 location assets, 0 `VaultLocation`. |
| P2-7 assets | VERIFIED-FIXED in data | 0 legacy states. 7 unresolved rows carry `needsAction`. The first table’s P2-7 sentence still says the videos were set to `needs_action`. That sentence is stale. The wave 2 table later in the same file is the accurate one. |

## 5. Routes and endpoints

`find src/app/api -name route.ts` → 278 handlers. Segment checker: 0 collisions. The old transcript path is not referenced.

A route-by-route auth review was not done. UNVERIFIED which of the 278 omit `x-user-id` on purpose.

Registry keys present in `packages/core/src/logic/endpointCatalog.ts`: `bytedance/omnihuman/v1.5`, `kling-video/o1/reference-to-video`, `kling-video/v1.6/standard/elements`, `wan-vace-14b/inpainting`, `sam-3/3d-objects`, `flux/dev`, `birefnet`. OpenAPI was not re-fetched tonight, so live status is UNVERIFIED. The voice-clone route is `src/app/api/audio/clone-voice/route.ts`. Its current price was not re-checked.

## 6. Features 27–32

| Feature | Status | Evidence |
|---|---|---|
| 27 music video | PRESENT, uncommitted | Music route. Rights gate. No render while paused. |
| 28 feature button | PRESENT, uncommitted | Button in the root layout. Zero stored requests. |
| 29 OmniHuman | PRESENT, uncommitted | Performance route. Consent and pause. |
| 30 aerial + image-to-3D | PRESENT, uncommitted | Aerial and mesh routes. |
| 31 multi-reference | PRESENT, uncommitted | Elements, reference-to-video, VACE reuse. |
| 32 bulk import | PRESENT, uncommitted | Prose calls `ingestBreakdown` (`bundle/route.ts:109`). Structured files skip it. Confirm does not generate. A paused prose file is kept and flagged. |
| VFX-T5 | PARTIAL | Nodes and evaluator exist. Desktop says it does not host them. |
| SAM-3D | PARTIAL | Mesh is a library take. It is not a separate angle-capture generator. |

## 7. CI and launch

| Gate | This pass |
|---|---|
| chokepoints, swallowed catches, endpoints, one worker, route segments, dormant auth, pause | PASS (`verify-static: 0`) |
| tsc and `launch-invariants.test.ts` | UNVERIFIED tonight. Wired in `scripts/verify.mjs` and `.github/workflows/verify.yml:18` |
| Launch smoke | Wired at `verify.yml:19`. `e2e/launch-smoke.test.mjs` starts `e2e/launch-server.mjs`. That is a contract double, not the Next app. Not re-run tonight. |
| Web and workers from one git commit | FAIL. Working tree is dirty. `main` is ahead of `origin/main` by 1. |

Launch checklist versus the file’s own marks:

| Item | File says | This pass |
|---|---|---|
| tsc / chokepoints / swallowed / endpoints | ✅ | Chokepoints, swallowed, endpoints ✅ tonight. tsc UNVERIFIED tonight. |
| one-worker, dual-route, pause | ⬜ not formalised | ✅ They are checks inside `scripts/verify-static.mjs` and they passed. |
| dormant auth | ◑ | ✅ 0 live references and 0 lowercase tables |
| balance == ledger in CI | ⬜ | External matches. Internal is excluded on purpose. Not a CI assertion. |
| Media persistence | ⚠ 9 clips | ✅ 0 CDN-only completed clips |
| Repo equals prod | ⚠ uncommitted | ⚠ still true |
| Simple generate / The Machines | ⚠ / ⬜ | ⬜ blocked by pause. Not run. |
| Entitlement billing | ⬜ | ⬜ `Subscription` count 0 |
| Desktop signing | ⬜ | ⬜ not inspected |
| Refresh-token sign-in | ◑ | ◑ code present, 0 tokens stored |
| Credit seed wiped | ◑ | ✅ 0 users at 20,000,000 |

Go/no-go: NO-GO. Pause is on, git is not the deploy, billing rows are 0, and The Machines was not run.

## Drift list

1. `MANIFEST.md` is the 2026-09-30 inventory. It still says runs 5, 6, 7, 10, 11, and 16b are unfed, and it stops before runs 18–32.
2. `LAUNCH-READINESS.md` blockers 1 and 3 (media backfill, CI gates) are done. Blocker 2 (commit) is still open. Section 4 still says 9 clips need a backfill.
3. `BUG-REGISTER.md` wave 3 header matches the database. The first table’s P1-3 row (4 PENDING scenes) and P2-7 row (`needs_action`) do not.
4. `RUN-INDEX-cursor.md` is in the repo. It is the later feed order. The manifest does not point at the runs it added.

## Fix list (not done in this pass)

| Sev | Fix | Where |
|---|---|---|
| P1 | Commit the working tree, excluding the `cinematic-forge-v3` symlink, and push only when asked. | git status on `main` |
| P2 | Rewrite `MANIFEST.md` so runs that are in the tree are marked done, and add runs 18–32. | `docs/spec-references/MANIFEST.md` |
| P2 | Update `LAUNCH-READINESS.md` §1 and §4 and the blocker list to the checks and the 0 CDN-only count. | `docs/spec-references/LAUNCH-READINESS.md` |
| P2 | Replace the stale P1-3 and P2-7 sentences in the first bug-register table. | `docs/audits/BUG-REGISTER.md` lines 16 and 24 |
| P2 | Leave the internal 968 as documented history, or add an internal-only offset later. Do not charge anyone. | `reconcileLedgers` already skips internal accounts |
| P2 | A Google sign-in is what stores the first refresh token. Not a code change until a sign-in shows none was saved. | `src/lib/auth.ts` |

Generation stays paused. Nothing in this audit was submitted to a model.
