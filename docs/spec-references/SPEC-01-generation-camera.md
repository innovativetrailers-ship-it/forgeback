# SPEC-01 — GENERATION & CAMERA (24 controls)
# Inherits conventions from SPEC-00. Audit: 16 WIRED / 2 UI-ONLY / 0 STUB / 6 ABSENT.
# Entity: StudioClip (web) / clips (desktop). Camera intent → CameraDirection object.

═══════════════════════════════════════════════════════════════════════
# GROUP A — CORE GENERATION INPUTS
═══════════════════════════════════════════════════════════════════════

### Prompt   [WIRED]
- PURPOSE: the shot's text description; the primary generation input.
- UI: textarea, multiline. AwaitingDirectionCard.tsx:374.
- DATA: StudioClip.prompt (string). composeShotPrompt (identity.ts:45) appends
  cast + location + camera before dispatch.
- BACKEND: payload.prompt to the routed model.
- WIRING: textarea → Direct → shot.prompt → shotIdentity.ts:99 → buildPayload.
- ACCEPTANCE: typed prompt appears in the FAL request; cast/location/camera appended.
- TIER: — (works).

### Negative prompt   [ABSENT → TIER 3]
- PURPOSE: describe what to EXCLUDE from the shot.
- UI: (build) second textarea under the prompt, collapsible "Advanced".
- DATA: add StudioClip.negativePrompt (string, nullable).
- BACKEND: payload.negative_prompt — ONLY if the routed model's schema has the
  field (buildPayload already writes it when set: payload.ts:171). Per rule 3, the
  UI shows the field only for models whose schema exposes negative_prompt.
- WIRING: textarea → shot.negativePrompt → buildPayload (already conditionally sends).
- ACCEPTANCE: for a model that supports it, negative text reaches the payload; for
  one that doesn't, the field is hidden.
- BUILD SKETCH: trivial — plumbing exists, add the field + a conditional UI.

### Duration   [WIRED — range gap]
- PURPOSE: shot length in seconds.
- UI: chips 5/10/custom (Simple, TextToVideoTab.tsx:179). Ultimate only PRINTS
  shot.duration (AwaitingDirectionCard.tsx:289) — no control.
- DATA: StudioClip.duration (number). processGenerateJob.ts:61 reads it.
- BACKEND: payload.duration, SNAPPED to the model's allowed enum (rule 3).
- STATUS NOTE: current values 5/10/custom(2–120) are NOT the per-model enum.
  Veo=4/6/8, LTX=6/8/10, etc. FIX: the duration control shows the ROUTED model's
  allowed durations (from schema), and buildPayload clamps. Add a duration control
  to Ultimate (currently print-only).
- ACCEPTANCE: selecting a duration shows only the model's valid values; payload
  never 422s on duration.
- TIER: 2 (Ultimate control + schema-driven values).

### Resolution / aspect ratio   [WIRED — no per-model enum]
- PURPOSE: output dimensions + framing.
- UI: aspect chips (Simple, TextToVideoTab.tsx:211). No resolution enum. Ultimate
  has NO aspect control.
- DATA: StudioClip.aspectRatio (string), project resolution.
- BACKEND: payload.aspect_ratio + resolution, from the model's schema enums.
- STATUS NOTE: FIX — surface per-model resolution enum; add aspect to Ultimate.
- TIER: 2.

### Seed (set / lock / randomize)   [ABSENT → TIER 2]
- PURPOSE: deterministic identity/look; lock to reproduce, randomize to vary.
- UI: (build) numeric field + "lock" toggle + "randomize" (dice) button.
- DATA: StudioClip.seed EXISTS (schema.prisma:313); payload.ts:174 already sends it.
- BACKEND: payload.seed for models whose schema has seed (rule 3).
- WIRING: field/toggle → shot.seed → buildPayload (already sends).
- ACCEPTANCE: locked seed → identical output on regen; randomize → new seed each run.
- BUILD SKETCH: HIGH VALUE, CHEAP — plumbing done, add the control. Character
  consistency + "regenerate keeping the look" both depend on it. Cross-ref: SPEC-04
  character identity uses the same seed.
- TIER: 2 (cheap win).

═══════════════════════════════════════════════════════════════════════
# GROUP B — REFERENCE & FRAME INPUTS
═══════════════════════════════════════════════════════════════════════

### Reference images   [WIRED — no per-slot picker]
- PURPOSE: character/style/location identity conditioning.
- UI: thumbnails shown (AwaitingDirectionCard.tsx:535). No per-slot add/remove.
- DATA: cast membership → character.referenceUrls (shotIdentity.ts:113), capped
  per model (Veo 3, Kling 3, Seedance 9, Grok 7, Wan 4 — registry.ts:39).
