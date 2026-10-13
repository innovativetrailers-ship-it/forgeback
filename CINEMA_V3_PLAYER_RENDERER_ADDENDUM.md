# CINEMATIC FORGE V3 — INTERACTIVE PLAYER & RENDERER ADDENDUM
## `CINEMA_V3_PLAYER_RENDERER_ADDENDUM.md`
### Professional Media Player + WebGPU Render Engine + Live Editing
### Feeds AFTER `CINEMA_V3_VFX_EFFECTS_ADDENDUM.md` (Position 20 in feed order)

---

> **THIS DOCUMENT DEFINES THE COMPLETE FORGE PLAYER AND RENDER ENGINE.**
> It replaces the basic Sprint 4 player spec in `CINEMA_V3_CURSOR_PROMPT.md`
> with a full professional implementation covering:
>
> **FORGE PLAYER** — Professional broadcast-grade monitor with scope overlays,
> comparison modes, safe area guides, HDR output, and all direct-in-player tools.
>
> **FORGE RENDERER** — WebGPU-accelerated GPU pipeline: hardware decode →
> VRAM transfer → OCIO colour transform → multi-pass effects compositing →
> HDR display or SDR tonemap. Zero CPU in the frame path.
>
> **LIVE EDITING ENGINE** — Every change (colour, effects, grade, text, mask)
> reflects in the player within 50ms. No bake-out. No preview render wait.
> Cursor paints, grades, and places effects directly onto the live frame.
>
> Nothing ships as a stub. Performance targets are hard requirements.

---

## PERFORMANCE CONTRACTS (Non-Negotiable)

```
These are HARD REQUIREMENTS, not aspirational goals.
The build does not ship until every target below is met and measured.

PLAYBACK:
  1080p/24fps:   p95 frame decode + display < 16ms  (real-time threshold)
  1080p/60fps:   p95 frame decode + display < 8ms
  4K/24fps:      p95 frame decode + display < 42ms  (proxy always available)
  4K/24fps proxy: p95 < 16ms (proxy is 1080p H.264 generated on import)

LIVE EDITING RESPONSIVENESS:
  Colour wheel drag → frame update:  < 50ms
  Node bypass toggle:                < 30ms
  Grade change (single node):        < 50ms
  VFX layer opacity change:          < 30ms
  Text content change:               < 30ms
  Mask point drag:                   < 16ms (must feel like direct manipulation)
  Scope update on frame change:      < 33ms (must update within 2 frames at 60fps)

SCRUBBING:
  Click-drag on timeline ruler:      < 16ms per frame stepped
  JKL fast scrub (2x, 4x):          no dropped frames below 1080p/24fps
  Frame step (arrow keys):           < 30ms to display new frame

CACHE:
  RAM cache hit playback latency:    < 5ms (frames already in VRAM)
  Disk cache hit read + display:     < 20ms per frame
  Cache write throughput:            ≥ 2 GB/s (NVMe SSD recommended)
  RAM cache size: configurable       2 / 4 / 8 / 16 / 32 GB

SCOPE RENDERING:
  Waveform update at 24fps:          scope must not lag playback
  Scope draw time:                   < 4ms per frame (WebGPU compute shader)
```

---

## PART 1 — FORGE PLAYER

### 1.1 — Player Modes & Layout

```typescript
type PlayerMode =
  | 'source'          // Source Monitor — clips from bin, before timeline placement
  | 'program'         // Program Monitor — timeline playback output
  | 'colour'          // Colour Monitor — full-frame colour page primary viewer
  | 'composite'       // Compositor Monitor — node compositor output viewer
  | 'audio_only'      // Audio-only view with large waveform + meters
  | 'review'          // ForgeReview isolated player (annotation mode)

type PlayerLayout =
  | 'single'          // One large monitor (Source OR Program)
  | 'dual'            // Source + Program side by side
  | 'quad'            // 4 viewers (multicam editing: 4 angles)
  | 'nine'            // 9 viewers (multicam: 9 angles)
  | 'sixteen'         // 16 viewers (multicam: full array)
  | 'colour_dual'     // Program monitor + Colour scopes panel
  | 'compare_ab'      // A/B comparison (two clips or two grades)

// Dual-monitor support:
//   Primary display  → workspace (timeline, panels, tools)
//   Secondary display → full-screen Program monitor (clean output, no UI)
//   Activate via: View → Output to Second Display
//   Secondary display: no chrome, no overlays (unless scope overlay enabled)
```

### 1.2 — Playback Controls

```typescript
interface PlaybackControls {
  // TRANSPORT
  play_pause:     'Space'
  play_forward:   'L'          // double-tap: 2× speed; triple: 4×; quad: 8×
  play_reverse:   'J'          // same speed multiplier system
  stop_to_head:   'K'          // stop + snap to nearest cut
  step_forward:   '→'          // 1 frame
  step_back:      '←'          // 1 frame
  step_5_fwd:     'Shift+→'   // 5 frames
  step_5_back:    'Shift+←'   // 5 frames
  step_10_fwd:    'Cmd+→'     // 10 frames
  step_10_back:   'Cmd+←'     // 10 frames
  go_to_start:    'Home'
  go_to_end:      'End'
  go_to_in:       'Shift+I'
  go_to_out:      'Shift+O'
  next_cut:       'Down'       // snap to next edit point on timeline
  prev_cut:       'Up'         // snap to previous edit point

  // IN/OUT MARKING
  mark_in:        'I'
  mark_out:       'O'
  clear_in:       'Alt+I'
  clear_out:      'Alt+O'
  clear_both:     'Alt+X'
  loop_in_out:    'Cmd+L'      // loop playback between in and out points
  
  // SPEED
  speed_50pct:    'Shift+Space' // 0.5× playback (slow motion review)
  speed_normal:   'Space'       // 1× playback
  speed_200pct:   'Shift+L'    // 2× playback
  
  // AUDIO SCRUBBING
  audio_scrub:    true          // plays audio at scrub speed when dragging playhead
  audio_scrub_pitch_correct: true // maintains pitch during slow scrub
}
```

