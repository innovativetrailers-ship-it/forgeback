# CINEMATIC FORGE — MASTER INDEX + CURSOR FEED LIST
## Navigable table of contents for the whole spec + build program, plus the exact
## ORDER to feed prompts to Cursor. Start here. Two sections:
##   A. INDEX — every document, what it is, when to read it
##   B. FEED LIST — the exact sequence to hand Cursor, with gates between steps

═══════════════════════════════════════════════════════════════════════
# SECTION A — DOCUMENT INDEX
═══════════════════════════════════════════════════════════════════════

## TIER 1 — ORIENTATION (read first, in this order)
| Doc | What it is | Read when |
|---|---|---|
| INDEX-and-feed-list.md | THIS — map + feed order | first, always |
| cinematic-forge-architecture.md | The target architecture: spine, flagship model, 7-model pool, build layers | to understand the whole |
| spec-audit-vs-reality.md | My inferred audit (superseded by the real one below) | historical — skip if short on time |
| reconciled-work-queue.md | Work queue calibrated to Cursor's REAL audit | to see priorities |
| spec-reconciliation-overlay.md | The 7 corrections where specs met reality | READ before building — it's the delta to truth |

## TIER 2 — THE SPECS (the target contracts — reference while building)
| Doc | Covers | Feeds which build |
|---|---|---|
| spec-1-data-contracts.md | Entities, adapters, state ownership | build-2 |
| spec-2-pipeline-stages.md | The 7 stages + FAL/Runway/Grok wiring | build-3,4,5 |
| spec-3-cognitive-moe.md | Cognitive Director + MoE + memory + RLAIF | build-5 |
| spec-4-character-system.md | Character creation → director, identity persistence | build-4 |
| spec-5-ui-surface-and-location.md | UI surface map + location→generation pipeline | build-4, build-6 |
| spec-6-integration-index.md | Chokepoints + pro tools + master wiring index | build-0, build-6 |

## CONTROL SPECS — per-control contracts (read when changing that system)
Called by filename. Conventions and the read-when table: `SPEC-00-INDEX-and-conventions.md`. Execution queue: `BP-00-INDEX-and-rules.md`. A SPEC is the contract. A BP is the only permission to change code, and only after that prompt is fed. Overlay still wins on conflict. BP-01 through BP-13 are not in this folder until each one is fed.

| Doc | System |
|---|---|
| SPEC-01-generation-camera.md | Generation and camera |
| SPEC-02-color-grading.md | Color and grading |
| SPEC-03-lighting-shading.md | Lighting and shading |
| SPEC-04-editing-nle.md | Editing / NLE |
| SPEC-05-vfx-compositing.md | VFX and compositing |
| SPEC-06-cgi-overlays.md | CGI and overlays |
| SPEC-07-audio.md | Audio |
| SPEC-08-style-look.md | Style / look / genre |
| SPEC-09-production-delivery.md | Production and delivery |
| SPEC-10-llm-intelligence.md | LLM / intelligence |

## BUILD PROMPTS — one chunk per session (BP-00)
Full rules: `BP-00-INDEX-and-rules.md`. Obey INV-1 through INV-8. Do not start a BP until the user feeds that file. Tier 0 before any pause lift. Each task cites its SPEC.

| Prompt | Tier | What it covers | Specs |
|---|---|---|---|
| BP-01 | 0 | Gate every ungated paid path + CI guard | SPEC-05, SPEC-06, chokepoints |
| BP-02 | 0 | Idempotency, draft-swap kill, HappyHorse hard-fail | SPEC-01 |
| BP-03 | 1 | Silent-drop: style, quality tier, native audio, CGI jobId, razor | SPEC-08, SPEC-01, SPEC-06, SPEC-04 |
| BP-04 | 1 | UI-only lies: JKL, green-screen, template, routes | SPEC-04, SPEC-05, SPEC-06 |
| BP-05 | 1 | Honesty: RAW/ProRes, 100+, 200+, 8-status claims | SPEC-04, SPEC-05, SPEC-06, SPEC-09 |
| BP-06 | 2 | Mount unmounted: LUT, ParametricEQ, scopes, tracker, subtitle translation | SPEC-08, SPEC-07, SPEC-02, SPEC-05, SPEC-09 |
| BP-07 | 2 | Expose frozen params: seed, emotion/stability, negative prompt, tiers | SPEC-01, SPEC-07, SPEC-10 |
| BP-08 | 2 | Precision: micro-color ranges, desktop parity | SPEC-02, SPEC-03 |
| BP-09 | 3 | OverlayEngine (charts/data), first of Tier 3 | SPEC-06 |
| BP-10 | 3 | Shared color/lighting engines | SPEC-02, SPEC-03 |
| BP-11 | 3 | Control-layer moat: node graph, comp camera, tracker, keyframes | SPEC-05 |
| BP-12 | 3 | Spectrum EQ + master suite | SPEC-07 |
| BP-13 | 3 | Remaining depth: per-model absents, review portal | SPEC-01, SPEC-09 |

