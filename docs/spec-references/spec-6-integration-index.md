# SPEC PHASE 6 (FINAL) — CROSS-CUTTING, FULL-SYSTEM WIRING INDEX & EVAL FRAMEWORK
## DECISION UPDATE: build the FULL system (not thin-slice). All features specced &
## wired, including DaVinci/Premiere-parity NLE + color. Chokepoints remain
## NON-NEGOTIABLE — they are what makes "build everything, remove what fails" SAFE.
## This is the capstone: proves every showcase dependency maps to a contract, and
## gives the build sequence + evaluation framework to begin implementation.

═══════════════════════════════════════════════════════════════════════
# PART 1 — THE SIX CHOKEPOINTS (enforced contracts — MANDATORY in full build)
═══════════════════════════════════════════════════════════════════════
## In a full-system build these matter MORE, not less: more surfaces = more ways
## to reach a paid API or a shared store. Each is the single enforced path for its
## concern. Nothing bypasses these — verified at build time.

| # | Chokepoint | Guarantees | Kills (bug class) |
|---|---|---|---|
| 1 | providerSubmit() | every paid video call: pause-gated, source-attributed, idempotent, logged | runaway billing, rogue callers, silent substitution |
| 2 | claudeCall() | every Anthropic call: pause-gated, source-attributed, agent-loop capped | rogue LLM spend, unbounded agents |
| 3 | persistMedia()/mirror | every provider output → your origin | CORS, expiring CDN urls |
| 4 | buildPayload (schema-driven) | payload derived from live OpenAPI, audio-off | per-model 422s, unwanted audio cost |
| 5 | single timeline store | one source of clip truth | empty/desync timeline |
| 6 | reconcileTimeline (DB projection) | timeline = completed shots, self-healing | missing clips |

```typescript
// The enforcement rule (build-time check):
// - grep the codebase: NO fetch/submit to fal/runway/xai/anthropic OUTSIDE
//   providerSubmit()/claudeCall(). Any direct call = build failure.
// - NO addClip except through the single store. NO second timeline store.
// - Every provider result passes through persistMedia before becoming videoUrl.
```
CHOKEPOINT CURSOR PROMPT:
```
Enforce the six chokepoints per spec-6 Part 1 as HARD invariants. Add a build/CI
check that greps for: direct paid-API calls outside providerSubmit/claudeCall
(fail build), addClip outside the single store, provider urls used as videoUrl
without persistMedia. Every call to a paid API carries ctx.source; agent loops
have a step cap. These hold in full-system build — every new feature that touches
generation, LLM, or media routes through the chokepoint, no exceptions.
```

═══════════════════════════════════════════════════════════════════════
# PART 2 — DAVINCI / PREMIERE PARITY SYSTEMS (now first-class, full-build)
═══════════════════════════════════════════════════════════════════════
## Previously "commodity/defer." NOW specced & wired as real systems. Desktop-
## flagship (heavy); web omits. Each has a contract; each is independently
## build-and-evaluate.

── NLE (Premiere/Resolve edit parity) [desktop] ──
```typescript
interface NLEModule {
  // timeline engine: Canvas renderer (not React DOM) for 60fps @ 1080p/24
  render(clips: Clip[], tracks: Track[]): void
  // edit ops (each a contract on the timeline store):
  select(clipIds): void;  razor(clipId, atSec): [Clip,Clip]
  trim(clipId, edge, deltaSec): Clip;  slip(clipId, deltaSec): Clip
  slide(clipId, deltaSec): Clip;  ripple(clipId, deltaSec): Clip
  threePoint(src:{in,out}, timeline:{point}, mode:'insert'|'overwrite'): void
  jlCut(clipId, audioOffset, videoOffset): void;  matchFrame(playheadSec): Frame
  multicam(angles: Clip[], syncBy:'timecode'|'waveform'): MulticamClip
  speedRamp(clipId, curve: BezierCurve, range:[number,number]): void
  opticalFlowRetime(clipId, targetFps): void   // fal FILM model via providerSubmit
  sceneDetect(clipId): Clip[];  nestSequence(clipIds): CompoundClip
  proxy(clipId): void   // H.264 720p on import
  undo(); redo()   // 100-level
}
```
CONTRACT: all ops mutate the SINGLE timeline store (chokepoint 5). opticalFlow/
FILM goes through providerSubmit (chokepoint 1). Format matrix (ProRes/BRAW/R3D/
ARRI/MXF/…) via native codec libs (desktop only).