### 1.3 — Zoom, Pan & Frame Navigation

```typescript
interface PlayerViewport {
  zoom_levels: [25, 33, 50, 75, 100, 150, 200, 400]  // percent of frame size
  zoom_fit:    'Shift+Z'    // fit frame to player window
  zoom_fill:   'Alt+Z'      // fill player window (may crop)
  zoom_1to1:   'Z'          // 100% actual pixels (no scaling)
  zoom_in:     'Cmd+='      // step up zoom level
  zoom_out:    'Cmd+-'      // step down zoom level
  zoom_scroll: true         // scroll wheel + Cmd zooms

  // PAN (only active when zoom > fit)
  pan_drag:    'Middle mouse button drag'
  pan_alt:     'Alt + left click drag'
  pan_reset:   'Double-click middle mouse button'

  // REGION OF INTEREST
  // Draw an ROI box → player zooms to that region for detail inspection
  roi_mode:    'R'           // toggle ROI draw mode; Escape to clear
  roi_follow:  false         // option: ROI follows tracked subject
}
```

### 1.4 — Timecode & Frame Reference Display

```typescript
interface TimecodeDisplay {
  // PRIMARY TIMECODE (top-left of player)
  format: 'hh:mm:ss:ff'       // default
  drop_frame: boolean          // toggle for 29.97/59.94 drop-frame formats
  display_fps: boolean         // show current sequence fps alongside timecode
  
  // SECONDARY TIMECODE (top-right of player)
  mode:
    | 'clip_tc'               // source timecode of clip under playhead
    | 'remaining'             // time remaining to sequence end
    | 'duration'              // total sequence duration
    | 'frames'                // absolute frame number from sequence start
    | 'feet_frames'           // feet+frames (35mm/16mm film format)
  
  // BURN-IN TIMECODE
  // Optional: overlay timecode as text on the video frame itself
  // Useful for client review exports
  burnin_enabled: boolean
  burnin_position: 'top_left'|'top_centre'|'bottom_left'|'bottom_centre'
  burnin_size: number          // pt
  burnin_opacity: number       // 0.0–1.0
  burnin_background: boolean   // dark rectangle behind text
  
  // CLIP NAME BURNIN
  clip_name_burnin: boolean
  clip_name_position: 'top_right'|'bottom_right'|'bottom_left'
}
```

### 1.5 — Safe Area & Frame Guides

```typescript
interface SafeAreaGuides {
  // STANDARD SAFE AREAS (toggle per type)
  action_safe:     { enabled: boolean, percent: 93, colour: '#FFFFFF40' }
  title_safe:      { enabled: boolean, percent: 80, colour: '#FFFFFF80' }
  graphic_safe:    { enabled: boolean, percent: 88, colour: '#FFFFFF60' }
  custom_safe:     { enabled: boolean, percent: number, colour: string }
  
  // ASPECT RATIO REFRAME GUIDES
  // Shows a frame-within-frame for target delivery aspect ratio
  // Use when editing 16:9 for a 2.39:1 theatrical delivery
  reframe_guides: Array<{
    enabled: boolean
    ratio: '2.39:1'|'2.35:1'|'1.85:1'|'1.78:1'|'1.33:1'|'9:16'|'1:1'|'4:5'|'4:3'|string
    opacity: number     // 0.0–1.0 (how dark the masked area appears)
    colour: string      // mask colour (default: #000000)
    guides_only: boolean // show just the guide lines, not the darkened area
  }>
  
  // COMPOSITION GRIDS
  rule_of_thirds:    { enabled: boolean, colour: '#FFFFFF30', thickness: 1 }
  golden_ratio:      { enabled: boolean, colour: '#FFFFFF30', thickness: 1 }
  golden_spiral:     { enabled: boolean, colour: '#FFFFFF30', thickness: 1 }
  pixel_grid:        { enabled: boolean, colour: '#FFFFFF15', visible_above_zoom: 300 }
  centre_cross:      { enabled: boolean, colour: '#FFFFFF50', thickness: 1 }
  diagonal_lines:    { enabled: boolean, colour: '#FFFFFF20', thickness: 1 }
  custom_grid:       { enabled: boolean, h_count: number, v_count: number }
}
```

### 1.6 — Scope Overlays (In-Player)

Scopes render as a semi-transparent GPU overlay directly inside the player window.
They compute directly from the current GPU frame texture — zero CPU cost.

```typescript
interface ScopeOverlay {
  mode: 'off' | 'waveform' | 'parade' | 'vectorscope' | 'histogram' | 'quad'
  
  // POSITIONING
  position: 'bottom_left' | 'bottom_right' | 'bottom_full' | 'top_left' | 'floating'
  size: 'small' | 'medium' | 'large' | 'fullwidth'  // % of player height
  opacity: number   // 0.1–1.0 (how opaque the scope overlay is)
  
  // WAVEFORM SETTINGS
  waveform: {
    mode: 'luma' | 'rgb_overlay' | 'parade' | 'ycbcr'
    scale: 'ire' | 'nits' | 'code_values'
    low_pass_filter: boolean   // smooth waveform for easier reading
    extents: boolean           // show min/max lines
    bright_range_warning: boolean // highlight overs in red
    hdr_range: boolean         // extend scale to 1000+ nits
  }
  
  // VECTORSCOPE SETTINGS
  vectorscope: {
    scale: '75pct' | '100pct'
    skin_tone_line: boolean    // the diagonal reference line
    colour_space: 'rec709' | 'rec2020' | 'p3_d65' | 'auto'
    magnification: 1 | 2 | 4  // zoom in for low-saturation signals
    extended_gamut_indicators: boolean  // markers beyond Rec.709 bounds
  }
  
  // HISTOGRAM SETTINGS
  histogram: {
    mode: 'luma' | 'rgb' | 'parade'
    log_scale: boolean
    clip_warning: boolean
  }
  
  // QUAD MODE (all 4 scopes in grid)
  quad: {
    top_left:  ScopeType
    top_right: ScopeType
    bottom_left: ScopeType
    bottom_right: ScopeType
  }
  
  // HDR
  hdr_nit_labels: boolean    // show 100 / 400 / 1000 / 4000 nit labels on waveform
  hdr_white_point: number    // nits (default: 203 for SDR reference white in HDR)
}
```

