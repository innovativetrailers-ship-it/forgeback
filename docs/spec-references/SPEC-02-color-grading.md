# SPEC-02 — COLOR & GRADING (74 controls)
# Inherits SPEC-00 conventions. Audit: 37 WIRED / 0 UI-ONLY / 0 STUB / 37 ABSENT.
# Host: DESKTOP-FLAGSHIP (heavy). Web has thin preview only. All grades are
# non-destructive clip effects burned in at export (colorFilter.ts). Entity:
# ClipEffects / ColorGrade / ColorWheels / ToneCurve / HslSecondary / PowerWindow.
# NOTE: the audit found WIRED ranges are COARSER than the Forge-Micro spec. Per
# rule 3, numeric ranges here are the SPEC target; where the code differs it's a
# range-widening task, tagged TIER 2 (precision), not a new build.

═══════════════════════════════════════════════════════════════════════
# GROUP A — PRIMARY WHEELS (3 sets)
═══════════════════════════════════════════════════════════════════════

### Lift / Gamma / Gain (R/G/B)   [WIRED]
- PURPOSE: primary tonal color balance in shadows/mids/highlights.
- UI: three RGB triads (EffectsPanel.tsx:2734/2739/2744). Lift/Gain −1…1, Gamma 0.5…2.
- DATA: ColorWheels {liftR/G/B, gammaR/G/B, gainR/G/B}. patchWheels stores.
- BACKEND: export → colorbalance shadows (lift), eq gamma (gamma), colorbalance
  highlights (gain) — colorFilter.ts:144.
- ACCEPTANCE: wheel move changes the exported grade in the right tonal region.
- TIER: — (works). Enhancement: add the hue-ball + luminance slider (below).

### Wheel hue selector (hue ball)   [ABSENT → TIER 3]
- PURPOSE: push color in any hue direction by dragging a center dot (DaVinci style).
- UI: (build) circular hue selector per wheel; center-dot drag → R/G/B offset.
- DATA: same ColorWheels fields (the ball is an alternate INPUT to the same data).
- BACKEND: unchanged — maps to the existing lift/gamma/gain export.
- BUILD SKETCH: a UI widget (canvas circle) that converts polar drag → RGB triad.
  No new backend; it's an input-method upgrade over the 3 sliders. TIER 3 (polish).

### Wheel luminance slider   [ABSENT → TIER 3]
- PURPOSE: master luminance of each wheel independent of hue.
- UI: (build) vertical slider beside each wheel. DATA: add ColorWheels.{lift/gamma/
  gain}Lum. BACKEND: applies as a master offset to all three channels of that wheel
  in the export chain. TIER 3.

### Master numeric readout   [ABSENT → TIER 3]
- PURPOSE: single master value alongside per-channel readouts.
- UI: (build) a 4th numeric = average/master of RGB. DATA: derived, not stored.
- TIER 3 (display only).

### Log wheels   [ABSENT → TIER 3]
- PURPOSE: log-space lift/gamma/gain for log footage (finer shadow/highlight control).
- UI: (build) a 2nd wheel set toggled "Log". DATA: ColorWheels.logMode + log triads.
- BACKEND: apply in log space before the display transform — export inserts the
  log grade before the tonemap/ODT stage. Requires the grade pipeline to know the
  working space (ties to ACES, already present). TIER 3.

### 6-stop HDR wheels   [ABSENT → TIER 3]
- PURPOSE: blacks/shadows/midtones/highlights/specular/whites zones (HDR grading).
- UI: (build) six wheels. DATA: ColorWheels.hdr[6]. BACKEND: six luminance-banded
  color offsets in the export (six masked colorbalance passes by luma range).
  Cross-ref: overlaps the Zone System (Group I) — consider ONE zone/HDR engine.
- TIER 3.

### Wheel reset   [WIRED]
- UI: reset per channel when off-neutral (EffectsPanel.tsx:338). TIER: —.

