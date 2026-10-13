# CINEMATIC FORGE V3 — COMPLETE IMPLEMENTATION DOCUMENT
## Cursor Agent Reference — Sprint S334 onward
### Verification of completed · Implementation order · Exact specs per sprint

> **Full master spec:** [`CINEMA_V3_FULL_IMPLEMENTATION_DOC.md`](./CINEMA_V3_FULL_IMPLEMENTATION_DOC.md) (Parts 1–15, V2 migration, priority order).  
> **Living index:** `../cinematic-forge-v3/IMPLEMENTATION_ROADMAP.md`. Prefer the full doc for new implementation work.

---

## HOW TO USE THIS DOCUMENT

This doc gives Cursor **zero architectural decisions to make**. Every sprint includes:
- Exact file paths (from the real codebase)
- Exact FFmpeg filter strings
- Exact function signatures
- Exact verification commands
- The 10-step recipe applied to that specific sprint

Feed one sprint at a time. Run the gate after every sprint before moving to the next.

**Gate (run after every sprint):**
```bash
npm run typecheck          # ×3 (main + preload + renderer)
npm test -- --run          # all 1305+ tests must pass
npm run build:main         # main process compile
```

---

## PART A — VERIFY COMPLETED SPRINTS ARE ACTUALLY WORKING

Run these before starting new sprints. If any check fails, fix it first.

### DAW Core (S52–S63, S207–S212)
```bash
# Mixer panel renders
grep -n "MixerPanel\|fader\|vol\|pan" src/renderer/components/mixer/MixerPanel.tsx | head -10

# Per-track bus chain exists
grep -n "trackBusMixChain\|hpf\|reverb\|compressor" src/main/export/audioFilter.ts | head -10

# Bus param chain order matches spec:
# processing → hpf → lpf → tilt → gate → exciter → pitch → tremolo →
# vibrato → chorus → phaser → flanger → reverb → saturation → compressor →
# presence → deesser → limiter → dim → phase → mono → width → trim → swap → delay → volume/pan
```

### Sends + Aux (S300–S326)
```bash
grep -n "collectSendTaps\|collectPieceSendTaps\|auxReturnMix" src/main/export/sendMix.ts | head -10
grep -n "TrackSend\|sends_json\|auxBusTrackId" src/shared/trackSends.ts | head -10
grep -n "mixAuxReturnBuses" src/main/export/sendMix.ts
```

### Automation (S213–S333)
```bash
grep -n "evaluateAutomation\|linear interp" src/main/export/automation.ts | head -5
grep -n "send:.*auxId\|wet.*aux" src/shared/auxWet.ts | head -5
# Verify S333 wet at t=0:
grep -n "mixTimeSec\|t=0\|wet.*0" src/main/export/sendMix.ts | head -5
```

### Group Solo/Mute (S330–S332)
```bash
grep -n "trackGroupSolo\|trackGroupMute\|exclusive.*solo" src/renderer/store/timeline.ts | head -5
```

### NLE Core (S5–S6, S224–S247)
```bash
grep -n "clipEdit\|trimClip\|splitClip\|rippleDelete" src/renderer/lib/clipEdit.ts | head -10
grep -n "opticalFlow\|retimeClip" src/main/export/exporter.ts | head -5
```

### Colour (S46–S249)
```bash
grep -n "colorFilter\|grade\|lut\|curves" src/main/export/colorFilter.ts | head -10
grep -n "scope\|waveform\|vectorscope\|histogram" src/renderer/components/editor/ -r | head -10
```

---

## PART B — IMPLEMENTATION ORDER (S334 onward)

```
IMMEDIATE (blocking other work):
  S334 — Time-varying aux wet export          ← unblocks S335+
  S335 — Aux bus FX param automation
  S338 — Automation lane toolbar              ← UX clarity for all automation
  S336 — Pre-fader send automation polish
  S337 — Send automation copy across tracks

NEXT (DAW completion):
  S339 — Solo/mute sync badges on timeline
  S340 — Ducking / sidechain export
  S341 — Stem export UX
  S342 — Real-time mixer preview (Web Audio)

NLE GAPS (user-visible, high impact):
  A08  — Morph cut
  A12  — AI auto-reframe (FAL tracking)
  A13  — Clip extend (generative)
  A09  — Transcript editing (remaining ◑)

COLOUR REMAINING:
  B06  — OCIO / ACES pipeline
  B08  — Timeline harmonisation
  V206 — AI grade suggestions

LATER (major phases):
  Export: DCP, IMF, C2PA, EDL, captions
  Desktop: Auto-update, crash reporting
  Avatar: N01–N03
  3D/MoGRT: E01–E10
  Commerce: V2-08–10, V2-15
  Realtime collab: V2-05, V2-14
  Extensibility: Plugin loader
```