### 1.7 — Monitoring Overlays (Signal Analysis)

```typescript
interface MonitoringOverlays {
  // FALSE COLOUR
  false_colour: {
    enabled: boolean
    preset: 'arri' | 'red' | 'sony' | 'forge_standard' | 'custom'
    zones: Array<{
      name: string
      ire_low: number
      ire_high: number
      colour: string    // display colour for this zone
    }>
    // Default Forge Standard zones:
    // 0–5 IRE:    #000090 (crushed black — deep blue)
    // 5–15 IRE:   #0000FF (near black — blue)
    // 15–25 IRE:  #00FFFF (dark shadow — cyan)
    // 25–55 IRE:  transparent (acceptable shadow/mid)
    // 55–70 IRE:  transparent (acceptable mid/highlight)
    // 70–80 IRE:  #FFFF00 (skin tone zone — yellow)
    // 80–95 IRE:  #FF8000 (near clipping — orange)
    // 95–100 IRE: #FF0000 (clipping — red)
    // >100 IRE:   #FF00FF (over — magenta)
  }
  
  // ZEBRA
  zebra: {
    enabled: boolean
    threshold_1: number      // IRE (default 95 — near clipping)
    threshold_1_colour: string  // striped overlay colour (default: yellow)
    threshold_2: number      // IRE (default 70 — skin tone guide)
    threshold_2_colour: string  // (default: red)
    threshold_2_enabled: boolean
    pattern: 'diagonal_stripes' | 'solid' | 'checkerboard'
    stripe_angle: 45 | 135
  }
  
  // FOCUS PEAKING
  focus_peaking: {
    enabled: boolean
    colour: '#FF0000' | '#00FF00' | '#0000FF' | '#FFFF00' | string
    threshold: 'low' | 'medium' | 'high'   // edge detection sensitivity
    // Highlights in-focus areas (high-frequency detail) with a coloured outline
    // Used when reviewing footage for focus accuracy
  }
  
  // CLIPPING INDICATORS
  clipping: {
    enabled: boolean
    highlight_over: boolean   // flash overexposed pixels
    highlight_under: boolean  // flash underexposed pixels (crushed black)
    over_colour: string       // default: red
    under_colour: string      // default: blue
  }
  
  // CHANNEL ISOLATION
  channel_view: 'composite' | 'red_only' | 'green_only' | 'blue_only' | 'luma_only' | 'alpha_only'
  // Show only one colour channel at a time (useful for keying, matte inspection)
}
```

### 1.8 — A/B Comparison System

```typescript
interface ABComparison {
  mode:
    | 'off'
    | 'wipe_vertical'     // Vertical divider, drag left/right
    | 'wipe_horizontal'   // Horizontal divider, drag up/down
    | 'wipe_diagonal'     // Diagonal divider
    | 'side_by_side'      // Full frames side by side
    | 'top_bottom'        // Full frames top and bottom
    | 'overlay'           // Blend between A and B (opacity slider)
    | 'difference'        // Math: |A − B| — shows what changed
    | 'quad_split'        // 4 frames: top-left A, others B (for multicam compare)

  // SOURCES TO COMPARE
  source_a:
    | 'current_grade'     // the current graded output
    | 'original_clip'     // bypass all grades (raw footage)
    | 'specific_version'  // a named saved version
    | 'timeline_clip'     // any clip from the bin
    | 'forgereview_v1'    // a specific review version
    | 'forgereview_v2'
  
  source_b: (same options as source_a)

  // WIPE CONTROLS
  wipe_position: number   // 0.0–1.0 position of the divider
  wipe_locked:   boolean  // prevent accidental dragging
  wipe_softness: number   // 0–50px feather on the wipe edge

  // OVERLAY MODE
  overlay_mix: number     // 0.0 (full A) → 1.0 (full B)
  
  // LABELS
  label_a: string         // displayed in player corner
  label_b: string
  label_visible: boolean
  
  // SYNC PLAYBACK
  // In side-by-side mode: both clips play in sync
  // Timecode offset (if comparing clips with different start times)
  tc_offset: number       // frames
}
```

### 1.9 — Direct In-Player Editing Tools

The player is not a passive viewer — it is an interactive editing canvas.
All tools below operate directly on the live player frame.

```typescript
// ACTIVE TOOL (selected via toolbar above player):
type PlayerTool =
  | 'select'          // default — click to select layers in compositor
  | 'paint_mask'      // brush → creates roto mask on current layer
  | 'polygon_mask'    // click to place polygon control points
  | 'bezier_mask'     // click to place bezier curve mask
  | 'text_insert'     // click on frame → text cursor appears → type new text layer
  | 'effect_drop'     // drag from FX Library → drop onto player to place effect
  | 'sample_grade'    // eyedropper → samples colour → passes to active qualifier
  | 'skin_sample'     // sets the skin tone reference point on vectorscope
  | 'densitometer'    // hover → shows pixel values (colour densitometer)
  | 'ruler_measure'   // drag → measures distance in pixels/% between two points
  | 'crop_handles'    // shows and drags clip crop handles
  | 'transform'       // shows transform handles (scale/rotate/position) on selected layer

// TRANSFORM HANDLES (when 'transform' tool active on a selected layer):
// Corner handles: scale (hold Shift = constrained)
// Edge handles: scale one dimension only
// Centre handle: position (drag to move)
// Rotation arc: appears outside corners; drag to rotate
// All transforms live-update in player at <16ms
// Numerical input: double-click any handle → type exact value

// MASK PAINTING:
// Brush size: scroll wheel when paint_mask active
// Hardness: Shift+scroll
// Opacity: number keys (1=10%, 2=20%...9=90%, 0=100%)
// Erase mode: hold Alt while painting
// Mask appears as coloured overlay (configurable colour)
// Feather: F key → drag to add/remove feather after drawing mask

// TEXT INSERT:
// Click on player frame → text cursor blinks
// Typing creates a new title layer at the clicked position
// Text tool panel appears on right: font, size, style, colour, alignment
// Press Escape to finish editing; Enter = new line

// EFFECT DROP:
// Drag any effect from FX Library panel
// Hover over player → frame highlights drop zone
// Release → effect placed at hover position
// Scale indicator: ring around cursor shows effect scale preview
```

