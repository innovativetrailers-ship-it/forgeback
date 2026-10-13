# CINEMATIC FORGE — V3 MASTER ARCHITECTURE
## "The Only Film Studio You'll Ever Need"
### Desktop-Native AI Production Platform | May 2026

---

> **THIS DOCUMENT IS THE SINGLE SOURCE OF TRUTH FOR V3.**
> V1 was "get AI-generated video out."
> V2 was "own the professional web-based production workflow."
> V3 is "replace every paid studio dependency with one desktop platform."

---

## WHAT V3 IS

Cinematic Forge V3 is a **downloadable desktop application** for macOS and Windows that replaces:
- Adobe Premiere Pro (NLE editing)
- DaVinci Resolve Color (color science)
- After Effects (VFX/compositing)
- Logic Pro / Fairlight (audio DAW)
- Autodesk ShotGrid/Flow (production tracking) → **ForgeFlow**
- Adobe Frame.io (video review/collaboration) → **ForgeReview**
- Every AI generation subscription (Runway, Veo direct, Kling direct, ElevenLabs direct)

By unifying all of these into one platform, V3 eliminates a $2,000–$6,000/year per-seat tool stack and replaces it with a single Cinematic Forge subscription.

---

## INTERNALIZED V1 & V2 FOUNDATIONS

### What V1 Shipped
- Next.js (Vercel) web app
- Multi-track timeline with drag-and-drop editing
- AI swarm: shot-level routing to Kling, Veo 3, Seedance 2.0, Wan 2.2, LTX
- Agentic Media Swarm — Brain decomposes script → Casting Director routes shots
- 3 quality tiers: Draft, Studio, Blockbuster
- Intelligence Firewall (model names hidden — "Cinematic Forge Intelligence" brand)
- Film/Series mode with character consistency
- Preview player, project importer (Premiere/DaVinci/CapCut)
- Payments (Stripe), landing page, dev account firewall
- 55 fully complete features out of 106 planned

### What V2 Added (121 features total)
- Optical flow retiming, video stabilisation, morph cut, transcript editing
- CDL color wheels, LUT import, film presets, HDR scopes, OCIO, RAW ingest
- Planar tracker, motion brush, particles, SFX library, luma keyer
- Full audio DAW (EQ, compressor, reverb, de-esser, Atmos mixing)
- Avatar system (N-series), social distribution, DCP/IMF/C2PA export
- Emotion Lattice (narrative arc visualization)
- Effect-aware object removal (CVPR 2026)
- Live wireless camera → timeline (WebRTC)
- Shoppable video / Shopify/WooCommerce integration
- Unreal Engine Sequencer bridge
- Real-time multiplayer editing
- Spatial video / Vision Pro export

### V3 Delta — What V3 Adds
1. **Full desktop app** (Electron 34, not just a PWA wrapper)
2. **Complete DaVinci/Premiere NLE parity** (every tool, every keyboard shortcut)
3. **Complete DaVinci Color Science parity** (node graph, wheels, qualifiers, scopes)
4. **Complete After Effects VFX parity** (node compositor, expressions, MoGRT 2.0)
5. **Complete audio DAW parity** (Fairlight/Logic level — spatial audio, MIDI, stems)
6. **ForgeFlow** — Internal ShotGrid/Flow Production Tracking replacement
7. **ForgeReview** — Internal Frame.io replacement
8. **V3 Agent Swarm** — 12 models, voice pipeline, music generation, 3D delegation
9. **Long-form renders** — Segment orchestration for 60+ second multi-agent renders
10. **Synced voice/voiceover/soundtrack** pipeline (ElevenLabs + Suno + OmniHuman)
11. **3D integration** — text-to-3D, USD/GLTF import, virtual production tools
12. **Offline-first local processing** (FFmpeg local, SQLite local, cloud sync optional)
13. **Native file system** — drag files directly from Finder/Explorer, no upload required

---

## DESKTOP APPLICATION ARCHITECTURE

### Framework: Electron 34.x

```
CHOICE: Electron 34.x (Chromium 130+, Node 22)
REASON: V3 is complex — Monaco-based scripting, Three.js WebGPU rendering,
heavy file system ops, multiple windows, existing Node ecosystem.
Tauri is better for lightweight. Cinematic Forge is NOT lightweight.

APP BINARY SIZES (acceptable for professional tool):
  macOS .dmg:        ~180MB
  Windows installer: ~150MB
  On disk:           ~800MB (Electron + FFmpeg + local assets)
```

### Process Architecture

