# CINEMATIC FORGE V3 — CURSOR BUILD PROMPT
## Feed This Document to Cursor Agent (claude-opus-4-8)
### After: All V2 documents + CINEMA_V3_MASTER_ARCHITECTURE.md

---

> **CURSOR AGENT INSTRUCTIONS:**
> Model: claude-opus-4-8
> Read the complete V3 Master Architecture document first.
> Then execute these sprints in strict order.
> Nothing ships incomplete. Nothing ships as a stub.
> Every feature must be fully wired, tested, and passing acceptance criteria.

---

## PRE-BUILD: ARCHITECTURE DECISIONS

Before writing any code, internalise these hard constraints:

```
1. THIS IS A DESKTOP APP — Electron 34.x. NOT a web app. NOT a PWA.
   The renderer loads from localhost, not a Vercel URL.

2. LOCAL FIRST — SQLite for all project data. Supabase is for TEAM SYNC only.
   The app must work 100% offline for editing and playback.
   Only AI generation calls require internet.

3. API KEYS IN SYSTEM KEYCHAIN — Never in .env, never in code, never in git.
   Use electron-keytar to store all API keys in the OS keychain.
   Renderer never sees raw API keys — all AI calls go through main process IPC.

4. INTELLIGENCE FIREWALL — Model names are COMPLETELY hidden.
   The user sees: "Forge Intelligence", "Generating...", quality tier names.
   Never: "Kling", "Veo", "Seedance", "Sora", "claude", "opus".
   The routing matrix is server-side in main process. Never in renderer bundle.

5. OPUS 4.8 IS THE CASTING DIRECTOR — claude-opus-4-8 decomposes scripts and
   routes shots. This is the most critical AI call. It runs in main process.
   System prompt must be embedded in main process. Never expose to renderer.

6. NO STUBS — If a feature cannot be fully implemented in this sprint,
   do not create placeholder UI. Create nothing. Move to next sprint.
   Complete features only.
```

---

## PROJECT SCAFFOLD

```bash
# Initialize the project
mkdir cinematic-forge-v3
cd cinematic-forge-v3

# Init package.json
npm init -y

# Install Electron
npm install electron@34 --save-dev
npm install electron-builder@25 --save-dev
npm install electron-updater --save
npm install electron-keytar --save  # system keychain

# Install build tools
npm install vite@6 --save-dev
npm install @vitejs/plugin-react --save-dev
npm install concurrently cross-env --save-dev

# Renderer dependencies
npm install react@19 react-dom@19
npm install typescript@5.5 --save-dev
npm install tailwindcss@4 @tailwindcss/vite --save-dev
npm install zustand@5
npm install @tanstack/react-query@5
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tooltip
npm install @radix-ui/react-slider @radix-ui/react-scroll-area @radix-ui/react-tabs
npm install lucide-react
npm install framer-motion

# Database
npm install better-sqlite3
npm install @types/better-sqlite3 --save-dev

# Media processing
npm install @ffmpeg-installer/ffmpeg
npm install fluent-ffmpeg
npm install @types/fluent-ffmpeg --save-dev
npm install exiftool-vendored
npm install mediainfo.js

# Job queue
npm install bullmq
npm install ioredis  # for Valkey/Redis client

# AI APIs
npm install @anthropic-ai/sdk
npm install @fal-ai/client
npm install elevenlabs

# Cloud sync
npm install @supabase/supabase-js

# Utilities
npm install axios
npm install ws
npm install uuid
npm install date-fns
npm install immer
npm install zod
```

### File Structure

```
cinematic-forge-v3/
├── package.json
├── electron-builder.config.js
├── vite.config.ts                    (renderer bundler)
├── tsconfig.json                     (shared)
├── tsconfig.main.json                (main process)
├── tsconfig.renderer.json            (renderer process)
│
├── src/
│   ├── main/                         (Electron main process — Node.js)
│   │   ├── index.ts                  (app entry, BrowserWindow creation)
│   │   ├── ipc/
│   │   │   ├── handlers.ts           (all IPC channel handlers)
│   │   │   ├── timeline.ts           (timeline operations)
│   │   │   ├── media.ts              (file system, import, export)
│   │   │   ├── ai.ts                 (ALL AI calls — never reach renderer)
│   │   │   ├── forgeflow.ts          (production tracking IPC)
│   │   │   └── forgereview.ts        (review portal IPC)
│   │   ├── db/
│   │   │   ├── schema.ts             (SQLite schema, migrations)
│   │   │   ├── queries.ts            (typed query helpers)
│   │   │   └── sync.ts               (Supabase sync logic)
│   │   ├── ai/
│   │   │   ├── router.ts             (INTELLIGENCE FIREWALL — casting director)
│   │   │   ├── models.ts             (model registry — NEVER exported to renderer)
│   │   │   ├── swarm.ts              (shot-level dispatch engine)
│   │   │   ├── voice.ts              (ElevenLabs + OmniHuman pipeline)
│   │   │   ├── music.ts              (Suno/Stable Audio pipeline)
│   │   │   ├── consistency.ts        (cross-shot seed management)
│   │   │   └── quality.ts            (QA inspector pipeline)
│   │   ├── media/
│   │   │   ├── ffmpeg.ts             (local FFmpeg wrapper)
│   │   │   ├── transcoder.ts         (proxy creation, format conversion)
│   │   │   ├── waveform.ts           (waveform data generation)
│   │   │   ├── thumbnail.ts          (timeline thumbnail generation)
│   │   │   └── export.ts             (final export pipeline)
│   │   ├── workers/
│   │   │   ├── queue.ts              (BullMQ queue definitions)
│   │   │   ├── transcoder.worker.ts
│   │   │   ├── ai.worker.ts
│   │   │   └── export.worker.ts
│   │   └── license.ts                (startup license check)
│   │
│   ├── preload/
│   │   └── index.ts                  (contextBridge API — typed IPC surface)
│   │
│   └── renderer/                     (React SPA)
│       ├── main.tsx                  (React entry point)
│       ├── App.tsx                   (root layout, routing)
│       ├── store/
│       │   ├── timeline.ts           (Zustand timeline state)
│       │   ├── project.ts            (project metadata state)
│       │   ├── playback.ts           (player state)
│       │   ├── color.ts              (color grading state)
│       │   ├── forgeflow.ts          (production tracking state)
│       │   ├── forgereview.ts        (review state)
│       │   └── ui.ts                 (panel layouts, preferences)
│       ├── hooks/
│       │   ├── useTimeline.ts
│       │   ├── useAI.ts              (wraps IPC to AI — returns generic status)
│       │   ├── useFFmpeg.ts
│       │   ├── useForgeFlow.ts
│       │   └── useForgeReview.ts
│       ├── components/
│       │   ├── layout/
│       │   │   ├── WorkspaceLayout.tsx
│       │   │   ├── TopBar.tsx
│       │   │   ├── LeftPanel.tsx     (media bin, forge flow)
│       │   │   ├── RightPanel.tsx    (inspector, properties)
│       │   │   └── StatusBar.tsx
│       │   ├── editor/               (NLE)
│       │   ├── color/                (color science)
│       │   ├── vfx/                  (compositor)
│       │   ├── audio/                (DAW)
│       │   ├── generate/             (AI generation — user-facing)
│       │   ├── forgeflow/            (production tracking)
│       │   ├── forgereview/          (media review)
│       │   ├── player/               (video player)
│       │   └── shared/               (buttons, inputs, modals, etc.)
│       └── workers/
│           ├── videoCanvas.worker.ts (WebGL render worker)
│           └── audio.worker.ts       (AudioWorklet)
│
├── resources/
│   ├── icons/                        (app icons, all sizes)
│   ├── ffmpeg/                       (bundled FFmpeg binaries per platform)
│   └── foley/                        (500 bundled foley sounds)
│
└── tests/
    ├── main/
    └── renderer/
```