---

## PART C — SPRINT SPECIFICATIONS

---

### S334 — TIME-VARYING AUX WET EXPORT

**Problem:** `mixAuxReturnBuses` evaluates wet at `mixTimeSec=0` only. If user animates
aux wet over time, the export ignores it.

**Solution:** Segment the aux return bus into pieces at automation keyframe boundaries,
evaluate wet at each segment's midpoint, and generate parallel dry/wet FFmpeg paths
with cross-fades at boundaries.

#### Step 1 — ipc.ts
No IPC changes needed. Wet automation already stored via `wet` param on aux tracks.

#### Step 2 — schema.ts
No schema change. Wet keyframes already in `timeline_automation` (param=`wet`, track_id=aux track).

#### Step 3 — project.ts
```typescript
// src/main/db/project.ts
// Add helper to load wet automation for a specific aux track:
export function getWetAutomation(db: Database, trackId: string): AutomationPoint[] {
  return db.prepare(
    `SELECT time, value FROM timeline_automation WHERE track_id = ? AND param = 'wet' ORDER BY time`
  ).all(trackId) as AutomationPoint[]
}
```

#### Step 4 — Pure helper
```typescript
// src/shared/auxWet.ts — add:

export interface AuxWetSegment {
  startSec:  number
  endSec:    number
  wetFrac:   number   // 0.0 – 1.0
}

/**
 * Slice the timeline into segments at wet automation keyframe boundaries.
 * Returns segments with constant wet value within each segment.
 * Caller evaluates `evaluateAutomation` at the midpoint of each segment.
 */
export function buildWetSegments(
  points: AutomationPoint[],
  durationSec: number
): AuxWetSegment[] {
  if (points.length === 0) return [{ startSec: 0, endSec: durationSec, wetFrac: 1 }]

  const times = [0, ...points.map(p => p.time), durationSec]
  const segs: AuxWetSegment[] = []

  for (let i = 0; i < times.length - 1; i++) {
    const midSec = (times[i] + times[i + 1]) / 2
    const wet    = evaluateAutomation(points, midSec, 100) / 100
    segs.push({ startSec: times[i], endSec: times[i + 1], wetFrac: wet })
  }
  return segs
}
```

#### Step 5 — sendMix.ts (FFmpeg)
```typescript
// src/main/export/sendMix.ts

import { getWetAutomation } from '../db/project'
import { buildWetSegments } from '../../shared/auxWet'

/**
 * Replace the current single-pass mixAuxReturnBuses with a segmented version.
 * For each wet segment: generate [dry] + [wet-return] + volume crossfade.
 */
export function mixAuxReturnBusesTimeVarying(
  auxTracks: Track[],
  db: Database,
  totalDuration: number,
  filterChain: FilterChain
): string {
  const fragments: string[] = []

  for (const aux of auxTracks) {
    const wetPoints = getWetAutomation(db, aux.id)
    const segments  = buildWetSegments(wetPoints, totalDuration)

    if (segments.length === 1) {
      // Single wet value — keep existing single-pass logic
      const wet = segments[0].wetFrac
      fragments.push(
        `[aux_${aux.id}_return][aux_${aux.id}_dry]amix=inputs=2:weights='${wet} ${1 - wet}'[aux_${aux.id}_out]`
      )
      continue
    }

    // Multiple segments — build volume-automated crossfade
    // Generate the wet automation as a volume filter with eval=frame
    const volumeExpr = buildVolumeExprFromSegments(segments)
    fragments.push(
      `[aux_${aux.id}_return]volume='${volumeExpr}':eval=frame[aux_${aux.id}_wet_v]`,
      `[aux_${aux.id}_dry]volume='1-${volumeExpr}':eval=frame[aux_${aux.id}_dry_v]`,
      `[aux_${aux.id}_wet_v][aux_${aux.id}_dry_v]amix=inputs=2[aux_${aux.id}_out]`
    )
  }
  return fragments.join(';\n')
}

function buildVolumeExprFromSegments(segs: AuxWetSegment[]): string {
  // FFmpeg volume eval=frame expression: if(lt(t,T1),W1,if(lt(t,T2),W2,...,WN))
  let expr = segs[segs.length - 1].wetFrac.toFixed(4)
  for (let i = segs.length - 2; i >= 0; i--) {
    expr = `if(lt(t,${segs[i].endSec.toFixed(4)}),${segs[i].wetFrac.toFixed(4)},${expr})`
  }
  return expr
}
```

