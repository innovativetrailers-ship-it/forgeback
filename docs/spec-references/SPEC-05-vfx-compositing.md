# SPEC-05 — VFX & COMPOSITING (36 controls)
# Inherits SPEC-00. Audit: 21 WIRED / 1 UI-ONLY / 2 STUB / 12 ABSENT.
# It's a timeline-stack compositor (layers + blend + effects), NOT a node graph.
# STRATEGIC: this section holds the moat infrastructure (tracker + node graph +
# 2.5D) for the proprietary camera/motion control layer. Entity: ClipEffects.
# BILLING: contains an ungated FAL motion-brush + roto (Tier 0).

═══════════════════════════════════════════════════════════════════════
# GROUP A — COMPOSITOR CORE (stack now; node graph is the big absent build)
═══════════════════════════════════════════════════════════════════════

### Layer stack   [WIRED]
- UI: tracks stack clips (timeline.ts:828); upper-track = per-clip blend. TIER: —.

### Blend modes   [WIRED]  (29, blendMode.ts:6 → FFmpeg blend). TIER: —.

### Node graph   [ABSENT → TIER 3, LARGE — moat foundation]
- PURPOSE: node-based compositing (connect nodes: input→effect→merge→output).
- UI: (build) a node canvas; nodes = source/effect/key/track/merge/output.
- DATA: a CompGraph { nodes[], edges[] } per composited clip.
- BACKEND: compile the graph → an FFmpeg filter graph (nodes map to filters, edges
  to filter links, merges to overlay/blend/maskedmerge). The current flat effect
  chain becomes a linear graph; branching enables real compositing.
- STRATEGIC: this is the FOUNDATION for the post-production camera/motion moat (the
  2.5D camera layer needs a compositor that can branch: plate + tracked element +
  transform). Also enables 3D layers, comp camera, nulls (below). BUILD THIS when
  you build toward the control-layer moat — it's the enabler for that whole tier.
- TIER: 3 (large; strategic; build with the moat).

### 3D layers (XYZ)   [ABSENT → TIER 3]
- Position is X/Y only (EffectsPanel.tsx:1258). UI: (build) add Z + 3D transform.
  Depends on the comp camera. Part of the node-graph/moat build. TIER 3.

### Comp camera (DOF / focal)   [ABSENT → TIER 3]
- PURPOSE: animatable perspective camera in the comp (the 2.5D camera move). This
  IS the core of the camera moat. DATA: comp.camera {pos, rot, focal, dof}. BACKEND:
  project 3D layers through the camera; animate via transform keyframes (SPEC-04).
  Cross-ref: CORRECTION-motion-brush-reality Tier-2. TIER 3 (moat centerpiece).

### Nulls (parent/child)   [ABSENT → TIER 3]
- Parent/child null hierarchy for driven transforms. Part of the node/3D build. TIER 3.

═══════════════════════════════════════════════════════════════════════
# GROUP B — KEYING (wired) + web green-screen (lie)
═══════════════════════════════════════════════════════════════════════

### Chroma key   [WIRED]  (color picker + similarity, EffectsPanel.tsx:3560). TIER: —.
### Spill suppression   [WIRED]  (0…100, :3610). TIER: —.
### Edge / feather   [WIRED]  (chroma feather 0…100, :3582). TIER: —.
### Luma key   [WIRED]  (0…100 + feather :3592/3600). TIER: —.

### Difference matte   [ABSENT → TIER 3]
- PURPOSE: isolate foreground from a static background plate. UI: (build) pick a
  clean plate frame. BACKEND: per-pixel difference vs plate → matte. TIER 3.

### Web green-screen Apply   [UI-ONLY → TIER 1]
- GreenScreenPanel.tsx:39 handleApply is a TODO; the panel advertises Chroma, Luma,
  AI Remove BG, Depth — NONE run.
- FIX (TIER 1 — rule 4 lie): EITHER (a) route Apply to the working keyer (desktop
  chroma/luma exists) and wire "AI Remove BG" to a real bg-removal model THROUGH the
  gated submit (rule 1), OR (b) REMOVE the web panel (keying is desktop-flagship).
  RECOMMEND (b) unless web keying is a v1 need. Don't wire a new FAL-billing feature
  into web just to satisfy a button.
