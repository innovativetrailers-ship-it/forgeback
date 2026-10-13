# MANIFEST — every document, its run, its status (the "nothing is lost" index)
## Complete inventory of the final-fixes doc set (2026-09-30). If a file exists it is listed here with a
## status. FEED = give to Cursor; DONE = closed/struck; REF = reference (don't feed). Cross-check against
## RUN-INDEX-cursor.md (the feed order) + DEFERRED-REGISTER.md (what's not built) + HANDOVER.md (resume).
##
## ═══ FEED COMPLETE — RECONCILED 2026-10-04 (evening AUDIT-COMPLETE) ═══
## ALL build prompts F1–32 are BUILT and in the working tree (Runs 27–32 + Fix-Waves 1/2/3 included). The
## per-row "⏳ FEED" marks below are HISTORICAL — feeding is done. The ONLY open build-side item is: COMMIT
## the tree (prod is ahead of git — 63 dirty paths). Launch remains gated (pause ON, 0 Subscription rows,
## desktop signed-build unverified, The Machines not run) — see LAUNCH-READINESS.md. Original note follows:
## ═══ REPO IS AHEAD — RECONCILED 2026-09-30 (per docs/audits/FORENSIC-AUDIT-2026-09-30.md) ═══
## Neo fed Cursor through Run 26. The forensic audit confirms Runs 2, 5, 6, 7, 10, 11, 16b, 17, the licence
## gate (L), AND Runs 18–26 are ALREADY IN THE REPO. So the per-row "⏳ FEED" marks below are STALE — treat
## the ENTIRE build queue (F-gate · 1–26 · L) as BUILT/IN-REPO. The BUILD PHASE IS COMPLETE. Work now =
## BUG FIXES → see BUG-REGISTER.md (the QA lane) + BUILD-FIX-WAVE-1-forensic.md (the P0/P1 fixes).
## ⚠ TWO DOC-HYGIENE items the audit flagged (fix in the repo, not here): (1) the repo's copy of this
## manifest is an OLDER snapshot that omits 18–26 — REPLACE it with THIS file; (2) most build-prompt files
## aren't in docs/spec-references and that folder holds specs this manifest doesn't list — align the two so
## the repo's doc folder == this manifest (one source of truth). Recommend: put all BUILD-*/SPEC-* here and
## in docs/spec-references, and make this MANIFEST the index of that folder.