---

## PART 2 — FORGE RENDERER (WebGPU GPU Pipeline)

### 2.1 — GPU Pipeline Architecture

```
The entire frame path from file to display stays on GPU.
CPU involvement is limited to: file I/O, job scheduling, UI events.

PIPELINE STAGES:
  ┌─────────────────────────────────────────────────────────────┐
  │                  FORGE GPU RENDER PIPELINE                  │
  └─────────────────────────────────────────────────────────────┘

  [1] DECODE STAGE (Hardware)
      ↓
      macOS: VideoToolbox (H.264, H.265, ProRes, AV1)
      Windows: NVDEC (NVIDIA) / AMF (AMD) / QuickSync (Intel)
      Output: GPU texture (YCbCr or RGB depending on codec)
      
  [2] COLOUR SPACE CONVERSION
      ↓
      WebGPU compute shader: YCbCr 420 → RGB16F
      Apply input colour transform (log → scene-linear)
      Uses OCIO GPU path: LUT3D applied as GPU texture lookup
      Output: scene-linear floating-point GPU texture

  [3] COLOUR GRADE NODES
      ↓
      Each colour node = one WebGPU render pass
      Node types → shader implementations:
        Lift/Gamma/Gain  → matrix multiply + per-channel power
        Curves           → 1D LUT texture lookup (pre-baked from bezier)
        Qualifier        → compute: HSL range mask → alpha channel
        Window           → compute: signed-distance-function masking
        LUT 3D           → 3D texture lookup (trilinear interpolated)
      Node chain: each pass writes output → input of next
      
      DELTA CACHE:
        When a node is changed, only that node and its downstream nodes re-run.
        Upstream nodes use their cached VRAM output texture.
        Unchanged portions of the node graph are zero-cost.

  [4] VFX COMPOSITOR PASSES
      ↓
      Each VFX layer = one WebGPU render pass
      Blend modes: implemented as WGSL shader blend functions
      Particle systems: WebGPU compute simulation (GPGPU particles)
      Motion blur: accumulation buffer (N frame samples)
      
  [5] DISPLAY OUTPUT
      ↓
      SDR display:
        Apply output colour transform (scene-linear → Rec.709)
        Apply display LUT if calibration profile loaded
        Write to WebGPU canvas (swapchain)
      
      HDR display (Windows HDR / macOS EDR / DisplayP3):
        Detect display HDR capabilities (navigator.screen.colorDepth,
          Electron: screen.getPrimaryDisplay().colorDepth)
        Apply output transform → PQ or HLG as appropriate
        Signal metadata: MaxCLL, MaxFALL
        Pass to OS compositor without tonemapping

  [6] SCOPE RENDERER (parallel — does not block display)
      ↓
      WebGPU compute pass on same GPU texture as step [5] input
      Scope types:
        Waveform: column-by-column luminance/RGB histogram → scatter plot
        Vectorscope: CB/CR scatter plot on UV plane
        Histogram: 256-bucket count per channel
      All scopes: single compute dispatch, results written to scope texture
      Scope texture rendered to scope canvas (separate WebGPU canvas)
      
  [7] OVERLAY RENDERER (parallel)
      ↓
      False colour: compute shader applies colour lookup to every pixel
      Zebra: edge detection compute shader
      Focus peaking: Sobel filter compute shader
      Safe areas: vector geometry (very cheap, SVG-style)
      All overlays composited into final display frame
```

### 2.2 — RAM Frame Cache

```typescript
interface RAMFrameCache {
  // SIZE CONFIGURATION
  size_mb: number              // user configurable: 2048, 4096, 8192, 16384, 32768 MB
  
  // RING BUFFER STRATEGY
  // Frames are stored as compressed GPU textures in system RAM
  // When cache is full: oldest frames evicted (LRU)
  
  // VRAM CACHE (hot tier — fastest)
  vram_cache_frames: number    // keep last N decoded+processed frames in VRAM
                               // default: 12 frames (0.5s at 24fps)
  
  // RAM CACHE (warm tier — fast)
  // Compressed with BC7 GPU texture compression
  // Decompression: one GPU compute pass (<1ms)
  
  // DISK CACHE (cold tier — background render)
  // See section 2.3
  
  // LOOKAHEAD
  lookahead_seconds: number    // pre-render ahead of playhead: 1 / 2 / 5 / 10
  lookahead_priority: 'forward_only' | 'bidirectional'
                               // bidirectional: also pre-render behind playhead
                               // (for reverse playback and scrub responsiveness)
  
  // PLAYHEAD BUFFER
  // When cache is under pressure, always protect:
  //   ± 1s around current playhead position (prioritise immediate responsiveness)
  //   The next 5s forward (for uninterrupted forward playback)
  
  // TIMELINE INDICATOR
  // Green bar on timeline ruler shows cached range
  // Yellow bar: caching in progress
  // Grey: uncached (will decode on demand, may stutter on first pass)
  
  // API
  isCached(frameNumber: number): boolean
  getFrame(frameNumber: number): GPUTexture | null
  putFrame(frameNumber: number, texture: GPUTexture): void
  invalidateRange(start: number, end: number): void  // called when edit changes
  invalidateClip(clipId: string): void
  stats(): { cached_frames: number, cache_mb_used: number, hit_rate: number }
}
```