- BACKEND: payload.reference_images (or model-specific field), from schema.
- STATUS NOTE: works via cast linkage; add a per-slot picker UI to choose/reorder
  which refs go in which slot. Cross-ref: SPEC-04 (character), SPEC-fix reference
  capability map (Kling/Veo/Wan/Grok are ALL reference-capable — update flags).
- TIER: 2 (slot picker) — the underlying wiring works.

### First frame   [WIRED]
- PURPOSE: the shot's opening image (anchor / uploaded / generated).
- UI: upload / generate / remove (AwaitingDirectionCard.tsx:298).
- DATA: StudioClip.anchorFrameUrl. BACKEND: payload.image_url (I2V start).
- WIRING: card → shot.anchorFrameUrl → buildPayload. Cross-ref: SPEC-04 anchor chain.
- ACCEPTANCE: uploaded/generated frame becomes the model's start image.
- TIER: — (works).

### Last frame   [WIRED]
- PURPOSE: the shot's target end image (interpolation target).
- UI: URL saved on blur (AwaitingDirectionCard.tsx:501).
- DATA: StudioClip.endFrameUrl. BACKEND: payload last-frame field, sent ONLY when
  modelAcceptsEndFrame (placeholder warns when dropped).
- STATUS NOTE: honest — it tells the user when the model drops it. Good pattern.
- TIER: — (works).

### Multi-keyframe (pin stills)   [ABSENT → TIER 3]
- PURPOSE: pin reference stills at multiple points along the clip.
- UI: (build) a mini-timeline under the shot with add-keyframe-at-position.
- DATA: add StudioClip.keyframes[] ({ url, position }).
- BACKEND: model-specific (LTX-2 multi-keyframe / Pika Frames). Only for models
  whose schema supports it. Currently LTX/Wan take one start+end only.
- BUILD SKETCH: build when a multi-keyframe model is in the pool with the API param.
- TIER: 3.

### Multi-shot (Kling)   [ABSENT → TIER 3]
- PURPOSE: multiple camera cuts in one Kling generation (up to 6).
- UI: (build) add-shot rows, each a sub-prompt, in the direction card for Kling.
- DATA: add StudioClip.subShots[] (prompt per cut).
- BACKEND: Kling 3.0 Omni multi-shot param (from schema). Cross-ref: SPEC-fix —
  Kling is the multi-shot sequence model.
- TIER: 3.

### Native-audio toggle   [UI-ONLY → TIER 1]
- PURPOSE: whether the model emits its own audio.
- UI: currently a SENTENCE (AwaitingDirectionCard.tsx:554) that says sound is
  included or silent. It does NOT control anything — silence is forced by
  resolveModel (:63) except Grok.