═══════════════════════════════════════════════════════════════════════
# GROUP B — CURVES (6 types)
═══════════════════════════════════════════════════════════════════════

### Luma curve   [WIRED — 3-anchor, not free]
- UI: 3 anchors shadows/mids/highlights (EffectsPanel.tsx:2791). Export curves=m=
  (colorFilter.ts:200).
- DATA: ToneCurve. STATUS NOTE: it's a 3-point curve, not a free-add-point bezier.
  Upgrade = allow arbitrary points. TIER 2 (enhance to free curve).

### Luma pivot   [ABSENT → TIER 3]
- PURPOSE: contrast pivot point for the luma curve.
- UI: (build) a pivot slider. DATA: ToneCurve.pivot. BACKEND: shift the curve's
  contrast anchor in the export expression. TIER 3.

### Red / Green / Blue curves   [WIRED]
- UI: channel button R/G/B (EffectsPanel.tsx:2768) → curveR/G/B. Export per-channel.
- TIER: —.

### Hue vs Sat   [ABSENT → TIER 3]
- PURPOSE: boost/crush saturation of specific hue ranges.
- UI: (build) a hue-axis curve; x=hue, y=sat multiplier.
- DATA: add ClipEffects.hueVsSat (curve points). BACKEND: export via a per-hue
  saturation adjustment — FFmpeg selectivecolor or a lut3d generated from the curve.
  BUILD SKETCH: generate a 3D LUT from the curve at apply-time (you already do
  lut3d in export). TIER 3.

### Hue vs Hue   [ABSENT → TIER 3]
- PURPOSE: rotate a hue band without touching others.
- Same mechanism as Hue-vs-Sat (curve → generated LUT). DATA: hueVsHue. TIER 3.

### Sat vs Lum   [ABSENT → TIER 3]
- PURPOSE: desaturate highlights / lift shadow color by luminance.
- Same curve→LUT mechanism, keyed on luma. DATA: satVsLum. TIER 3.
- NOTE Group B absent curves share ONE build: a "curve → generated 3D LUT →
  existing lut3d export" pipeline. Build that once, it serves all three vs-curves.

═══════════════════════════════════════════════════════════════════════
# GROUP C — QUALIFIERS
═══════════════════════════════════════════════════════════════════════

### HSL qualifier (hue band + shift + sat + intensity)   [WIRED]
- UI: 6 bands, hue shift −180…180, sat −1…1, intensity −1…1 (EffectsPanel.tsx:2832+).
  Export huesaturation (ipc.ts:978). STATUS NOTE: it's a band SHIFT, not a
  hue/sat/lum RANGE qualifier with a selection mask. TIER: — (works as band shift).

### Qualifier feather / clean / blur   [ABSENT → TIER 3]
- PURPOSE: refine a qualifier SELECTION (soften edges, remove noise).
- Requires a real range-selection qualifier first (below). TIER 3.

### Luma-range qualifier   [ABSENT → TIER 3]
- PURPOSE: isolate a grade to an exposure zone.
- UI: (build) low/high luma range sliders + feather. DATA: add a qualifier mask
  def. BACKEND: generate a luma mask (geq/lut) → maskedmerge the graded vs original
  (you already do maskedmerge for power windows — colorFilter, ipc.ts:1020). TIER 3.

### 3D qualifier   [ABSENT → TIER 3]
- PURPOSE: select by full 3D color volume (cube-space).
- UI: (build) eyedropper + 3D tolerance. BACKEND: 3D color-distance mask → maskedmerge.
  Heaviest qualifier; build last. TIER 3.

═══════════════════════════════════════════════════════════════════════
# GROUP D — POWER WINDOWS
═══════════════════════════════════════════════════════════════════════

### Window rect / ellipse / linear / polygon   [WIRED]
- UI: shape buttons (EffectsPanel.tsx:2909/2979) → powerWindows. Export masks with
  geq + maskedmerge (ipc.ts:1020). TIER: —.

