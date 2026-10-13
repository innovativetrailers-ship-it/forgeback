# SPEC-04 — EDITING / NLE (38 controls)
# Inherits SPEC-00. Audit: 22 WIRED / 1 UI-ONLY / 5 STUB / 10 ABSENT.
# Host: DESKTOP-FLAGSHIP timeline (cinematic-forge-v3/src/renderer/store/timeline.ts).
# The core edit ops are REAL store mutations. Issues: JKL lies, web-razor bug, and
# deceptive stubs (RAW/ProRes/multicam) that advertise capability that isn't there.
# Entity: timeline clips (desktop store) / editor recipe (web).

═══════════════════════════════════════════════════════════════════════
# GROUP A — CORE EDIT TOOLS (mostly wired — the real NLE spine)
═══════════════════════════════════════════════════════════════════════

### Select   [WIRED]  (Workspace.tsx:101, tool.select). TIER: —.

### Blade / razor   [WIRED — web bug → TIER 1]
- PURPOSE: split a clip at the playhead.
- UI: B key / razor tool. Desktop splitClip (timeline.ts:2036) is correct.
- BUG (web): editor split (editor.ts:210) sets BOTH pieces' trim in/out to 0
  (:218), so the second piece LOSES its source offset → wrong content.
- FIX (TIER 1 — correctness): web split must set piece1 = [in, cut] and piece2 =
  [cut, out], preserving source offsets, matching desktop splitClip. Small, real bug.
- ACCEPTANCE: split a trimmed clip on web → second piece plays the correct source
  range, not from 0.
- TIER: 1.

### Trim   [WIRED]  (trimClip timeline.ts:1395). TIER: —.
### Slip   [WIRED]  (timeline.ts:1418, source inside fixed slot; web has none). TIER: —.
### Slide   [WIRED]  (timeline.ts:1437; web has none). TIER: —.
### Ripple   [WIRED]  (rippleDelete :2907, insert :1305). TIER: —.
### Roll   [WIRED]  (rollEdit :1657). TIER: —.
### 3-point edit   [WIRED]  (ForgePlayer.tsx:55, source in/out → insert/overwrite). TIER: —.
### Match frame   [WIRED]  (ProgramMonitor.tsx:144). TIER: —.

### 4-point edit   [ABSENT → TIER 3]
- PURPOSE: in/out on BOTH source and timeline → auto time-remap to fit.
- UI: (build) record-side in/out marks + a "fit" mode. DATA: edit op params.
- BACKEND: when 4 points set, compute the speed to fit source range into timeline
  range → apply as a speed-remap on insert. TIER 3.

### J-cut / L-cut   [ABSENT → TIER 3]
- PURPOSE: roll edit that offsets audio and video independently (audio leads/lags).
- UI: (build) drag audio/video handles independently on a linked clip. DATA: clip
  audioOffset. BACKEND: the export already separates A/V; offset the audio start.
  Depends on link/unlink (below). TIER 3.

### JKL trim   [UI-ONLY → TIER 1]
- PURPOSE: the editing-standard shuttle — J=reverse, K=pause, L=forward, repeated
  presses ramp speed; with a trim tool, dynamic trim during playback.
- BUG: J and K both STOP, L STARTS (TopBar.tsx:192). Not shuttle, not trim. This is
  the single most muscle-memory-sacred NLE shortcut and it's wrong — a pro notices
  in 10 seconds.
- FIX (TIER 1): wire J/K/L to real transport: J=play-reverse (repeat → 2×,4×),
  K=pause, L=play-forward (repeat → 2×,4×). Dynamic trim (JKL during a trim) is a
  later enhancement (TIER 3). Just the shuttle first.
- ACCEPTANCE: J reverses, L forwards, repeated presses ramp speed, K pauses.
- TIER: 1.

### Link / unlink   [ABSENT → TIER 2]
- PURPOSE: toggle audio-video linking for independent edit.
- UI: (build) a link toggle on a clip; linked = move/trim together.
- DATA: clip.linkedGroupId. BACKEND: edit ops act on the group when linked.
  Prerequisite for J/L cuts. TIER 2 (enables J/L; useful).

═══════════════════════════════════════════════════════════════════════
# GROUP B — MULTICAM (stub graveyard — build or remove honestly)
═══════════════════════════════════════════════════════════════════════