### 2.3 — Disk Render Cache

```typescript
interface DiskRenderCache {
  // LOCATION
  cache_path: string           // configurable, separate drive recommended
  cache_format: 'prores_lt' | 'dnxhd_36' | 'uncompressed_yuv' | 'jpeg2000'
  cache_quality: 'draft' | 'standard' | 'high'
  
  // SMART CACHE (auto mode)
  // Resolve analyses the timeline for 'heavy' sections:
  //   > 3 colour nodes active
  //   > 1 active VFX layer
  //   Any particle system
  //   Any AI-generated effect
  //   Any complex transition (optical flow, morph cut)
  // These sections are automatically queued for background cache render
  
  // MANUAL CACHE
  // Right-click any clip → "Render to Cache" → immediately queued
  // Right-click → "Clear Cache" → forces re-render on next playback
  
  // CACHE STATUS (displayed on timeline clips)
  // Clip header badge:
  //   Green bar at top = fully cached
  //   Yellow animated = currently rendering to cache
  //   Red = cache stale (source or grade changed; will re-render)
  //   Grey = no cache
  
  // BACKGROUND RENDER THREADS
  // Cache renders in a dedicated BullMQ worker (FFmpeg + OCIO)
  // Does NOT steal from playback GPU resources
  // Priority: lower than UI/playback; higher than export
  
  // CACHE INVALIDATION
  // Invalidated when:
  //   Source clip changes (re-link, re-transcode)
  //   Colour grade changes (any node in chain)
  //   VFX layer changes
  //   Trim changes
  //   Speed ramp changes
  //   Audio changes DO NOT invalidate video cache
  
  // SIZE LIMIT
  cache_size_limit_gb: number  // default: 100GB; auto-prune oldest unused entries
}
```

### 2.4 — Live Editing Engine (Delta Rendering)

The core of live editing is the **delta render system** — when the user changes anything,
only the affected portion of the GPU pipeline re-runs. Everything else is cached.

```typescript
interface DeltaRenderSystem {
  // NODE GRAPH DEPENDENCY TRACKING
  // Every node in the colour graph has:
  //   inputs: Set<nodeId>   — which nodes feed into this one
  //   outputs: Set<nodeId>  — which nodes this feeds into
  //   cache: GPUTexture     — last rendered output
  //   dirty: boolean        — needs re-render
  //
  // When a node is changed:
  //   1. Mark that node dirty
  //   2. Propagate dirty flag downstream (DFS through output edges)
  //   3. On next frame render: re-run only dirty nodes
  //   4. Use cached texture for all clean nodes
  //
  // Example: 5-node chain, user changes node 3:
  //   Nodes 1, 2: use cached texture (zero GPU work)
  //   Nodes 3, 4, 5: re-render (only these 3 passes run)

  // DEBOUNCE
  // Slider drag does not trigger a render on every pixel of movement.
  // Instead: schedule a render 50ms after last input event.
  // This prevents flooding the GPU with renders during fast dragging.
  // Result: smooth drag, update appears ~50ms after drag ends.
  
  // PREVIEW QUALITY MODE
  // During active dragging (mousedown held):
  //   Downsample frame to 1/4 resolution for the live preview
  //   This makes the delta render instant even on slow GPUs
  //   Full-resolution render fires when drag ends (mouseup)
  //
  preview_quality_during_drag: 'quarter' | 'half' | 'full'
  
  // EDIT CATEGORIES AND THEIR RENDER COST
  editRenderCost: {
    colour_wheel_nudge:     'delta_single_node'   // fastest
    node_bypass:            'delta_downstream'    // fast
    qualifier_range:        'delta_single_node'
    lut_swap:               'delta_single_node'
    vfx_opacity:            'delta_vfx_layer'     // fast
    vfx_position:           'delta_vfx_layer'     // fast
    vfx_blend_mode:         'delta_vfx_layer'
    text_content:           'delta_title_layer'   // fastest
    mask_point_drag:        'delta_mask_only'     // very fast
    timeline_trim:          'full_frame_rerender' // expensive — invalidates cache
    new_clip_added:         'full_frame_rerender'
    audio_change:           'audio_only'          // no video re-render needed
  }

  // RENDER QUEUE
  // All pending delta renders are queued with priority:
  //   P0 (immediate): current frame under playhead — always first
  //   P1 (high): frames within ±1s of playhead
  //   P2 (normal): lookahead frames
  //   P3 (low): background cache render
}
```

### 2.5 — HDR Display Pipeline

```typescript
interface HDRDisplayPipeline {
  // DETECTION
  // On startup, Electron queries:
  //   macOS: screen.getPrimaryDisplay() colorSpace → 'display-p3'
  //   Windows: DXGI output HDR flags
  //   Reports: max_nits, min_nits, supports_hdr10, supports_dolby_vision
  
  // SDR DISPLAY (standard path)
  sdr: {
    output_space: 'rec709_gamma22' | 'rec709_gamma24' | 'srgb'
    display_lut:  string | null  // optional: load ICC profile or display LUT
    // for probe/monitor calibration
  }
  
  // HDR10 DISPLAY (Windows HDR mode)
  hdr10: {
    output_space: 'rec2020_pq'
    max_cll: number    // MaxContentLightLevel (nits) — embed in metadata
    max_fall: number   // MaxFrameAverageLightLevel (nits)
    // WGSL tone map: ACES AP1 scene-linear → PQ signal
  }
  
  // APPLE EXTENDED DYNAMIC RANGE (macOS EDR)
  apple_edr: {
    output_space: 'display_p3'
    headroom: 2.0      // macOS EDR provides 2× SDR headroom on capable displays
    // Canvas: HTML canvas with colorSpace: 'display-p3', uses extended float backing
  }
  
  // SIMULATION MODES (for SDR displays previewing HDR content)
  hdr_simulation: {
    mode: 'off' | 'hdr10_tonemap' | 'hlg_tonemap' | 'dolby_vision_tonemap'
    tonemap_operator: 'reinhard' | 'hable' | 'aces' | 'davinci_wide_gamut'
    // Shows HDR content graded for SDR viewing with simulated tonemap
  }
  
  // NITS OVERLAY
  // Show nit values in waveform scope (0–10,000 nit scale)
  // Reference lines: 100 nits (SDR white), 203 nits (HDR reference white),
  //   1000 nits (HDR10 peak), 4000 nits (Dolby Vision mid peak)
}
```