#### Step 6 — exporter.ts
```typescript
// src/main/export/exporter.ts
// Replace the static mixAuxReturnBuses call with the time-varying version:

// ❌ Before:
const auxMix = mixAuxReturnBuses(auxTracks, mixTimeSec)

// ✅ After:
const auxMix = mixAuxReturnBusesTimeVarying(auxTracks, db, project.durationSec, filterChain)
```

#### Steps 7–9 — Store/UI
No store or UI changes needed. Wet automation already editable via existing K key + lane.
Update status label in MixerPanel aux strips from "wet@0" to "wet (animated)" when keyframes > 1.

#### Verification
```bash
npm run typecheck && npm test -- --run && npm run build:main
# Specific test: add wet automation keyframes on aux, export, verify
# FFmpeg output contains eval=frame volume expressions
grep -n "eval=frame\|buildWetSegments" src/main/export/sendMix.ts
```

---

### S335 — AUX BUS FX PARAM AUTOMATION IN EXPORT

**Problem:** Reverb/saturation/etc. on aux return buses are static — no time-varying
export even though the automation system supports it.

#### Key change — audioFilter.ts
```typescript
// src/main/export/audioFilter.ts

// Each bus FX param in the bus chain needs an automation-aware variant.
// Pattern: for each FX param that can be automated on aux tracks,
// wrap the FFmpeg filter arg with an automation expression.

export function buildAuxBusFxFilter(
  aux:       Track,
  db:        Database,
  paramName: string,   // e.g. 'reverb', 'saturation', 'compressor'
  totalSec:  number
): string {
  const points = getParamAutomation(db, aux.id, paramName)
  if (!points.length) {
    // Static — use track's current value
    return buildStaticFxFilter(aux, paramName)
  }
  const segs  = buildWetSegments(points, totalSec)   // reuse seg builder
  const expr  = buildVolumeExprFromSegments(segs)
  return buildDynamicFxFilter(aux, paramName, expr)
}
```

**FFmpeg patterns per FX:**
```
reverb (roomscale):  aecho=0.8:0.88:{expr}:0.5    (delay in ms, no native eval — use segment re-encode workaround)
saturation:          asoftclip=type=atan:param={expr}:eval=frame
compressor ratio:    acompressor=ratio={expr}:eval=frame (if FFmpeg supports)
```

> Note: Not all FFmpeg audio filters support `eval=frame`. For those that don't,
> use the segment-based approach from S334: split the timeline at automation boundaries,
> render each segment with its static value, and concat.

---

### S338 — AUTOMATION LANE VISIBILITY TOOLBAR

**Problem:** All automation lanes shown at once causes clutter. Users need per-track
lane toggle.

#### Step 7 — timeline.ts store
```typescript
// src/renderer/store/timeline.ts
// automationVisibleParams already exists — add toggle action:

toggleAutomationLane: (trackId: string, param: string) =>
  set(s => {
    const key   = `${trackId}:${param}`
    const lanes = new Set(s.automationVisibleParams)
    lanes.has(key) ? lanes.delete(key) : lanes.add(key)
    return { automationVisibleParams: lanes }
  }),

showOnlyLane: (trackId: string, param: string) =>
  set(s => {
    // Solo this lane — hide all others for this track
    const allParams = AUTOMATION_PARAM_FAMILIES.flatMap(f => f.params)
    const lanes     = new Set(s.automationVisibleParams)
    allParams.forEach(p => lanes.delete(`${trackId}:${p}`))
    lanes.add(`${trackId}:${param}`)
    return { automationVisibleParams: lanes }
  }),
```