── COLOR (DaVinci color parity) [desktop] ──
```typescript
interface ColorModule {
  // node graph — every grade is a node chain:
  addNode(type:'serial'|'parallel'|'layer', clipId): Node
  primaryWheels(node, {lift,gamma,gain, logWheels?, hdrWheels?}): void
  curves(node, {luma, r,g,b, hueSat, hueHue, satLum}): void
  qualifier(node, {type:'hsl'|'luma'|'3d', sample, ranges}): Mask
  powerWindow(node, {shape, tracker?, faceDetect?}): Window
  lut(node, {file:'.cube'|'.3dl', size:17|33|65}): void
  aces(clip, {idt, odt}): void;  ocio(config): void
  scopes(clip): { waveform, vectorscope, histogram, cie, falseColor }  // WebGL
  aiShotMatch(clip, referenceFrame): Node   // claudeCall for suggestion
  filmLab(clip): { grainHalation, stockEmulation, aiNR }  // fal restoration models
  microColour(clip, params): void   // the surgical precision panel (3-decimal)
}
```
CONTRACT: grades are non-destructive node trees per clip. aiShotMatch/Film Lab AI
via claudeCall/providerSubmit (chokepoints). Scopes via WebGL (dispose on unmount
— the WebGL-leak fix applies here, this is the heaviest WebGL surface).

── AUDIO DAW (Fairlight/Logic parity) [desktop] ──
```typescript
interface AudioModule {
  mixer(tracks): ChannelStrip[]   // fader/pan/meter/solo/mute/VCA/sends/sidechain
  dsp(channel, chain): void   // EQ, multiband comp, dynamics, deesser, reverb, delay
  spectrumEQ(channel, {mode:'standard'|'linear'|'dynamic'|'analog', bands:20}): void
  masterSuite(bus, {9-stage chain}): void   // corrective EQ→glue→MB→sat→…→limiter→dither
  stemSeparation(clip): { vocals,drums,bass,piano,other }  // Demucs via fal
  spatialAudio(objects, {atmos:'7.1.4'}): void
  adr(timecode, preroll): Take[];  foley(query): Sound[]
  aiDucking(dialogueTrack, musicTrack): void
}
```
CONTRACT: DSP is real-time (Web Audio / native). AI features (stem sep, dialogue
enhance) via providerSubmit. Spectrum EQ + Master Suite = the deep specs from the
showcase Parts 8-9, wired as modules.

── VFX COMPOSITOR (After Effects parity) [desktop] ──
```typescript
interface VFXModule {
  nodeGraph(clip): CompositorGraph;  layerStack(clip): Layer[]  // 28 blend modes
  keying(layer, {ultra|luma|difference}): Matte
  roto(layer, {aiBrush, propagate:20}): Mask   // AI roto via fal
  tracking(clip, {1pt|4pt-planar|3d-camera|ai-object}): TrackData
  stabilize(clip, {smooth|none|locked, edgeFill:'crop'|'ai'}): Clip
  motionGraphics(): { text, shapes, paths, expressions, mogrt:200 }
  effectsRack(clip, effect): Clip   // 100+ built-in
}
```
CONTRACT: composites render back as clips into the timeline. AI features (roto,
bg-removal, sky-replace, content-aware-fill) via providerSubmit.

── EFFECTS LIBRARY (200+ pre-rendered) [both, assets desktop-heavy] ──
```typescript
interface EffectsLibrary {
  search(query): Effect[]   // AI fuzzy prompt-match
  drop(clipId, effect, blendMode): Clip   // pre-rendered ProRes 4444 + alpha
}
// 9 categories (Pyro/Destruction/Fluid/Ballistic/Atmospheric/Energy/Practical/
// Crowd/Lens). v1 full: ship the library; web streams a subset, desktop bundles all.
```