### 2.6 — Frame Cache Visualiser (Timeline Integration)

```
TIMELINE CACHE BAR:
  A thin bar immediately above the timeline tracks (below the time ruler)
  Colour-coded by cache state per frame:
  
  ████████████░░░░░████████████░░░░░░░░░░░░████
  ^           ^    ^           ^            ^
  Green       Yellow          Rendering     Red     Grey
  (cached)  (playing/  (in cache queue)  (stale  (uncached)
            currently                    cache)
            rendering)

  Hovering over the bar: tooltip shows "Frame 1203 — Cached (ProRes LT)"
  Click on bar: jumps playhead to that position
  
MEMORY PRESSURE INDICATOR:
  In the status bar (bottom of app):
  "Cache: 4.2 / 8.0 GB  [▓▓▓▓▓▓░░░░]  CPU: 12%  GPU: 67%  VRAM: 6.1/8.0GB"
  
  If VRAM > 90%: warning toast "VRAM near capacity — switching to proxy mode"
  If RAM cache > 95%: auto-evict oldest cached segments
```

---

## PART 3 — MULTI-VIEWER & SPECIAL MODES

### 3.1 — Source / Program Dual View

```
DUAL LAYOUT (default for Edit workspace):
  
  ┌────────────────────┬────────────────────┐
  │   SOURCE MONITOR   │  PROGRAM MONITOR   │
  │   (clip from bin)  │  (timeline output) │
  │                    │                    │
  │  [timecode]        │  [timecode]        │
  │  [in/out markers]  │  [in/out markers]  │
  └────────────────────┴────────────────────┘

SOURCE MONITOR:
  - Shows the clip currently loaded from the bin
  - In/out marks are the source in/out for the three-point edit
  - Transport controls work on this clip independently

PROGRAM MONITOR:
  - Shows the real-time composited timeline output
  - The 'truth' — what the final output looks like
  - All grades, effects, transitions applied
  - Audio meters live in bottom strip

Both monitors share the same JKL transport controls
(the last-clicked monitor is the active one — highlighted border)
```

### 3.2 — Colour Page Monitor

```
COLOUR WORKSPACE MONITOR:
  Full-width, full-height viewer
  No source monitor — only program output
  
  Unique colour page controls:
    Prev clip:    '['  (navigate to previous clip on timeline)
    Next clip:    ']'  (navigate to next clip on timeline)
    Grade flag:   'F'  (mark clip as flagged for grader review)
    
  GALLERY STILL:
    Grab:  Cmd+G  (save current frame as grade reference still)
    Apply: drag a gallery still onto any clip → applies that grade
    
  SPLIT SCREEN LAYOUT (colour page specific):
    Shows current clip + previous clip side by side for grade matching
    Configurable: show 2, 4, or 8 adjacent clips for continuity check
```

### 3.3 — Multicam Viewer

```
MULTICAM VIEWER (for multicam editing):
  Display: 2 / 4 / 9 / 16 angle grid
  
  Each angle cell:
    Shows real-time decode of that camera's feed
    Gold outline = currently active/record angle
    
  Cut on-the-fly:
    Number keys 1–16: cut to that angle during playback
    Click on any cell: cut to that angle + advance playhead to next frame
    
  Angle switching sound: optional audio cue on each cut
  
  Sync indicator:
    Each cell shows its timecode
    Out-of-sync angles shown with red TC background
    
  Audio track selector:
    Right-click angle cell → "Use This Angle's Audio"
    Can mix audio from different angles than video
```

### 3.4 — ForgeReview Player (Isolated Review Mode)

```
FORGEREVIEW PLAYER MODE:
  Clean, distraction-free interface
  No timeline panels, no colour tools, no bins
  Just: player + controls + comments panel (right)
  
  REVIEW-SPECIFIC CONTROLS:
    Annotation mode: A key → drawing tools appear
    Comment:         C key → text comment box opens at current timecode
    Approve:         Cmd+Enter → mark as approved
    Needs changes:   Cmd+R → mark as needs revision
    Reject:          Cmd+Shift+R → mark as rejected
    
  IN REVIEW MODE:
    All normal overlay tools still available (safe areas, scopes, false colour)
    Comparison: can compare with previous version (A/B wipe)
    Annotations from comments visible on playback (appear at comment timecodes)
```

---

## PART 4 — LIVE GRADE PREVIEW SYSTEM

### 4.1 — Real-Time Node Chain Preview

The killer feature of the Forge Renderer: every single node adjustment
shows in the player instantly. No "apply" button. No preview render.

```
HOW IT WORKS IN PRACTICE:

  User drags a Gain wheel:
  ┌─ input event (mousemove) fires
  │   └─ Zustand store: gradeNode[3].gain = newValue
  │       └─ DeltaRenderSystem.markDirty(nodeId: 3)
  │           └─ Propagate dirty: nodes 4, 5 also marked dirty
  │               └─ scheduleRender(priority: P0, debounce: 50ms)
  │
  └─ 50ms later: render fires
      └─ Node 1: use cached VRAM texture ✓
      └─ Node 2: use cached VRAM texture ✓
      └─ Node 3: re-run Lift/Gamma/Gain shader → new texture
      └─ Node 4: re-run Curve shader using node 3 output
      └─ Node 5: re-run LUT shader using node 4 output
      └─ Display: composite and present
      └─ Total GPU time: ~3ms (only 3 shader passes)
      └─ Visible latency: ~53ms from drag to display
```

### 4.2 — Grade Preview Resolution Modes