---

## SPRINT PLAN — V3

**Architecture:** 45 sprints, each 1 week. Total: ~11 months.

---

### PHASE 0 — FOUNDATION (Sprints 1–5)

**Sprint 1: Desktop Shell & IPC Surface**
```
Goal: Electron app launches, shows a blank workspace, license check works.

Tasks:
1. Create package.json with all dependencies listed above
2. Create vite.config.ts (renderer: React + Tailwind + TypeScript)
3. Create src/main/index.ts — BrowserWindow (1440x900, hiddenInset titlebar)
4. Create src/preload/index.ts — contextBridge exposes typed IPC API
5. Create src/renderer/main.tsx + App.tsx — blank workspace skeleton
6. Implement license.ts — on app launch, verify JWT from Anthropic API
   - If invalid/expired: show LicenseGate screen (cannot proceed)
   - If valid: proceed to workspace
   - If offline: 72-hour grace period (check stored expiry timestamp)
7. Create electron-builder.config.js (macOS dmg + Windows nsis)
8. npm run dev (concurrently electron + vite)

Acceptance:
- App launches and shows license check screen
- Correct email/key → workspace loads
- Wrong key → blocked
- npm run dist:mac generates .dmg
- npm run dist:win generates .exe installer
```

**Sprint 2: SQLite Schema & Project System**
```
Goal: Projects can be created, opened, saved, and have metadata.

Schema (src/main/db/schema.ts):

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  settings_json TEXT,          -- resolution, fps, color space, sample rate
  thumbnail_path TEXT
);

CREATE TABLE clips (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  duration REAL,               -- seconds
  width INTEGER, height INTEGER,
  fps REAL,
  codec TEXT,
  audio_codec TEXT,
  sample_rate INTEGER,
  proxy_path TEXT,
  thumbnail_path TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE timeline_tracks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,          -- 'video' | 'audio' | 'subtitle' | 'title'
  index_order INTEGER NOT NULL,
  name TEXT,
  muted INTEGER DEFAULT 0,
  locked INTEGER DEFAULT 0,
  height INTEGER DEFAULT 60,
  color TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE timeline_clips (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL,
  clip_id TEXT,                -- null for AI-generated clips
  ai_job_id TEXT,              -- for AI-generated clips
  timeline_start REAL NOT NULL, -- seconds from sequence start
  timeline_end REAL NOT NULL,
  source_in REAL DEFAULT 0,
  source_out REAL,
  speed REAL DEFAULT 1.0,
  label TEXT,
  color TEXT,
  effects_json TEXT,           -- applied effects (VFX, color nodes, audio)
  FOREIGN KEY (track_id) REFERENCES timeline_tracks(id)
);

CREATE TABLE ai_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,          -- 'video' | 'voice' | 'music' | 'sfx' | '3d'
  status TEXT NOT NULL,        -- 'queued' | 'running' | 'complete' | 'failed' | 'repairing'
  prompt TEXT,
  shot_analysis_json TEXT,     -- Casting Director output
  model_assigned TEXT,         -- INTERNAL ONLY — never sent to renderer
  fal_request_id TEXT,
  output_url TEXT,
  output_path TEXT,            -- local cache
  cost_credits REAL,
  quality_score REAL,
  error TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  reference_image_path TEXT,
  voice_id TEXT,               -- ElevenLabs voice_id
  style_embedding_json TEXT,
  notes TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  reference_image_path TEXT,
  style_embedding_json TEXT,
  notes TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- ForgeFlow tables
CREATE TABLE ff_shots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  sequence_id TEXT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'concept',
  assignee_id TEXT,
  bid_days REAL,
  due_date INTEGER,
  camera TEXT, lens TEXT, fps TEXT, duration REAL,
  notes TEXT,
  thumbnail_path TEXT,
  order_index INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE ff_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,          -- 'character' | 'location' | 'prop' | 'vehicle'
  name TEXT,
  status TEXT DEFAULT 'concept',
  reference_images_json TEXT,
  pipeline_status_json TEXT,
  notes TEXT
);

CREATE TABLE ff_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  shot_id TEXT,
  asset_id TEXT,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'not_started',
  assignee_id TEXT,
  priority TEXT DEFAULT 'medium',
  due_date INTEGER,
  estimated_hours REAL,
  actual_hours REAL,
  notes TEXT
);

-- ForgeReview tables
CREATE TABLE fr_review_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  shot_id TEXT,
  name TEXT NOT NULL,
  video_path TEXT,
  proxy_path TEXT,
  version INTEGER DEFAULT 1,
  status TEXT DEFAULT 'in_review',
  created_at INTEGER NOT NULL
);

CREATE TABLE fr_comments (
  id TEXT PRIMARY KEY,
  review_item_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  timecode REAL NOT NULL,
  author_id TEXT,
  author_name TEXT,
  content TEXT,
  annotation_json TEXT,        -- drawing data for this frame
  resolved INTEGER DEFAULT 0,
  parent_id TEXT,              -- threading
  created_at INTEGER NOT NULL,
  FOREIGN KEY (review_item_id) REFERENCES fr_review_items(id)
);

Acceptance:
- Create project → stores in SQLite at ~/Documents/CinematicForge/projects/{id}.cfp
- Open project → loads all tracks/clips from SQLite
- Import media file → inserts into clips table, generates thumbnail
- Auto-save fires every 30s
```