### Window bezier   [ABSENT → TIER 3]
- PURPOSE: bezier-handle mask shape. UI: (build) bezier points on the polygon tool.
  DATA: PowerWindow.bezierHandles. BACKEND: rasterize bezier → same mask pipeline.
  TIER 3.

### Window feather   [WIRED]
- UI: 0…1 on rect/ellipse/polygon (EffectsPanel.tsx:3000). TIER: —.

### Window invert   [WIRED]
- UI: invert / flip (EffectsPanel.tsx:2925). TIER: —.

### Window tracking   [WIRED]
- UI: tracker keys stored (EffectsPanel.tsx:1294/1302). Export moves the window
  center along the track (ipc.ts:691). Cross-ref: SPEC-05 planar tracker (the moat
  infra); this 1-point window tracker already works. TIER: —.

### Face window (detect + mask)   [ABSENT → TIER 3]
- PURPOSE: auto-window a detected face; track it.
- UI: (build) "detect faces" → auto power-windows. BACKEND: a face-detect pass
  (mediapipe/an fal model) → generate a tracked window. Ties to per-face grade
  (skin tools, SPEC-03). TIER 3.

═══════════════════════════════════════════════════════════════════════
# GROUP E — NODE GRAPH
═══════════════════════════════════════════════════════════════════════

### Node graph (serial / parallel / layer)   [ABSENT → TIER 3, LARGE]
- PURPOSE: chain grades as nodes (the heart of DaVinci-style grading).
- UI: (build) a node-graph canvas; each node = a grade op with its own controls.
- DATA: add a GradeGraph { nodes[], connections[] } per clip; each node holds a
  ColorGrade + optional qualifier/window.
- BACKEND: the export composes nodes in order (serial = chained filters; parallel =
  blended branches; layer = maskedmerge composite). This is a REARCHITECTURE of the
  grade from a flat ColorGrade to a node tree.
- BUILD SKETCH: significant. Model each node as a filter sub-chain; serial =
  concatenate, parallel = split+blend, layer = mask composite. The existing flat
  grade becomes a single serial node. Migrate incrementally.
- STRATEGIC NOTE: this is the biggest color build and it's OPTIONAL — flat grade +
  power windows + LUTs already give a strong grade. Build only if pro colorists
  demand node grading. TIER 3.

### Node groups (pre/clip/post) + presets   [ABSENT → TIER 3]
- Depends on the node graph. DATA: node.group. BACKEND: apply groups at the right
  pipeline stage. Save node trees as presets. TIER 3.

═══════════════════════════════════════════════════════════════════════
# GROUP F — LUT & COLOR SCIENCE
═══════════════════════════════════════════════════════════════════════

### Look presets   [WIRED]
- UI: Teal&Orange/Noir/WarmFilm/CoolNight/BleachBypass buttons (EffectsPanel.tsx:97)
  → primary grade. Cross-ref: SPEC-08 genre LUTs (20 .cube files exist, need a
  mounted panel). TIER: — (these buttons work; the LUT PACK is SPEC-08 Tier 2).

### 3D LUT import (.cube)   [WIRED]
- UI: .cube import (EffectsPanel.tsx:2402) → lut3d export (colorFilter.ts:228). TIER: —.

### 1D LUT   [ABSENT → TIER 3]
- PURPOSE: import a 1D .cube/.3dl (per-channel transfer). UI: (build) extend the
  importer to detect 1D. BACKEND: FFmpeg lut1d / curves. TIER 3.

### ACES IDT / ODT   [WIRED]
- UI: IDT/ODT selects (EffectsPanel.tsx:2205/2234). Export runs them (exporter.ts:1190).
  ACES on clears manual HDR tonemap. TIER: —.

### OCIO   [WIRED]
- UI: bundled ACES 1.3 config (EffectsPanel.tsx:2258). TIER: —.
- ABSENT sub-feature: loading CUSTOM studio OCIO configs → TIER 3 (add a config
  file picker; the OCIO pipeline exists).