#### Step 8 — UI: Automation Lane Toolbar
```tsx
// src/renderer/components/mixer/AutomationLaneToolbar.tsx

const PARAM_GROUPS = [
  { label: 'Static',  params: ['volume', 'pan', 'dim', 'width', 'trim', 'delay'] },
  { label: 'Sends',   params: [] },  // populated dynamically from track sends
  { label: 'Aux Wet', params: ['wet'] },
]

// Render a row of toggleable lane buttons above the automation lanes
// K = existing shortcut to add keyframe; toolbar shows which lanes are visible
```

---

### S340 — DUCKING / SIDECHAIN EXPORT

**Problem:** `processing.duck` field exists but is not wired into the export.

#### FFmpeg sidechain pattern
```bash
# Sidechain ducking: source audio ducks target audio when source is above threshold
# [sidechain] [target] → sidechaincompress → [ducked_out]
[track_A]asplit=2[track_A_main][track_A_sc];
[track_B][track_A_sc]sidechaincompress=threshold=0.1:ratio=4:attack=5:release=100[track_B_ducked]
```

#### audioFilter.ts addition
```typescript
// src/main/export/audioFilter.ts

export function buildDuckFilter(
  targetTrackId:    string,
  sidechainTrackId: string,
  duck:             DuckConfig   // { threshold, ratio, attack, release }
): string {
  return [
    `[track_${sidechainTrackId}]asplit=2[sc_main_${sidechainTrackId}][sc_tap_${targetTrackId}]`,
    `[track_${targetTrackId}][sc_tap_${targetTrackId}]sidechaincompress=` +
      `threshold=${duck.threshold}:ratio=${duck.ratio}:` +
      `attack=${duck.attack}:release=${duck.release}` +
      `[track_${targetTrackId}_ducked]`,
  ].join(';\n')
}
```

---

### S342 — REAL-TIME MIXER PREVIEW (Web Audio API)

**Problem:** Users hear clip gain only in the program monitor. Bus FX, volume, pan,
sends and aux returns are export-only.

**Solution:** Maintain a Web Audio graph in the renderer that mirrors the export graph.
This is preview-quality (not sample-accurate) but sufficient for mixing.

#### Web Audio node graph
```typescript
// src/renderer/lib/audioPreview.ts

export interface AudioPreviewGraph {
  ctx:       AudioContext
  trackGain: Map<string, GainNode>
  trackPan:  Map<string, StereoPannerNode>
  auxReturn: Map<string, { gain: GainNode; convolver?: ConvolverNode }>
  master:    GainNode
  limiter:   DynamicsCompressorNode
}

export function buildPreviewGraph(tracks: Track[]): AudioPreviewGraph {
  const ctx     = new AudioContext({ latencyHint: 'interactive' })
  const master  = ctx.createGain()
  const limiter = ctx.createDynamicsCompressor()

  // Per-track nodes
  const trackGain = new Map<string, GainNode>()
  const trackPan  = new Map<string, StereoPannerNode>()

  for (const t of tracks) {
    const gain = ctx.createGain(); gain.gain.value = dbToLinear(t.fader ?? 0)
    const pan  = new StereoPannerNode(ctx, { pan: t.pan ?? 0 })
    trackGain.set(t.id, gain)
    trackPan.set(t.id, pan)
    gain.connect(pan).connect(master)
  }

  master.connect(limiter).connect(ctx.destination)
  return { ctx, trackGain, trackPan, auxReturn: new Map(), master, limiter }
}

// Update node values in real time (no rebuild needed)
export function updatePreviewVolume(graph: AudioPreviewGraph, trackId: string, db: number) {
  const gain = graph.trackGain.get(trackId)
  if (gain) gain.gain.setTargetAtTime(dbToLinear(db), graph.ctx.currentTime, 0.01)
}

export function updatePreviewPan(graph: AudioPreviewGraph, trackId: string, pan: number) {
  const panNode = graph.trackPan.get(trackId)
  if (panNode) panNode.pan.setTargetAtTime(pan, graph.ctx.currentTime, 0.01)
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20)
}
```

#### MixerPanel integration
```tsx
// src/renderer/components/mixer/MixerPanel.tsx
// On fader drag → call updatePreviewVolume (instant feedback, no export needed)
// On pan knob → call updatePreviewPan
// On play → feed clip audio through graph for monitoring
```