**Sprint 3: Media Bin & Import Pipeline**
```
Goal: Drag files onto the app, see them in the bin with thumbnails + metadata.

Tasks:
1. src/main/media/ffmpeg.ts — wrap FFmpeg binary:
   - probe(filePath): returns MediaInfo (duration, fps, codec, width, height)
   - thumbnail(filePath, timecode, outputPath): generate frame image
   - waveform(filePath, outputPath): generate waveform JSON data
   - createProxy(filePath, outputPath): H.264 720p proxy

2. src/renderer/components/layout/LeftPanel.tsx — MediaBin:
   - Grid/list toggle
   - Folder/bin hierarchy
   - Drag files from Finder/Explorer into bin (Electron drag-and-drop)
   - Thumbnail display with metadata badge (fps, resolution, codec)
   - Right-click context: Create Proxy, Add to Timeline, Properties

3. IPC channels:
   'media:import' (filePaths: string[]) → MetadataResult[]
   'media:probe' (filePath) → MediaInfo
   'media:thumbnail' (filePath, timecode) → base64 image
   'media:waveform' (filePath) → WaveformData

Acceptance:
- Drop 3 video files → appear in bin with thumbnails within 2s
- Proxy created in background; badge shows "Proxy" when ready
- All metadata correct (duration, fps, resolution, codec)
```

**Sprint 4: Video Player (WebGL Canvas)**
```
Goal: Click a clip in the bin → plays back in source monitor at native resolution.

Tasks:
1. src/renderer/workers/videoCanvas.worker.ts — OffscreenCanvas renderer:
   - Receives frame data via VideoFrame API / transferable
   - Renders via WebGL (YUV → RGB conversion shader)
   - Handles HDR (PQ → SDR tone map if display is SDR)

2. src/renderer/components/player/:
   - PlayerCanvas.tsx — WebGL canvas element + OffscreenCanvas worker
   - PlayerControls.tsx — Play/pause (Space), J/K/L scrub, in/out points
   - PlayerTimecode.tsx — HH:MM:SS:FF display
   - PlayerMonitor.tsx — Source (S) and Program (P) monitor layouts

3. Playback engine:
   - FFmpeg pipe: ffmpeg -i input.mp4 -f rawvideo -pix_fmt yuv420p pipe:1
   - Stream frame data to canvas worker via IPC
   - Audio: Web Audio API from decoded PCM
   - Frame-accurate seeking (seek to exact PTS)

Acceptance:
- 1080p/24fps clip plays smoothly (>95% frames on time)
- JKL controls work (J=reverse, K=pause, L=play)
- Seek by clicking timecode: jump to any frame
- Source and Program monitors both functional
```

**Sprint 5: Timeline Canvas**
```
Goal: Clips can be dragged from bin to timeline; timeline plays back.

Tasks:
1. src/renderer/components/editor/Timeline.tsx — Full timeline implementation:
   - Rendered via HTML Canvas (NOT React tree — performance critical)
   - Tracks rendered as horizontal rows
   - Clips as colored rectangles with label, thumbnail strip
   - Playhead (red vertical line, draggable)
   - Time ruler (frames / seconds / timecode display modes)
   - Zoom (Cmd+/- or scroll + Ctrl/Cmd)
   - Horizontal scroll + vertical scroll (if >8 tracks)

2. Track headers (left panel of timeline):
   - Lock toggle, mute, solo, visibility eye
   - Color label
   - Track name (double-click to rename)
   - Height resize handle

3. Edit tools (toolbar above timeline):
   - Select (V) — default selection
   - Blade (B) — cut at click point
   - Trim (T) — resize handles
   - Slip (S) — slip trim
   - Slide (Y) — slide trim
   - Pen (P) — add keyframe to audio envelope

4. Drag-and-drop from bin to timeline:
   - Snap to playhead, snap to other clip edges
   - Insert vs overwrite mode (toggle)
   - Audio/video link indicator

5. Playback of timeline (sequence playback):
   - Reads timeline_clips for current time range
   - Composites overlapping video clips
   - Mixes audio tracks
   - Loops or stops at sequence end

Acceptance:
- 10 clips on 4 tracks all play back smoothly
- Cut, blade, trim, slip all work correctly
- Playhead follows playback
- Undo/redo (100 levels) for all timeline operations
```

---

### PHASE 1 — NLE COMPLETION (Sprints 6–10)

**Sprint 6: Edit Tools — J/L cuts, Three-Point, Match Frame**
```
Implement A11–A14, A17, A25 from V3 architecture.

Key implementations:
- Three-point edit: set in/out in source monitor → right-click → Insert / Overwrite
- Match frame: with playhead on timeline clip, press F → source monitor jumps to that frame
- J/L cut: audio/video roll edit that moves audio or video independently
- Linked/unlinked selection toggle in toolbar

Acceptance:
- Three-point edit inserts clip exactly at specified timeline position
- Match frame accurately navigates source to correct frame
- J/L cut moves audio handle without affecting video (and vice versa)
```