### AI shot match   [WIRED]
- UI: plate match → RGB gains; AI Suggest+Apply → wheels+primaries (EffectsPanel.tsx:
  2420/2710). Uses a model → route through claudeCall/providerSubmit (rule 1).
  STATUS NOTE: confirm the AI-suggest call is gated (Tier 0 sweep). TIER: — (works;
  verify gating).

═══════════════════════════════════════════════════════════════════════
# GROUP G — SCOPES (WebGL — dispose on unmount, rule from SPEC-03/playback fix)
═══════════════════════════════════════════════════════════════════════

### Waveform   [WIRED]
- UI: PlayerAnalysis.tsx:50 (desktop), parade on same menu. Web Scopes.tsx:12 draws
  one but NOTHING mounts it (the recurring graveyard). TIER: — desktop; web = mount-
  or-delete (Tier 2, shared decision with SPEC-03 skin line + SPEC-07 EQ).

### Vectorscope   [WIRED]
- UI: scopes.ts:66 (Cb/Cr). TIER: —.

### Vectorscope skin line   [ABSENT/STUB → TIER 2]
- Web Scopes.tsx:82 draws a skin line but Scopes isn't mounted; desktop scope has
  no skin line. FIX: add the skin line to the DESKTOP vectorscope (the one that's
  actually shown). Small. Cross-ref SPEC-03 skin tools. TIER 2.

### Histogram   [WIRED]
- UI: scopes.ts:89. TIER: —.

### CIE chromaticity   [ABSENT → TIER 3]
- PURPOSE: plot frame gamut vs Rec709/P3/Rec2020 boundaries. UI/BACKEND: (build) a
  WebGL CIE plot from frame samples. TIER 3 (specialist scope).

### False colour   [ABSENT → TIER 3]
- PURPOSE: exposure map overlay. BACKEND: map luma→zone colors as a preview shader.
  TIER 3.

═══════════════════════════════════════════════════════════════════════
# GROUP H — FORGE MICRO COLOUR (precision panel — WIRED coarse, spec is fine)
═══════════════════════════════════════════════════════════════════════
NOTE: these are WIRED but at COARSER ranges than the Forge-Micro spec. Each is a
range-widening / precision task (TIER 2), NOT a new build, UNLESS marked absent.

### Exposure   [WIRED — TIER 2 precision]
- Current −1…1 @0.01 (EffectsPanel.tsx:2273). Spec: ±8.000 stops @0.001.
- FIX: widen the slider range + step; export already scales exposure. Confirm the
  export math holds at ±8 stops. Web preview (−3…3) isn't written to clip — either
  wire it or drop the web pretend. TIER 2.

### Contrast (+ pivot)   [WIRED contrast / ABSENT pivot]
- Contrast 0…2 @0.01 (EffectsPanel.tsx:2281) WIRED. Pivot ABSENT → add pivot
  (TIER 3, see Luma pivot).

### Per-channel RGB trim   [ABSENT → TIER 2]
- PURPOSE: manual independent R/G/B offset @0.001. UI: (build) 3 numeric fields.
  DATA: ClipEffects.rgbTrim. BACKEND: per-channel colorbalance/eq offset in export
  (the mechanism exists via plate-match; expose manual). TIER 2.

### White balance   [WIRED — TIER 2 units]
- Current temp −1…1 (EffectsPanel.tsx:2305). Spec: 1000–12000K. FIX: relabel/rescale
  to Kelvin; export maps Kelvin→red/blue shift (the shift exists). TIER 2.

### Tint   [WIRED]  (−1…1, :2313). TIER: —.

### Highlight recovery   [ABSENT → TIER 2]
- PURPOSE: recover clipped highlights 0…100. BACKEND: highlight-compression curve
  in export (a targeted rolloff on the top luma range). TIER 2.

### Shadow detail   [ABSENT → TIER 2]
- PURPOSE: lift shadow detail independently. BACKEND: shadow-range gamma lift. TIER 2.