---

### A08 — MORPH CUT (NLE gap)

**Problem:** Jump cuts in speech look jarring. Morph cut smooths them by
AI-interpolating the transition frames.

#### FAL integration pattern
```typescript
// src/main/export/morphCut.ts

export async function generateMorphCut(
  clipA:     string,   // URL of first clip (take last ~0.5s)
  clipB:     string,   // URL of second clip (take first ~0.5s)
  durationMs: number = 500
): Promise<string> {
  // Use FILM frame interpolation to blend end of A into start of B
  const result = await fal.subscribe('fal-ai/film-interpolation', {
    input: {
      frame_a:     clipA + `#t=${clipAEnd - 0.033}`,  // last frame of A
      frame_b:     clipB + `#t=0.033`,                // first frame of B
      num_frames:  Math.round(durationMs / 33),       // @ 30fps
      mode:        'morph',
    },
  })
  return result.data.video.url
}
```

#### Exporter integration
```typescript
// src/main/export/exporter.ts
// At each cut point where `clip.morphCut === true`:
// 1. Extract last frame of prev clip
// 2. Extract first frame of next clip
// 3. Call generateMorphCut → get interpolated video
// 4. Insert as a mini clip at the cut point
// 5. Trim prev clip end and next clip start by half the morph duration
```

---

### A12 — AI AUTO-REFRAME

**Problem:** Clips need to be reframed for 9:16 vertical (TikTok/Reels) automatically,
tracking the primary subject.

#### FAL tracking + crop pattern
```typescript
// src/main/export/autoReframe.ts

export async function generateReframeKeyframes(
  videoUrl:     string,
  targetAspect: '9:16' | '1:1' | '4:5'
): Promise<CropKeyframe[]> {
  // Step 1: Track subject across the video
  const tracking = await fal.subscribe('fal-ai/object-tracker', {
    input: {
      video_url:  videoUrl,
      track_type: 'primary_subject',   // tracks the most prominent human
      output_format: 'normalized_bbox', // 0–1 bbox per frame
    },
  })

  // Step 2: Convert tracking data to crop keyframes
  const frames = tracking.data.frames as { time: number; bbox: BBox }[]
  return frames
    .filter((_, i) => i % 12 === 0)   // keyframe every 12 frames (0.5s @24fps)
    .map(f => ({
      timeSec: f.time,
      cropX:   clamp(f.bbox.cx - targetWidth / 2, 0, 1 - targetWidth),
      cropY:   clamp(f.bbox.cy - targetHeight / 2, 0, 1 - targetHeight),
      cropW:   targetWidth,
      cropH:   targetHeight,
    }))
}

// FFmpeg crop filter with animated keyframes:
// crop=w:h:x_expr:y_expr (no eval=frame support for crop — use concat segments)
```

---

### A13 — CLIP EXTEND (GENERATIVE)

**Problem:** User wants to extend a clip beyond its natural end using AI generation.

#### Pattern
```typescript
// src/main/export/clipExtend.ts

export async function extendClip(
  clipUrl:      string,
  extendBySec:  number,
  model:        string = 'kling-3.0'
): Promise<string> {
  // 1. Extract the last frame of the clip as the I2V seed
  const lastFrameUrl = await extractLastFrame(clipUrl)

  // 2. Generate extension using image-to-video
  const result = await fal.subscribe(FAL_MODEL_IDS[model], {
    input: {
      image_url: lastFrameUrl,
      prompt:    'Continue the scene naturally, matching the visual style and motion',
      duration:  Math.min(extendBySec, 10),
    },
  })

  // 3. Concat original clip + extension
  return await concatVideos([clipUrl, result.data.video.url])
}
```

---

### B06 — OCIO / ACES PIPELINE

#### colorFilter.ts pattern
```typescript
// src/main/export/colorFilter.ts — ACES addition