**Sprint 7: Multicam Editing**
```
Implement A13 from V3 architecture.

Key implementations:
- Multicam bin grouping: select clips, right-click → Create Multicam Sequence
- Sync methods: timecode, audio waveform, in-point, out-point
- Multicam viewer: 2/4/9/16-way angle display
- Cut on-the-fly: number keys (1–16) cut to that angle during playback
- Switch angle on existing cut: click angle in viewer

Acceptance:
- 4-camera sync works by timecode and waveform
- Cutting to angles in real time during playback
- Angle switches visible in timeline as colored segments
```

**Sprint 8: Proxy Workflow & Speed Ramps**
```
Implement A19, A21 from V3 architecture.

Key implementations:
- Auto-proxy: on import, queue proxy creation job; show badge when ready
- Proxy toggle: in preferences and per-project setting
- Speed ramp editor: right-click clip → Speed/Duration panel
  - Speed percentage (10%–1000%)
  - Freeze frame
  - Smooth bezier curve in ramp editor (like Premiere's Speed Graph)
  - Reverse clip

Acceptance:
- Proxy mode: 4K source → 720p proxy for real-time editing
- Speed ramp: 100% → 20% → 100% with bezier curve plays smoothly
- Optical flow interpolation for sub-frame slow-mo (via fal.ai FILM model)
```

**Sprint 9: Scene Detection & Smart Bins**
```
Implement A23, A26, A27 from V3 architecture.

Key implementations:
- Scene detection: right-click long clip → Scene Detect → creates subclips at cut points
  - Uses FFmpeg scene detection filter (select=gt(scene,0.3))
  - Creates markers at detected cuts
  - Optional: Auto-subclip into bin
- Smart bins: right-click bin → New Smart Bin
  - Rules: codec, resolution, fps, date range, tag, rating, keyword
  - Auto-populates and updates as new clips are imported

Acceptance:
- 1-hour interview clip → scene detect finds 90+ cuts in <30 seconds
- Smart bin "4K ProRes" auto-shows all 4K ProRes clips instantly
```

**Sprint 10: Audio Sync & Format Import Matrix**
```
Implement A22, A30 from V3 architecture.

Audio sync:
- Select one video clip + one audio clip → right-click → Sync by Waveform
- FFmpeg cross-correlation to find offset
- Merge clips (video + external audio) as a sync group

Format matrix:
- Test import of: ProRes 422/4444/RAW, BRAW (Blackmagic), RED R3D, 
  ARRI .ari, AVCHD, MXF (XDCAM), AVI, WebM, HEVC/H.265, AV1, DNxHD/HR
- For RAW formats (R3D, BRAW, .ari): debayer via FFmpeg with correct color science

Acceptance:
- 30-second R3D clip imports and plays correctly with correct color space tag
- Waveform sync correctly aligns within 1 frame
```

---

### PHASE 2 — COLOR SCIENCE (Sprints 11–15)

**Sprint 11: Color Page & Node Graph**
```
Implement B01–B04, B15–B18 from V3 architecture.

Key:
- Dedicated "Color" workspace tab (like DaVinci Resolve)
- Node graph panel (bottom of color page)
- Default: 1 serial node (main grade)
- Add node: right-click → Add → Serial / Parallel / Layer
- Node thumbnails (small preview of grade contribution)
- Node bypass toggle (Cmd+D)
- Lift/Gamma/Gain wheels: React-rendered canvas wheels
  - Circular color wheel with triangle inside
  - Drag center to push color
  - Vertical slider = luminance lift
  - Three wheels side by side (shadows / midtones / highlights)

Acceptance:
- Dragging a wheel shifts hue in preview within 50ms
- Node graph: 3-node chain correctly applies in sequence
- Bypass node: before/after visible on preview
```

**Sprint 12: Advanced Curves & Qualifiers**
```
Implement B05–B12 from V3 architecture.

Key:
- Curves panel: 6 curve types (Luma, R, G, B, HvS, HvH)
  - Each curve: bezier with add/remove control points
  - Overlay display for HvS/HvH showing hue band gradient
- Qualifier panel (HSL picker):
  - Eyedropper to sample color from preview
  - Hue/Saturation/Luminance range sliders with feather
  - Soft clip handles
  - Highlight selected region on preview (orange mask overlay)

Acceptance:
- Skin tone isolation (sample skin, qualifier locks to it)
- Curves: S-curve applied, preview updates within 50ms
- Qualifier + curve node: selective grade only affects qualified area
```

**Sprint 13: Power Windows & Tracking**
```
Implement B13–B14 from V3 architecture.

Key:
- Window panel: circle, linear, polygon, bezier shapes
  - Draw window on preview canvas
  - Feather per edge point
  - Invert window (grade outside instead of inside)
- Object tracking:
  - "Track Forward" analyzes motion across timeline_clip
  - Uses fal.ai planar tracker API
  - Bakes tracking data to window keyframes
  - Face detection: find face bounds → auto-window

Acceptance:
- Draw circle on face → Track Forward → window follows face for 10s clip
- Grade inside window affects only windowed area
```

**Sprint 14: LUT Import, ACES, Scopes**
```
Implement B19–B28 from V3 architecture.

Key:
- LUT import: File → Import LUT → .cube / .3dl → apply in node (right-click node → Import LUT)
- ACES workflow: Project Settings → Color Science → ACES 1.3
  - IDT per clip (right-click clip → Input Color Transform)
  - ODT on output node (RRT + ODT)
- Scopes panel: waveform, vectorscope, histogram, parade
  - All rendered via WebGL from current frame data
  - Update on each frame

Acceptance:
- Import SpeedGrade .cube LUT → applies and renders correctly
- ACES mode: ARRI LogC clip correctly transforms through pipeline
- Scopes: waveform shows over-exposed highlights correctly
```