```
MAIN PROCESS (Node.js — src/main/index.ts):
  - App lifecycle, window management, IPC handlers
  - File system access (native dialogs)
  - FFmpeg subprocess management
  - Local BullMQ + Valkey worker spawning
  - SQLite (better-sqlite3) — all local data
  - Auto-updater (electron-updater)
  - Native menus (macOS menu bar, Windows taskbar)
  - System tray
  - Hardware GPU detection
  - License verification (email + subscription check on launch)

RENDERER PROCESS (React SPA — src/renderer/):
  - Full application UI
  - NO nodeIntegration — all Node access via contextBridge IPC
  - Video canvas (WebGL/WebGPU via OffscreenCanvas)
  - Web Audio API for real-time audio processing
  - Three.js for 3D viewport
  - OCIO WASM bindings for color science

WORKER PROCESSES (src/workers/):
  - FFmpeg transcoder worker
  - AI job queue worker (BullMQ)
  - Thumbnail generator worker
  - Waveform generator worker
  - Proxy creator worker
  - Export renderer worker
```

### Technology Stack

```typescript
// DESKTOP
Electron:         34.x
Node.js:          22.x (bundled)
Chromium:         130+

// RENDERER
React:            19.x
TypeScript:       5.5
Vite:             6.x (renderer bundler)
Tailwind CSS:     4.x
Zustand:          5.x (global state)
React Query:      5.x (server state)
Radix UI:         primitives for accessible components

// LOCAL DATA
SQLite:           better-sqlite3 (all project data, local)
Valkey:           embedded (job queues, local)
BullMQ:           4.x (job queue, local)

// CLOUD SYNC (optional)
Supabase:         Postgres (team sync, ForgeFlow, ForgeReview)
Cloudflare R2:    media asset storage (cloud projects)
Supabase Auth:    user accounts + team management

// MEDIA PROCESSING
FFmpeg:           7.x (local binary, @ffmpeg-installer)
ExifTool:         metadata read/write
MediaInfo:        format analysis
OpenColorIO:      WASM build for color science

// AI ROUTING (hidden from users)
Anthropic API:    claude-opus-4-8 (Casting Director, Script Analyst)
fal.ai:           primary AI gateway (Kling, Seedance, HappyHorse, LTX, Veo)
Replicate:        fallback gateway (Wan, PixVerse, Hailuo, Luma)
ElevenLabs API:   voice synthesis + lip sync
Suno API:         music generation
Stable Audio API: SFX, ambient generation
Google Vertex AI: Veo 3.1 direct access

// VIDEO PLAYER
Custom WebGL canvas + OffscreenCanvas worker
  (no third-party player dependencies)

// 3D
Three.js r168:    3D viewport
GLTF/USD loader:  asset import
MeshyAI API:      text-to-3D
Tripo3D API:      alternative text-to-3D

// REALTIME COLLABORATION
ws:               WebSocket server (local)
Supabase Realtime: cloud collaboration (ForgeReview + ForgeFlow)
WebRTC:           peer video for review sessions

// EXPORT
fluent-ffmpeg:    export pipeline
DCP-o-matic:      DCP package generation
Node-Webm-muxer: fragmented MP4/HLS
```

---

## FEATURE SPECIFICATION: ALL GROUPS

---

## GROUP A — FULL NLE ENGINE
### "Complete DaVinci Resolve / Premiere Pro Parity"

**A01: Multi-track Timeline (unlimited tracks)**
- Unlimited video and audio tracks
- Track headers: lock, mute, solo, visibility, color label, height resize
- Track types: Video (V1–Vn), Audio (A1–An), Subtitle (S1–Sn), Title (T1–Tn)
- Track groups and nesting
- Track effects per track (video/audio)

**A02–A05: Core Edit Tools (from V2 — verified complete)**
- Drag-and-drop, trim handles, ripple edit, repaint

**A06–A10: Advanced Timeline (from V2 — must be complete)**
- Optical flow retiming, video stabilisation, morph cut, transcript editing, AI filler removal

**A11–A25: NEW V3 Timeline Features**
- **A11 Three-point editing** — set in/out in source viewer + one timeline point → insert/overwrite
- **A12 Four-point editing** — in/out in both source and timeline → auto time-remap
- **A13 Multicam editing** — angle viewer (2/4/9/16-way split), cut on-the-fly with keyboard
- **A14 J/L cut tool** — roll edit that splits audio/video independently
- **A15 Slip/slide edit** — slip: change content without changing duration; slide: move clip within handle range
- **A16 Dynamic trim** — real-time feedback trim with JKL playback during trim
- **A17 Match frame** — F key: open source clip at current frame in source monitor
- **A18 Nested sequences (compound clips)** — group clips into reusable sub-sequence
- **A19 Speed ramp UI** — bezier curve editor for variable speed; exponential/linear/sinusoidal modes
- **A20 Freeze frame** — insert freeze clip at current head or tail
- **A21 Proxy workflow** — auto-create H.264 proxies on import; toggle proxy/original at any time
- **A22 Audio sync** — align two clips by waveform fingerprint (for dual-system audio)
- **A23 Scene detection** — AI auto-cut on scene change across long import clips
- **A24 Keyboard shortcut mapper** — full remappable keymap with presets (Premiere, Resolve, Avid, FCP layouts)
- **A25 Linked/unlinked selection** — toggle audio/video link; edit independently when unlinked

