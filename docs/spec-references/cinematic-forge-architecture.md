# CINEMATIC FORGE — SYSTEM ARCHITECTURE (v1)
## Engineering architecture, not a feature showcase. Data contracts, interfaces,
## state ownership, dependency order. This is the thing you WIRE AGAINST.
## Companion to the June 2026 Feature Showcase (that = the WHAT; this = the HOW).

## v1 STRATEGY (decided)
- SPINE: full pipeline thin-slice — every stage runs end-to-end, each minimal.
- COMMODITY (NLE/color/audio/VFX): KEPT as first-class (core to the pitch), but
  v1 ships MINIMAL versions; deep parity is post-v1 depth, not v1 breadth.
- MODEL POOL: cut to 6-8 premium/specialist models. Reliable routing over pool size.

## THE ONE RULE THIS DOC ENFORCES
Every system has: (1) a defined INTERFACE (inputs/outputs as typed contracts),
(2) explicit STATE OWNERSHIP (who writes it, who reads it), (3) a single
CHOKEPOINT for anything external/paid. Bugs this session were all missing
contracts at seams. No seam ships without a contract here.

═══════════════════════════════════════════════════════════════════════
# PART A — THE SPINE (canonical data model + state ownership)
═══════════════════════════════════════════════════════════════════════

The whole app is a projection of ONE state tree. Every system reads/writes
defined slices. No system owns another's slice.

## A1 — Core entities (the contracts everything shares)
```typescript
Project { id, title, createdAt, settings: ProjectSettings }
Scene   { id, projectId, order, brief: CreativeBrief }
Shot {
  id, sceneId, order,
  prompt: string,
  status: 'pending'|'awaiting_direction'|'generating'|'completed'|'failed',
  // MODEL SELECTION (manual v1; cognitive later) — the substitution-bug fix:
  selectedModelId: string,        // what the USER/director chose. IMMUTABLE by pipeline.
  provider: Provider,             // derived from selectedModelId, asserted at submit
  // ANCHOR CHAIN:
  anchorFrameUrl: string | null,  // start frame (prev shot's end, or manual)
  anchorSource: 'auto'|'manual'|'keyframe'|'none',
  // RESULT (provider-agnostic, mirrored):
  videoUrl: string | null,        // ALWAYS your-R2 url (mirrored), never raw provider CDN
  sourceProviderUrl: string | null,
  lastFrame: string | null,
  durationSec: number | null,
  falRequestId: string | null,    // idempotency (runaway-loop fix)
  characterIds: string[],         // links to Character entities
  locationId: string | null,
}
Character { id, projectId, name, referenceImageUrl, seed, voiceId }  // identity persistence
Location  { id, projectId, plateUrl, coords }                        // location plate
Clip {                            // the TIMELINE projection of a completed Shot
  id, shotId, track, startSec, durationSec,
  sourceUrl: string,              // = Shot.videoUrl (R2). REQUIRED. never a thumbnail.
  posterUrl?: string,
}
```

## A2 — State ownership (who writes what — violating this = the bugs you hit)
| Slice | Owner (writes) | Readers |
|---|---|---|
| Shot.status, videoUrl, lastFrame | worker/JobRunner ONLY | UI, reconcile |
| Shot.selectedModelId | director UI ONLY (user choice) | dispatch (reads, never writes) |
| Shot.anchorFrameUrl | worker (advanceChain) + director UI (manual) | dispatch |
| Clip[] (timeline) | ONE timeline store (Zustand) | editor, Simple, player |
| Character/Location | cast/location UI + Phase-0 pre-prod | dispatch (as reference_image) |
| model_constraints | schema-sync (boot/cron) | buildPayload |

RULE: the timeline store is SINGLE. Simple mode, editor, reconcile, project-load
all import the same one. (This was the recurring empty-timeline root cause.)

## A3 — The projection principle (fixes missing-clips permanently)
The timeline is a PROJECTION of completed Shots, not an event accumulator.
`reconcileTimeline(shots)` runs on load + every shots refetch: any completed
shot with a videoUrl and no clip → add clip. Live events are an optimization;
the DB is truth. Miss an event → next reconcile heals it.

═══════════════════════════════════════════════════════════════════════
# PART B — THE PIPELINE (thin-slice, every stage, minimal)
═══════════════════════════════════════════════════════════════════════

Full spine runs end-to-end in v1. Each stage has a defined interface; each can
deepen post-v1 without changing its contract.

## STAGE 0 — Pre-Production (Patient Zero) [v1: MINIMAL]
Interface: (CreativeBrief) → { characterRefs[], locationPlates[], keyframes[] }
- v1 minimal: generate a character reference image (1 per named character) and a
  storyboard keyframe per shot via the DRAFT model (cheap). Store as Character.
  referenceImageUrl / Shot.anchorFrameUrl(keyframe).