## MODEL PIPELINE — one family per session (MP-00)
Full rules: `MP-00-INDEX-and-rules.md`. Obey INV-1 through INV-8. Verify each endpoint with a free OpenAPI fetch before wiring it. Do not start an MP until the user feeds that file. This queue does not replace the build program or the BP queue, and it does not lift `GENERATION_PAUSED`. The one real generation per mode is the user's.

| Prompt | What it covers |
|---|---|
| MP-01 | Mode-aware scaffolding only. No family data |
| MP-02 + MP-02b | Seedance family, composition, tool-exposure matrix |
| MP-03 | Kling |
| MP-04 | Veo |
| MP-05 | Wan |
| MP-06 | MiniMax / Hailuo |
| MP-07 | Grok |
| MP-08 | PixVerse |
| MP-09 | HappyHorse, after one clean generation |
| MP-10 | LTX |
| MP-11 | Image models (keyframe and reference) |
| MP-12 | Tool connection and capability gating |
| MP-13 | Chained continuity (video-reference feed-forward) |
| MP-14 | Gemini Omni Flash 1.1 (primary quality t2v; Veo stays for 4K / long) |
| MP-15 | ElevenLabs audio toolkit on FAL (separate audio provider path) |

## TRAINING STUDIO — one TR per session (TR-00)
Full rules: `TR-00-INDEX.md`. Contracts: `SPEC-training-studio-sidebar.md`, `SPEC-TRAINING-MODEL-CATALOG.md`, `SPEC-TRAINING-STUDIO-SUBCATEGORIES.md`, `SPEC-open-weight-models-in-pipeline.md`. Obey INV-1 through INV-8. Verify each trainer and `/lora` endpoint with a free OpenAPI fetch (then `fal.ai/models/<id>/llms.txt`) before wiring it. Do not start a TR until the user feeds that file. After MP-01..12. This queue does not replace the build program, BP, MP, or OR queues, and it does not lift `GENERATION_PAUSED`. Serverless FAL training — no GPU infra.

| Prompt | What it covers |
|---|---|
| TR-01 | Trainer + LoRA-inference registry (H3, Wan, LTX-2, FLUX.2, Stable Audio 3) |
| TR-02 | Train pipeline: dataset zip → fal.storage → gated trainer → queue/webhook → store LoRA |
| TR-03 | StyleLora / CharacterLora / Voice / AudioLora entities; buildPayload lora field |
| TR-04 | Sidebar UI: Characters / Assets / Styles / Voices / Music |
| TR-05 | Genre presets + domain import + rights/consent |
| TR-06 | Open-weight bases in the selectable pool (BASE + LoRA-applied) |

## WAVE 7 — PRODUCTION WORKFLOW (fed)
Full rules: `.cursor/rules/wave-7-production-workflow.mdc`. Spec: `SPEC-production-workflow-preproduction.md`. Build: `BUILD-WAVE-7-production-workflow.md`. Capstone on Waves 2, 3, 4, and B. Ingest, optional pre-production, then direct. References never block a build. Overlay still wins. Does not lift `GENERATION_PAUSED`.

| Task | What it covers |
|---|---|
| W7-T0 | Breakdown schema + Asset resolutionState / appearsInShots |
| W7-T1 | Ingest mode of the one orchestrate |
| W7-T2 | Cached resolution chain |
| W7-T3 | Pre-production board, skippable |
| W7-T4 | Cost-confirmed batch auto-gen |
| W7-T5 | Director compile |
| W7-T6 | Zero / some / trained reference levels |

## WORKFLOW PARITY — one WF per session (WF-00)
Full rules: `WF-00-INDEX.md`. Contracts: `SPEC-A2-project-context-ingestion.md`, `SPEC-A3-playbooks.md`, `SPEC-A1-realtime-collaboration.md`. Phase 2 vs InVideo Agent Two. After MP-01..12, OR-01..06, and the moat-proof narrative demo. Obey INV-1 through INV-8. Overlay still wins. This queue does not replace the build program, BP, MP, TR, or OR queues, and it does not lift `GENERATION_PAUSED`. Do not start a WF until the user feeds that file.