- TIER: 1.

═══════════════════════════════════════════════════════════════════════
# GROUP C — ROTO & TRACKING (billing + moat infra)
═══════════════════════════════════════════════════════════════════════

### Roto overlay   [WIRED — UNGATED → TIER 0]
- ForgeMotion.tsx:96 → rembg-video via the RAW FAL client (rotoOverlay.ts:57), NOT
  pause-gated. TIER 0: route through the gated submit. (The feature works; gate it.)

### Roto brush (propagate)   [ABSENT → TIER 3]
- PURPOSE: paint a subject → AI isolates + propagates the mask forward/back 20+
  frames. UI: (build) paint stroke. BACKEND: an fal roto model (SAM-video/propagation)
  through gated submit. TIER 3.

### 1-point tracker   [WIRED]  (playhead X/Y keys, EffectsPanel.tsx:1294; moves window
  or PiP). TIER: —.

### 4-point planar track   [STUB → TIER 2 — MOAT INFRA]
- tracker.ts:21 trackPlanarRegion calls CoTracker; NOTHING in the UI calls it.
- FIX: MOUNT it (don't delete — it's moat infrastructure). A UI to select a region,
  run trackPlanarRegion, store the track, attach a layer/window to follow it.
- STRATEGIC: planar tracking is required for surface-locked overlays (SPEC-06 charts
  on a screen) AND the post-production camera/motion moat. Wiring it unlocks both.
- TIER: 2 (strategic).

### 3D camera track   [ABSENT → TIER 3]
- PURPOSE: solve the camera's 3D motion → attach 3D elements. UI/BACKEND: (build) a
  camera-solve (COLMAP/an fal model) → comp camera keys. Part of the moat/CGI build.
  TIER 3.

### AI subject track   [WIRED]  (auto-reframe subject keys, EffectsPanel.tsx:1709 —
  crops to subject; not a free object tracker). TIER: —.

### Warp stabilizer   [WIRED]  (two-pass vidstab, ipc.ts:642). TIER: —.

═══════════════════════════════════════════════════════════════════════
# GROUP D — MOTION GRAPHICS / TEXT
═══════════════════════════════════════════════════════════════════════

### Text   [WIRED]  (pos/size/fade/slide, burned as ASS, EffectsPanel.tsx:4240). TIER: —.

### Per-character animation   [ABSENT → TIER 3]
- Current: whole-title animations only (ipc.ts:462); glyph blur/scale exist, per-
  letter TIMING does not. UI: (build) per-glyph delay. BACKEND: render each glyph as
  a timed ASS/overlay element. TIER 3.

### Text on a path   [ABSENT → TIER 3]
- UI: (build) draw a path; place text along it. BACKEND: position glyphs along a
  bezier. TIER 3.

### Shape layers   [ABSENT → TIER 3]
- Rectangles/ellipses/bezier with fill/stroke/gradient/path-anim. Power-window masks
  are not shape layers. UI/BACKEND: (build) a vector shape primitive rendered to the
  comp. TIER 3.

### Expressions   [ABSENT → TIER 3]
- A JS expression engine for procedural animation. Large; niche. TIER 3.

### MoGRT templates   [WIRED]  (200 generated titles from 6 layouts, mogrt.ts:233;
  drag places ASS text). Cross-ref SPEC-06 lower-thirds. TIER: —.

### AI titles   [WIRED]  (generate custom template, MoGRTPanel.tsx:110). Uses a model
  → confirm gated (Tier 0 sweep). TIER: — (verify gating).

═══════════════════════════════════════════════════════════════════════
# GROUP E — EFFECTS RACK
═══════════════════════════════════════════════════════════════════════

### Blur   [WIRED]  (gblur, EffectsPanel.tsx:3441). TIER: —.
### Glow   [WIRED]  (radius/threshold derived — see SPEC-03 bloom). TIER: —.
### Lens distortion   [WIRED]  (lenscorrection, :3258). TIER: —.
### Chromatic aberration   [WIRED]  (rgbashift, :3289). TIER: —.
### Vignette   [WIRED]  (strength; shape/offset = SPEC-03). TIER: —.
### Particles   [WIRED]  (count 0…32, boxes, tracker-movable, :1451). STATUS: crude
  (draws boxes); a real particle system = TIER 3 enhancement.