── FORGEFLOW (ShotGrid parity) + FORGEREVIEW (Frame.io parity) [desktop] ──
```typescript
interface ForgeFlow { productions/episodes/sequences/shots; assetLibrary;
  shotStatus(8-stage); gantt; reports; bidirectionalLink(clip↔shot) }
interface ForgeReview { reviewPlayer; annotations(timecode); comments(threaded);
  approvalChain; clientPortal(no-account, PIN, watermark, expiry); versionStack; c2pa }
```
CONTRACT: ForgeFlow shot status ↔ Shot.status (bidirectional). ForgeReview
approval → updates ForgeFlow → updates timeline clip. The "parts know about each
other" wiring is explicit here.

DAVINCI/PREMIERE CURSOR PROMPT:
```
Implement the parity systems per spec-6 Part 2 as first-class desktop modules:
NLEModule, ColorModule, AudioModule, VFXModule, EffectsLibrary, ForgeFlow,
ForgeReview. Each mutates shared state through its contract; all AI features route
through providerSubmit/claudeCall; all timeline mutations through the single store;
color/VFX WebGL surfaces dispose contexts on unmount. Web mounts none of these
(feature filter). Build each as an independent module so it can be evaluated and
kept/altered/removed without touching the spine.
```

═══════════════════════════════════════════════════════════════════════
# PART 3 — MASTER WIRING INDEX (every showcase dependency → contract)
═══════════════════════════════════════════════════════════════════════
## The definitive "is everything specced & wired" answer. Each showcase claim →
## the spec that contracts it. If a row has a spec, it's specced. Wiring = the
## handler/route exists per Phase 5.

| Showcase system | Spec | Status target |
|---|---|---|
| Cognitive Director (5 stages) | spec-3 Part 1 | specced; build pass-through→fill |
| 4 Memory stores + RLAIF | spec-3 Part 3 | specced; bypassable |
| MoE routing / Casting Director | spec-3 Part 2 | specced |
| Live performance matrix | spec-3 Part 2d | specced |
| Schema-driven payloads | spec-2 §3c | specced+built |
| 21→7 model pool | arch Part C | specced (expandable) |
| Provider routing (FAL/Runway/Grok) | spec-2 §3 | specced+built |
| Runway → scene | spec-2 §3b-runway | specced |
| Grok native audio | spec-2 §3b-grok | specced |
| Character creation → director | spec-4 (all) | specced |
| Identity persistence (seed/ref/voice) | spec-4 Part 2-3 | specced |
| Location → scenery → director | spec-5 Part B | specced |
| Anchor chain (tail-to-head) | spec-2 §4 | specced+built |
| Quality gate (Vision) | spec-2 §5 | specced (stub→real) |
| DAG parallel generation | spec-2 §3 + arch | specced |
| RIFE stitching | spec-2 §6 (deferred) | interface specced |
| NLE (Premiere/Resolve) | spec-6 Part 2 | specced |
| Color (DaVinci) | spec-6 Part 2 | specced |
| Micro Colour panel | spec-6 Part 2 | specced |
| Audio DAW (Fairlight) | spec-6 Part 2 | specced |
| Spectrum EQ (20-band) | spec-6 Part 2 | specced |
| Master Suite (9-stage) | spec-6 Part 2 | specced |
| VFX compositor (AE) | spec-6 Part 2 | specced |
| 200+ effects library | spec-6 Part 2 | specced |
| ForgeFlow (ShotGrid) | spec-6 Part 2 | specced |
| ForgeReview (Frame.io) | spec-6 Part 2 | specced |
| Location scouting (Mapillary/Cesium) | spec-5 Part B | specced |
| Audio gen (ElevenLabs/Suno) | spec-2 §7 | specced |
| Lip sync (OmniHuman) | spec-2 §7 (deferred) | interface specced |
| Export/delivery matrix | spec-2 §6 + arch D | specced |
| Intelligence Firewall | spec-3 Part 4 | specced |
| Six chokepoints | spec-6 Part 1 | specced+built |
| UI surface map (all workspaces) | spec-5 Part A | specced |
| V2/V3 flagship split | arch Part F | specced |
| Data contracts / adapters | spec-1 | specced |