### Multicam 2-up / 4-up   [STUB → TIER 2 or REMOVE]
- MultiCam.tsx:72 grid exists; NOTHING mounts it. 3-column max (no 9/16-up).
### Multicam 9-up / 16-up   [ABSENT]
### Sync by timecode   [STUB]  (MultiCamSync.ts:31 syncBySmpte never called).
### Sync by waveform   [STUB]  (MultiCamSync.ts:61 syncByAudio never called).
- DECISION (rule 4 — don't advertise stubs): multicam is a BIG feature and it's
  a graveyard (component + sync engine built, nothing mounted). CHOOSE:
  (a) WIRE it: mount MultiCam, call the sync functions, add an angle switcher that
      cuts on number keys during playback. Real work but the pieces exist.
  (b) REMOVE the multicam UI for v1 so it doesn't imply a feature that doesn't run.
  RECOMMEND (b) unless multicam is a needed v1 seller. The sync functions are also
  used by "audio sync" (below) — decide together.
- TIER: 2 (wire) or immediate removal (honesty).

### Audio sync   [STUB]
- MultiCamSync.ts:61 (same unused waveform function). Align a video + separate audio
  by waveform cross-correlation. FIX: if you keep waveform sync for multicam, expose
  it here too (align a clip to a separate audio recording). Shares the build. TIER 2.

═══════════════════════════════════════════════════════════════════════
# GROUP C — SPEED & RETIMING
═══════════════════════════════════════════════════════════════════════

### Speed amount   [WIRED — range]  (0.25×–4×, EffectsPanel.tsx:2053; spec 10–1000%).
- Widen range if needed; export resamples (ipc.ts:645). TIER 2 (range) if 4× is
  insufficient; otherwise —.
### Reverse   [WIRED]  (EffectsPanel.tsx:1777). TIER: —.
### Optical-flow retime   [WIRED]  (minterpolate when speed<1, ipc.ts:648). TIER: —.

### Speed bezier   [ABSENT → TIER 3]
- PURPOSE: variable-speed ramp via a bezier curve (exponential/linear/sinusoidal).
- UI: (build) a speed-curve editor. DATA: clip.speedCurve (points). BACKEND: sample
  the curve → time-remap map fed to the retime (setpts with a per-frame expression).
  TIER 3.

═══════════════════════════════════════════════════════════════════════
# GROUP D — ORGANIZATION & MEDIA
═══════════════════════════════════════════════════════════════════════

### Proxy   [WIRED]  (Preview.tsx:47, switches to proxyUrl). TIER: —.

### Scene detect   [ABSENT → TIER 3]
- PURPOSE: auto-cut a long clip into subclips. UI: (build) "detect scenes" command.
  BACKEND: FFmpeg scene-detect (select='gt(scene,X)') → create subclips in the bin.
  TIER 3.

### Nested sequences   [ABSENT → TIER 3]
- PURPOSE: group clips into a compound clip (reusable, editable). UI: (build) "nest"
  on a selection. DATA: a sequence-clip type referencing a sub-timeline. BACKEND:
  render or reference the nested timeline as one clip. Rearchitecture-ish. TIER 3.

### Smart bins   [ABSENT → TIER 3]
- PURPOSE: auto-populate bins by codec/res/fps/date/tag/rating. UI: (build) rule
  editor. DATA: bin rules. BACKEND: filter the media library by rules, live. NOTE:
  a DaVinciImporter reads Resolve's SmartBin table (DaVinciImporter.ts:15) — that's
  IMPORT, not a Forge bin. TIER 3.

═══════════════════════════════════════════════════════════════════════
# GROUP E — TRANSPORT (all wired)
═══════════════════════════════════════════════════════════════════════
### Play / Pause   [WIRED]  (togglePlay, ProgramMonitor.tsx:137). TIER: —.
### Scrub   [WIRED]  (Timeline.tsx:1015). TIER: —.
### Frame step   [WIRED]  (ProgramMonitor.tsx:58, ±1 or ±5 with Shift). TIER: —.
### Fullscreen   [WIRED — web only]  (Preview.tsx:119). STATUS: desktop player has
  NO fullscreen control — add one. TIER 2 (small parity fix).
### Undo / redo   [WIRED]  (100-level, timeline.ts:136/2924). TIER: —.

═══════════════════════════════════════════════════════════════════════
# GROUP F — TRANSFORM & COMPOSITE
═══════════════════════════════════════════════════════════════════════

### Opacity / scale / position / rotation   [WIRED — single value each]
- UI: one value each (EffectsPanel.tsx:1247), burned in at export. TIER: —.

### Transform keyframes   [ABSENT → TIER 2]
- PURPOSE: animate opacity/scale/position/rotation over time.
- UI: (build) keyframe toggle + a keyframe track per property. DATA: clip.transform
  Keyframes (per-prop point arrays). BACKEND: the export applies animated transforms
  (FFmpeg with time expressions, or per-frame). Auto-reframe ALREADY stores its own
  keys (EffectsPanel.tsx:1742) — reuse that keyframe machinery.
- STRATEGIC: transform keyframes are PREREQUISITE for the post-production camera
  moat (2.5D camera moves = animated transform + tracking). Cross-ref: SPEC-05
  tracker, CORRECTION-motion-brush-reality Tier-2 control layer. HIGH strategic value.
- TIER: 2 (and moat infra).

### Blend modes   [WIRED]  (29 modes, blendMode.ts:6 → FFmpeg blend). TIER: —.

═══════════════════════════════════════════════════════════════════════
# GROUP G — FORMAT SUPPORT (deceptive stubs — build or stop advertising)
═══════════════════════════════════════════════════════════════════════

### Camera RAW import (BRAW/R3D/ARRI/MXF/CRM/N-RAW/S-RAW)   [STUB → TIER 1 honesty]
- raw-ingest.ts:7 LISTS these formats; ingestRAWFile is NEVER called; the picker
  accepts video/*,audio/*,image/* (LeftPanel.tsx:326).
- ISSUE (rule 4 — worst deceptive stub): a pro drops a BRAW expecting RAW handling
  and gets generic-video or a failure. Advertising BRAW/R3D/ARRI you don't process
  is a credibility-killer for the pro audience the desktop flagship targets.
- FIX (TIER 1): EITHER (a) build real RAW ingest (decode via the appropriate SDK/
  FFmpeg build with the codec, generate a working-space proxy, tag color space), OR
  (b) REMOVE the RAW format list from the UI and accept only what you actually
  process. RECOMMEND (b) now, (a) when you have pro users with RAW workflows.
- TIER: 1 (honesty) — remove the false advertisement; build later.

### ProRes import   [STUB → TIER 1 honesty]
- ProRes 422/4444 are EXPORT names (export.worker.ts:25); no importer. FIX: ProRes
  export is fine; don't imply ProRes IMPORT unless FFmpeg is built with it (it
  usually decodes ProRes fine — VERIFY and either enable or don't claim). TIER 1.

═══════════════════════════════════════════════════════════════════════
# SECTION SUMMARY & CONSOLIDATION
═══════════════════════════════════════════════════════════════════════
TIER-1 (do soon — bugs + honesty):
- Web razor trim bug (real correctness error).
- JKL keys → real shuttle (pros judge the NLE on this instantly).
- RAW import + ProRes import stubs → REMOVE the false format advertising (or build).
TIER-2 (cheap/strategic):
- Link/unlink (enables J/L cuts).
- Transform keyframes (STRATEGIC — moat infra for post-production camera).
- Desktop fullscreen; audio sync; multicam decision (wire or remove).
TIER-3 (depth): 4-point edit, J/L cuts, speed bezier, scene detect, nested
sequences, smart bins.
CONSOLIDATION: the waveform-sync function serves BOTH multicam sync and audio sync
(one build). Transform-keyframe machinery is reused from auto-reframe AND feeds the
camera moat. Link/unlink gates J/L cuts.

## CROSS-REFS
- Transform keyframes + tracker → SPEC-05 planar tracker → the control-layer moat.
- Multicam/audio-sync graveyard → the built-but-unmounted pattern (SPEC-02/03/07).
- Web razor bug + JKL → TIER-1 silent-drop/lie queue (FINAL-AUDIT-VERDICT).

## NEXT
Say "next" for SPEC-05 (VFX & compositing, 36 controls).