### Lens flare   [STUB → TIER 3 or remove]
- renderer.ts:101 emits placeholder flite=s=; comment says needs a real filter;
  desktop has no flare. FIX: implement a real flare filter OR remove the option
  (rule 4). Low priority. TIER 3.

### AI sky replace   [ABSENT → TIER 3]
- PURPOSE: detect + swap sky, match foreground light. UI/BACKEND: (build) sky
  segmentation (fal model, gated) → composite a new sky + relight. TIER 3.

### Content-aware fill   [WIRED]  (painted mask → flux-pro/v1/fill, ai-edit/route.ts:89;
  one frame, not across a shot). CONFIRM gated (Tier 0). Enhancement: propagate
  across the shot = TIER 3. TIER: — (verify gating).

### Motion brush   [WIRED — UNGATED + version note → TIER 0]
- EffectsPanel.tsx:1915 → fal-ai/kling-video/v1.6/pro/motion-brush (motionBrush.ts:26),
  replaces the clip. This is a WORKING motion brush (unlike Runway which has no API).
- ISSUES: (1) UNGATED — no GENERATION_PAUSED check → TIER 0 (gate it). (2) Uses
  Kling 1.6, not pool Kling 3.0 — flag whether intended; align or note the exception.
- NOTE: this ANSWERS "how do we do motion brush" for v1 — via Kling's API, not
  Runway's. It's a real, working, per-shot motion brush. Gate it and it's a feature.
  Cross-ref: SPEC-01 (Runway motion brush absent), CORRECTION-motion-brush-reality.
- TIER: 0 (gate) then — (works).

### 100+ effect rack   [ABSENT/FALSE-CLAIM → TIER 1 honesty]
- schema.ts:53 = 15 web effect types; desktop "150 rows" include color/audio/
  transform, not 100 compositing assets. FIX (rule 4): scope the claim to reality —
  advertise the real count, grow honestly. Same as SPEC-06 "200+" and SPEC-04 RAW
  list. TIER 1 (honesty).

═══════════════════════════════════════════════════════════════════════
# SECTION SUMMARY & CONSOLIDATION
═══════════════════════════════════════════════════════════════════════
TIER 0 (billing — into the lockdown): motion brush (Kling 1.6) + roto overlay are
UNGATED FAL calls. Gate both. Confirm AI titles / content-aware fill gated.
TIER 1 (honesty/lie): web green-screen Apply (wire or remove); "100+ effects" claim.
TIER 2 (strategic): MOUNT the planar tracker — it unlocks surface-locked overlays
(SPEC-06) AND the camera moat. Highest-leverage non-billing item here.
TIER 3 (moat + depth): the NODE GRAPH + 3D layers + comp camera + nulls = ONE build
that IS the compositor foundation for the proprietary camera/motion control layer.
Plus roto-brush, 3D camera track, per-char text, shapes, expressions, sky replace.
CONSOLIDATION: the node graph + comp camera + planar tracker + transform keyframes
(SPEC-04) TOGETHER are the post-production control-layer moat. This section + SPEC-04
transform keyframes = the moat's home. Build them as ONE deliberate initiative.

## CROSS-REFS
- Motion brush (Kling 1.6) → answers SPEC-01's absent Runway motion brush; the v1
  working path. Gate it (Tier 0).
- Planar tracker + node graph + comp camera → the camera/motion moat
  (CORRECTION-motion-brush-reality) + SPEC-04 transform keyframes + SPEC-06 surface-lock.
- Ungated FAL (motion brush, roto) → TIER-0-CONSOLIDATED lockdown.
- "100+ effects" false claim → SPEC-06 "200+", SPEC-04 RAW (honesty batch).

## NEXT
Say "next" for SPEC-06 (CGI & overlays, 29 controls — includes the chart/overlay
differentiator).
