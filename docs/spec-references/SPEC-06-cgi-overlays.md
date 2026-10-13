# SPEC-06 — CGI & OVERLAYS (29 controls)
# Inherits SPEC-00. Audit: 9 WIRED / 1 UI-ONLY / 1 STUB / 18 ABSENT.
# Two halves: (1) CGI element gen+splice (partly wired, integration thin) and
# (2) the DETERMINISTIC OVERLAY pipeline (charts/text/data) — ENTIRELY absent, and
# your highest value-to-difficulty differentiator. This chunk gives the deepest
# BUILD SKETCHES because the overlay pipeline should be the FIRST new build.
# BILLING: TripoSG text-to-3D is ungated (Tier 0). Entity: CgiElement (to add).

═══════════════════════════════════════════════════════════════════════
# GROUP A — 3D ELEMENT GENERATION (partly wired)
═══════════════════════════════════════════════════════════════════════

### Text → 3D   [WIRED — UNGATED → TIER 0]
- ThreeDSection.tsx:38 → TripoSG (textTo3d.ts:23) → mesh into bin. Desktop runFal
  does NOT check GENERATION_PAUSED. TIER 0: gate it. Then — (works).

### 3D text extrude   [WIRED]  (depth/height/color → local OBJ, textExtrude3d.ts:40;
  no network). TIER: —.

### Image → 3D   [ABSENT → TIER 3]
- The 3D panel takes text only. UI: (build) image input → image-to-3D (Tripo/Rodin
  image mode, gated). TIER 3.

### Effect-element generation   [ABSENT → TIER 3]
- Fire/smoke/etc. are FILTER types, not generated elements. For novel elements:
  generate an alpha video element (fal) or — PREFER — use the effects LIBRARY
  (SPEC-05). Build generation only for elements the library lacks. TIER 3.

═══════════════════════════════════════════════════════════════════════
# GROUP B — INTEGRATION (place / track / light / composite — mostly absent)
═══════════════════════════════════════════════════════════════════════

### Place on the timeline   [WIRED]  (extruded text at playhead on "3D Text" track,
  timeline.ts:1291). TIER: —.

### Drag onto the picture   [ABSENT → TIER 3]
- Mesh is a bin file; nothing drops it into the frame. UI: (build) drag mesh into
  the preview → position it. DATA: CgiElement placement. BACKEND: render the mesh
  over the plate (needs the comp camera, SPEC-05). TIER 3.

### Planar track   [STUB → TIER 2 — shared moat infra]
- tracker.ts:21 (same trackPlanarRegion as SPEC-05). No CGI/overlay control calls it.
- FIX: MOUNT it (SPEC-05 Tier-2). Needed for surface-lock (below) + overlays. TIER 2.

### 3D camera track   [ABSENT → TIER 3]  (same as SPEC-05; camera solve for element
  lock. Part of the moat/CGI build.) TIER 3.

### Light match   [WIRED — thin]
- lighting.ts:89, CGI insert calls it (cgi/insert/route.ts:89) but it IGNORES the
  location-plate URL and relights with a FIXED prompt. FIX (TIER 2): pass the actual
  plate + element so the relight matches the scene, not a generic prompt. Gated (rule 1).
- TIER: 2 (make it actually match).

### Occlusion composite   [ABSENT → TIER 3]
- cgi/insert/route.ts:87 REQUESTS a depth map and NEVER uses it. FIX: use the depth/
  roto matte so foreground occludes the element. BACKEND: maskedmerge with the depth
  matte (mask engine, SPEC-02). This is the Tier-1-vs-Tier-2 CGI split — real
  integration. TIER 3 (research-grade; assisted 2.5D is the achievable version).

### CGI splice   [WIRED — jobId BUG → TIER 1]
- CGIInsertTool.tsx:45 → route generates mesh, runs Kling 1.5 i2v, concatenates into
  the shot (cgi/insert/route.ts:100). BUG: the route returns outputUrl with NO jobId
  (:153); the panel opens a job stream expecting jobId → marks a SUCCESSFUL insert
  as FAILED.
