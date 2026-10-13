# RUN INDEX — feed these to Cursor, one file per run, in this order
## ONE file = ONE run. Each file is internally ordered (its own tasks/phases) — do them top to
## bottom within the file. No file is split across runs. After each run: verify the gates, deploy
## web + worker together, then remove that item's row(s) from DEFERRED-REGISTER.md.
## The CLOSING-PLAN + DEFERRED-REGISTER are REFERENCE (don't feed them to Cursor).

═══════════════════════════════════════════════════════════════════════
# THE ORDER
═══════════════════════════════════════════════════════════════════════
| Run | Feed to Cursor (whole file) | What it does |
|---|---|---|
| 1 | ✅ DONE — FIX-orchestrator-audit-reconcile.md | COMPLETE (2026-09-29): the working director confirms it. Robustness: land-resilient row, keyframe fallback, Sonnet creative tier, JSON schema-constrain, Draft default. |
| **2 ← START HERE** | BUILD-director-control-wizard.md | The Director Control Wizard — steppable orchestrate (W-T0) + Mode/Batch + the 4 gates + import (image/video/3D) + angles/variations + save-to-library + location audit. The control frame. |
| 3 | BUILD-WAVE-1-close-now.md | Honesty debt + cheap wires + D4 audio finish + Simple message. |
| 4 | BUILD-WAVE-B-LIBRARY-media-bin-and-drag.md | Foldered media library, nothing auto-places, drag-to-timeline. |
| 5 | BUILD-editor-foundation.md | Make Forge a REAL editor: Dockview docking + workspaces + customisable/floating toolbars + keymap (Premiere/Resolve/FCP presets) + pro workflow (source⟷program, 3-point, trim modes) + creator layer (drag-edit, overlay/text/sticker tracks) + transition browser + titles/graphics. The shell the suite mounts into. |
| 6 | BUILD-WAVE-B-post-production-suite.md | Mount into the shell: grade → effects → audio → master → export (on imported footage). |
| 7 | BUILD-templates.md | Generative TEMPLATES (creator-tier growth): gallery + apply (seeds the wizard) + save-as-template. Reuses the breakdown schema. |
| 8 | BUILD-WAVE-B5-voiceover-finetune-panel.md | Voice at placement (prompted + priced) + the speech toolbar + lip-sync. |
| 9 | BUILD-WAVE-2-chained-continuity.md | Continuity feed-forward + transitions/cuts + the thread-anchor bridge. |
| 10 | BUILD-timeline-generative-editing.md | In-timeline generative editing — EXTENDS existing (audit first): in-timeline FX (Repaint/Motion-Brush → Wan VACE inpaint + tracked mask), generative BRIDGE (reuse Wave 2 first-last-frame), EXTEND (reuse i2v), speed-ramp + motion blur. Adds LTX-2.5/Hunyuan/VACE/Void/Pika/Kling-O1 to the registry. |
| 11 | BUILD-post-ai-tools.md | The AI-enhance set (Resolve/Premiere parity): upscale/denoise/deblur/sharpen · depth/relight/DoF · AUTO-REFRAME (launch cut-downs) · voice-isolate/enhance/match · scene-cut-detect · media-search · colour-match. One guarded, priced, registry op → library take. |
| 12 | BUILD-WAVE-3-orchestrator-intelligence.md | Learning loop (RLAIF) + rating + KNOW-live + debates + pusher (backend). |
| 13 | BUILD-WAVE-4-training-lane.md | Asset model + open-weight base + LoRA training + backup/continuity + T2I studio + variations. |
| 14 | BUILD-WAVE-7-production-workflow.md | The capstone: plan ingestion → resolution → DAG auto-gen → compile. The wizard is its front-end. |
| 15 | BUILD-WAVE-5-desktop-parity.md | Desktop TWO things: (a) shared contracts — @cinema/core (one submit/LLM/store) + 3D loaders + crash net; (b) FLAGSHIP DEPTH — deep AUDIO suite (W5-T6) + colour/VFX depth + plugin host + local/BYO + multi-monitor. Web = CORE; desktop = DEEP studio. |
| 16 | BUILD-WAVE-6-moat-control-layer.md | Overlays (6.1) + planar tracker (6.2) + transform keyframes (6.3) — ALREADY on the shared timeline (done). |
| 16b | BUILD-WAVE-6.4-node-compositor.md | The open phase of 16: node compositor (6.4a graph model → 6.4b node types → 6.4c render engine → 6.4d editor UI) + 2.5D (6.5). Feed sub-prompts a→d then 6.5. Wraps 6.1/6.2/6.3 + effects/grade + Run 10's mask as NODES (audit-first, not parallel). Web = core graph; desktop = deep (flagship). |
| 17 | BUILD-WAVE-TIER2-controls-and-polish.md | The non-gated residuals (cleanup wave): memory on/off toggles · per-stage bypass (confirm subsumed by the wizard's Hybrid gates, else expose) · clip delete (the ONE §Q-safe explicit-delete/tombstone path) · trainer UI exposure · subtitle-translation verify · ops-visibility decision. Independent tasks; strike each register row on its VERIFY. Closes the backlog to its KEEP-GATED floor. |
| L (launch-gate) | BUILD-ACCOUNT-entitlement-and-desktop-license.md | NOT a creative run — a LAUNCH GATE (required before paid/public launch). Part A: membership/entitlement on the EXISTING NextAuth+Prisma/Neon (subscription status, ONE entitlement resolver, billing webhook) — can land anytime pre-launch. Part B: desktop launcher LICENCE LOCK — desktop free for Ultimate OR $300/yr desktop sub OR a one-time 30-day trial, all meter API calls; server-signed short-lived token + heartbeat + offline grace + lock screen (pay / web / start-trial); no pirate-able key — land AFTER Wave 5. INV-1 metering intact; §Q untouched. |
| 18 (desktop, security gate) | BUILD-local-model-isolation.md | GAP-1: the isolation boundary for local/BYO models — untrusted leaf executor, only its task payload, no orchestrator/system-code exposure, Forge runs no ComfyUI code, returns validated untrusted. Gates safely turning the local tier ON. |
| 19 (desktop-flagship) | BUILD-plugin-extension-SDK.md | GAP-2: first-party sandboxed extension SDK — manifest + `forge.*` API + permissions + sandbox + install/registry. The "extensive plugin capability" platform (beyond VST/AU + OFX hosting). |
| 20 | BUILD-flagship-review-collab.md | GAP-4a: extend ForgeReview/ForgeFlow — client portal (PIN/watermark/expiry) + multi-reviewer approval chain + real-time collaboration. |
| 21 | BUILD-nle-depth-and-presets.md | GAP-4b + GAP-3: proxy/offline-online + adjustment layers + nested sequences + effect/look preset library. |
| 22 (desktop, LAUNCH-BLOCKING) | BUILD-desktop-ship-pipeline.md | Package/sign/notarize/auto-update + installers (dmg/nsis/AppImage) + OS wiring (keychain for the entitlement token, forge:// deep-link for OAuth, native menus, file associations, single-instance). Distribution + the hard dependency of Run L Part B (licence lock). |
| 23 (desktop-flagship) | BUILD-desktop-colour-grade-suite.md | The full colourist suite as the deep ColorGrade node in the 16b compositor (one grade model, one evaluator, preview==export). Web keeps LUT+basic. |
| 24 (desktop-flagship) | BUILD-desktop-vfx-depth.md | Deep roto/mask + particles/3D + OFX-style video-plugin host as node types in the 16b graph; routes to the shared tracker/mask/depth; plugins sandboxed. |
| 25 (desktop, needs 18) | BUILD-local-model-enable-and-tools.md | Turn the local/BYO tier ON: Model Manager tool + delegate routing as an isolated leaf executor (Run 18) + $0-meter submit-shape wiring; locally-trained LoRAs serve here. |
| 26 | BUILD-GAP-FIXES-verified.md | From the 2026-09-30 source-verified NLE research: verified keymap preset tables (Premiere/Resolve/FCP → Run 5), transcript-driven (text-based) editing, beat-sync editing, optional assemble-from-transcript, new AI audio (crosstalk-separate + generate-soundscape), + Cryptomatte/deep-EXR/vector-warp recorded as Run-24 future depth. Each routed to its home run (extend, not parallel). |
| 27 | BUILD-music-video-mode.md | Director Wizard MUSIC-VIDEO mode: import a track → beat/section/lyric analysis → treatment + beat-timed shot list + choreography → consistent cast performing/lip-syncing to the vocals → beat-cut assembly over the master track. Music-rights gated. Extends Run 2 + 26 (beat) + 29 (OmniHuman lip-sync). |
| 28 | BUILD-feature-request-button.md | In-app feature/tool request button → FeatureRequest model + admin/dev review queue (the in-product feed into the backlog). Untrusted input sanitised; auth+admin gated; optional upvotes/notify. |
| 29 | BUILD-omnihuman-performance-shots.md | OmniHuman v1.5 (fal-ai/bytedance/omnihuman/v1.5, LIVE-VERIFIED: image+audio→performing video) as a "performance/dialogue" shot generator + the Run-27 lip-sync engine; offered via the lip-sync picker alongside LatentSync. Guarded + duration-billed; consent-gated. (Feed BEFORE 27 for music-video lip-sync.) |
| 30 | BUILD-generation-utilities.md | Geo/satellite location generator (on-demand → the one location model) + image-to-3D/SAM-3D (ELEVATED to a first-class CONSISTENCY tool: 3D mesh from one image → exact consistent angles → reference pipeline; + Run 24 VFX input). Endpoints live-verified at build. |
| 31 | BUILD-multi-reference-generation.md | Multi-reference generation (un-rejected + live-verified): multi-IMAGE refs → one shot (Kling Elements) + reference-to-video + video-conditioning (Wan VACE, reuses Run 10). In the references board (W-T3), registry-routed, guarded, consistent via the entity model. The thin "multiple whole video clips" case handled honestly. |
| 32 | BUILD-wizard-bulk-document-import.md | URGENT. Wizard BULK document/bundle import: pdf/md/doc/docx/txt/csv + ZIP bundle carrying the whole pre-production package (script · screenplay · audio · bulk characters w/ prompt+rules+negative-prompt · bulk assets · bulk locations) → parse (reuse Wave 7) → VERIFY/edit → generate characters+variations, assets+variations, locations, verify screenplay prompts, generate scenes step by step. Extends Run 2 (wizard) + Wave 7 (ingestion) + primary→variation; additive Asset fields (negativePrompt, rules). |
| — | NOTE re Run 24 | VFX-T5 ELEVATED to first-class: Cryptomatte + deep-EXR compositing + vector-warp face-replace (full Resolve-Fusion parity) as node types in the 16b graph — no longer "future depth". |

═══════════════════════════════════════════════════════════════════════
# ONE SHARED-CONTRACT NOTE (so nothing conflicts across runs)
═══════════════════════════════════════════════════════════════════════
The ASSET DATA MODEL is the one contract that Run 2 (wizard refs/save), Run 4 (library) and
Run 9 (training) all read/write:
  Asset { id, ownerId, kind:'character'|'location'|'asset'|'style'|'voice', sourcePrompt,
    sourceRefs[], generatedImage, isPrimary, variations[], trainedLoRA{...}|null,
    usableAsReference, appearsInShots[], resolutionState }
ALL migrations are ADDITIVE (INV-7): whichever run first writes assets defines it per this shape
(kind INCLUDES location); later runs ADD fields (e.g. training adds trainedLoRA) without
rebuilding. So there is NO need to build Wave 4 first — the model grows additively in place.
(Wave 4's §4.0 is the same definition; if assets already exist from Run 2, §4.0 just verifies/
extends them.)

═══════════════════════════════════════════════════════════════════════
# PARALLELISM (optional — if two people / two Cursor sessions)
═══════════════════════════════════════════════════════════════════════
- Runs 3 (Wave 1) and 4–5 (Wave B library+suite) can go in PARALLEL with Run 2 (wizard) — they
  don't collide (different surfaces). Solo, just go 1→12 in order.
- Everything from Run 6 on is sequential (each builds on the prior).

═══════════════════════════════════════════════════════════════════════
# THE LOOP FOR EVERY RUN
═══════════════════════════════════════════════════════════════════════
1. Paste the whole file into Cursor; it does the file's tasks in order.
2. Verify: tsc 0 · check-chokepoints 0 · check-swallowed-catches 0 · check-endpoints 0 + the
   file's own VERIFY lines.
3. Deploy WEB + WORKER together (§Q).
4. Remove the cleared row(s) from DEFERRED-REGISTER.md.
5. Next run.
When only the KEEP-GATED items remain in the register (private tier, OmniHuman, delivery, workflow
parity/collab, node-UI, mobile, RAW ingest), the backlog is closed — a NOT-CLEAR gate then means a
REAL blocker again. NOTE: the desktop-flagship DEPTH (deep audio/colour/VFX, plugin hosts, local/BYO
+ ComfyUI, multi-monitor) is NOT in that gated set — it builds on the WAVE 5 desktop track (Run 15,
audio = W5-T6), with web keeping the accessible CORE.