**Sprint 15: AI Grade Intelligence & Film Lab**
```
Implement B29–B33 from V3 architecture.

Key:
- "Forge Intelligence Grade" button in color panel → calls claude-opus-4-8:
  - Analyzes current frame (via base64 image in prompt)
  - Suggests: primary grade direction, look, LUT recommendation
  - Returns JSON: { lift_adjust, gamma_adjust, gain_adjust, saturation, look_preset }
  - Applied as a new node
- Film Lab panel:
  - Film stock selector: Kodak Vision3 500T, Fuji Eterna, etc.
    (Pre-built LUT + grain + halation layered node structure)
  - Film grain: strength, size, texture (fine/coarse)
  - Halation: bloom radius, color temperature (warm/cool), opacity

IMPORTANT: All references to "claude", "opus", "AI" hidden from UI.
Show: "Forge Intelligence is analyzing your scene..."

Acceptance:
- AI grade runs on daylight interior shot → suggests warm, contrasty grade
- Kodak Vision3 preset: applies grain + warm highlights + halation
```

---

### PHASE 3 — VFX/COMPOSITOR (Sprints 16–20)

**Sprint 16: Node Compositor Canvas**
```
Implement C01–C06 from V3 architecture.

Key:
- "Effects" workspace tab → opens compositor
- Node graph (React Flow or custom canvas) for compositing nodes
- Every timeline_clip can be "Open in Compositor" → creates composite clip
- Output node: sends rendered composite back to timeline
- Layer stack view (alternative to node graph — togglable)
- 3D space toggle: enable on any layer → XYZ sliders appear

Acceptance:
- Drag two video clips into compositor → layer them with blend mode
- Export from compositor → renders correctly back in timeline
```

**Sprint 17: Keying & Roto**
```
Implement C07–C11 from V3 architecture.

Key:
- Ultra Keyer: color picker on green/blue screen, pull matte, spill suppress
  - FFmpeg chromakey as base
  - Edge refinement (feather/erode/dilate sliders)
- AI Roto Brush: click subject in preview → fal.ai segmentation API
  - Propagates across frames (up to 100 frames)
  - Paint corrections for edge errors
- AI Background removal: one-click → background becomes alpha

Acceptance:
- Greenscreen keyed cleanly on talking head (no green fringe)
- Roto brush: person isolated from outdoor scene, tracks for 5s
```

**Sprint 18: Tracking & Planar Replacer**
```
Implement C12–C16 from V3 architecture.

Key:
- 1-point tracker: track position, attach layer to tracking data
- 4-point planar tracker: track flat surface (use fal.ai CoTracker API)
  - Place any layer on tracked surface (screen replacement)
- Warp stabilizer: analyze clip, apply inverse transform to stabilize
  - Modes: Smooth Motion, No Motion, Locked Frame

Acceptance:
- Laptop screen in shot: planar track + replace with new screen content
- Shaky handheld → warp stabilize → smooth output
```

**Sprint 19: Text, Shapes, Motion Graphics**
```
Implement C17–C22 from V3 architecture.

Key:
- Text tool: click on preview → type text, style panel on right
  - Font (system fonts + bundled Cinematic Forge font pack)
  - Size, tracking, leading, kerning
  - Fill, stroke, shadow, blur
  - Per-character animation (Scale/Opacity/Position/Rotation with range selector)
- Shape layer tool: rectangle, ellipse, polygon
  - Fill, stroke, gradient
  - Path animations
- 200+ MoGRT templates (bundled in resources/motgrt/)
  - Categories: titles, lower thirds, transitions, countdowns, social overlays
  - User can customize text + colors

Acceptance:
- Animated title: types on from left, scale-up from center, fade out
- Lower third from template: double-click name field to edit
```

**Sprint 20: Particles, Lens FX, AI Sky & Content Fill**
```
Implement C23–C28 from V3 architecture.

Key:
- Particle system node: Type (fire/smoke/rain/snow/dust/confetti)
  - Count, gravity, lifespan, size, velocity, turbulence
- Lens flare: position (or track to light source), intensity, scale, rotation
- AI sky replacement: fal.ai sky segmentation → replace sky layer → match lighting
- AI content-aware fill: draw mask → fal.ai inpainting → fill from context
  - Time range: single frame or propagate across range

Acceptance:
- Rain particle system over outdoor shot
- Sky replacement: cloudy → sunset, lighting adjustment visible in foreground
```

---

### PHASE 4 — AUDIO DAW (Sprints 21–24)

**Sprint 21: Mixer & Effects Chain**
```
Implement D01–D06, D07–D10 from V3 architecture.

Key:
- "Audio" workspace tab → full mixer view
- Channel strip per track: fader (vertical), pan knob, level meter, solo/mute
- Effects chain per channel: click + icon → add effect from library
- EQ: 8-band parametric with FFT analyzer (use Web Audio API AnalyserNode)
  - Rendered on canvas overlay
  - Click/drag band handles
- Compressor: attack/release/threshold/ratio/knee/makeup gain
  - Gain reduction meter
- De-esser: frequency + threshold + depth; spectrum display

Acceptance:
- Vocal track: EQ (boost 2kHz, cut 200Hz), compressor (2:1), de-esser
- Real-time metering accurate to ±0.1 dB
```

**Sprint 22: Reverb, Delay, Pitch, Spatial Audio**
```
Implement D11–D14, D19–D22 from V3 architecture.

Key:
- Reverb: algorithmic (room/hall/plate) + convolution (load .wav IR)
- Delay: echo with tempo sync + feedback + stereo spread
- Pitch correction: auto-tune with chromatic or scale-locked modes
- Dolby Atmos: enable per-project → Object panner panel (3D sphere)
  - Objects move in 3D space over time
  - LUFS meter for loudness compliance

Acceptance:
- Reverb on drums: room 0.8s RT60
- Atmos panning: sound pans left → right → overhead
- LUFS meter: integrated reading updates correctly
```