EVERY showcase system now maps to a contract. NONE is unspecced. That is the
"yes, everything is specced" answer — with the honest caveat that specced ≠ built;
built ≠ validated. The next doc (the AUDIT) maps each to ACTUAL code status.

═══════════════════════════════════════════════════════════════════════
# PART 4 — FULL-SYSTEM BUILD SEQUENCE + EVALUATION FRAMEWORK
═══════════════════════════════════════════════════════════════════════
## "Build everything, keep what works." Safe BECAUSE of the chokepoints. Order
## minimizes cascade risk; each layer is independently evaluable.

BUILD ORDER (dependency-correct):
```
LAYER 0 — SAFETY (before anything generates): 6 chokepoints (Part 1). Non-negotiable.
LAYER 1 — SPINE: Phase 1 data contracts + adapters + single store + reconcile.
LAYER 2 — GENERATION: Stages 2,3 (manual routing, dispatch, mirror, idempotency).
LAYER 3 — VISIBILITY: Stage 6 timeline projection + minimal playback.
LAYER 4 — CREATIVE LOOP: Stage 4 anchor + Stage 0 preprod + Phase 4 characters +
          Phase 5 Part B locations.
LAYER 5 — AUDIO: Stage 7 (voice/music).
LAYER 6 — INTELLIGENCE: Phase 3 cognitive director + MoE (pass-through→fill) +
          Stage 5 real quality gate + memory/RLAIF.
LAYER 7 — PRO TOOLS (desktop): Part 2 NLE, Color, Audio DAW, VFX, Effects,
          ForgeFlow, ForgeReview — each independent, build in parallel.
LAYER 8 — BREADTH: expand model pool 7→21; export matrix; lip-sync; RIFE.
```

EVALUATION FRAMEWORK (the "figure what works and doesn't"):
```
For each system, after build, evaluate on:
1. WORKS: does it produce correct output end-to-end? (functional)
2. QUALITY: is the output good enough to justify its place? (the real bar)
3. COST: does it bill acceptably? (chokepoint logs give per-system attribution)
4. VALUE: does a user actually use it, or is it feature-bloat?
DECISION per system: KEEP (works+valuable) / ALTER (works, needs tuning) /
REMOVE (fails or unused). Because systems are independent modules behind
contracts, REMOVE never breaks the spine — you delete the module, the contract
stub remains, nothing downstream cares.
```

WHY FULL-BUILD IS SAFE NOW (the reconciliation):
- Chokepoints (Layer 0) mean no experiment can runaway-bill or cascade.
- Contracts (Phase 1) mean systems compose without seam-guessing.
- Modules (Part 2) mean any system removed leaves a stub, not a hole.
- Per-system cost attribution (chokepoint logs) means "what's too expensive" is
  a data question, not a mystery.
This is the difference between "throw it all at the wall" chaos and "build the
full system, measure each part, keep what earns its place" — which is what you
described, made safe by the architecture.

## THE COMPLETE SPEC SET (all 6 phases + arch)
1. cinematic-forge-architecture.md — the target architecture + flagship model
2. spec-1-data-contracts.md — entities, adapters, ownership
3. spec-2-pipeline-stages.md — the 7 stages + provider wiring
4. spec-3-cognitive-moe.md — cognitive director + MoE + memory
5. spec-4-character-system.md — character → director wiring
6. spec-5-ui-surface-and-location.md — UI map + location pipeline
7. spec-6-integration-index.md — chokepoints + pro tools + master index + build seq

## FINAL NEXT STEP
The specs define the TARGET (full system). The remaining artifact is the AUDIT:
map every row in the Master Wiring Index (Part 3) to its ACTUAL status in your
codebase — live / partial / unbuilt — using the ~35 fix docs from this session as
the inventory of what's already built. That converts this spec set into a
prioritized WORK QUEUE against Layer 0-8.
Say "next" to build the AUDIT (spec vs reality → work queue), or "build" to start
generating the per-layer Cursor implementation prompts beginning with Layer 0.