- Deferred depth: style-consistent anchors across all refs, location generation.
- WHY in v1: character identity + keyframes are what make the anchor chain and
  consistency real. Without Stage 0, "character creation → director" stays unwired.

## STAGE 1 — Brief / Script Breakdown [v1: MINIMAL]
Interface: (userPrompt | script) → Scene.brief + Shot[] (prompt, order, duration)
- v1 minimal: one Claude call via claudeCall() chokepoint → structured shot list.
- Deferred depth: the 5-stage Cognitive Director (intent/arc/ideation/reflexion).
  v1 ships Stage 1 as a SINGLE enrichment call; the cognitive stages slot in
  BEHIND this same interface later without changing downstream contracts.
- CONTRACT so cognition can land later: breakdown output is already the
  "enriched brief" shape, just minimally filled in v1.

## STAGE 2 — Routing / Model Selection [v1: MANUAL + reliable]
Interface: (Shot) → selectedModelId (v1: user picks; later: cognitive router)
- v1: MANUAL selection in director UI. The router is a PASS-THROUGH that respects
  selectedModelId and NEVER substitutes.
- assertModelIntegrity(selectedModelId, submittedEndpoint) at submit — throws on
  mismatch. (Kills veo→ltx / grok→wan / ltx→pixverse silent swaps.)
- Deferred depth: the 9-dimension analysis + live perf matrix + procedural policy
  become the AUTOMATIC selectedModelId source, behind the same field. Manual mode
  stays as override forever.

## STAGE 3 — Generation Dispatch [v1: FULL, this is the moat]
Interface: (Shot) → GenerationResult { videoUrl, lastFrame, durationSec, provider }
- Provider dispatch switch: fal | runway | grok | (elevenlabs/suno = audio path).
- ONE chokepoint: falSubmit()/providerSubmit() — pause gate + caller source +
  idempotency (falRequestId) + attempts:2. NOTHING reaches a paid API except
  through here. (Kills runaway billing + rogue callers.)
- Schema-driven buildPayload: enums snapped, required asserted, forbidden stripped,
  audio-off flag set. (Kills per-model 422s + unwanted audio cost.)
- Mirror-to-R2 on completion → videoUrl is always your origin. (Kills CORS.)

## STAGE 4 — Anchor Chain / Continuity [v1: MINIMAL]
Interface: on Shot complete → advanceChain(nextShot, thisLastFrame)
- Sets next directable shot to awaiting_direction, anchorFrameUrl = this.lastFrame.
- Director UI renders AwaitingDirectionCard with the start frame + Direct button.
- v1 minimal: tail-to-head frame bridging. Deferred: DAG parallel chains,
  character-seed consistency enforcement.

## STAGE 5 — Quality Gate [v1: DEFERRED-STUB]
Interface: (segment) → score 0-10 → pass | repair
- v1: stub that always passes (or a cheap heuristic). Interface exists so the
  Claude-Vision scorer + auto-repair lands later without rewiring.

## STAGE 6 — Timeline / Assembly [v1: MINIMAL]
Interface: Clip[] → preview playback + export
- Reconcile clips (Part A3). Media-clock playhead, multi-clip rollover.
- v1 minimal export: FFmpeg concat. Deferred: RIFE interpolation at boundaries.

## STAGE 7 — Audio [v1: MINIMAL]
Interface: (Shot[], characters) → { voiceStems[], musicTrack, sfx[] }
- v1: ElevenLabs voice per character + Suno music, composited via FFmpeg. Video
  models generate SILENT (audio-off flag). Audio is the single sound source.
- Deferred: the full DAW, lip-sync tiers, spatial audio.

═══════════════════════════════════════════════════════════════════════
# PART C — THE MODEL POOL (cut to 6-8, each earns its place)
═══════════════════════════════════════════════════════════════════════

Cut rule: keep specialists that cover distinct routing roles; drop commodity
overlap. Each remaining model = one clear job, verified endpoint, reliable.

## v1 POOL (proposed 7 — adjust to taste)
| Role | Model | Provider | Covers | Cut because... |
|---|---|---|---|---|
| APEX/hero | Veo 3.1 | fal (fal-ai/veo3.1) | best quality, physics, hero shots | — keep |
| MOTION | Kling 3.0 | fal | locomotion, camera, lipsync | — keep |
| DIALOGUE | Seedance 2.0 | fal | faces, performance | — keep |
| CONTROL | Runway Gen-4.5 | runway direct | camera sentence in promptText | — keep direct: FAL has no verified Gen-4.5 endpoint |
| AUDIO-NATIVE | Grok Imagine | fal (`xai/grok-imagine-video`) | baked audio | — hosted on FAL; direct xAI client retired |
| VFX | PixVerse C1 | fal | particles, fluid, CGI | — keep |
| DRAFT | LTX-2.3-Fast | fal | cheap previs + keyframes | — keep (Stage 0/previs) |
DROPPED for v1: Wan, CogVideoX, HunyuanVideo, HY-Motion, SkyReels, Pika,
Minimax, LTX-2.3(full), PixVerse V6, Luma, HappyHorse, Kling O3, Hailuo.
Sora 2 is deprecated (April 2026) and is not a re-add candidate. Physics stays
on Veo 3.1.