| Prompt | Spec | What it covers |
|---|---|---|
| WF-01 | A2 | Project context ingestion (build first — feeds the orchestrator) |
| WF-02 | A3 | Playbooks (standing overridable defaults) |
| WF-03 | A1 | Real-time collaboration (heaviest; needs FIX-K store + BP-02) |

## TIER 3 — THE BUILD PROGRAM (the ordered execution — feed to Cursor)
| Doc | Layer | Risk | Needs billable test? |
|---|---|---|---|
| cursor-audit-request.md | (pre) | none | no — read-only |
| build-0-safety-prompts.md | 0 SAFETY | low | no (static) + 1 confirm shot |
| build-1-unify-stores.md | 1 STORES | medium | 1 shot to confirm |
| build-2-shared-core.md | 2 SHARED CORE | HIGH (refactor) | no |
| build-3-generation-patches.md | 3 GEN PATCHES | low | 1 veo shot (3.1) |
| build-4-character-location-wiring.md | 4 CHAR/LOCATION | medium | 3-shot consistency test |
| build-5-connect-moat-and-audio.md | 5 MOAT + AUDIO | medium | 1 dialogue scene |
| build-6-pro-tools.md | 6 PRO TOOLS | large/ongoing | per-tool |

## TIER 4 — SESSION FIX DOCS (the ~35 debugging docs — the MATERIALS)
These are the diagnosis+fix docs from the debugging marathon. The build layers
reference them; they're the "how" behind many prompts. Consult when a build prompt
points at one. Grouped:
- Endpoints/payloads: fix-all-endpoints, fix-endpoint-schema-system-consolidated,
  fix-per-model-payloads, fix-schema-sync-system, hotfix-endpoint-namespace,
  hotfix-fal-result-urls, fix-disable-model-audio
- Routing/integrity: fix-provider-routing, fix-model-integrity-and-clip-sync,
  fix-grok-clip-and-duration, fix-provider-result-to-clip
- Billing/safety: fix-runaway-retry-loop, fix-pause-bypass-emergency,
  fix-rogue-anthropic-calls, fix-find-rogue-generator, fix-kill-eval-harness,
  hotfix-credit-preflight-sync
- Timeline/media: fix-timeline-playback-fullscreen, fix-timeline-populate-and-project-load,
  fix-addclip-rejection, fix-simple-mode-buttons, fix-provider-cors-mirror,
  fix-playback-webgl-errors, forge-fixes/ (actual code)
- Creative loop: fix-manual-direction-v2, fix-anchor-chain-ui, fix-audio-pipeline-v2,
  fix-inpaint-quality-gate, hotfix-direct-visibility
- Auth: fix-auth-configuration-error
- V3 desktop: fix-v3-desktop-complete, fix-v3-desktop-port-2
- Diagnostics: hotfix-pipeline-diagnostics, hotfix-worker-tracing

═══════════════════════════════════════════════════════════════════════
# SECTION B — THE CURSOR FEED LIST (exact order, with gates)
═══════════════════════════════════════════════════════════════════════
## Feed each block to Cursor in order. Do NOT proceed past a GATE until its checks
## pass. Keep GENERATION_PAUSED=true until Gate 0 clears.

┌─ STEP 0 — CALIBRATE ───────────────────────────────────────────────┐
│ FEED: cursor-audit-request.md                                       │
│ Cursor returns the read-only repo audit. (ALREADY DONE this session │
│ — you have the results. Re-run only if the repo changed a lot.)     │
└────────────────────────────────────────────────────────────────────┘

┌─ STEP 1 — SAFETY (build-0) ────────────────────────────────────────┐
│ FEED in order: 0.1 harness → 0.2 anthropic bypasses → 0.3 video     │
│   bypasses → 0.4 idempotency → 0.5 CI enforcement.                  │
│ ⚠ GATE 0 (must pass before ANY generation):                        │
│   [ ] grep: zero messages.create/anthropic outside anthropicClient  │
│   [ ] grep: zero raw provider POSTs outside gated wrappers          │
│   [ ] eval harness cron/entrypoint disabled                         │
│   [ ] check:chokepoints CI passes                                   │
│   [ ] deploy w/ pause ON → both dashboards ZERO calls for 15 min    │
│   [ ] then ONE manual shot, pause off → 1 submit, 0 resubmits       │
│ Billing is now safe. Everything after this is safe to experiment.   │
└────────────────────────────────────────────────────────────────────┘

┌─ STEP 2 — SPINE (build-1) ─────────────────────────────────────────┐
│ FEED in order: 1.1 map stores → 1.2 unify → 1.3 reconcile-everywhere│
│   → 1.4 mirror fallback.                                            │
│ GATE 1: [ ] one store only [ ] Simple shot appears in Ultimate      │
│   [ ] reconcile self-heals a dropped event [ ] tsc green            │
└────────────────────────────────────────────────────────────────────┘

