# SPEC-03 — LIGHTING & SHADING (28 controls)
# Inherits SPEC-00. Audit: 8 WIRED / 0 UI-ONLY / 1 STUB / 19 ABSENT.
# Two backends: (1) IC-Light AI relight (web, via /api/clips/ai-edit → prompt) and
# (2) desktop export filters (bloom/vignette via FFmpeg). Entity: ClipEffects.
# KEY ISSUE: relight sliders collapse to PROMPT WORDS (precision→3-bucket problem).
# Per rule 4 (honest UI): either send IC-Light real numbers OR coarsen the sliders.

═══════════════════════════════════════════════════════════════════════
# GROUP A — AI RELIGHT (IC-Light) — precision/prompt mismatch to resolve
═══════════════════════════════════════════════════════════════════════

### Light direction   [WIRED — via prompt, no widget]
- PURPOSE: set apparent light direction in post.
- UI: drag the frame (toolCanvas.ts:100) → a direction. No 2D pad widget.
- DATA: direction → /api/clips/ai-edit (ai-edit/route.ts:62) → PROMPT PHRASE →
  IC-Light. Desktop "Estimate Lighting" stores a text direction (EffectsPanel.tsx:
  2468); Preview saves a still, does NOT relight the clip.
- BACKEND: IC-Light via gated call (rule 1 — CONFIRM ai-edit FAL calls are gated,
  Tier 0 sweep).
- STATUS NOTE: works as prompt. ENHANCE: add a real 2D light-direction PAD widget
  (the intent is already captured as data). TIER 2 (widget) — the relight works.

### Relight intensity   [WIRED — precision mismatch → TIER 1/2]
- UI: 0…2 @0.05 (InteractivePlayer.tsx:342). Spec was 0…3.
- DATA/BACKEND: inserted into the IC-Light PROMPT (ai-edit/route.ts:74).
  relightImage does NOT send a numeric intensity field (lighting.ts:31).
- ISSUE (rule 4): a continuous slider whose value becomes prompt text ≈ dishonest
  precision. FIX: EITHER (a) send IC-Light a real numeric intensity param IF the
  endpoint accepts one (check lighting.ts / IC-Light schema), OR (b) coarsen the UI
  to labeled steps (subtle/medium/strong) that match the prompt buckets.
  RECOMMEND (a) if the param exists, else (b). TIER 1 (honesty) — small.

### Relight colour temperature   [WIRED — 3-bucket mismatch → TIER 1/2]
- UI: 2000–8000K @100K (InteractivePlayer.tsx:348).
- BACKEND: route maps the WHOLE range to "warm"/"neutral"/"cool" in the prompt
  (ai-edit/route.ts:69) — 60 slider positions → 3 words.
- ISSUE: worst precision-vs-prompt case. FIX: same as intensity — send Kelvin if
  IC-Light takes it, else coarsen to 3 labeled presets. TIER 1 (honesty).

### Relight blend   [ABSENT → TIER 3]
- PURPOSE: blend the relit layer over the original. UI: (build) 0…1 blend slider.
  DATA: ClipEffects.relight.blend (ambient:0.3 sits unused on the default now).
  BACKEND: composite relit-over-original at blend opacity (compositor). TIER 3.

═══════════════════════════════════════════════════════════════════════
# GROUP B — HDR SPECULAR (all absent — a nit/rolloff engine)
═══════════════════════════════════════════════════════════════════════

### HDR rolloff start (nits)   [ABSENT → TIER 3]
- PURPOSE: where highlight rolloff begins (200–4000 nits @10).
- UI: (build) nit slider. DATA: ClipEffects.hdr.rolloffStart. BACKEND: parameter
  to the tonemap stage (zscale+tonemap EXISTS, EffectsPanel.tsx:2141) — expose the
  rolloff knee. TIER 3.

### HDR rolloff curve   [ABSENT → TIER 3]
- UI: (build) curve enum (linear/sigmoid/highlight-roll/film). BACKEND: tonemap
  algorithm selection into the existing tonemap. TIER 3.