export function buildAcesFilter(
  idt: string,   // Input Device Transform: e.g. 'ARRI LogC EI800'
  odt: string    // Output Device Transform: e.g. 'Rec.709'
): string {
  // FFmpeg OCIO filter with ACES config:
  // Requires the ACES config .ocio file bundled with the app
  const ocioConfig = path.join(app.getPath('userData'), 'ocio', 'aces_config.ocio')
  return `lut3d=${ocioConfig}:interp=tetrahedral` +
    `,colorspace=ispace=${idt}:ospace=${odt}`
  // Or via vf=ocio=config=${ocioConfig}:src=${idt}:dst=${odt} if FFmpeg has OCIO support
}
```

---

### V206 — AI GRADE SUGGESTIONS

```typescript
// src/main/ai/gradeAdvisor.ts

export async function suggestGrade(
  frameUrl: string,
  style:    string   // 'cinematic', 'documentary', 'horror', etc.
): Promise<GradeSuggestion> {
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 600,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'url', url: frameUrl } },
      { type: 'text', text:
        `Analyse this frame for colour grade. Style target: ${style}.
         Return JSON: { lift: [R,G,B], gamma: [R,G,B], gain: [R,G,B],
         saturation: 0-2, temperature: -1to1, tint: -1to1, lut: string|null,
         reasoning: string }` }
    ]}],
  })
  return JSON.parse(res.content[0].text.replace(/```json|```/g, '').trim())
}
```

---

## PART D — PANNING & CLIPPING (why it's slow and the exact patterns)

These are the two features you mentioned specifically struggling with.
Here are the exact FFmpeg strings so Cursor has nothing to figure out.

### Audio Panning — Complete FFmpeg Patterns

```typescript
// src/main/export/audioFilter.ts

// Static pan (most common case):
export function buildPanFilter(track: Track): string {
  const pan = track.pan ?? 0    // -1.0 (full left) → 0 (centre) → +1.0 (full right)
  const L   = Math.cos((pan + 1) * Math.PI / 4).toFixed(6)
  const R   = Math.sin((pan + 1) * Math.PI / 4).toFixed(6)
  return `pan=stereo|c0=${L}*c0|c1=${R}*c1`
}

// Time-varying pan (automation):
export function buildPanAutomationFilter(
  track:  Track,
  points: AutomationPoint[],
  totalSec: number
): string {
  if (!points.length) return buildPanFilter(track)
  // FFmpeg volume+pan via expr — no native pan eval=frame, so use split approach:
  // Split to L/R, apply volume automation independently to each channel
  const segs    = buildWetSegments(points, totalSec)
  const panExpr = buildVolumeExprFromSegments(segs.map(s => ({ ...s, wetFrac: s.wetFrac })))
  const L       = `cos((${panExpr}+1)*PI/4)`
  const R       = `sin((${panExpr}+1)*PI/4)`
  return `pan=stereo|c0=${L}*c0:eval=frame|c1=${R}*c1:eval=frame`
}

// Stereo width (M/S processing):
export function buildWidthFilter(widthPct: number): string {
  const w = widthPct / 100   // 0=mono, 1=normal, 2=wide
  return [
    `pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0-0.5*c1`,   // to M/S
    `volume=1`,                                           // (process M/S here)
    `pan=stereo|c0=1*c0+${w.toFixed(4)}*c1|c1=1*c0-${w.toFixed(4)}*c1`,  // back to L/R
  ].join(',')
}
```

### Video Clip Trimming — Complete Patterns

```typescript
// src/renderer/lib/clipEdit.ts

export interface TrimResult {
  clipId:   string
  inSec:    number
  outSec:   number
}

// Ripple trim: move clip edge, ripple all clips to the right
export function rippleTrim(
  clips: Clip[],
  clipId: string,
  edge:   'in' | 'out',
  deltaSec: number,
  snap:   SnapGrid
): Clip[] {
  const idx    = clips.findIndex(c => c.id === clipId)
  const clip   = clips[idx]
  const snapped = snapDelta(deltaSec, snap)

  if (edge === 'in') {
    const newIn     = clamp(clip.startSec + snapped, 0, clip.endSec - MIN_CLIP_DUR)
    const trimDelta = newIn - clip.startSec
    return clips.map((c, i) => {
      if (c.id === clipId) return { ...c, startSec: newIn, inPoint: c.inPoint + trimDelta }
      if (i > idx) return { ...c, startSec: c.startSec + trimDelta }  // ripple right
      return c
    })
  } else {
    const newOut    = clamp(clip.endSec + snapped, clip.startSec + MIN_CLIP_DUR, MAX_TIMELINE_DUR)
    const trimDelta = newOut - clip.endSec
    return clips.map((c, i) => {
      if (c.id === clipId) return { ...c, endSec: newOut }
      if (i > idx) return { ...c, startSec: c.startSec + trimDelta }  // ripple right
      return c
    })
  }
}