Rationale: Runway stays the one direct video client because FAL does not publish
a verified Gen-4.5 endpoint. Grok's published FAL endpoints are
`xai/grok-imagine-video/text-to-video` and `image-to-video`. Text LLM calls go
through FAL `openrouter/router` on the existing FAL key. Image prompts still use
Anthropic, because that router input is a text prompt. OpenRouter's video API
is not a provider: schema-sync already owns per-model payloads, and a second
video vendor is not justified until those payloads keep failing.

═══════════════════════════════════════════════════════════════════════
# PART D — COMMODITY FEATURES (kept, minimal v1, deepen later)
═══════════════════════════════════════════════════════════════════════

Kept as first-class (core to "only studio you'll need"), but v1 = minimal viable
version behind a stable interface, NOT DaVinci/AE parity.

| System | v1 minimal | Deferred depth | Interface contract |
|---|---|---|---|
| NLE timeline | multi-track, trim, razor, playback | slip/slide/multicam/proxy | Clip[] + edit ops |
| Color | LUT apply + basic wheels | node graph, Micro Colour, scopes | (clip) → gradedClip |
| Audio DAW | track mix + levels | Fairlight parity, Spectrum EQ | (stems) → mix |
| VFX | drop pre-rendered effect + blend | node compositor, keying, tracking | (clip, effect) → composite |
| Effects library | subset (~20 hero effects) | full 200+ | prompt-match → effect asset |
| ForgeFlow | shot status list | Gantt, ShotGrid parity | Shot.status ↔ tracker |
| ForgeReview | share link + comment | annotations, C2PA, approvals | (clip) → review link |
| Location | search + plate (Part 15 live) | Cesium fly-through | address → Location |
| Export | FFmpeg presets | full delivery matrix, C2PA | (film) → file |

RULE: each commodity system ships its INTERFACE in v1 even if the impl is thin.
That way deepening it later never touches the spine.

═══════════════════════════════════════════════════════════════════════
# PART E — CROSS-CUTTING (the chokepoints that end bug classes)
═══════════════════════════════════════════════════════════════════════

1. providerSubmit() — ONE gate to every paid video API. Pause + source + idempotency.
2. claudeCall() — ONE gate to Anthropic. Pause + source + step-cap on agent loops.
3. mirrorToR2() — every provider output → your origin. CORS + expiry immunity.
4. schema-sync — buildPayload derives from OpenAPI. No hardcoded per-model payloads.
5. single timeline store — one source of truth for clips.
6. reconcileTimeline — DB-projection, self-healing.
These six are the immune system. Every bug this session was the ABSENCE of one.