### Black / white point   [WIRED — TIER 2 split]
- Current ONE Levels slider 0…100 pulls both (EffectsPanel.tsx:2365). Spec: two
  numeric points ±IRE @0.01. FIX: split into two controls; export colorlevels
  already supports both ends. TIER 2.

### Saturation   [WIRED — TIER 2 range]  (0…2, spec 0…4. Widen. TIER 2.)

### Vibrance   [WIRED]  (−100…100, FFmpeg vibrance ipc.ts:657). TIER: —.

### Hue spin   [WIRED]  (−180…180 @1°, EffectsPanel.tsx:2297). TIER: —.

### Clarity   [WIRED]  (0…100, cas ipc.ts:701). TIER: —.

### Texture   [ABSENT → TIER 3]
- PURPOSE: mid-frequency local contrast (distinct from clarity's frequency). BACKEND:
  a different-radius unsharp/cas pass. TIER 3.

### Micro-contrast   [ABSENT → TIER 3]
- PURPOSE: fine-frequency local contrast. Same as texture, third frequency scale.
  Build clarity/texture/micro as one 3-band local-contrast control. TIER 3.

### Dehaze   [ABSENT → TIER 3]
- PURPOSE: remove atmospheric haze. BACKEND: a dehaze algorithm (dark-channel prior)
  or an fal restoration model (gated). TIER 3.

═══════════════════════════════════════════════════════════════════════
# GROUP I — ZONE SYSTEM (10 zones — ABSENT, one engine)
═══════════════════════════════════════════════════════════════════════

### Zone luminance / temperature / saturation / hue / detail / feather / isolate / presets   [ALL ABSENT → TIER 3]
- PURPOSE: Ansel-Adams 10-zone (Z0 black … Z10 white) independent control.
- UI: (build) 10 zone strips, each with lum/temp/sat/hue/detail + feather + isolate
  toggle + presets (Cinematic/Documentary/HDR/Night/Golden Hour).
- DATA: ClipEffects.zones[10] { luminance, temp, saturation, hue, detail, feather }.
- BACKEND: for each zone, generate a luma-range mask (the zone's stop band) →
  apply that zone's adjustments through maskedmerge (the mask pipeline EXISTS for
  power windows/qualifiers). Ten masked passes, composited.
- BUILD SKETCH: this is ONE engine reused 10× by luma band. Shares the mask
  infrastructure. It ALSO subsumes the 6-stop HDR wheels (Group A) — build the zone
  engine and the HDR wheels become a 6-band preset of it. Build the two together.
- STRATEGIC NOTE: the zone system is the deepest color feature and the most
  colourist-specialist. High effort, narrow audience. Build only on real demand.
  TIER 3.

═══════════════════════════════════════════════════════════════════════
# SECTION SUMMARY & BUILD CONSOLIDATION
═══════════════════════════════════════════════════════════════════════
Reusable engines that collapse many absent controls into few builds:
- CURVE→LUT engine → serves Hue-vs-Sat/Hue/SatLum (Group B).
- MASK→MASKEDMERGE engine (EXISTS) → serves luma qualifier, 3D qualifier, zone
  system, HDR wheels, face window. Most absent color depth reuses this.
- NODE GRAPH → the big rearchitecture; optional; gates node groups/presets.
PRECISION (TIER 2) tasks = widen existing Micro-Colour ranges to spec (exposure,
WB Kelvin, black/white split, saturation, RGB trim, highlight recovery, shadow
detail) — these are range/label changes on WIRED controls, cheap, do as a batch.
TIER-3 depth (wheels/curves/qualifiers/node/zone/scopes) = build on colorist demand.

## CROSS-REFS
- Scopes graveyard → SPEC-03 (skin line), SPEC-07 (EQ), same mount-or-delete call.
- AI shot match / Film Lab AI → rule 1 gating (Tier 0 sweep).
- Zone system ⊇ HDR wheels (build together).
- Power-window tracker ↔ SPEC-05 planar tracker (moat infra).

## NEXT
Say "next" for SPEC-03 (Lighting & shading, 28 controls).