// J-cut: audio starts before video (audio in < video in)
export function applyJCut(clips: Clip[], videoClipId: string, offsetSec: number): Clip[] {
  return clips.map(c =>
    c.id === videoClipId && c.linkedAudioId
      ? { ...c, linkedAudioOffset: -Math.abs(offsetSec) }
      : c
  )
}

// L-cut: audio continues after video ends (audio out > video out)
export function applyLCut(clips: Clip[], videoClipId: string, offsetSec: number): Clip[] {
  return clips.map(c =>
    c.id === videoClipId && c.linkedAudioId
      ? { ...c, linkedAudioOffset: Math.abs(offsetSec) }
      : c
  )
}

const MIN_CLIP_DUR = 0.1   // 100ms minimum clip duration
const MAX_TIMELINE_DUR = 86400
```

---

## PART E — STANDARD SPRINT RECIPE (reference)

Apply to every new sprint. Do not skip steps.

```
1.  src/shared/ipc.ts         — extend TrackMixPatch / AutomationPoint / new types
2.  src/main/db/schema.ts     — bump version if new column; else use JSON field
3.  src/main/db/project.ts    — SELECT/INSERT/updateTrack CRUD
4.  src/shared/*.ts OR
    src/renderer/lib/*.ts     — pure helper + matching *.test.ts
5.  src/main/export/
    audioFilter.ts            — FFmpeg audio fragments
    sendMix.ts                — send/aux mixing
    automation.ts             — evaluateAutomation callsites
    colorFilter.ts            — colour/grade FFmpeg
6.  src/main/export/
    exporter.ts               — thread new ids/flags through all 4 bus chains:
                                  (audio, video, aux, master)
7.  src/renderer/store/
    timeline.ts               — optimistic set + api().persist call
8.  src/renderer/components/
    mixer/MixerPanel.tsx      — mixer UI
    editor/Timeline.tsx       — timeline canvas
    editor/TimelineTrackHeaders.tsx — track header UI
9.  src/renderer/lib/shortcuts.ts
    src/renderer/Workspace.tsx — keyboard shortcuts + handler
10. GATE: npm run typecheck (×3) && npm test -- --run &&
          npm run build:main && ReadLints
```

**Bus param chain order (never deviate):**
```
processing → hpf → lpf → tilt → gate → exciter → pitch → tremolo → vibrato →
chorus → phaser → flanger → reverb → saturation → compressor → presence →
deesser → limiter → dim → phase → mono → width → trim → swap → delay → volume/pan
```

---

## PART F — WHY AGENTS WERE STRUGGLING + PREVENTION

| Root cause | Prevention |
|---|---|
| Agent had to decide FFmpeg filter strings | Exact filter strings given in this doc |
| Agent had to choose where in the bus chain | Bus chain order specified — never varies |
| Agent didn't know which file to touch | Full file paths in every sprint spec |
| Wet automation was architectural (no prior pattern) | S334 establishes the segment pattern — reuse for S335 |
| Panning required trig | Exact L/R formulas given above |
| Clip editing had no type definitions | TrimResult, JCut interfaces defined |
| Agent rebuilt things that exist | Part A verification confirms what's there first |

**Feed one sprint at a time. Gate after every sprint. Do not batch.**

---

## V2 BACKPORT REMINDER

After completing each sprint group, the following transfer to V2 web app
(replacing SQLite with Prisma, replacing local FFmpeg with FAL endpoint):

| V3 sprint | V2 equivalent |
|---|---|
| S334–S335 aux wet | `/api/audio/render` route update |
| S340 ducking | FAL sidechaincompress via FFmpeg endpoint |
| A08 morph cut | `/api/clips/morph-cut` → FAL FILM |
| A12 auto-reframe | `/api/clips/reframe` → FAL object-tracker |
| A13 clip extend | `/api/clips/extend` → FAL I2V |
| V206 AI grade | `/api/grade/suggest` → Claude Vision |