**A26–A30: Media Management**
- **A26 Smart bins** — auto-populate by codec, resolution, frame rate, tag, date
- **A27 Metadata editor** — bulk edit XMP/EXIF; custom metadata fields
- **A28 Media relinking** — relink offline clips to new file paths; batch relink
- **A29 Project archive** — zip all media + project file for delivery/backup
- **A30 Format matrix import** — ProRes (all variants), BRAW, RED R3D, ARRI .ari, AVCHD, MXF, AVI, WebM, HEVC, AV1, DNxHD/HR

---

## GROUP B — PROFESSIONAL COLOR SCIENCE
### "Complete DaVinci Resolve Color Parity"

**B01–B04: Primary Correction (V2 base — upgrade to full)**
- **B01 Lift/Gamma/Gain wheels** — all three panels with shadow/mid/highlight lift-off
- **B02 Log wheels** — Shadows/Midtones/Highlights on log-mapped input
- **B03 HDR wheels** — 6 tonal ranges (blacks, shadows, midtones, highlights, specular, whites)
- **B04 Offset** — global luminance shift, all channels together or per RGB

**B05–B09: Advanced Curves**
- **B05 Luminance curve** — custom bezier with contrast pivot
- **B06 Color channel curves** — R/G/B individual curves with crossover display
- **B07 Hue vs Saturation** — isolate hue range and pull saturation up/down
- **B08 Hue vs Hue** — rotate specific hue ranges while protecting others
- **B09 Saturation vs Luminance** — reduce sat in highlights/lift in shadows

**B10–B14: Qualifier & Window**
- **B10 HSL Qualifier** — pick color/luma/saturation range with feathering + clean/blur
- **B11 Luma Range qualifier** — isolate exposure zone for selective correction
- **B12 3D Qualifier** — 3D color volume selection in cube space
- **B13 Power Windows** — circle, linear, polygon, bezier; individual feather per point
- **B14 Object/face tracking** — AI-powered planar and face tracker per window; update tracking

**B15–B18: Node Graph**
- **B15 Serial node pipeline** — chained corrections, A→B→C→output
- **B16 Parallel nodes** — blend two grade branches at adjustable mix
- **B17 Layer nodes** — composite two input streams over each other
- **B18 Node groups** — Pre-clip, Clip (main), Post-clip group isolation; reuse node trees as presets

**B19–B23: LUT & Color Science**
- **B19 1D LUT import** — .cube, .3dl, single channel; apply as technical or creative
- **B20 3D LUT import** — 17/33/65 lattice; apply in node; import manufacturer LUTs (ARRI, RED, Sony)
- **B21 ACES workflow** — Input Transform, ACEScct IDT, Output Transform presets
- **B22 OCIO configuration** — load studio OCIO config; override per-clip IDT
- **B23 Shot match (AI)** — analyze reference frame, apply grade to match; accepts still or clip

**B24–B28: Scopes & Analysis**
- **B24 Waveform scope** — luma / RGB parade / overlay modes; IRE + % scale
- **B25 Vectorscope** — standard + extended; skin tone indicator line
- **B26 Histogram** — luma / RGB / parade overlay; log scale option
- **B27 CIE chromaticity** — plot current frame in color gamut; overlay Rec.709 / P3 / Rec.2020 boundaries
- **B28 False color** — exposure map overlay on preview canvas; customizable zones

**B29–B33: Film Lab (AI Intelligence)**
- **B29 AI grade suggestions** — Opus 4.8 analyzes scene content → recommends grade direction
- **B30 Genre looks** — 12 cinematic LUT packs (thriller, romance, documentary, period, etc.)
- **B31 Film stock emulation** — Kodak Vision3 500T, Fuji Eterna 500, Kodak Portra 400, Ilford HP5 (B&W)
- **B32 Film grain & halation** — per-grain-size control; halation bloom radius/color; overlay or composited
- **B33 Noise reduction (AI)** — temporal + spatial NR; dial: Temporal Strength, Spatial Strength, Chroma NR; powered by fal.ai restoration models

---

## GROUP C — VFX/COMPOSITING
### "Complete After Effects Parity"