- FIX (TIER 1 — real bug): align the contract — the route returns a jobId the panel
  can track, OR the panel handles the direct outputUrl return. Same field-mismatch
  class as videoUrl/sourceUrl. You pay for a working CGI gen and are told it failed.
- Also: the Kling 1.5 i2v call must be gated (Tier 0 sweep).
- TIER: 1 (bug) + 0 (gate the call).

═══════════════════════════════════════════════════════════════════════
# GROUP C — DETERMINISTIC OVERLAYS (charts/data/text) — the DIFFERENTIATOR
═══════════════════════════════════════════════════════════════════════
ALL ABSENT. This is the highest value-to-difficulty feature in the system (the
"do what the video models can't" insight): render precise charts/text/data
DETERMINISTICALLY (real chart lib + real fonts + real data), composite as an alpha
overlay, screen-space or planar-locked. Video models MANGLE text/numbers; this
never touches diffusion → pixel-perfect. It's the EASY compositing tier (2D/screen-
space, no lighting solve). SHIP THIS FIRST among new builds.

SHARED BUILD (one pipeline serves all of Group C):
  OverlayEngine: (spec) → deterministic render → transparent PNG-sequence/WebM →
  composite (screen-space OR planar-locked via the tracker) → timeline "overlay"
  track. The LLM (mechanical tier) STRUCTURES data/chooses type; the RENDER is
  deterministic so numbers are ALWAYS correct.
  - Chart render: a headless chart lib (Chart.js/D3/ECharts) → canvas/SVG → frames.
  - Text/MoGRT render: the existing motion-graphics/MoGRT engine (SPEC-05) with alpha.
  - Data: user CSV/paste, or script numbers structured by the LLM.
  - Composite: alpha over the plate; screen-space (frame position) or planar-locked
    (SPEC-05 planar tracker → chart on a screen/wall in the shot).
DATA: CgiElement { kind:'chart'|'callout'|'lowerthird'|'diagram'|'table'|'map',
  spec:<type-specific>, data:<rows>, placement:'screen'|'surface', track?:<planarId> }.

### Bar chart / Line chart / Pie chart / Scatter chart   [ALL ABSENT → TIER 3 (build FIRST)]
- UI: (build) chart type + data input + style (theme/colors/fonts) + animation
  (draw-on/count-up) + placement. BACKEND: OverlayEngine chart render. Numbers exact.
- ACCEPTANCE: a bar chart from pasted data renders legible, correct, composited.

### Stat callout   [ABSENT → TIER 3 (build FIRST)]
- A number + label card (e.g. "+37%"), count-up animation, bound to real data. Same
  engine. Highest-frequency overlay for explainer/corporate.

### Lower thirds   [WIRED desktop / broken web]
- Desktop drag places ASS text (MoGRTPanel.tsx:226). Web (MoGRTPanel.tsx:18) "Add"
  posts to /api/mogrt/render which DOESN'T EXIST. FIX (TIER 1): create the route or
  point web at the working desktop path. TIER 1 (broken web wiring).

### Kinetic text   [WIRED — whole-title only]  (ipc.ts:462; per-letter = SPEC-05 Tier3). TIER: —.

### Labeled diagrams / Tables / Timeline graphics / Maps   [ALL ABSENT → TIER 3]
- Same OverlayEngine, different renderers: diagram (boxes+arrows+labels), table
  (grid render), timeline (event bar), map (tile + pins via the location system,
  SPEC-09). Build after charts/callouts prove the engine. TIER 3.

### Chart data input   [ABSENT → TIER 3 (build FIRST, with charts)]
- UI: (build) CSV upload / paste / type / "pull from script" (LLM structures).
  The data field bound to the overlay. Without this, charts have no data. TIER 3.