**Sprint 23: AI Audio Intelligence**
```
Implement D15–D18 from V3 architecture.

Key:
- Stem separation: right-click audio clip → Separate Stems
  - Calls fal.ai Demucs API (5-stem: vocals/drums/bass/piano/other)
  - Creates 5 sub-clips in new bin folder
  - Places on separate tracks automatically
- Noise reduction: click clip → Reduce Noise → AI removes broadband/hiss
- Speaker separation: for interview, identifies Speaker 1 / Speaker 2 automatically

Acceptance:
- Music clip → stem separation → 5 stems, all correctly isolated
- Recording with room noise → noise reduction removes background hiss clearly
```

**Sprint 24: ADR, Foley Library, Music Ducking**
```
Implement D23–D26 from V3 architecture.

Key:
- ADR: mark timecode range on timeline → record button → pre-roll countdown
  - Guide track plays through headphones during recording
  - Multiple takes visible as lanes
- Foley library panel (resources/foley/ — 500 sounds, categorized)
  - Search, drag to timeline
  - Auto-placement: detect edit points → suggest relevant foley
- Music ducking: AI analyzes dialogue presence → applies volume automation
  - Sensitivity slider (how aggressively it ducks)
  - Attack/release handles

Acceptance:
- Record ADR take with guide track playing
- Music track auto-ducks 12dB when dialogue detected
```

---

### PHASE 5 — AI SWARM V3 (Sprints 25–28)

**Sprint 25: Script Decomposer & Casting Director**
```
Implement core of Group E from V3 architecture.

Key:
- src/main/ai/router.ts — CASTING DIRECTOR (claude-opus-4-8):

SYSTEM PROMPT (embedded in main process — NEVER sent to renderer):
"You are the Casting Director for Cinematic Forge. You analyze scripts and shot 
descriptions and output a JSON shot list. For each shot, you assign the optimal 
AI model from the available farm. Your routing decisions balance quality, cost, 
and the specific visual requirements of each shot.

MODEL FARM (INTERNAL — NEVER REVEALED TO USERS):
[full model matrix from V3 architecture — all 12 models with capabilities]

Output format: { shots: [ { id, description, duration_seconds, scene_type, 
  human_presence, physics_type, audio_type, quality_tier, consistency_id,
  assigned_model: string, fallback_model: string, estimated_cost_credits: number,
  prompt_optimized: string } ] }

IMPORTANT: Never include model names in any user-facing output.
Use only: 'draft', 'studio', 'blockbuster', 'Forge is rendering...'"

- IPC: 'ai:decompose-script' (script: string, quality_tier: string) → ShotList
- Cost estimate shown to user before confirming render

Acceptance:
- Input: 200-word action script → output: 8 shots, each correctly assigned
- Dialogue shots → NARRATIVE or APEX
- Physics shots → CINEMA or PHYSICS
- Cost estimate returned in Forge Credits
```

**Sprint 26: Parallel Shot Dispatch & Progress**
```
Key:
- src/main/ai/swarm.ts — DISPATCH ENGINE:
  - Receives ShotList from Casting Director
  - Creates ai_jobs rows in SQLite for each shot
  - Dispatches to fal.ai/Replicate/Google Vertex based on model assignment
  - Max 12 concurrent jobs (configurable)
  - Progress stream: IPC event 'ai:shot-progress' per shot update
  
- src/renderer/components/generate/ — RENDER PROGRESS UI:
  - Shot grid: each shot shown as a card
  - Card states: queued / rendering / complete / failed / repairing
  - Thumbnail preview fills in as shots complete
  - Total progress: X/Y shots complete, estimated time remaining
  - Credit counter: X credits used, Y credits remaining
  - NEVER shows model names — shows only shot type icons

- Consistency seed management:
  - Character: first-shot reference image passed to all subsequent shots with same character_id
  - Automatically chain last-frame → next-shot as reference

Acceptance:
- 8-shot scene dispatches all in parallel
- Progress UI updates correctly as each job completes
- Character consistency: same character recognizably consistent across 5 shots
```

**Sprint 27: Quality Inspector & V2V Repair**
```
Key:
- src/main/ai/quality.ts — QA INSPECTOR:
  - Extract middle frame from completed clip
  - Send to claude-opus-4-8 vision with original prompt
  - Rate coherence 0–10
  - Return: { score, passed, issues[], repaint_recommended, repaint_regions[] }
  
- Repair pipeline:
  - score ≥ 6.0 → pass, add to assembly queue
  - score 4.0–5.9 → send to V2V repair (Seedance 2.0)
  - score < 4.0 → re-render with fallback_model
  
- src/main/ai/assembly.ts — STITCHER:
  - Download all completed shots to local cache
  - FFmpeg: last-frame-first-frame optical flow blend at each boundary
  - IC-Light color normalization (match average luminance/color between shots)
  - 4-frame cross-dissolve at boundary (unless hard cut requested)
  - Audio assembly: voice stems + music + SFX → mixed audio track
  - Final output: single stitched .mp4 in project media folder

Acceptance:
- Test with intentionally bad prompt → repair pipeline triggers
- 8-shot sequence stitched cleanly — no visible jump at boundaries
```

**Sprint 28: Voice Pipeline & Music Generation**
```
Key:
- src/main/ai/voice.ts — VOICE PIPELINE:
  - Parse script for dialogue lines + character assignments
  - Call ElevenLabs TTS API per character line
  - Voice cloning: upload reference audio → /clone endpoint → store voice_id in characters table
  - OmniHuman lip sync: send generated video + voice stem → get lip-synced video back
  - Multi-language dubbing: ElevenLabs Dubbing Studio API

- src/main/ai/music.ts — MUSIC PIPELINE:
  - Input: genre, mood, tempo (BPM), duration, optional reference URL
  - Suno v4 API: generate full-length track
  - Stable Audio: generate SFX and ambient layers
  - Auto-place on timeline: music on M1, ambient on M2, SFX on M3

- UI additions:
  - Characters panel (left sidebar): add characters, record/upload reference voice
  - Scene-by-scene voice assignment: which character says which lines
  - Generate Voice button → generates all dialogue at once
  - Music section in generate panel: genre/mood selectors

Acceptance:
- Script with 2 characters → both get distinct voices
- Lip sync applied → mouth movements match audio
- 90-second score generated for 90-second scene
```