**C01–C06: Core Compositor**
- **C01 Node-based compositor** — separate workspace tab; import clip from timeline; export back as a rendered clip
- **C02 Layer timeline** — AE-style layer stack within compositor with keyframe lanes
- **C03 Blend modes** — all 28 Photoshop-equivalent modes on every layer
- **C04 3D layer space** — enable 3D on any layer; position/rotation/scale in XYZ; perspective camera
- **C05 Camera rig** — animatable camera; depth of field; focal length; target point
- **C06 Null objects** — parent/child hierarchy; drives child transforms from parent

**C07–C11: Keying & Rotoscoping**
- **C07 Ultra Keyer (chroma)** — spill suppression, edge refinement, transparency
- **C08 Luma keyer** — mask by brightness range with feathering
- **C09 Difference matte** — isolate foreground from static background plate
- **C10 AI roto brush** — single-click subject isolation; propagates across 20+ frames
- **C11 AI background removal** — static and motion backgrounds; edge-aware matting

**C12–C16: Tracking**
- **C12 1-point tracker** — position track; attach any layer
- **C13 4-point planar tracker** — track flat surfaces for screen replacement, signs, windows
- **C14 Camera tracker (3D)** — solve camera motion from live footage for AR compositing
- **C15 AI object tracker** — identify and lock to non-rigid subjects (hands, faces, animals)
- **C16 Stabilize tracker** — warp stabilizer using tracking data; crop or infill options

**C17–C22: Motion Graphics**
- **C17 Text engine** — full typographic control; per-character animation; text-on-path
- **C18 Shape layers** — path-based geometry (rectangle, ellipse, polygon, bezier); group nesting
- **C19 Motion paths** — animatable bezier motion paths; velocity handles
- **C20 Expressions scripting** — JavaScript expression engine for procedural animation (AE-compatible)
- **C21 MoGRT 2.0 templates** — import/export Cinematic Forge MoGRT; 200+ bundled templates
- **C22 Title sequences** — AI-generated title sequences from text description

**C23–C28: Effects Rack**
- **C23 Core effects library** — 100+ effects: blurs, glows, distorts, noise, color, stylize
- **C24 Particle systems** — air (floating particles), fire, smoke, rain, snow, confetti, sparks
- **C25 Lens effects** — flare, chromatic aberration, vignette, bloom, anamorphic streak
- **C26 Warp tools** — bezier warp, corner pin, mesh warp, liquify brush
- **C27 AI content-aware fill** — remove selected region; AI fills from context (V2 base, upgraded)
- **C28 AI sky replacement** — detect and swap sky layer; match lighting; animate

---

## GROUP D — AUDIO DAW
### "Complete Fairlight / Logic Pro Parity"

**D01–D06: Full Mixer**
- **D01 Unlimited tracks** — video/audio/aux/submix/master bus
- **D02 Per-track DSP** — fader, pan, solo, mute, phase flip
- **D03 VCA groups** — link multiple faders for group rides
- **D04 Pre/post fader sends** — send to aux bus before or after fader
- **D05 Side-chain routing** — route any track as side-chain to compressor/gate
- **D06 Snapshot automation** — capture fader states at time points; interpolate

**D07–D14: Audio Effects Chain**
- **D07 Parametric EQ** — 8 bands; bell/high-shelf/low-shelf/HP/LP/notch; FFT analyzer display
- **D08 Multiband compressor** — 4-band with individual attack/release/ratio per band
- **D09 Dynamics (comp/limit/expand/gate)** — VCA / FET / Optical / Variable-μ modes
- **D10 De-esser** — frequency-specific compressor for sibilance; spectrum display
- **D11 Reverb** — algorithmic (room/hall/plate/spring) + convolution with IR import
- **D12 Delay** — tempo-sync multi-tap delay; stereo spread; feedback
- **D13 Pitch correction (AI)** — auto-tune with scale locking; natural or hard mode; formant shift
- **D14 Vocal de-breathe** — AI detects and reduces breath noise between phrases

**D15–D18: AI Audio Intelligence**
- **D15 Stem separation** — vocals / drums / bass / piano / other (5-stem)
- **D16 Speaker separation** — isolate individual speakers from group recording
- **D17 Noise reduction (AI)** — remove broadband noise, hum, clicks, hiss
- **D18 Dialogue enhancement** — EQ + compression preset for speech clarity

**D19–D22: Spatial Audio**
- **D19 Dolby Atmos mixing** — 7.1.4 bed + 128 audio objects; panner per object
- **D20 Binaural monitor** — headphone preview of spatial mix
- **D21 LUFS metering** — ITU-R BS.1770-4 / EBU R128; integrated + short-term + momentary
- **D22 Phase correlation** — mono compatibility check