```typescript
interface PreviewResolutionMode {
  mode:
    | 'full'         // Full resolution at all times (requires powerful GPU)
    | 'half'         // 1/2 resolution during drag; full on mouseup
    | 'quarter'      // 1/4 resolution during drag; full on mouseup (default)
    | 'proxy'        // Always use proxy — most responsive on low-end GPUs
    | 'smart'        // Auto: use full if GPU < 50% utilisation; quarter otherwise

  // GPU PERFORMANCE MONITOR
  // Shows in status bar: GPU frame time (ms)
  // If consistently > 16ms at 'full' mode: suggest switching to 'half'
  // If consistently > 16ms at 'half': suggest 'quarter'
  
  // RESOLUTION MISMATCH INDICATOR
  // When viewing at quarter res, player shows subtle border pulse
  // to indicate it is in reduced-resolution preview mode
  // On mouseup / drag end: border disappears (full res has fired)
}
```

### 4.3 — Live Audio Monitoring

```
LIVE AUDIO IN PLAYER:
  Audio output: Web Audio API AudioContext
  Latency mode: 'interactive' (lowest latency path)
  
  REALTIME EFFECTS MONITORING:
    All audio effects (EQ, compressor, reverb) apply in real time during playback
    AudioWorklet nodes process the audio stream
    Latency: <10ms from timeline audio to speaker output
    
  AUDIO METERS (embedded in player, below frame):
    Per-track peak meters visible during playback
    Master bus: LUFS momentary + true peak
    Configurable height (compact strip or tall meter)
    
  SCRUB AUDIO:
    During timeline scrub: pitch-corrected audio playback
    Speed: matches scrub speed (up to ±8× pitch-corrected)
    Useful: find dialogue lines, identify audio events
    
  SOLO/MUTE in player:
    Click track meter in player footer → solos that track
    Alt+click → mutes
    (Mirrors the main mixer state)
```

---

## PART 5 — SPRINT ADDENDUM FOR CURSOR

### SPRINT P-R-1: Forge Player Core + WebGPU Pipeline (Replaces Sprint 4)

```
Goal: Full professional player with WebGPU GPU pipeline, hardware decode,
      OCIO colour transform, scope overlays, and all monitoring tools.
      Replaces the basic Sprint 4 spec entirely.

Files to create/replace:
  src/renderer/workers/
    renderPipeline.worker.ts     — WebGPU render pipeline (OffscreenCanvas)
    frameCache.worker.ts         — RAM cache ring buffer manager
    scopeRenderer.worker.ts      — WebGPU compute: waveform/vectorscope/histogram
    overlayRenderer.worker.ts    — false colour/zebra/focus peaking compute

  src/renderer/components/player/
    ForgePlayer.tsx              — main player component (replaces PlayerMonitor.tsx)
    PlayerCanvas.tsx             — WebGPU OffscreenCanvas mount
    PlayerControls.tsx           — transport bar (JKL, in/out, loop, speed)
    PlayerTimecode.tsx           — primary + secondary timecode display
    PlayerOverlayToolbar.tsx     — scope/false colour/zebra/safe area toggles
    PlayerScopeOverlay.tsx       — scope canvas (separate WebGPU canvas, composited)
    PlayerMonitoringOverlays.tsx — false colour, zebra, focus peaking, channel view
    PlayerABComparison.tsx       — wipe/side-by-side/overlay/difference modes
    PlayerSafeAreas.tsx          — SVG overlay: safe zones, grids, reframe guides
    PlayerTimecodeDisplay.tsx    — burnin + secondary TC
    PlayerInPlayerTools.tsx      — paint/mask/text/transform direct editing tools
    DualMonitorLayout.tsx        — Source + Program dual view
    MulticamViewer.tsx           — 2/4/9/16 angle grid
    PlayerAudioMeters.tsx        — per-track meters + LUFS strip in player footer
    PlayerCacheBar.tsx           — cache state visualiser above timeline ruler

  src/renderer/gpu/
    forgeGPU.ts                  — WebGPU device init, adapter query, caps detection
    decodeStage.ts               — hardware decode → GPU texture
    colourTransformStage.ts      — OCIO GPU path: YCbCr→sRGB, log→linear, LUT3D
    colourNodeShaders.ts         — WGSL shaders for each colour node type
    vfxCompositeStage.ts         — VFX layer compositing passes
    displayStage.ts              — output: SDR rec709, HDR10, Apple EDR
    scopeCompute.ts              — WGSL compute: waveform, vectorscope, histogram
    overlayCompute.ts            — WGSL compute: false colour, zebra, focus peak
    blendModes.wgsl              — all blend mode implementations
    
  src/main/renderer/
    hardwareDecode.ts            — VideoToolbox (macOS) / NVDEC (Windows) bridge
    hdrDetection.ts              — query display HDR capabilities via Electron API

Shader files (src/renderer/gpu/shaders/):
    ycbcr_to_rgb.wgsl            — YCbCr 420 planar → RGB16F
    ocio_lut3d.wgsl              — 3D LUT trilinear interpolation
    lift_gamma_gain.wgsl         — colour wheels transform
    curves.wgsl                  — 1D LUT curve lookup
    qualifier_hsl.wgsl           — HSL range qualifier mask
    waveform.wgsl                — column-by-column luminance scatter
    vectorscope.wgsl             — CB/CR scatter on UV plane
    false_colour.wgsl            — zone-based colour remap
    zebra.wgsl                   — threshold highlight pattern
    focus_peak.wgsl              — Sobel edge detection
    tonemap_aces.wgsl            — ACES AP1 scene-linear→display
    tonemap_pq.wgsl              — SMPTE ST.2084 PQ encode

Acceptance:
  - 1080p/24fps: p95 frame display < 16ms (measure with GPU profiler)
  - 4K proxy: p95 < 16ms
  - Hardware decode active (confirm via GPU activity monitor — not CPU decoding)
  - Scope overlays update every frame without dropping playback
  - False colour: accurate to ±0.5 IRE across full range
  - Zebra: highlights exactly pixels above threshold, not approximate
  - A/B wipe: drag divider in real time, no lag
  - HDR detection: correct on macOS + Windows HDR displays
  - Safe areas: pixel-accurate at all zoom levels
```