---

### PHASE 6 — FORGEFLOW (Sprints 29–31)

**Sprint 29: Production Management Core**
```
Implement F01–F04 from V3 architecture.

Key:
- "ForgeFlow" tab in left sidebar
- Project tree: Production → Sequences → Shots
- Shot board: Kanban by pipeline status
- Shot list: table with columns [Name, Status, Assignee, Due Date, Bid Days, Notes]
- Asset library panel
- Task panel with list/kanban/Gantt views
- All data stored in SQLite ff_shots, ff_assets, ff_tasks tables

Acceptance:
- Create production → sequence → 20 shots
- Drag shots between kanban columns to update status
- Assign tasks to team members, set due dates
```

**Sprint 30: Scheduling, Budgeting & Reports**
```
Implement F05–F07 from V3 architecture.

Key:
- Gantt chart: react-gantt or custom canvas implementation
  - Shots as rows, date range as X axis
  - Drag right edge to extend duration
  - Milestones as diamond markers
- Budget panel: line items, totals, burn rate
- Reports: daily progress, shot completion %, budget burn
  - PDF export via Puppeteer (headless Chromium in Electron)

Acceptance:
- Gantt shows 40-shot feature with correct date distribution
- Daily report PDF generated for today
```

**Sprint 31: ForgeFlow-Timeline Bridge**
```
Implement F08 from V3 architecture.

Key:
- Right-click timeline clip → "Link to ForgeFlow Shot"
  - Dropdown: select production → sequence → shot
  - Stores link in timeline_clips.ff_shot_id
- Shot status badge on timeline clip (colored dot: in progress / approved / etc.)
- ForgeFlow shot panel: "Open in Timeline" → jumps to linked clip
- When shot approved in ForgeFlow → timeline clip gets green checkmark

Acceptance:
- Link 5 timeline clips to ForgeFlow shots
- Approve shots in ForgeFlow → checkmarks appear on timeline
```

---

### PHASE 7 — FORGEREVIEW (Sprints 32–34)

**Sprint 32: Review Player & Annotations**
```
Implement G01–G03 from V3 architecture.

Key:
- ForgeReview workspace tab
- Clean full-screen review player (media controls hidden until hover)
- Drawing overlay: canvas over video, tools appear on hover
- Annotation tools: pen, line, arrow, rectangle, text
- On annotation: create fr_comments row with timecode + annotation_json
- Comments panel (right sidebar): listed by timecode

Acceptance:
- Draw arrow on frame → comment created with annotation
- Comment appears on right panel; click → jumps to timecode
- Annotations visible on playback at correct frame
```

**Sprint 33: Approval Workflow & Version Management**
```
Implement G04–G07 from V3 architecture.

Key:
- Status buttons (top of review player): Approve / Needs Changes / Reject
- Version panel: list all versions of a review item; click to load
- A/B comparison: side-by-side or overlay with opacity blend
- Comment resolution: checkmark on comment → marks resolved
- Version notes: "What changed" field when uploading new version

Acceptance:
- 3 versions of a shot; compare V1 vs V3 side-by-side
- Approve V3 → status badge updates in ForgeFlow automatically
```

**Sprint 34: Client Portal & Share Links**
```
Implement G05–G06, G08 from V3 architecture.

Key:
- Generate share link: creates Supabase record with token
- Link opens ForgeReview in browser (Next.js web companion — lightweight)
  - No account required for client
  - Shows: player + add comment (name field only, no login)
  - Watermark overlay (configurable)
  - Download button (toggle by sender)
- Password protection: optional 6-digit PIN

NOTE: This requires a companion Next.js web app deployed to Vercel
(forgecinema-review.vercel.app) that serves the client review page.
Client-facing: just the review UI. No editor, no AI features.

Acceptance:
- Generate link → open in incognito browser → can view and comment
- Comments made from browser appear in desktop app in real time
```

---

### PHASE 8 — EXPORT & DELIVERY (Sprints 35–36)

**Sprint 35: Export Pipeline**
```
Implement H01–H02 from V3 architecture.

Key:
- Export queue panel: list multiple exports in queue
- Presets: Netflix, YouTube 4K, TikTok 9:16, DCP, ProRes Master, etc.
- All exports via FFmpeg with correct codec settings per preset
- Background export: export runs in BullMQ worker, editing unblocked
- Progress bar per export with time remaining estimate
- Audio stems option: export audio as separate files

Acceptance:
- Export 10-minute sequence to YouTube 4K preset in background
- Editing continues during export with no performance drop
- Output file plays correctly in VLC
```

**Sprint 36: AI-Assisted Delivery & C2PA**
```
Implement H03 from V3 architecture.

Key:
- Auto-reframe AI: 16:9 → 9:16 via fal.ai subject detection + smart crop
  - Tracks primary subject across clip
  - Creates new 9:16 timeline clip
- Loudness normalization: select target (YouTube -14, Netflix -27, Broadcast -23)
  - FFmpeg loudnorm filter applied during export
- C2PA signing: embed content credentials in output file
  - Certificate: "Created with Cinematic Forge" + generation metadata

Acceptance:
- 16:9 interview clip → 9:16 auto-reframe tracks speaker correctly
- C2PA certificate verifiable in Adobe Content Authenticity tool
```

---

### PHASE 9 — HARDENING & POLISH (Sprints 37–45)

**Sprint 37: Keyboard Shortcut System**
```
- Full remappable keyboard shortcut system
- Preset layouts: Premiere, DaVinci, Avid, Final Cut, Custom
- Every action in the app is an Action with a command ID
- Settings → Keyboard → visual keyboard diagram with action overlays
- Import/export keymap as JSON
```