**D23–D26: Production Audio Tools**
- **D23 ADR recording** — punch-in recording with pre-roll and guide track
- **D24 Foley library** — 500+ categorized foley sounds (steps, cloth, impact, environment)
- **D25 Music ducking** — AI analyzes dialogue presence and auto-ducks background music
- **D26 Audio conforming** — match replacement audio to original scene cut timing

---

## GROUP E — V3 AGENT SWARM
### "12-Model Shot-Level Orchestration + Voice + Music + 3D"

### May 2026 Model Matrix

| Agent ID | Model | Provider | Elo (AA) | Specialty | Cost/min |
|----------|-------|----------|----------|-----------|---------|
| APEX | HappyHorse 1.0 | Alibaba ATH / fal.ai | 1357 | #1 overall; 7-lang lip sync; 15B params; 1080p | $4.50 |
| NARRATIVE | Seedance 2.0 | ByteDance / fal.ai | 1213 | #1 with-audio; 9-img + 3-clip multi-ref; character consistency | $3.20 |
| CINEMA | Veo 3.1 Standard | Google / Vertex AI | Top-3 | 4K, 48kHz sync audio, physics benchmark leader | $6.00 |
| MOTION | Kling 3.0 Omni | Kuaishou / fal.ai | Top-10 x4 | 4K/60fps, human movement, multilingual lip sync, 15s | $3.50 |
| PHYSICS | Sora 2 | OpenAI / Replicate | Top-5 | Physics-first (fluid/gravity/mechanics), camera movement | $5.00 |
| CONTROL | Runway Gen-4.5 | Runway / API | — | Motion brushes, scene consistency, GWM-1 world model | $4.00 |
| HDR | Luma Ray 3.14 | Luma / API | — | First native 16-bit HDR video model | $3.00 |
| PREMIUM | Kling Video O3 | Kuaishou / fal.ai | — | Premium quality variant, high-consistency outputs | $7.50 |
| ECONOMY | Wan 2.6 | Alibaba / fal.ai | — | Open-source; landscapes; wide environments; batch shots | $0.20 |
| RAPID | LTX-2.3 | LightTricks / fal.ai | — | 20s clips; stereo audio; fastest iteration; draft layer | $0.30 |
| EFFECTS | PixVerse V5.5 | PixVerse / API | — | Stylized; creative effects; artistic looks | $1.20 |
| HYBRID | Hailuo 2.3 | MiniMax / fal.ai | — | Specialist niche; motion-from-still; detail renders | $2.00 |

### Routing Decision Engine (claude-opus-4-8)

```
SHOT ANALYSIS DIMENSIONS:
  - scene_type: dialogue | action | nature | product | aerial | abstract | vfx
  - human_presence: none | background | foreground | close_up | dialogue
  - physics_type: none | fluid | fire | smoke | crowd | cloth | rigid_body
  - duration: short(≤4s) | medium(5-10s) | long(11-20s)
  - audio_type: none | ambient | dialogue | music | sfx
  - quality_tier: draft | studio | blockbuster
  - consistency_id: null | character_A | location_B (cross-shot linking)
  - has_text_on_screen: bool
  - style_key: cinematic | documentary | commercial | animation | news

ROUTING MATRIX:
  dialogue + close_up              → NARRATIVE (Seedance) or APEX (HappyHorse)
  lip_sync required                → APEX (HappyHorse, 7-lang) or MOTION (Kling Omni)
  physics required (fluid/fire)    → CINEMA (Veo 3.1) or PHYSICS (Sora 2)
  4K + cinematic + blockbuster     → CINEMA (Veo 3.1)
  human_motion + action            → MOTION (Kling 3.0) or CONTROL (Runway Gen-4.5)
  16-bit HDR output required       → HDR (Luma Ray 3.14)
  premium_quality + consistency    → PREMIUM (Kling O3) or APEX (HappyHorse)
  landscape + simple + economy     → ECONOMY (Wan 2.6)
  draft + fast_iteration           → RAPID (LTX-2.3)
  stylized / artistic              → EFFECTS (PixVerse V5.5)
  motion_from_still                → HYBRID (Hailuo 2.3)
  scene_consistency_chain          → CONTROL (Runway Gen-4.5) or NARRATIVE
  V2V repair                       → NARRATIVE (Seedance 2.0 V2V)
  multi_ref (5+ images)            → NARRATIVE (Seedance 9-image input)
```

### Long-Form Render Architecture (60+ seconds)

The key V3 innovation — rendering a 5-minute film through agent segmentation:

```
SEGMENT STRATEGY:
  Each model generates 4–20 second clips.
  A 5-minute film = 30–75 segments.
  Each segment is dispatched in parallel (up to 16 concurrent jobs).
  Cost = sum of individual segments (not one expensive API call).
  
CONSISTENCY SYSTEM:
  character_seeds: { [character_id]: { seed_image, style_embedding, voice_id } }
  location_seeds:  { [location_id]: { reference_frame, lighting_embedding } }
  Cross-shot: adjacent segments share seed references as input image to model.
  
BOUNDARY HANDLING:
  - Last frame of segment N used as first-frame anchor for segment N+1
  - 4-frame optical flow cross-dissolve at every boundary
  - IC-Light normalization across model outputs (color matching)
  - QA Inspector (Claude Vision) flags jarring boundaries → queues V2V repair
  
QUALITY INSPECTION PIPELINE:
  Per-segment: extract middle frame → Claude Vision rates coherence 0–10
  Score ≥ 6.0 → pass
  Score 4.0–5.9 → V2V repair via Seedance
  Score < 4.0 → re-render with alternate model
  
RENDER PROGRESS:
  Real-time shot-by-shot progress tracker in UI
  Estimated completion time per segment + total
  Cost tracker (credits consumed vs budget)
  Preview thumbnails as segments complete
```

### Voice Pipeline (E-series Audio Agents)

```
VOICE AGENT (ElevenLabs):
  - Script → character voice assignment
  - One ElevenLabs voice_id per character
  - Voice cloning: upload 30s reference audio → clone new voice
  - Multi-language: automatic translation + dub via ElevenLabs Dubbing Studio
  - 70+ languages supported
  - Output: .wav stem per character

LIP SYNC AGENT (OmniHuman 1.5 via ElevenLabs):
  - Input: generated video clip + character voice stem
  - Output: lip-synced video with mouth animation
  - Supports static image → talking video
  - Preserves background motion / other characters

MUSIC AGENT (Suno v4):
  - Input: genre, mood, tempo, duration, reference track (optional)
  - Output: original composed score track (.wav)
  - Lyrics option for songs
  - Instrumental only option
  - Looping export for background use

SFX AGENT (Stable Audio):
  - Input: text description of sound (e.g., "city traffic ambience, 10s")
  - Output: .wav SFX
  - Batch generate foley sounds for scene
  - Auto-placed at edit points on timeline

AUDIO ASSEMBLY:
  All stems (dialogue, music, SFX, ambient) assembled in DAW layer
  Auto-ducking: music fades when dialogue detected
  LUFS normalization per platform (YouTube -14 LUFS, Netflix -27 LUFS, etc.)
```

### 3D Integration (E-series 3D Agents)

```
TEXT-TO-3D AGENT (MeshyAI + Tripo3D):
  - Input: text description or reference image
  - Output: .glb / .obj / .fbx mesh
  - Texture auto-generated (PBR)
  - Import into compositor 3D layer
  - Import into Unreal Engine bridge

3D VIEWPORT (Three.js r168):
  - Real-time preview of imported 3D assets
  - GLTF/GLB/OBJ/FBX/USD import
  - Lighting controls (HDR environment, point/spot/area lights)
  - Render pass output (beauty, depth, normal, motion vector)
  - Camera path animation for virtual production pre-vis
```

---

## GROUP F — FORGEFLOW
### "Internal ShotGrid / Autodesk Flow Production Tracking Replacement"

ForgeFlow is the production management brain embedded in Cinematic Forge V3. It replaces a $800+/seat/year ShotGrid subscription.

### F01 — Project Hierarchy
```
ENTITY TYPES:
  Production          (top-level — Film, Series, Commercial, Music Video, Game)
  ├── Episode         (for TV/series)
  │   ├── Sequence    (scene grouping)
  │   │   └── Shot    (individual camera setup)
  │
  ├── Asset           (character, location, prop, vehicle, wardrobe, VFX element)
  │   └── Version     (multiple iterations per asset)
  │
  └── Task            (unit of work assigned to a team member)
      └── Note        (annotation, feedback, approval)
```

### F02 — Shot Management
- Shot status workflow: `concept` → `layout` → `animation` → `VFX` → `comp` → `review` → `approved` → `final`
- Thumbnail auto-generated from first/middle/last frame
- Shot metadata: camera, lens, FPS, aspect, handles, duration, bid days
- Link shot to timeline clip (bidirectional)
- Drag shots to reorder in sequence
- Bulk status change
- Shot notes with frame-accurate reference images

### F03 — Asset Tracking
- Asset library: characters (with reference turntable images), locations (with hero stills), props (with dimensions + texture maps)
- Asset status per pipeline stage
- Asset linking to shots (which shots use which assets)
- Dependency tracking (if asset changes, flag linked shots)
- AI Character consistency seeds linked to asset record