═══════════════════════════════════════════════════════════════════════
# GROUP D — PLACEMENT & LIBRARY
═══════════════════════════════════════════════════════════════════════

### Screen-space placement   [WIRED]  (title X/Y as frame fractions, EffectsPanel.tsx:
  4240). Overlays reuse this for screen-space mode. TIER: —.

### Surface lock   [ABSENT → TIER 2 — depends on planar tracker]
- PURPOSE: an overlay follows a planar-tracked surface (chart on a screen in the shot).
- UI: (build) "lock to surface" → select region → planar track → overlay follows.
- BACKEND: SPEC-05 planar tracker (mount it) → apply the track to the overlay's
  transform. Cross-ref SPEC-05 Tier-2. TIER 2 (once the tracker is mounted).

### Web AI template   [UI-ONLY → TIER 1]
- MoGRTPanel.tsx:53 posts {prompt}; route reads {description}, returns {config} the
  panel can't consume (route.ts:28); panel only accepts {template} → list never
  changes, JSON never rendered. Three-way contract mismatch.
- FIX (TIER 1): align the contract — panel sends description, route returns a
  template the panel renders. Uses an LLM → via claudeCall (rule 1). TIER 1.

### 200+ effect library   [ABSENT/FALSE-CLAIM → TIER 1 honesty]
- schema.ts:53 = 15 effect types; MOGRT_TEMPLATES = 200 name+thumb STUBS
  (MoGRTGenerator.ts:57), not rendered assets. FIX (rule 4): scope to reality —
  the templates that render are real; don't claim 200 rendered assets. Same batch
  as SPEC-05 "100+" and SPEC-04 RAW. TIER 1.

### Prompt-match search   [WIRED]  (filters the 12 card names/tags, MoGRTPanel.tsx:44;
  not a visual library). TIER: — (works for what exists).

### Blend recommend   [ABSENT → TIER 3]  (suggest a blend mode per effect. Small
  heuristic or LLM. TIER 3.)

═══════════════════════════════════════════════════════════════════════
# SECTION SUMMARY & CONSOLIDATION
═══════════════════════════════════════════════════════════════════════
TIER 0 (billing): TripoSG (text-to-3D) + Kling 1.5 (CGI splice) are ungated. Gate.
TIER 1 (bugs/lies): CGI splice jobId mismatch (success→fail); web lower-thirds
route missing; web AI-template contract mismatch; "200+ library" false claim.
TIER 2 (strategic): mount planar tracker → enables surface-lock overlays; make
light-match actually use the plate.
TIER 3 — THE DIFFERENTIATOR: the OverlayEngine (charts/callouts/data) is entirely
absent AND is the highest value-to-difficulty build. BUILD IT FIRST among new
features once billing is safe. It's the easy tier (deterministic 2D, no lighting
solve), reuses the MoGRT engine + planar tracker, and unlocks explainer/
documentary/corporate/data genres the video models CAN'T serve. This is the moat
that's cheapest to reach.
CGI INTEGRATION (occlusion, drag-to-frame, 3D track) = research-grade, defer; the
effects library + assisted 2.5D cover most needs.

## CROSS-REFS
- OverlayEngine ← MoGRT engine (SPEC-05) + planar tracker (SPEC-05) + location maps
  (SPEC-09) + LLM data-structuring (SPEC-10, mechanical tier).
- Surface lock ← planar tracker (SPEC-05 Tier-2).
- Ungated TripoSG + Kling 1.5 → TIER-0-CONSOLIDATED.
- CGI splice jobId bug + web route/template mismatches → TIER-1 bug queue.
- "200+ library" → SPEC-05 "100+", SPEC-04 RAW (honesty batch).
- CGI integration depth → addendum-cgi-pipeline (tiered honesty).

## NEXT
Say "next" for SPEC-07 (Audio, 56 controls — the largest absent set: Spectrum EQ +
Master Suite).