**Sprint 38: Project Templates & Onboarding**
```
- 10 project templates (Feature Film, Short Film, Music Video, Social Ad, Documentary)
  - Pre-configured resolution, FPS, color space, audio settings
  - Sample ForgeFlow structure for each type
- First-launch onboarding flow:
  - Name the project → select template → set workspace path
  - API key setup wizard (main process stores in keychain)
- Recent projects screen (before project is open)
```

**Sprint 39: Plugin Architecture**
```
- src/plugins/ directory
- Plugin API (sandbox via Electron contextBridge)
- Plugins can: add effects, import formats, add export presets, add AI models
- Plugin marketplace UI (stub for future expansion)
- 5 first-party plugins:
  - Suno Score Composer
  - ElevenLabs Studio
  - ForgeReview Companion
  - DaVinci Round-Trip
  - Unreal Engine Sequencer Bridge (from V2)
```

**Sprint 40: Performance Optimization**
```
Timeline performance targets:
- 1080p/24fps: <30ms frame decode time
- 4K/24fps proxy: <50ms frame decode time  
- Timeline scroll: >60fps at all times
- Seek to random frame: <200ms

Optimization approaches:
- OffscreenCanvas for video rendering (off main thread)
- Timeline canvas: only redraw dirty regions (not full repaint)
- Thumbnail LRU cache (keep last 1000 in memory)
- Waveform data pre-computed, stored as JSON in SQLite
- Node graph rendering: throttle to 30fps (not 60fps)
```

**Sprint 41: Settings & Preferences**
```
- Preferences window (Cmd+, / Ctrl+,)
- Sections: General, Appearance, Playback, Timeline, Color, Audio, AI, Shortcuts, Advanced
- General: language, units, auto-save interval, update channel
- Appearance: dark/light/system, accent color, timeline clip height default, font scale
- AI: credit balance, usage history, generation quality defaults, budget alerts
- All settings stored in SQLite settings table; applied immediately
```

**Sprint 42: V2 Feature Migration**
```
All 121 V2 features must be verified present in V3 codebase.
Run against CINEMA_V2_MASTER_COMPLETE.md feature checklist.
Any missing features must be implemented in this sprint.

Key V2 features to verify:
- Emotion Lattice analysis (A-series)
- Effect-aware object removal (D-series)
- Wireless camera → timeline (WebRTC)
- Shoppable video / Shopify integration
- Avatar system (N-series)
- Social distribution (H-series)
- DCP/IMF/C2PA export
- Film/Series/Character mode
- Intelligence Firewall (all V2 vocabulary)
```

**Sprint 43: ForgeReview Companion Web App**
```
Separate Next.js project: cinematic-forge-review/
Deploy to: forgecinema-review.vercel.app

Features:
- View shared review items (read from Supabase)
- Add comments with drawings (timestamped)
- Approve/reject/request changes
- No editing, no AI, no media management
- Mobile-responsive
- PWA installable

This is the ONLY web component in V3. Everything else is desktop.
```

**Sprint 44: macOS Code Signing & Windows Code Signing**
```
macOS:
- Apple Developer account + certificate
- electron-builder: mac.identity = "Developer ID Application: ..."
- Notarize with notarytool
- Hardened runtime flags
- Entitlements: file access, camera (for wireless recording), microphone

Windows:
- EV Code Signing certificate
- electron-builder: win.certificateFile, win.certificatePassword
- SmartScreen: green after 3 signed versions distributed

Acceptance:
- macOS: install .dmg → launches without "unidentified developer" warning
- Windows: install .exe → no SmartScreen block
```

**Sprint 45: QA, Testing, Security Audit**
```
- Unit tests (Vitest): all business logic (routing matrix, shot decomposition, DB queries)
- Integration tests: all IPC channels
- E2E tests (Playwright + Electron): critical user flows
- Security audit:
  - No API keys in renderer bundle
  - No model names in renderer bundle
  - All IPC commands whitelisted
  - No eval() or innerHTML injection
  - CSP headers on renderer
  - Supabase RLS policies verified
- Performance benchmark run
- Memory profiling (no leaks in 4-hour session)

FINAL ACCEPTANCE:
- All 45 sprints complete
- All V3 features tested and passing
- All V2 features (121) verified present
- macOS .dmg codesigned and notarized
- Windows .exe codesigned
- App locks correctly on license failure
- Zero model names in any user-facing string
- Zero placeholder UI ("coming soon" / TODO)
```

---

## FEED ORDER FOR CURSOR

Feed these documents in this exact sequence to Cursor Agent (claude-opus-4-8):

```
1.  CINEMA_Master_Roadmap.md          — original architecture + naming
2.  CINEMA_cursor_prompt.md           — V1 primary build spec
3.  CINEMA_swarm_upgrade.md           — V1 routing engine
4.  CINEMA_film_series_mode.md        — character/film/series
5.  CINEMA_studio_gap_closure.md      — Hollywood pipeline tools
6.  CINEMA_intelligence_firewall.md   — knowledge firewall
7.  CINEMA_cursor_prompt_addendum.md  — payments, landing, dev account
8.  CINEMA_gap_audit_consolidation.md — conflict resolution
9.  CINEMA_complete_wiring.md         — all stores, toolbars, shortcuts
10. CINEMA_gap_fill_prompt.md         — surgical V1 fixes
11. CINEMA_preview_player.md          — studio player
12. CINEMA_project_importer.md        — project import
13. CINEMA_v2_features.md             — V2 new feature specs
14. CINEMA_v2_completion_checklist.md — V2 completion criteria
15. CINEMA_v2_master_complete.md      — V2 final authority (121 features)
16. CINEMA_V3_MASTER_ARCHITECTURE.md  — THIS DOCUMENT PREDECESSOR
17. CINEMA_V3_CURSOR_PROMPT.md        ← THIS DOCUMENT — V3 build instructions
```

---

*Cinematic Forge V3 — Cursor Build Document*
*45 Sprints | 11 Months | claude-opus-4-8 Required*
*Replaces: Adobe, Autodesk, Frame.io, Runway, ElevenLabs, Suno*
*The Only Film Studio You'll Ever Need | May 2026*