### Specular desaturation   [ABSENT → TIER 3]
- PURPOSE: highlights lose color as they clip (real-world specular). BACKEND: a
  luma-keyed desaturation on the top range (reuse the mask engine from SPEC-02).
  TIER 3.

### Nit ceiling   [ABSENT → TIER 3]
- UI: (build) enum 100/400/600/1000/1600/4000/10000. DATA: hdr.nitCeiling. BACKEND:
  tonemap peak-nits param (PQ 203-nit reference is documented ipc.ts:858). TIER 3.

### Tone-map algorithm   [WIRED]
- UI: SDR/HLG/HDR10-PQ (EffectsPanel.tsx:2141). Export zscale+tonemap. ACES clears
  it (:2195). TIER: —. (The other HDR knobs above extend THIS existing stage.)
NOTE: Group B is one "HDR tonemap controls" build extending the existing tonemap.

═══════════════════════════════════════════════════════════════════════
# GROUP C — BLOOM / GLOW
═══════════════════════════════════════════════════════════════════════

### Bloom radius   [ABSENT → TIER 3]
- Current: glow strength picks the blur sigma 6…24 (colorFilter.ts:716) — no
  independent radius. UI: (build) radius slider. BACKEND: expose the gblur sigma
  separately from intensity. TIER 3 (small).

### Bloom threshold   [ABSENT → TIER 3]
- Current: fixed luma gate 190 (colorFilter.ts:732). UI: (build) threshold slider.
  BACKEND: parameterize the highlight-isolation gate. TIER 3 (small).

### Bloom / glow intensity   [WIRED]
- UI: 0…100 (EffectsPanel.tsx:3297). Export screens a blurred copy back (colorFilter
  .ts:708). TIER: —.
NOTE: radius+threshold are two params on the EXISTING glow. Add together, cheap.

═══════════════════════════════════════════════════════════════════════
# GROUP D — VIGNETTE
═══════════════════════════════════════════════════════════════════════

### Vignette strength   [WIRED]  (0…100, FFmpeg vignette colorFilter.ts:334). TIER: —.

### Vignette shape / offset / feather   [ABSENT → TIER 3]
- PURPOSE: circular/oval/rect/bezier, center offset, feather.
- UI: (build) shape enum + X/Y offset + feather. DATA: ClipEffects.vignette.{shape,
  offsetX, offsetY, feather}. BACKEND: FFmpeg vignette takes x0/y0/mode; for
  non-elliptical shapes, generate a mask (reuse SPEC-02 mask engine) → multiply.
  TIER 3 (the strength works; shape/offset/feather are the enhancement).

═══════════════════════════════════════════════════════════════════════
# GROUP E — DIFFUSION FILTERS (named looks — all absent)
═══════════════════════════════════════════════════════════════════════

### Classic Net / Pro Mist / Star / Light Haze   [ALL ABSENT → TIER 3]
- PURPOSE: emulate physical diffusion filters (cinematographer looks).
- Current: a generic Blur slider (EffectsPanel.tsx:3441 → gblur) and Halation
  (:3305, warm highlight bloom) exist but are NOT the named filters.
- UI: (build) a diffusion enum with @0.001 opacity per filter.
- BACKEND per filter (build sketch):
  - Pro Mist = highlight bloom + slight lifted blacks + halation (compose existing
    glow + black-lift + halation with tuned params).
  - Classic Net = subtle overall softening + texture reduction (light gblur + cas−).
  - Star = highlight streaks (a directional streak filter on isolated highlights).
  - Light Haze = low-contrast veil + bloom (black-lift + soft glow).
- BUILD SKETCH: each is a PRESET composition of existing primitives (glow, blur,
  halation, black-lift) at tuned settings — NOT new filters. Build as named presets
  over the existing effect chain. Star is the only one needing a new (streak) filter.
- TIER 3 (cinematographer polish; low audience in v1).

═══════════════════════════════════════════════════════════════════════
# GROUP F — WARMTH BY TONAL REGION
═══════════════════════════════════════════════════════════════════════