═══════════════════════════════════════════════════════════════════════
# BUILD PROMPTS (20 files) — every one mapped to a run + status
═══════════════════════════════════════════════════════════════════════
| Run | File | Status | What it is |
|---|---|---|---|
| F-gate | BUILD-F1-timeline-project-and-reconcile-guard.md | ✅ DONE (green) | Foundation: clip lands/plays + reconcile guard (F1). |
| 1 | FIX-orchestrator-audit-reconcile.md | ✅ DONE | Audit-reconcile: keyframe fallback, Sonnet tier, resilient R2, JSON, Draft default. |
| 2 | BUILD-director-control-wizard.md | ⏳ FEED (confirm — may be closed w/ Wave 7) | The control frame: steppable orchestrate + Mode/Batch + 4 gates + import + save-to-library + location audit. |
| 3 | BUILD-WAVE-1-close-now.md | ✅ DONE | Honesty debt + cheap wires + D4 audio + Simple message. |
| 4 | BUILD-WAVE-B-LIBRARY-media-bin-and-drag.md | ✅ DONE | Foldered media bin, nothing auto-places, drag-to-timeline. |
| 5 | BUILD-editor-foundation.md | ⏳ FEED | Real editor: Dockview docking + workspaces + toolbars + keymap presets + pro workflow + creator layer + transition browser + titles. |
| 6 | BUILD-WAVE-B-post-production-suite.md | ⏳ FEED | Grade → effects → audio → master → export on imports (web CORE). |
| 7 | BUILD-templates.md | ⏳ FEED | Generative templates: gallery + apply (seeds wizard) + save-as-template. |
| 8 | BUILD-WAVE-B5-voiceover-finetune-panel.md | ✅ DONE | Voice at placement (prompted+priced) + speech toolbar + lip-sync. |
| 9 | BUILD-WAVE-2-chained-continuity.md | ✅ DONE | Continuity feed-forward + transitions/cuts + thread-anchor bridge. |
| 10 | BUILD-timeline-generative-editing.md | ⏳ FEED | In-timeline FX/bridge/extend/speed-ramp — EXTENDS Repaint/Motion-Brush/continuity (audit-first). |
| 11 | BUILD-post-ai-tools.md | ⏳ FEED | AI-enhance set: upscale/denoise/deblur/depth/relight/auto-reframe/voice-isolate/scene-cut/search/colour-match. |
| 12 | BUILD-WAVE-3-orchestrator-intelligence.md | ✅ DONE | Learning loop (RLAIF) + rating + KNOW-live + debates + pusher. |
| 13 | BUILD-WAVE-4-training-lane.md | ✅ DONE | Asset model + open-weight base + LoRA training + backup/continuity + T2I + variations. |
| 14 | BUILD-WAVE-7-production-workflow.md | ✅ DONE | Capstone: plan ingestion → resolution → DAG auto-gen → compile. |
| 15 | BUILD-WAVE-5-desktop-parity.md | ◑ PARTIAL | Shared-contracts (submit/LLM/store/3D/crash) ✅ DONE; W5-T6 deep desktop AUDIO ⏳ FEED (flagship depth). |
| 16 | BUILD-WAVE-6-moat-control-layer.md | ◑ PARTIAL | 6.1 overlays + 6.2 tracker + 6.3 transform-keyframes ✅ DONE; the doc now points to 16b for the rest. |
| 16b | BUILD-WAVE-6.4-node-compositor.md | ⏳ FEED | Node compositor (6.4a→d) + 2.5D (6.5) — wraps 6.1/6.2/6.3 + effects/grade + Run 10 mask as NODES. |
| 17 | BUILD-WAVE-TIER2-controls-and-polish.md | ⏳ FEED | Non-gated residuals: memory toggles · bypass · clip-delete (§Q) · trainer UI · subtitle verify · ops decision. |
| L | BUILD-ACCOUNT-entitlement-and-desktop-license.md | ⏳ FEED (launch gate) | Membership/entitlement on NextAuth+Prisma/Neon + desktop licence lock (Ultimate / $300yr / 30-day trial; access-only, hosted calls billed, local free). |
| 18 | BUILD-local-model-isolation.md | ⏳ FEED (desktop, security gate) | GAP-1: local model = untrusted leaf executor; only task payload; no orchestrator/system-code exposure; Forge runs no ComfyUI code; returns validated untrusted. Gates the local tier. |
| 19 | BUILD-plugin-extension-SDK.md | ⏳ FEED (desktop-flagship) | GAP-2: first-party sandboxed extension SDK (panels/tools/effect-nodes/exporters) — manifest + `forge.*` API + permissions + install registry. Beyond VST/AU+OFX hosting. |
| 20 | BUILD-flagship-review-collab.md | ⏳ FEED | GAP-4a: extend ForgeReview/ForgeFlow — client portal (PIN/watermark/expiry) + multi-reviewer approval chain + real-time collaboration. Pulled forward from parked. |
| 21 | BUILD-nle-depth-and-presets.md | ⏳ FEED | GAP-4b + GAP-3: proxy/offline-online + adjustment layers + nested sequences + effect/look preset library. Pulled forward; editor depth on the one timeline. |
| 22 | BUILD-desktop-ship-pipeline.md | ⏳ FEED (desktop, LAUNCH-BLOCKING) | Package/sign/notarize/auto-update + installers + OS wiring (keychain, forge:// deep-link, native menus, file assoc, single-instance). Unblocks Run L Part B. |
| 23 | BUILD-desktop-colour-grade-suite.md | ⏳ FEED (desktop-flagship) | Full colourist suite (wheels/curves/qualifier/power-windows/node-grade/ACES-HDR/DCTL) as the deep ColorGrade node; web keeps LUT+basic. |
| 24 | BUILD-desktop-vfx-depth.md | ⏳ FEED (desktop-flagship) | Deep roto/mask + particles/3D + OFX-style video-plugin host, as node types in the 16b compositor. |
| 25 | BUILD-local-model-enable-and-tools.md | ⏳ FEED (desktop, gated by 18) | Turn the local/BYO tier ON: Model Manager + delegate routing as isolated leaf executor + $0-meter wiring. |
| 26 | BUILD-GAP-FIXES-verified.md | ⏳ FEED | Verified-research follow-ups (routed to existing runs): keymap preset tables (→Run 5) · transcript-driven editing · beat-sync editing · assemble-from-transcript · new AI audio (crosstalk-separate + generate-soundscape) · Cryptomatte/deep-EXR/vector-warp as Run-24 future depth. |
| 27 | BUILD-music-video-mode.md | ⏳ FEED | Director Wizard music-video mode: audio import → beat/section/lyric analysis → timed breakdown + choreography → consistent cast that performs/lip-syncs to the vocals → beat-cut assembly. Music-rights gated. Extends Run 2 + 26 + 29. |
| 28 | BUILD-feature-request-button.md | ⏳ FEED | In-app feature/tool request button → FeatureRequest model (additive) → admin/dev review queue (Neo triages) → backlog. Untrusted input sanitised; optional upvotes/notify. |
| 29 | BUILD-omnihuman-performance-shots.md | ⏳ FEED | OmniHuman v1.5 (LIVE-VERIFIED) as a "performance/dialogue" shot generator (image+audio→video); the music-video (27) lip-sync engine; picker alongside LatentSync. Guarded + duration-billed. |
| 30 | BUILD-generation-utilities.md | ⏳ FEED | Geo/satellite location generator (on-demand) + image-to-3D/SAM-3D (ELEVATED: first-class consistency tool → angle-capture + Run 24 VFX). Endpoints live-verified at build. |
| 31 | BUILD-multi-reference-generation.md | ⏳ FEED | Multi-reference generation (UN-REJECTED, verified): multi-image refs (Kling Elements) + reference-to-video + video-conditioning (Wan VACE, reuses Run 10). In the references board; registry-routed; consistent. |
| 32 | BUILD-wizard-bulk-document-import.md | ⏳ FEED (URGENT) | Wizard BULK document/bundle import: pdf/md/doc/docx/txt/csv + ZIP → parse (reuse Wave 7) into breakdown + entities (characters/assets/locations each with prompt+rules+negative-prompt, additive) → verify/edit → generate characters+variations, assets+variations, locations, verify screenplay prompts, generate scenes step by step. Extends Run 2 + Wave 7 + primary→variation. |
NOTE: Run 24 now includes VFX-T5 (Cryptomatte + deep-EXR + vector-warp) ELEVATED to first-class (full Fusion parity), not "future depth".

FEED STATUS (2026-10-04): COMPLETE. All of F1–32 + Fix-Waves 1/2/3 are built and in the tree (uncommitted).
Nothing remains to feed. Next build-side action = COMMIT + push (repo==prod). The historical feed order was:
2 → 5 → 6 → 7 → 10 → 11 → 15 (W5-T6) → 16b → 17 → L → 18 → 19 → 20 → 21 → 22 → 23 → 24 → 25 → 26 → 29 → 27
→ 28 → 30 → 31 → 32, then Fix-Wave-1/2/3 + OPS-media-backfill. Verification lane now: AUDIT-COMPLETE (clean).
DESKTOP note: 22 is launch-blocking (distribution + unblocks the licence lock); 25 requires 18 first.
FLAGSHIP-GAP DECISIONS (Neo 2026-09-30): plugin = first-party SDK (19); pulled ALL parked review/collab +
NLE residuals forward (20, 21); local-model isolation is the security gate (18). See DESKTOP-FLAGSHIP-GAP-AUDIT.md.

═══════════════════════════════════════════════════════════════════════
# FIX / QA PHASE (build phase done — now stabilising; from FORENSIC-AUDIT-2026-09-30.md)
═══════════════════════════════════════════════════════════════════════
| Feed | File | What |
|---|---|---|
| audit-first (read-only) | AUDIT-auth-canonical.md | Determines which auth table set is canonical (Neo unsure). READ-ONLY; run BEFORE Fix-Wave-1 §3. |
| FIX-1 | BUILD-FIX-WAVE-1-forensic.md | P0/P1: double-worker (root cause) · route collision · dual-auth (after audit) · credit-hold release · media→R2 + backfill · scene status · transcript endpoint · counters · credit dev/user split. |
| FIX-2 | BUILD-FIX-WAVE-2-forensic.md | P2: job/clip backlog reconcile · credit-ledger reconciler · counters backfill · training records · location-model reconcile (12 plates→one) · unresolved assets/drafts · session/refresh lifecycle. Run AFTER Fix-1. |
| OPS | OPS-media-backfill.md | Run the media backfill where R2 creds are valid (Railway/cron) — the 9 CDN-only clips. URGENT. |
| FIX-CI | BUILD-LAUNCH-CI-GATES-and-e2e.md | Make the invariants self-checking: one CI gate (existing + new checks) + §Q/ledger/pause tests + e2e smoke suite, wired to block a red deploy. |
| ref | BUG-REGISTER.md (in /outputs) | The QA source of truth — every finding, severity, invariant, fix route, status. |
| ref | LAUNCH-READINESS.md (in /outputs) | The go/no-go gate: invariant gates · e2e flows · The Machines acceptance · operational + business/legal readiness · outstanding blockers. |
FIX FEED ORDER: AUDIT-auth-canonical → FIX-WAVE-1 → re-audit → FIX-WAVE-2 (✅ deployed) → OPS-media-backfill
(urgent) + COMMIT the tree → BUILD-LAUNCH-CI-GATES-and-e2e → walk LAUNCH-READINESS to green → The Machines
acceptance → go/no-go. Deploy web+worker together each time.

═══════════════════════════════════════════════════════════════════════
# REFERENCE DOCS (don't feed to Cursor — analysis / index / registers)
═══════════════════════════════════════════════════════════════════════
| File | Role |
|---|---|
| RUN-INDEX-cursor.md | THE feed order (the active index). |
| HANDOVER.md | Resume point if the chat ends: state + feed order + invariants + capture→run map. |
| MANIFEST.md | THIS file — the complete inventory. |
| DEFERRED-EXECUTION-PROGRAM.md | The full wave program + KEEP-GATED table. |
| CLOSING-PLAN-post-pipeline.md | Wave order + gating reference. |
| BUILD-QUEUE-launch-order.md | Older launch-order index (superseded by RUN-INDEX; kept for reference). |
| MASTER-TOOLS-and-panels.md | Tool/panel catalog (interaction·routing·display; web/desktop tiers). |
| GAP-REGISTER-consolidated.md · GAP-DaVinci-Resolve.md · GAP-Adobe-Premiere.md | Competitor gap analyses (bannered w/ run-number reconcile). |
| SCOPE-capcut-creator-tier.md · SCOPE-ui-workspace-docking.md | Creator-tier + docking/toolbar scoping. |
| SPEC-entity-variations-primary-reference.md | Drift-prevention primary→variation model. |
| SPEC-media-library-and-voiceover.md · SPEC-production-workflow-preproduction.md · SPEC-orchestrator-model-routing-and-self-improvement.md | Source specs the build prompts were distilled from. |
| FIX-orchestrator-llm-call-explosion.md | Historical fix (folded into Run 1 audit-reconcile). |
NOTE: the two REGISTERS live one level up in /mnt/user-data/outputs/: DEFERRED-REGISTER.md (what's not
built + triggers, with the ✅ CLOSED LOG) and IDEAS-BACKLOG-register.md (captured ideas, pre-decision).

═══════════════════════════════════════════════════════════════════════
# HOW TO USE THIS MANIFEST
═══════════════════════════════════════════════════════════════════════
- This is the whole set. If you can't find a doc, it's in the BUILD or REFERENCE table above — nothing
  lives outside these two lists.
- To FEED: work the "STILL TO FEED" order; each run's per-file loop is in RUN-INDEX / HANDOVER.
- When a run closes: flip its status here to ✅ DONE + move its DEFERRED-REGISTER rows to the CLOSED LOG.
- Update this manifest whenever a file is added or a run closes — it's the one place that lists everything.