### F04 — Task Management
- Assign tasks to team members
- Time tracking per task
- Priority levels (critical, high, medium, low)
- Dependencies (task B can't start until task A is approved)
- Custom task templates per pipeline type
- Kanban board view / list view / Gantt view

### F05 — Scheduling & Gantt
- Full Gantt chart: shots as rows, dates as columns, drag to resize
- Resource calendar: who is available when
- Milestone markers (locked picture, delivery, festival premiere)
- Critical path highlighting
- Auto-schedule suggestion from bid days + resource availability
- Export to PDF, CSV, or iCal

### F06 — Budgeting
- Line item budget breakdown (VFX, cast, locations, equipment, post, delivery)
- Studio day rate management
- Bid-to-actual comparison
- Invoice tracking
- CSV export for accounting tools

### F07 — Reports
- Daily progress report (shots completed today, this week, this month)
- Overdue tasks report
- Budget burn rate
- Shot status heat map
- VFX pull list (shots requiring VFX work)
- Delivery checklist (everything approved before delivery date)
- Client-ready PDF report generation

### F08 — Pipeline Integrations
- Export EDL/XML/AAF → import to Cinematic Forge timeline automatically
- Webhook triggers (on shot approved → push to delivery pipeline)
- CSV import from scheduling apps
- Email notification rules (task overdue, shot approved, feedback added)

---

## GROUP G — FORGEREVIEW
### "Internal Frame.io Replacement"

ForgeReview is the media review and collaboration portal embedded in V3. It replaces a $15+/seat/month Frame.io subscription.

### G01 — Review Player
- Distraction-free full-screen player
- Playback up to 4K/60fps (proxied for remote reviewers)
- Frame-by-frame navigation (← → arrows)
- JKL scrubbing
- Timecode display (HH:MM:SS:FF)
- A/B comparison (stack two versions side by side, or overlay)
- Loop selection (set in/out, loop that region)
- Playback speed control (0.25x / 0.5x / 1x / 2x)

### G02 — Annotation Tools
- Draw annotations directly on video frame (appears for duration of that frame)
- Tools: pen, line, arrow, rectangle, ellipse, highlight, text label
- Color picker (12 preset colors + custom)
- Erase tool
- Annotation auto-expires at frame end or can be pinned

### G03 — Timestamped Comments
- Comment attaches to specific timecode
- Comment thread (reply to any comment)
- @mention any team member → email notification
- Emoji reactions on any comment
- Voice comment (record up to 60s audio note)
- Screenshot attached to comment automatically
- Resolve/unresolve comments (tracks feedback completion)

### G04 — Approval Workflow
- Status per asset: `In Review` → `Needs Changes` → `Approved` → `Final`
- Single-click approve / reject / request changes
- Multi-step approval chain (e.g., Director → Producer → Client)
- Audit log: who approved what, when
- Email notifications on status change

### G05 — Client Portal (No Account Required)
- Generate share link for any asset (client does not need a Cinematic Forge account)
- Password protection on link
- Link expiry (7 days / 30 days / never)
- Watermark overlay on client preview (text watermark with client name)
- Download permissions toggle (can/cannot download)
- View tracking (log who opened and when)

### G06 — Collaboration Features
- Real-time multi-user review (see other reviewers' cursors + playback position)
- Presence indicators (who is watching right now)
- Live comment feed (new comments appear in real time)
- Collaborative playlist (curate a sequence of review items)
- Review session recording (capture the review conversation with Loom-style recording)

### G07 — Version Management
- Version stacking per shot (V001, V002, V003...)
- Side-by-side version comparison
- Copy-forward comments to new version
- Version notes (what changed from last version)
- Mark version as hero/primary
- C2PA media authenticity certificate per version

### G08 — Integration with ForgeFlow
- Review notes auto-create ForgeFlow tasks
- Shot approval in ForgeReview updates shot status in ForgeFlow
- Playlist maps to ForgeFlow sequence
- Delivery checklist links to approved review assets

---

## GROUP H — EXPORT & DELIVERY

### H01 — Format Presets
| Preset | Codec | Container | HDR | Notes |
|--------|-------|-----------|-----|-------|
| Netflix Originals | ProRes 4444 | .mov | Dolby Vision | + DNxHD36 for dailies |
| Disney+ / Hulu | HEVC Main10 | .mp4 | HDR10+ | IMF with Subtitle XML |
| YouTube 4K HDR | VP9/AV1 | .webm | HLG/HDR10 | Bitrate 40–68Mbps |
| TikTok/Reels 9:16 | H.265 | .mp4 | SDR | Auto-reframe AI |
| Instagram Feed | H.264 | .mp4 | SDR | Max 60s |
| Theatrical DCP | JPEG2000 | .mxf | P3 D65 | 24fps, DCI 4K |
| Broadcast MXF | XDCAM EX | .mxf | Rec.709 | IMX-50 / DVCPRO-HD |
| IMF OPL | ProRes/HEVC | IMF pkg | HDR10 | Compliance: Netflix/Amazon |
| CDN Streaming | H.264/H.265 | fMP4 | HLG | HLS + DASH manifests |
| ProRes Master | ProRes 422HQ | .mov | HDR10 | Archival |

### H02 — Export Options
- Background export (continue editing while exporting)
- Batch export (multiple sequences in queue)
- Render in/out region only
- Chapter markers in output
- Burned subtitles or sidecar .SRT/.VTT/.SCC
- Audio stems export (one file per track group)
- Frame export (TIFF/PNG/EXR/DPX sequences)
- C2PA signing (Adobe Content Credentials) on all AI-generated content

### H03 — AI-Assisted Delivery
- Auto-reframe AI for aspect ratio conversion (16:9 → 9:16 → 1:1 → 4:5)
- Loudness normalization per platform target
- Bit depth conversion with dithering
- Subtitle auto-translation (30 languages via ElevenLabs)

---

## GROUP I — INFRASTRUCTURE & OFFLINE-FIRST

### I01 — Local-First Architecture
```
All editing, playback, and processing works OFFLINE with no cloud needed.
Cloud required only for:
  - AI generation calls (external API)
  - ForgeFlow/ForgeReview team sync
  - R2 cloud asset storage
  - License verification (on launch; 72h grace period offline)
  
LOCAL STORAGE:
  SQLite (better-sqlite3): all project metadata, settings, ForgeFlow data
  File system: all media assets on user's drive
  Valkey: local job queue state
  
CLOUD SYNC:
  Supabase Postgres: team project sync, ForgeFlow, ForgeReview
  Cloudflare R2: shared cloud media for team collaboration
  Sync is incremental and conflict-resolved (last-write-wins with merge)
```

### I02 — Security & License
- App locked at launch until: email verified + subscription active
- License check via Anthropic-signed JWT
- Offline grace period: 72 hours
- All API keys stored in system keychain (never in code or .env)
- Electron contextBridge: renderer has no direct Node access
- IPC whitelist: only defined commands accepted from renderer

### I03 — Real-Time Collaboration
- ForgeFlow: Supabase Realtime for task/shot status updates
- ForgeReview: WebSocket + Supabase Realtime for live review sessions
- Timeline multi-user: WebRTC peer sessions (invite by project link)
- Conflict resolution: operational transforms on timeline events

### I04 — Auto-Save & Project Management
- Auto-save to SQLite every 30 seconds (configurable)
- Manual snapshot (Cmd+S creates named checkpoint)
- Project history: roll back to any auto-save point (last 100)
- Project migration wizard (from Premiere .prproj, DaVinci .drp, CapCut)
- V1/V2 project import (backward compatible)

---

## DEFINITION OF DONE — V3 COMPLETE

V3 ships when:

- [ ] Electron desktop app installs on macOS 13+ (arm64 + x86_64) and Windows 10/11 (x64 + arm64)
- [ ] All Group A features (A01–A30) complete
- [ ] All Group B features (B01–B33) complete
- [ ] All Group C features (C01–C28) complete
- [ ] All Group D features (D01–D26) complete
- [ ] All Group E Agent Swarm features complete (12-model matrix + voice + music + 3D)
- [ ] ForgeFlow (F01–F08) fully operational
- [ ] ForgeReview (G01–G08) fully operational
- [ ] Export suite (H01–H03) complete
- [ ] Offline-first (I01–I04) complete
- [ ] All V2 features (121 items from V2 master) migrated/retained
- [ ] Zero "coming soon" or stub features
- [ ] App locks properly on launch (license check)
- [ ] All API keys in system keychain (zero in code)
- [ ] Performance: timeline playback p95 <50ms frame latency at 1080p
- [ ] Test coverage: >80% on all business logic
- [ ] Security audit: passed
- [ ] macOS .dmg codesigned + notarized
- [ ] Windows .exe codesigned (EV certificate)

---

## CURSOR AGENT CONFIGURATION

```
Model: claude-opus-4-8
Temperature: 0 (deterministic builds)
Max context: full window
Feed order: see CINEMA_V3_CURSOR_PROMPT.md

Cursor must ALWAYS:
1. Read the entire feed document before writing a single line of code
2. Create files at exact specified paths — no deviation
3. Never use placeholder text, TODO comments, or stub returns
4. Test every API integration before marking complete
5. Use TypeScript strict mode everywhere
6. Keep model names, API costs, and routing logic completely hidden from UI
7. Use "Cinematic Forge Intelligence" / "Forge" as the only AI brand visible to users
```

---

*Cinematic Forge V3 — The Only Film Studio You'll Ever Need*
*Architecture Version: 3.0 | May 2026*
*Requires: Cursor Agent with claude-opus-4-8*