- FIX (TIER 1 — it lies): EITHER (a) make it a real toggle that sets the model's
  audio field where the schema supports it (and is disabled/hidden where it
  doesn't), OR (b) remove the sentence and show the model's FIXED audio behavior as
  a read-only label. Per rule 4 (honest UI), a control must match reality.
  RECOMMEND (b) for v1: read-only "This model: silent / native audio" label.
- ACCEPTANCE: the shown audio behavior matches what the model actually emits.
- TIER: 1.

═══════════════════════════════════════════════════════════════════════
# GROUP C — CAMERA (all prompt-choreography per CORRECTION-motion-brush-reality)
═══════════════════════════════════════════════════════════════════════
All camera controls write the CameraDirection object → appended to prompt via
composeShotPrompt. Per the motion-brush correction: camera = prompt text for ALL
models (no structured API camera params exist). Keep CameraDirection structured so
the future post-production control layer can render it differently (rule 5).

### Angle   [WIRED]
- UI: enum — eye/low/high/dutch/overhead/POV (AwaitingDirectionCard.tsx:484).
- DATA: CameraDirection.angle. BACKEND: appended as "Camera: <angle>...".
- WIRING: saveCamera (:140) → shot camera → composeShotPrompt → prompt.
- TIER: — (works).

### Movement   [WIRED]
- UI: enum — static/push/pull/pan/tilt/dolly/truck/crane/orbit/handheld (:488).
- DATA: CameraDirection.movement. BACKEND: prompt append. TIER: —.

### Movement speed   [WIRED]
- UI: enum — slow/medium/fast/normal/slow-motion/speed-ramp (:496).
- DATA: CameraDirection.speed. BACKEND: prompt words (not a curve). TIER: —.

### Easing   [ABSENT → TIER 3]
- PURPOSE: ease-in/out/bezier on the camera move.
- UI: (build) easing enum, later a bezier curve.
- DATA: CameraDirection.easing. BACKEND: prompt phrase now ("gently easing in");
  a real curve only in the future post-production camera layer (cross-ref: the
  control-layer moat, CORRECTION-motion-brush-reality Tier 2).
- TIER: 3.

### Shot size   [WIRED]
- UI: enum — ECU/CU/MCU/MS/MLS/WS/EWS (:480). DATA: CameraDirection.shotSize.
- BACKEND: prompt append. TIER: —.

### Lens / focal length   [WIRED — words not numeric]
- UI: enum — wide/normal/tele/24/35/50/85/anamorphic (:492).
- DATA: CameraDirection.lens. BACKEND: prompt text (not a numeric focal slider).
- STATUS NOTE: fine as prompt language; a true numeric focal-length control only
  matters in the post-production camera layer (Tier 3).
- TIER: — (works as prompt).

### Motion Brush   [ABSENT → TIER 3 — see correction doc]
- PURPOSE: paint which regions move.
- STATUS: NOT exposed by Runway API. DO NOT build a canvas that feeds nothing
  (rule 4). Two future paths (CORRECTION-motion-brush-reality): (a) gesture →
  prompt description, honestly labeled; (b) proprietary post-production motion via
  the compositor (roto + independent region motion) — the moat version.
  NOTE: a WORKING motion-brush via Kling 1.6 exists in VFX (SPEC-05) — different
  path, must be gated (Tier 0).
- TIER: 3 (proprietary build) — v1 does NOT expose it.

### Camera path keyframes   [ABSENT → TIER 3]
- PURPOSE: keyframe camera position/rotation/zoom over time.
- STATUS: no structured camera-path API param on any pool model. This is a
  POST-PRODUCTION feature (the control-layer moat) — build in the compositor with
  transform keyframes + tracking, not via the generation model.
- TIER: 3 (moat).

### DOF / focus / aperture   [ABSENT → TIER 3]
- PURPOSE: depth-of-field control. STATUS: no API param; post-production only
  (compositor with a depth pass). TIER: 3.

═══════════════════════════════════════════════════════════════════════
# GROUP D — MODEL & TIER SELECTION
═══════════════════════════════════════════════════════════════════════

### Quality tier (Draft / Studio / Blockbuster)   [UI-ONLY → TIER 1]
- PURPOSE: the quality/cost level the film renders at.
- UI: buttons (TopBar.tsx:255) → useEditorStore.activeTier (editor.ts:159).
- BUG: generation NEVER reads activeTier. The user picks Blockbuster, gets the
  default. AND draft mode separately/silently swaps models to LTX (dispatch.ts:39).
- FIX (TIER 1): (1) generation reads activeTier and maps it to a real quality
  behavior (model selection band + resolution + steps). (2) Draft-mode model swap
  becomes EXPLICIT and VISIBLE — the tier is the honest control; a draft preview
  may use LTX but LABELED, and the final render uses the selected/tier-appropriate
  model. assertModelIntegrity covers the draft path. Cross-ref: SPEC-10 routing,
  TIER-0 draft-swap fix.
- ACCEPTANCE: the tier the user picks measurably changes the render; no silent swap.
- TIER: 1 (kills a lie + a silent substitution).

### Model override   [WIRED]
- PURPOSE: manually pick the model for a shot (else auto-route).
- UI: dropdown; Auto sends modelOverride:null (AwaitingDirectionCard.tsx:275/520).
- DATA: StudioClip.selectedModelId + modelOverride. BACKEND: resolveModel uses it,
  no swap. STATUS NOTE: desktop forwards a stored override, has no picker — add one.
- STATUS NOTE: the draft-mode swap (above) can still remap AFTER this — that's the
  Tier-1 bug, a separate path from this dropdown.
- TIER: — (the dropdown works; the draft-swap bug is tracked in Quality tier).

═══════════════════════════════════════════════════════════════════════
# SECTION CROSS-REFS
═══════════════════════════════════════════════════════════════════════
- Seed + reference images → SPEC-04 (character identity uses the same fields).
- First/last frame → SPEC-04 (anchor chain).
- Camera controls → CORRECTION-motion-brush-reality (all prompt-based) + the
  post-production control-layer moat (Tier 3).
- Quality tier + model override → SPEC-10 (routing) + TIER-0 (draft-swap fix).
- Reference capability → SPEC-FIX-reference-capability-map (Kling/Veo/Wan/Grok
  are reference-capable; update registry flags).

## NEXT
Say "next" for SPEC-02 (Color & grading, 74 controls — the largest chunk).