### SPRINT P-R-2: Delta Render System + RAM Cache + Live Editing

```
Goal: Complete live editing engine — every grade/effect change updates
      the player in <50ms. Full RAM cache with timeline indicator.
      All in-player editing tools working.

Files to create:
  src/renderer/gpu/
    deltaRenderSystem.ts         — node dependency graph + dirty tracking
    ramFrameCache.ts             — ring buffer in SharedArrayBuffer
    diskCacheManager.ts          — disk cache read/write + invalidation
    previewQualityManager.ts     — quarter/half/full res switching

  src/renderer/components/player/
    PlayerInPlayerPaintTool.tsx  — brush/eraser for roto mask painting
    PlayerTransformHandles.tsx   — corner/edge/centre/rotation handles overlay
    PlayerTextInsertTool.tsx     — click-to-type title layer creation
    PlayerEffectDropZone.tsx     — highlight + accept dropped FX
    PlayerRulerMeasure.tsx       — distance measurement tool

  src/main/cache/
    cacheWorker.ts               — background disk cache render (BullMQ job)
    cacheInvalidator.ts          — listen for edit events → invalidate ranges

IPC channels for cache:
  'cache:frame-status' (frameNumbers: number[]) → CacheStatus[]
  'cache:invalidate-range' (start, end, projectId)
  'cache:render-priority' (frameNumbers: number[])
  'cache:stats' () → CacheStats

Acceptance:
  - Colour wheel drag → frame updates in <50ms (measured, not estimated)
  - Node bypass toggle: < 30ms
  - Green/yellow/grey cache bar correctly reflects cache state in real time
  - Transform handle drag (mask point): < 16ms response
  - Text insert: typing appears on frame within 1 frame of keypress
  - Preview quality switches automatically during drag (quarter → full on mouseup)
  - Cache invalidation: change a grade → cache bar goes red immediately
  - Background render: complex section auto-queues and renders to cache
  - RAM cache hit rate > 95% during normal 24fps playback (after warmup)
  - Memory does not grow unboundedly — LRU eviction confirmed with memory profiler
```

---

## UPDATED CURSOR FEED ORDER

```
17. CINEMA_V3_CURSOR_PROMPT.md
18. CINEMA_V3_AUDIO_COLOR_PRECISION_ADDENDUM.md
19. CINEMA_V3_VFX_EFFECTS_ADDENDUM.md
20. CINEMA_V3_PLAYER_RENDERER_ADDENDUM.md    ← THIS DOCUMENT (position 20)

Sprint replacement/insertion:
  Sprint P-R-1 REPLACES Sprint 4 (basic player spec) entirely
  Sprint P-R-2 inserts immediately after P-R-1
  All original Sprint 5–45 remain; numbering adjusts internally
  
Total sprint count: 52 (50 + 2 player/renderer sprints; Sprint 4 replaced not added)
```

---

## DEFINITION OF DONE — PLAYER & RENDERER

**GPU Pipeline:**
- [ ] Hardware decode active on both macOS (VideoToolbox) and Windows (NVDEC/AMF)
- [ ] YCbCr → RGB16F conversion via WebGPU compute shader, not CPU
- [ ] OCIO 3D LUT applied on GPU (not CPU-side OCIO library)
- [ ] Each colour node type has a WGSL shader implementation
- [ ] Display output: SDR Rec.709, HDR10 (Windows), Apple EDR (macOS) — all correct
- [ ] 1080p/24fps p95 frame time < 16ms confirmed with GPU profiler

**Player Features:**
- [ ] All transport keyboard shortcuts (JKL, in/out, step, nav) work correctly
- [ ] Zoom + pan functional at all zoom levels (25%–400%)
- [ ] All scope overlays (waveform, parade, vectorscope, histogram) update each frame
- [ ] False colour: 7 zones, colours accurate vs. IRE measurements
- [ ] Zebra: highlights only pixels above threshold — no false positives
- [ ] Focus peaking: highlights in-focus areas on any test frame
- [ ] All 8 A/B comparison modes functional
- [ ] All safe area templates (action/title/graphic/custom, 8 aspect ratios)
- [ ] All composition grids (thirds, golden ratio, pixel grid, centre cross)
- [ ] Dual monitor: second display shows clean program output, no chrome
- [ ] Multicam viewer: 4/9/16 angle layouts, cut-on-the-fly with number keys

**Live Editing:**
- [ ] Colour wheel drag → display update < 50ms (p95 — measured)
- [ ] Delta render: unchanged nodes use cached VRAM texture — confirmed with GPU profiler
- [ ] Preview quality: quarter res during drag, full on mouseup — confirmed visually
- [ ] Transform handles: drag response < 16ms
- [ ] In-player text insert: text on frame within 1 frame of keystroke
- [ ] Mask paint tool: brush stroke appears on frame in real time

**Cache:**
- [ ] RAM cache ring buffer: correct LRU eviction, no memory growth
- [ ] Cache bar: green/yellow/grey/red states correctly reflect reality
- [ ] Cache hit rate > 95% during steady-state 24fps playback
- [ ] Disk cache: renders complex sections in background without interrupting playback
- [ ] Cache invalidation: grade change → cache stale indicator within 500ms

**HDR:**
- [ ] macOS: Apple EDR headroom correctly used on capable displays
- [ ] Windows: HDR10 PQ signal sent to OS compositor when HDR display detected
- [ ] SDR display: correct Rec.709 gamma output
- [ ] Nit labels on waveform when in HDR mode

---

*Cinematic Forge V3 — Interactive Player & Renderer Addendum*
*Addendum Version: 1.0 | May 2026*
*52 Total Sprints | Sprint 4 replaced | Requires: Cursor Agent with claude-opus-4-8*