### Shadow warmth   [WIRED]  (split shadow −100…100, EffectsPanel.tsx:2338). TIER: —.
### Highlight warmth   [WIRED]  (split highlight −100…100, :2347). TIER: —.
### Midtone warmth   [ABSENT → TIER 2]
- Current: global Kelvin (EffectsPanel.tsx:2159) shifts all three regions together.
  UI: (build) a midtone-only warmth slider. BACKEND: midtone-range colorbalance
  (the shadow/highlight split exists; add the mid band). TIER 2 (small, completes
  the set). Cross-ref: SPEC-02 zone system would subsume this at full depth.

═══════════════════════════════════════════════════════════════════════
# GROUP G — SKIN TOOLS (all absent/stub — depend on face detection)
═══════════════════════════════════════════════════════════════════════

### Skin-tone line   [STUB → TIER 2]
- Web Scopes.tsx:82 draws a skin line but Scopes isn't mounted; desktop vectorscope
  (scopes.ts:66) has none. FIX: add the skin line to the DESKTOP vectorscope (the
  shown one). Small. Cross-ref SPEC-02 Group G (same fix). TIER 2.

### Skin eyedropper lock   [ABSENT → TIER 3]
- PURPOSE: sample skin → lock reference hue for the clip. UI: (build) eyedropper.
  DATA: ClipEffects.skinRefHue. BACKEND: stores the hue; used by hue guard below.
  TIER 3.

### Skin hue guard   [ABSENT → TIER 3]
- PURPOSE: prevent grades shifting skin ±5° from reference. BACKEND: a hue-protect
  pass that clamps the skin hue band during other grades. Vibrance's export comment
  claims skin protection (ipc.ts:658) but there's no control. TIER 3.

### Skin luminance guide   [ABSENT → TIER 3]
- PURPOSE: waveform guide showing where skin should sit by tone. BACKEND: overlay on
  the waveform scope. TIER 3.

### Per-face grade   [ABSENT → TIER 3]
- PURPOSE: independent mini-grade per detected face. Depends on face detection +
  face windows (SPEC-02 face window). UI: (build) detect faces → per-face grade.
  BACKEND: face-detect → tracked window → per-window grade (mask engine). Bilateral
  Smooth (EffectsPanel.tsx:3208) is portrait blur, not this. TIER 3.
NOTE: Group G is one "face detection + skin reference" subsystem. Build the
detector once; eyedropper, guard, guide, per-face grade, and face window (SPEC-02)
all hang off it.

═══════════════════════════════════════════════════════════════════════
# SECTION SUMMARY & CONSOLIDATION
═══════════════════════════════════════════════════════════════════════
Reusable builds that collapse the absent set:
- HDR tonemap knobs (Group B) = params on the EXISTING tonemap stage — one build.
- Bloom radius/threshold (Group C) = two params on the EXISTING glow — cheap.
- Diffusion filters (Group E) = PRESET compositions of existing primitives (only
  Star needs a new streak filter) — one preset system.
- Face/skin subsystem (Group G + SPEC-02 face window) = one face-detector, many
  controls hang off it.
TIER-1 (honesty, do soon): the relight intensity + colour-temp precision/prompt
mismatch — send IC-Light real numbers or coarsen the sliders. Confirm ai-edit FAL
calls are gated (Tier 0).
TIER-2 (cheap): midtone warmth, skin-line on desktop scope, 2D light-direction pad.
TIER-3: HDR specular, diffusion presets, vignette shape, full skin subsystem.

## CROSS-REFS
- ai-edit FAL gating → TIER-0 sweep (rule 1).
- Skin line + scopes graveyard → SPEC-02 Group G (one fix).
- Face window/per-face grade → SPEC-02 (shared face subsystem).
- Midtone warmth / zone-region control → SPEC-02 zone system (subsumes at depth).
- Relight-in-post + light direction → the control-layer moat (post lighting is a
  future proprietary layer, like camera; CORRECTION-motion-brush-reality).

## NEXT
Say "next" for SPEC-04 (Editing / NLE, 38 controls).