═══════════════════════════════════════════════════════════════════════
# PART F — V2/V3 SPLIT
═══════════════════════════════════════════════════════════════════════
- V2 web: spine + generation + minimal timeline/audio + Simple/Director modes.
- V3 desktop: same spine (SQLite/JobRunner/IPC/keychain/forge-media://), plus the
  commodity NLE/color/audio depth (desktop is where pro parity makes sense).
- The spine (Part A) is IDENTICAL across both; only the adapters differ
  (fetch↔invoke, url↔path, R2↔MEDIA_DIR). One data model, two shells.

═══════════════════════════════════════════════════════════════════════
# PART G — BUILD SEQUENCE (dependency order — what to wire first)
═══════════════════════════════════════════════════════════════════════
1. Part E chokepoints (stop billing bleed, enable safe iteration). ← do first
2. Part A data model + single store + reconcile (the spine's backbone).
3. Stage 3 dispatch + Stage 2 manual routing + integrity assert (reliable gen).
4. Stage 6 timeline projection (see the output).
5. Stage 4 anchor chain + Stage 0 character refs (continuity + character→director).
6. Stage 7 audio minimal (silent video + composited sound).
7. Stage 1 breakdown minimal (prompt → shots).
8. Part D commodity interfaces (thin, behind contracts).
9. Stage 5 quality gate stub → real. Stage 1 → cognitive director (the moat).
Then: expand the model pool, deepen commodity systems, land RLAIF/memory.

## NEXT DOC: the AUDIT — map every system above to its ACTUAL code status
## (live/partial/unbuilt) so we know exactly what to wire vs build. This arch doc
## is the target; the audit is the gap; the fixes (30 docs this session) are the
## materials to close it.

═══════════════════════════════════════════════════════════════════════
# PART F (REVISED) — FLAGSHIP = V3 DESKTOP; V2 WEB = LIGHTER SIBLING
═══════════════════════════════════════════════════════════════════════
## DECIDED: V3 desktop is THE product. V2 web is the SAME spine with the
## heavy/local-compute tools omitted. Not a peer product — a feature-subset of
## the flagship. This makes "both simultaneously" cheap: nothing is built twice;
## web just doesn't MOUNT the heavy modules.

## THE MODEL — one spine, one feature registry, two profiles
```typescript
// Every capability declares a tier + host requirement:
interface Capability {
  id: string
  tier: 'core' | 'heavy'          // heavy = needs local compute / GPU / big binaries
  host: 'shared' | 'desktop-only' // desktop-only = requires Electron/native
  mount: (ctx: AppContext) => Module
}
// V3 desktop mounts: ALL capabilities.
// V2 web mounts:      tier==='core' && host!=='desktop-only'.
// ONE registry, ONE spine (Part A), ONE pipeline (Part B). The profile is a
// FILTER, not a fork. A capability is written ONCE; web omits it by tier/host.
```

## WHAT'S FLAGSHIP-ONLY (heavy — desktop mounts, web omits)
| Capability | Why desktop-only |
|---|---|
| Full NLE depth (multicam, proxy, slip/slide, canvas timeline @60fps) | local render perf, big media |
| Color science depth (node graph, scopes/WebGL, Micro Colour, ACES/OCIO) | GPU, local LUT processing |
| Audio DAW depth (Fairlight parity, Spectrum EQ, Master Suite, spatial) | DSP compute, plugin hosting |
| VFX compositor (keying, tracking, 3D camera, node graph) | GPU compositing |
| 200+ effects library (ProRes 4444, 4K alpha) | multi-GB local assets |
| ForgeFlow / ForgeReview (full) | local project DB, offline collab |
| Local media processing / offline-first / no-upload | THE moat — footage never leaves the machine |
| Format matrix (BRAW, R3D, ARRI, ProRes variants) | native codec libs |

## WHAT'S SHARED CORE (both mount — the spine + thin tools)
| Capability | Both because |
|---|---|
| Full pipeline spine (Part A entities, Part B stages 0-7) | the concept itself |
| Generation + provider dispatch + chokepoints (Part E) | the moat, host-agnostic logic |
| Model pool + routing + schema-sync | data + logic, no heavy compute |
| Anchor chain / character refs / continuity | core creative loop |
| Minimal timeline (multi-track, trim, razor, playback) | everyone needs to see clips |
| Minimal color (LUT + basic wheels) | table-stakes |
| Minimal audio (voice + music + mix) | table-stakes |
| Location scouting | already live, API-based, light |
| Export (FFmpeg presets) | both deliver films |
| Cognitive Director (when built) | server/main-process logic, host-agnostic |

## ADAPTER SEAM (the ONLY thing that differs per host — Part A unchanged)
| Concern | V3 desktop | V2 web |
|---|---|---|
| Data | SQLite (better-sqlite3) | Postgres (Prisma) |
| Jobs | in-proc JobRunner | BullMQ + Railway worker |
| Events | IPC | SSE |
| Media | MEDIA_DIR + forge-media:// (no CORS ever) | R2 + mirror + /api/media proxy |
| Secrets | OS keychain (safeStorage) | env vars (single source, no dupes) |
| Auth | desktop license/account | NextAuth (one scheme, no dup env) |
| Paid-API chokepoint | providerSubmit() in main proc | providerSubmit() in worker |
The spine calls an ADAPTER INTERFACE; each host provides its implementation.
Spine code never branches on host — it calls adapter.saveShot(), adapter.
enqueue(), adapter.mediaUrl(). Write the pipeline once; inject the host.

## CONSEQUENCE FOR BUILD (both at once, cheaply)
- Build the SPINE + CORE capabilities host-agnostically, against the adapter
  interface. Both products get them at once — free.
- Build HEAVY capabilities desktop-only. Web never sees them; no web work incurred.
- The earlier fix-v3-desktop-port docs are now INVERTED in priority: desktop is
  primary, web is the subset. Where a fix was "port web→desktop," reframe as
  "spine capability + web omits heavy." The LOGIC in those docs stands; the
  framing flips.
- Test matrix: every CORE capability tested on BOTH hosts (adapter parity);
  every HEAVY capability tested on desktop only.

## RULE THAT KEEPS IT CHEAP
No capability is implemented twice. If you're writing desktop AND web versions of
the same feature, STOP — it belongs in the shared spine behind the adapter
interface, or it's heavy and web shouldn't have it at all. Divergent
implementations of one capability = the doubled bug surface that kills
simultaneous builds.