┌─ STEP 3 — SHARED CORE (build-2) ── HIGH RISK, optional-defer ──────┐
│ FEED: 2.1 map dup → 2.2 scaffold → 2.3 types → 2.4 logic+adapter    │
│   → 2.5 prove single-spine.                                         │
│ GATE 2: [ ] @cinema/core builds, both apps import [ ] no dup spine  │
│   logic [ ] web behaviour unchanged                                 │
│ ⚠ DEFER-OK: if momentum matters more than maintainability this week,│
│   skip to STEP 4/5, return here later. Small tsc-green commits.     │
│   Revert any step that destabilises web.                            │
└────────────────────────────────────────────────────────────────────┘

┌─ STEP 4 — GEN PATCHES (build-3) ───────────────────────────────────┐
│ FEED (any order): 3.1 veo audio-off → 3.2 registry honesty →        │
│   3.3 play guards → 3.4 webgl dispose.                              │
│ GATE 3: [ ] veo silent [ ] registry truthful [ ] no AbortError spam │
└────────────────────────────────────────────────────────────────────┘

┌─ STEP 5 — CHARACTER/LOCATION (build-4) ────────────────────────────┐
│ FEED in order: 4.1 schema → 4.2 seed → 4.3 char→payload →           │
│   4.4 location→payload → 4.5 director UI.                           │
│ GATE 4 (THE CREATIVE PROOF):                                        │
│   [ ] 3-shot sequence, ONE character → consistent face all 3 shots  │
│   [ ] a located shot looks grounded in that place                   │
└────────────────────────────────────────────────────────────────────┘

┌─ STEP 6 — MOAT + AUDIO (build-5) ──────────────────────────────────┐
│ FEED PART B first (audio, morale): 5.4 audit audio → 5.5 voice →    │
│   5.6 music+mix. THEN PART A (moat): 5.1 gate → 5.2 cognition →     │
│   5.3 memory loops.                                                 │
│ GATE 5 (THE FULL CONCEPT):                                          │
│   [ ] dialogue scene, auto-routed, consistent character + voice +   │
│       music, composited → the whole pipeline running end to end     │
└────────────────────────────────────────────────────────────────────┘

┌─ STEP 7 — PRO TOOLS (build-6) ── large, parallel, ongoing ─────────┐
│ FEED by internal priority: 6.1 NLE core → 6.4 camera → 6.2 color    │
│   floor → 6.6 audio floor → 6.5 vfx floor → 6.3 light/shade →       │
│   deep systems → 6.7 breadth. Evaluate keep/alter/scope per system. │
│ No single gate — each tool evaluated on works/quality/cost/use.     │
└────────────────────────────────────────────────────────────────────┘

┌─ STEP 8 — WORKFLOW PARITY (WF-00) — PHASE 2 ───────────────────────┐
│ AFTER MP-01..12 + OR-01..06 + the moat-proof narrative demo.        │
│ FEED in order: WF-01 (A2 ingestion) → WF-02 (A3 playbooks) →        │
│   WF-03 (A1 collaboration). One WF per session. WF-01..03 fed.      │
│   this index until the user feeds that prompt. Overlay still wins.  │
└────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════
# QUICK-START (if you read nothing else)
═══════════════════════════════════════════════════════════════════════
1. You already have the repo audit. Read spec-reconciliation-overlay.md (5 min).
2. Feed build-0 to Cursor. Clear GATE 0. Billing stops leaking. ← do this first.
3. Feed build-1. Clear GATE 1. Empty-timeline bug dies.
4. Then build-3 (quick wins) + build-4 (character consistency = the creative proof).
5. build-5 Part B (audio) for a watchable film; Part A (moat) for the smart routing.
6. build-2 (shared core) whenever maintainability > momentum.
7. build-6 (pro tools) = the long parity road, built+measured piece by piece.

## LAUNCH QUEUE (The Machines)
Feed order: `BUILD-QUEUE-launch-order.md`. Entity variations (`SPEC-entity-variations-primary-reference.md`) fold into Wave 4 (`BUILD-WAVE-4-training-lane-2.md`) and Wave 7 (`BUILD-WAVE-7-production-workflow-2.md`). A shot names `(entityId, variantId?)`. Primaries generate first; variations derive from the parent image. Nothing auto-places.

## MINIMUM VIABLE DEMO = Gates 0,1,3,4 + build-5 Part B.
## That's: safe billing + working timeline + reliable gen + consistent character +
## audio = a coherent short film you can show. Everything else is depth on top.
