# CINEMATIC FORGE V3 — FULL IMPLEMENTATION DOCUMENT
## Master Reference for Cursor Agents · Sprint S1–S∞
### Architecture · Verification · Remaining Sprints · Full Specs · V2 Migration

---

## DOCUMENT RULES

1. Feed **one sprint at a time** to Cursor. Gate after every sprint.
2. Never skip the gate. A broken foundation cascades into 5× debug time.
3. Every sprint spec uses the **10-step recipe** (Part 2). Never deviate from it.
4. **Bus chain order is sacred** — inserting a new FX in the wrong position breaks export.
5. This document is the single source of truth. Do not re-derive patterns from scratch.

---

## LIVE SYNC STATUS

**Synced:** 2026-06-07 · **Repo:** `cinematic-forge-v3` · **Schema:** v37 · **Tests:** ~1366 vitest  
**Companion:** [`IMPLEMENTATION_ROADMAP.md`](./IMPLEMENTATION_ROADMAP.md) (living index — update both when a sprint lands)

| Sprint | Status | Key paths |
|--------|--------|-----------|
| S334 | ✅ Done | `src/shared/auxWet.ts`, `sendMix.ts` (`eval=frame` dry/wet), `exporter.ts` |
| S335 | ✅ Done | `src/shared/auxBusFxAutomation.ts`, segmented wet-chain FX in `sendMix.ts` |
| S336 | ✅ Done | `automationMath.ts` pre-fader lanes, `trackHasPreSendAutomation` in `sendMix.ts` |
| S337 | ✅ Done | `remapSendAutomation`, `resolveSendAutomationPasteIncoming`, auto-create send on paste |
| S338 | ✅ Done | `AutomationLaneToolbar.tsx`, per-track `automationPerTrackVisible` in store |
| S339 | ✅ Done | `trackGroupSync.ts` — group M/S badges on `TimelineTrackHeaders` |
| S340 | ✅ Done | `duckSidechain.ts` — configurable key track + export wiring |
| S341 | ✅ Done | `stemExport.ts` — categories, pre/post-fader, `stems/` output + Export panel |
| S342 | ✅ Done | `audioPreview.ts` — Web Audio vol/pan/EQ/compressor on program monitor |
| A08 | ✅ Done | `morphCut.ts` — fal film-interpolation + junction context menu |
| EXP-04 | ✅ Done | `chapters.ts`, `transcriptSrt.ts`, chapter sidecars + transcript SRT export |
| VFX-02 | ✅ Done | `motionBrush.ts`, brush canvas UI, FAL motion brush IPC + timeline replace |
| B12 | ✅ Done | `gradeSync/hub.ts`, IPC broadcast, collaborative grade in Effects panel |
| EXP-01 | ✅ Done | DCP JPEG2000 MXF presets + `dcpPackage.ts` SMPTE folder wrap |
| EXP-02 | ✅ Done | IMF APP2E H.264 MXF presets + `imfPackage.ts` SMPTE folder wrap |
| EXP-03 | ✅ Done | C2PA manifest sidecar + metadata embed + optional `@contentauth/c2pa-node` signing |
| PKG-01 | ✅ Done | `electron-updater` background checks + Preferences UI + restart dialog |
| PKG-02 | ✅ Done | `crashReporter` + JS error log + recovery dialog + optional HTTP upload |
| N01 | ✅ Done | `avatarGen.ts` text-to-character portrait + vault `referenceImagePath` |
| N02 | ✅ Done | `avatarLipsync.ts` OmniHuman 1.5 portrait + voiceover lip-sync |
| N03 | ✅ Done | `avatarMocap.ts` DWPose skeleton + Hunyuan HY-Motion transfer |
| COLLAB-01 | ✅ Done | `projectSync.ts` clip + automation realtime sync (IPC + optional Supabase) |
| EXT-01 | ✅ Done | `pluginHost.ts` sandboxed BrowserWindow loader + toolbar + clip effects API |
| FF-01 | ✅ Done | `ganttLevel.ts` greedy assignee leveling + Gantt conflict UI + `levelSchedule` IPC |
| FF-02 | ✅ Done | `resourceReport.ts` utilisation + budget-by-category + shot heat map in Report/PDF |
| E01 | ✅ Done | `textTo3d.ts` TripoSG text→mesh + Generate panel + media bin `model3d` assets |
| E05 | ✅ Done | `mogrt.ts` 200 MoGRT-lite templates + Motion panel + timeline place/drag |
| E06 | ✅ Done | AI MoGRT generate (Anthropic) + per-project custom library + place/drag |
| E08 | ✅ Done | Particle gravity + wind (export + live Viz) via `particlePhysics.ts` |
| E10 | ✅ Done | USDA scene export (3D mesh timeline → `.usda` sidecar + standalone) |

**Gate after every sprint:** `npm run typecheck` (×3) → `npm test -- --run` → `npm run build:main` → ReadLints on touched files.

---

# PART 1 — ARCHITECTURE REFERENCE

## 1.1 Process Model

```
┌─────────────────────────────────────────────────────────────────┐
│  Renderer (React 19 + Zustand + TanStack Query)                 │
│  src/renderer/ — UI, canvas, stores, pure lib helpers           │
│  NO Node, NO secrets, NO model names (Intelligence Firewall)    │
└───────────────────────────┬─────────────────────────────────────┘
                            │ contextBridge
┌───────────────────────────▼─────────────────────────────────────┐
│  Preload — src/preload/ — typed window.forge API                │
└───────────────────────────┬─────────────────────────────────────┘
                            │ IPC
┌───────────────────────────▼─────────────────────────────────────┐
│  Main (Node) — src/main/                                        │
│  • SQLite (better-sqlite3) per-project .cfp files               │
│  • FFmpeg export graph (ffmpeg-static)                          │
│  • AI providers (fal, Anthropic, ElevenLabs) + keystore         │
│  • Media probe/import/protocol handlers                         │
└─────────────────────────────────────────────────────────────────┘
Shared: src/shared/ — ipc.ts, trackSends.ts, auxWet.ts (pure types, both sides)
```

## 1.2 Data Flow (every feature follows this)

```
Model (ipc.ts) → Persistence (schema.ts + project.ts) →
Pure logic (src/main/export/*.ts + src/renderer/lib/*.ts) →
Export (exporter.ts) → Store (timeline.ts) → UI → Tests → Gate
```

## 1.3 Export Audio Graph (DAW)

```
Per clip:    audioClipFilter (gain, fades, restoration, spatial, pitch)
Per track:   trackProcessingFilter → bus chain (hpf…limiter…delay) → trackMixFilter (vol/pan)
             ± automation wrappers (volume/pan/send per segment)
Sends:       collectSendTaps / collectPieceSendTaps → auxSendAcc
Aux:         mixAuxReturnBuses → auxReturnMixStatements (dry/wet + bus FX)
Mix:         amix all carriers → loudnorm → fades
```

## 1.4 Bus Param Chain Order (NEVER DEVIATE)

```
processing → hpf → lpf → tilt → gate → exciter → pitch → tremolo → vibrato →
chorus → phaser → flanger → reverb → saturation → compressor → presence →
deesser → limiter → dim → phase → mono → width → trim → swap → delay → volume/pan
```

## 1.5 Key File Paths

| Area | Path |
|------|------|
| Timeline canvas | `src/renderer/components/editor/Timeline.tsx` |
| Track headers | `src/renderer/components/editor/TimelineTrackHeaders.tsx` |
| Clip editing | `src/renderer/lib/clipEdit.ts` |
| Shortcuts | `src/renderer/lib/shortcuts.ts` |
| Layout | `src/renderer/lib/timelineLayout.ts` |
| Mixer UI | `src/renderer/components/mixer/MixerPanel.tsx` |
| Audio bus FFmpeg | `src/main/export/audioFilter.ts` |
| Sends + aux | `src/main/export/sendMix.ts` |
| Aux wet | `src/shared/auxWet.ts` |
| Automation evaluator | `src/main/export/automation.ts` |
| Automation math | `src/renderer/lib/automationMath.ts` |
| Colour/grade FFmpeg | `src/main/export/colorFilter.ts` |
| Composite/key | `src/main/export/composite.ts` |
| Export orchestration | `src/main/export/exporter.ts` |
| AI swarm | `src/main/ai/swarm.ts` |
| Store | `src/renderer/store/timeline.ts` |
| Schema | `src/main/db/schema.ts` |
| Project CRUD | `src/main/db/project.ts` |
| IPC contract | `src/shared/ipc.ts` |
| ForgeFlow | `src/main/db/forgeflow.ts` |
| ForgeReview | `src/main/db/forgereview.ts` |

## 1.6 Automation Param Families

| Family | Params |
|--------|--------|
| Static bus | `volume`, `pan`, `dim`, `width`, `trim`, `delay`, `hpf`, `lpf`, `limiter`, all bus FX |
| Dynamic send | `send:{auxBusTrackId}` (source tracks with active send) |
| Aux-only | `wet` (return FX wet/dry ratio) |

---

# PART 2 — SPRINT RECIPE & GATE

## 2.1 Standard 10-Step Recipe (apply to every sprint)

```
1.  src/shared/ipc.ts           — new types / TrackMixPatch fields
2.  src/main/db/schema.ts       — version bump IF new column; else JSON field
3.  src/main/db/project.ts      — SELECT/INSERT/updateTrack
4.  src/shared/*.ts OR          — pure helper
    src/renderer/lib/*.ts          + matching *.test.ts
5.  src/main/export/            — FFmpeg fragments
    audioFilter.ts | sendMix.ts | automation.ts | colorFilter.ts | composite.ts
6.  src/main/export/exporter.ts — thread through ALL 4 bus chains
7.  src/renderer/store/         — optimistic set + api().persist
    timeline.ts
8.  src/renderer/components/    — UI
    mixer/MixerPanel.tsx
    editor/Timeline.tsx
    editor/TimelineTrackHeaders.tsx
9.  src/renderer/lib/shortcuts.ts + Workspace.tsx (keyboard shortcuts)
10. GATE — run all four commands, fix before next sprint
```

## 2.2 Gate Commands (run after EVERY sprint)

```bash
npm run typecheck          # tsconfig.main + preload + renderer (×3)
npm test -- --run          # all vitest tests (currently 1305+)
npm run build:main         # main process compile
ReadLints                  # on all touched files
```

## 2.3 FFmpeg Utility Patterns

### Volume expression (time-varying, eval=frame)
```
if(lt(t,T1),V1,if(lt(t,T2),V2,if(lt(t,T3),V3,VN)))
```

### Pan (stereo, constant)
```
pan=stereo|c0={L}*c0|c1={R}*c1
where L=cos((pan+1)*PI/4), R=sin((pan+1)*PI/4), pan in [-1,1]
```

### Pan (time-varying, eval=frame)
```
pan=stereo|c0=cos(({expr}+1)*PI/4)*c0:eval=frame|c1=sin(({expr}+1)*PI/4)*c1:eval=frame
```

### Sidechain ducking
```
[source]asplit=2[main][sc]; [target][sc]sidechaincompress=threshold=0.1:ratio=4:attack=5:release=100[out]
```

### Stereo width (M/S)
```
pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0-0.5*c1,
<process M/S>,
pan=stereo|c0=1*c0+{w}*c1|c1=1*c0-{w}*c1
```

### Loudness normalisation (EBU R128)
```
loudnorm=I=-14:LRA=11:TP=-1
```

### Reverb (convolution)
```
[in]aecho=0.8:0.88:{room_ms}:0.4[out]
or: [in][ir]afir=dry=1:wet={wetFrac}[out]
```

### DCP encode (JPEG2000)
```
-vf scale=4096:1716 -c:v libopenjpeg -cinema_mode 4k_24 -pix_fmt yuv444p -r 24
```

### IMF (Interoperable Master Format)
```
-c:v libx264 -preset slow -crf 18 -color_primaries bt709 -color_trc bt709 -colorspace bt709
```

---

# PART 3 — COMPLETED DOMAINS (verification)

Run these grep/test commands to confirm each domain is working before building on it.

## 3.1 NLE Core
```bash
grep -n "splitClip\|trimClip\|rippleDelete\|insertClip" src/renderer/lib/clipEdit.ts | head -10
grep -n "optical.*flow\|retimeClip\|stabilise" src/main/export/exporter.ts | head -5
grep -n "fillerRemoval\|silenceRemoval" src/main/export/exporter.ts | head -5
```
Expected: all found. Sprint ranges S5–S6, S224–S247, S56–S58.

## 3.2 DAW Bus + Per-Track FX
```bash
grep -n "trackBusMixChain\|hpf\|reverb\|compressor\|limiter" src/main/export/audioFilter.ts | head -15
grep -n "fader\|MixerPanel\|trackMixFilter" src/renderer/components/mixer/MixerPanel.tsx | head -10
```
Expected: full bus chain (26 stages) in audioFilter.ts.

## 3.3 Sends + Aux Buses
```bash
grep -n "collectSendTaps\|collectPieceSendTaps\|auxSendAcc" src/main/export/sendMix.ts | head -10
grep -n "TrackSend\|sends_json\|auxBusTrackId" src/shared/trackSends.ts | head -10
grep -n "mixAuxReturnBuses" src/main/export/sendMix.ts
```
Expected: send collection and aux return mixing present.

## 3.4 Automation
```bash
grep -n "evaluateAutomation\|linear.*interp\|AutomationPoint" src/main/export/automation.ts | head -10
grep -n "automationMath\|hitTest\|clamp\|colour" src/renderer/lib/automationMath.ts | head -10
grep -n "timeline_automation" src/main/db/schema.ts
```
Expected: evaluateAutomation with linear interpolation, per-param colours.

## 3.5 Send Automation (S324–S329)
```bash
grep -n "sendAutomationClipboard\|copyPaste\|pasteAtPlayhead" src/shared/sendAutomationClipboard.ts | head -10
grep -n "sendAutomationFocus" src/shared/sendAutomationFocus.ts | head -5
```

## 3.6 Group Solo/Mute (S330–S332)
```bash
grep -n "trackGroupSolo\|exclusive.*solo\|trackGroupMute" src/renderer/store/timeline.ts | head -10
grep -n "buildTimelineDisplayRows\|buildMixerDisplayRows" src/renderer/lib/ -r | head -5
```

## 3.7 Aux Wet Automation (S333–S334) ✅
```bash
grep -n "buildWetSegments\|eval=frame\|wetSegmentsNeedTimeVarying" src/main/export/sendMix.ts src/shared/auxWet.ts | head -10
grep -n "Wet (anim)\|wet.*K\|addAutomationPoint.*wet" src/renderer/components/mixer/MixerPanel.tsx | head -5
```
Expected: time-varying wet uses `eval=frame` dry/wet paths when >1 keyframe; `totalDurationSec` threaded from exporter.

## 3.8 Colour (S46–S249)
```bash
grep -n "liftGammaGain\|curves\|hslQual\|lut3d\|grain" src/main/export/colorFilter.ts | head -15
grep -n "waveform\|vectorscope\|histogram\|scope" src/renderer/components/ -r --include="*.tsx" | head -10
```

## 3.9 VFX / Composite (S83–S84, S252–S275)
```bash
grep -n "composite\|chroma.*key\|ultraKey\|depthMatte" src/main/export/composite.ts | head -10
```

## 3.10 AI Swarm + Voice/Music (S25–S28)
```bash
grep -n "swarm\|decompose\|assembly\|castingDirector" src/main/ai/swarm.ts | head -10
grep -n "ElevenLabs\|voiceClone\|suno\|musicGen" src/main/ -r --include="*.ts" | head -5
```

## 3.11 ForgeFlow (S29–S31)
```bash
grep -n "ff_shots\|ff_assets\|ff_tasks\|budget" src/main/db/forgeflow.ts | head -10
```

## 3.12 ForgeReview (S32–S33)
```bash
grep -n "fr_items\|fr_comments\|annotation\|approval" src/main/db/forgereview.ts | head -10
```

---

# PART 4 — DAW / AUTOMATION (S334–S342)

## S334 — TIME-VARYING AUX WET EXPORT ✅ COMPLETE

**Blocks:** S335, S336 (all use the segment pattern established here)

### Step 4 — src/shared/auxWet.ts (add)
```typescript
export interface AuxWetSegment { startSec: number; endSec: number; wetFrac: number }

export function buildWetSegments(
  points: AutomationPoint[], durationSec: number
): AuxWetSegment[] {
  if (!points.length) return [{ startSec: 0, endSec: durationSec, wetFrac: 1 }]
  const times = [0, ...points.map(p => p.time), durationSec]
  return times.slice(0, -1).map((t, i) => ({
    startSec: t, endSec: times[i + 1],
    wetFrac: evaluateAutomation(points, (t + times[i + 1]) / 2, 100) / 100,
  }))
}

export function buildVolumeExprFromSegments(segs: AuxWetSegment[]): string {
  let expr = segs[segs.length - 1].wetFrac.toFixed(4)
  for (let i = segs.length - 2; i >= 0; i--)
    expr = `if(lt(t,${segs[i].endSec.toFixed(4)}),${segs[i].wetFrac.toFixed(4)},${expr})`
  return expr
}
```

### Step 3 — src/main/db/project.ts (add)
```typescript
export function getWetAutomation(db: Database, trackId: string): AutomationPoint[] {
  return db.prepare(
    `SELECT time, value FROM timeline_automation WHERE track_id=? AND param='wet' ORDER BY time`
  ).all(trackId) as AutomationPoint[]
}
```

### Step 5 — src/main/export/sendMix.ts (replace static call)
```typescript
import { buildWetSegments, buildVolumeExprFromSegments } from '../../shared/auxWet'
import { getWetAutomation } from '../db/project'

export function mixAuxReturnBusesTimeVarying(
  auxTracks: Track[], db: Database, totalSec: number
): string {
  return auxTracks.map(aux => {
    const points = getWetAutomation(db, aux.id)
    const segs   = buildWetSegments(points, totalSec)
    if (segs.length === 1) {
      const w = segs[0].wetFrac.toFixed(4)
      return `[aux_${aux.id}_return][aux_${aux.id}_dry]amix=inputs=2:weights='${w} ${(1-segs[0].wetFrac).toFixed(4)}'[aux_${aux.id}_out]`
    }
    const expr = buildVolumeExprFromSegments(segs)
    return [
      `[aux_${aux.id}_return]volume='${expr}':eval=frame[aux_${aux.id}_wet_v]`,
      `[aux_${aux.id}_dry]volume='1-(${expr})':eval=frame[aux_${aux.id}_dry_v]`,
      `[aux_${aux.id}_wet_v][aux_${aux.id}_dry_v]amix=inputs=2[aux_${aux.id}_out]`,
    ].join(';\n')
  }).join(';\n')
}
```

### Step 6 — exporter.ts
```typescript
// Replace: mixAuxReturnBuses(auxTracks, mixTimeSec)
// With:    mixAuxReturnBusesTimeVarying(auxTracks, db, project.durationSec)
```

### Verification
```bash
npm run typecheck && npm test -- --run && npm run build:main
grep -n "eval=frame\|buildWetSegments" src/main/export/sendMix.ts
```

---

## S335 — AUX BUS FX PARAM AUTOMATION IN EXPORT ✅ COMPLETE

**Depends on:** S334 segment pattern. **Reuse** `buildWetSegments` + `buildVolumeExprFromSegments`.

### Step 3 — project.ts (add)
```typescript
export function getParamAutomation(db: Database, trackId: string, param: string): AutomationPoint[] {
  return db.prepare(
    `SELECT time, value FROM timeline_automation WHERE track_id=? AND param=? ORDER BY time`
  ).all(trackId, param) as AutomationPoint[]
}
```

### Step 5 — audioFilter.ts (add)
```typescript
// For each automatable aux bus param, check for keyframes and build eval=frame expression.
// Params supporting eval=frame: volume, saturation (asoftclip param)
// Params NOT supporting eval=frame: reverb, compressor → use segment re-encode workaround

export function buildAuxBusFxSegmented(
  aux: Track, db: Database, param: string, totalSec: number
): string {
  const points = getParamAutomation(db, aux.id, param)
  const segs   = buildWetSegments(
    points.map(p => ({ ...p, value: p.value })), totalSec
  )
  // Build concat-based segmented export for non-eval filters
  return segs.map((seg, i) =>
    `[aux_${aux.id}_in]atrim=start=${seg.startSec}:end=${seg.endSec},` +
    `${buildStaticBusFxFilter(aux, param, seg.wetFrac)}` +
    `[aux_${aux.id}_seg${i}]`
  ).join(';\n')
}
```

---

## S336 — PRE-FADER SEND AUTOMATION POLISH ✅ COMPLETE

### Step 5 — sendMix.ts
```typescript
// Visual distinction: pre-fader sends use a dashed purple lane (handled in automationMath.ts)
// Export parity: pre-fader taps already in collectPieceSendTaps — verify automation
// evaluates correctly for pre-fader param: `send:{auxId}:pre`

// Audit collectPieceSendTaps to confirm pre vs post routing:
function collectPieceSendTaps(track: Track, piece: ExportPiece, db: Database) {
  const sends = JSON.parse(track.sends_json ?? '[]') as TrackSend[]
  return sends
    .filter(s => s.active)
    .map(s => ({
      auxId:   s.auxBusTrackId,
      level:   evaluateAutomation(getParamAutomation(db, track.id, `send:${s.auxBusTrackId}`),
                 piece.midTimeSec, s.level),
      preFader: s.preFader ?? false,
    }))
}
```

### Step 4 — automationMath.ts
```typescript
// Add visual distinction for pre-fader lanes:
export const LANE_COLORS = {
  'volume':          '#4ade80',
  'pan':             '#60a5fa',
  'send:*':          '#a855f7',   // post-fader send: solid purple
  'send:*:pre':      '#a855f7',   // pre-fader send: dashed purple (CSS handles dash)
  'wet':             '#c084fc',
  default:           '#94a3b8',
}
```

---

## S337 — SEND AUTOMATION COPY ACROSS TRACKS ✅ COMPLETE

### Step 4 — src/shared/sendAutomationClipboard.ts (add)
```typescript
// When pasting send automation to a different track, remap the auxBusTrackId.
// The source track's send `send:{oldAuxId}` becomes `send:{newAuxId}` on target.

export function remapSendAutomation(
  points:    AutomationPoint[],
  oldAuxId:  string,
  newAuxId:  string
): AutomationPoint[] {
  return points.map(p => ({
    ...p,
    param: p.param === `send:${oldAuxId}` ? `send:${newAuxId}` : p.param,
  }))
}

// In paste handler: if target track has a different send to the same aux bus, remap.
// If target track has no send to that aux, create one before pasting.
```

---

## S338 — AUTOMATION LANE VISIBILITY TOOLBAR ✅ COMPLETE

### Step 7 — timeline.ts (add actions)
```typescript
// Add to store:
automationVisibleParams: new Set<string>(),   // already exists, just verify

toggleAutomationLane: (trackId: string, param: string) =>
  set(s => {
    const key   = `${trackId}:${param}`
    const lanes = new Set(s.automationVisibleParams)
    lanes.has(key) ? lanes.delete(key) : lanes.add(key)
    return { automationVisibleParams: lanes }
  }),

soloAutomationLane: (trackId: string, param: string) =>
  set(s => {
    const allForTrack = [...s.automationVisibleParams]
      .filter(k => k.startsWith(`${trackId}:`))
    const lanes = new Set(s.automationVisibleParams)
    allForTrack.forEach(k => lanes.delete(k))
    lanes.add(`${trackId}:${param}`)
    return { automationVisibleParams: lanes }
  }),

showAllLanes: (trackId: string) =>
  set(s => {
    const lanes = new Set(s.automationVisibleParams)
    ALL_AUTOMATION_PARAMS.forEach(p => lanes.add(`${trackId}:${p}`))
    return { automationVisibleParams: lanes }
  }),
```

### Step 8 — UI
```tsx
// Above automation lane area in Timeline.tsx, render a compact toolbar:
// [All] [Volume] [Pan] [Sends ▼] [Wet] — toggle buttons per param family
// Selected = highlighted, deselected = dim
// Sends dropdown shows each active send by aux name
```

---

## S339 — SOLO/MUTE SYNC BADGES ON TIMELINE ✅ COMPLETE

### Step 8 — TimelineTrackHeaders.tsx (add)
```tsx
// When a track is solo'd or muted via group control, show a badge on the track header:
{track.isMutedByGroup && (
  <span className="text-[9px] bg-amber-500 text-black px-1 rounded">M</span>
)}
{track.isSolodByGroup && (
  <span className="text-[9px] bg-emerald-500 text-black px-1 rounded">S</span>
)}
// Derive isMutedByGroup / isSolodByGroup from store group state — no new DB fields needed
```

---

## S340 — DUCKING / SIDECHAIN EXPORT ✅ COMPLETE

### Step 1 — ipc.ts
```typescript
interface TrackProcessing {
  // ... existing fields ...
  duck?: { targetTrackId: string; threshold: number; ratio: number; attack: number; release: number }
}
```

### Step 5 — audioFilter.ts (add)
```typescript
export function buildDuckFilter(
  targetId: string, scId: string,
  duck: { threshold: number; ratio: number; attack: number; release: number }
): string {
  return [
    `[track_${scId}]asplit=2[sc_main_${scId}][sc_tap_${targetId}]`,
    `[track_${targetId}][sc_tap_${targetId}]sidechaincompress=` +
    `threshold=${duck.threshold}:ratio=${duck.ratio}:attack=${duck.attack}:release=${duck.release}` +
    `[track_${targetId}_ducked]`,
  ].join(';\n')
}
```

### Step 6 — exporter.ts
```typescript
// After per-track processing, before mix:
// For each track with processing.duck set, insert the sidechain filter
const duckFilters = tracks
  .filter(t => t.processing?.duck)
  .map(t => buildDuckFilter(t.id, t.processing.duck!.targetTrackId, t.processing.duck!))
  .join(';\n')
```

---

## S341 — STEM EXPORT UX

### Step 8 — Export panel UI additions
```tsx
// In Export settings panel, add a "Stems" section:
// [ ] Export stems
//   (•) Pre-fader   ( ) Post-fader
//   [x] Video      [x] Music      [x] Dialogue      [x] SFX      [x] VFX
//   Output: [stems/] folder alongside master

// This drives the existing stem export logic — only UI is missing
// Verify stems logic exists: grep -n "stem\|stemExport" src/main/export/exporter.ts
```

---

## S342 — REAL-TIME MIXER PREVIEW (Web Audio API)

### Step 4 — src/renderer/lib/audioPreview.ts (create)
```typescript
export class AudioPreviewGraph {
  ctx       = new AudioContext({ latencyHint: 'interactive' })
  trackGain = new Map<string, GainNode>()
  trackPan  = new Map<string, StereoPannerNode>()
  trackEQ   = new Map<string, BiquadFilterNode[]>()
  auxReturn = new Map<string, GainNode>()
  master    = this.ctx.createGain()

  constructor(tracks: Track[]) {
    const limiter  = this.ctx.createDynamicsCompressor()
    this.master.connect(limiter).connect(this.ctx.destination)

    for (const t of tracks) {
      const gain = this.ctx.createGain()
      const pan  = new StereoPannerNode(this.ctx, { pan: t.pan ?? 0 })
      gain.gain.value = dbToLinear(t.fader ?? 0)
      gain.connect(pan).connect(this.master)
      this.trackGain.set(t.id, gain)
      this.trackPan.set(t.id, pan)
    }
  }

  setVolume(trackId: string, db: number) {
    this.trackGain.get(trackId)?.gain.setTargetAtTime(
      dbToLinear(db), this.ctx.currentTime, 0.01
    )
  }

  setPan(trackId: string, pan: number) {
    const n = this.trackPan.get(trackId)
    if (n) n.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.01)
  }

  connectClip(clipAudioUrl: string, trackId: string): void {
    // Load clip audio → connect to track gain node for monitoring
    const source = this.ctx.createBufferSource()
    fetch(clipAudioUrl)
      .then(r => r.arrayBuffer())
      .then(buf => this.ctx.decodeAudioData(buf))
      .then(decoded => {
        source.buffer = decoded
        source.connect(this.trackGain.get(trackId) ?? this.master)
        source.start()
      })
  }

  dispose() { this.ctx.close() }
}

function dbToLinear(db: number): number { return Math.pow(10, db / 20) }
```

### Step 7 — timeline.ts (add)
```typescript
previewGraph: AudioPreviewGraph | null = null,
initPreviewGraph: (tracks: Track[]) => set({ previewGraph: new AudioPreviewGraph(tracks) }),
disposePreviewGraph: () => {
  get().previewGraph?.dispose()
  set({ previewGraph: null })
},
```

---

# PART 5 — REMAINING: NLE ADVANCED GAPS

## A08 — MORPH CUT

**What it does:** AI-interpolates frames between two jump cuts in speech to smooth them.

### Step 4 — src/main/export/morphCut.ts (create)
```typescript
import * as fal from '@fal-ai/client'

export async function generateMorphCut(
  clipAUrl: string, clipBUrl: string,
  frameATimeSec: number, frameBTimeSec: number,
  morphDurationSec: number = 0.5
): Promise<string> {
  const frameA = await extractFrame(clipAUrl, frameATimeSec)
  const frameB = await extractFrame(clipBUrl, frameBTimeSec)
  const numFrames = Math.round(morphDurationSec * 24)

  const result = await fal.subscribe('fal-ai/film-interpolation', {
    input: { frame_a: frameA, frame_b: frameB, num_frames: numFrames, mode: 'morph' },
  })
  return result.data.video.url
}

async function extractFrame(videoUrl: string, timeSec: number): Promise<string> {
  // Use ffmpeg-static to extract a single frame as JPEG, upload to R2/temp, return URL
  const { execSync } = await import('child_process')
  const tmp = `/tmp/frame_${Date.now()}.jpg`
  execSync(`ffmpeg -ss ${timeSec} -i "${videoUrl}" -vframes 1 "${tmp}" -y`)
  return uploadTemp(tmp)
}
```

### Step 6 — exporter.ts
```typescript
// At each cut where clip.morphCut === true:
const morphVideo = await generateMorphCut(
  prevClip.src, nextClip.src,
  prevClip.outPoint, nextClip.inPoint,
  clip.morphDurationSec ?? 0.5
)
// Insert morphVideo as a clip between prevClip and nextClip
// Trim prevClip end and nextClip start by half the morph duration
```

### Step 8 — UI
```tsx
// Right-click on a cut point between two clips:
// Context menu option: "Apply Morph Cut"
// Shows a slider: Morph Duration 0.2s–1.0s
// Progress indicator while FAL processes
```

---

## A09 — TRANSCRIPT EDITING ✅

Word-level transcript editing on top of S85 transcribe + filler cut.

### Shipped
- `src/shared/transcriptEdit.ts` — `wordRemoveRange`, `timelineFrameForWord`, `wordIndexAtTime`, `segmentsAfterWordRemoval` (reuses silence keep/ripple maths)
- `src/renderer/components/editor/TranscriptPanel.tsx` — transcribe selected clip (OpenAI Whisper via main), clickable word chips → playhead jump, right-click / Delete → ripple-remove word range
- `src/renderer/store/timeline.ts` — `transcriptOpen`, `toggleTranscriptOpen`, `removeTranscriptWord` (sub-clip split + ripple like `removeFillers`; requires `speed === 1`)
- Toolbar **Transcript** toggle next to Markers
- `tests/transcriptEdit.test.ts`

### Not in scope (future)
- Word rearrange / drag-reorder on timeline

---

## A12 — AI AUTO-REFRAME ✅

Subject-tracking crop for social aspects (9:16, 1:1, 4:5).

### Shipped
- `src/shared/autoReframe.ts` — ratio maths, tracking→keyframes, FFmpeg axis expressions
- `src/main/media/autoReframe.ts` — fal `object-tracking/video` on clip segment, stores keyframes on `ClipEffects.autoReframe`
- `src/main/export/autoReframe.ts` — animated `crop` on raw source before delivery raster (base + overlay paths)
- Effects panel **Track subject** (Crop / Reframe section)
- `tests/autoReframe.test.ts`

---

## A13 — CLIP EXTEND (GENERATIVE) ✅

Generative tail extension from the clip's last frame.

### Shipped
- `src/shared/clipExtend.ts` — clamp/validate, `computeClipExtendEdits`, concat list helper
- `src/main/media/clipExtend.ts` — extract segment → last-frame I2V (kling/seedance) → `concatVideos` → import
- `src/main/media/ffmpeg.ts` — `concatVideos` (copy with re-encode fallback)
- Effects → Motion → **Generative Extend** (0.5–10s, model picker, **Extend tail**)
- `tests/clipExtend.test.ts`

---

# PART 6 — REMAINING: COLOUR SCIENCE

## B06 — OCIO / ACES PIPELINE ✅

ACES 1.3 studio OCIO colour pipeline at export.

### Shipped
- `resources/ocio/aces_1.3.config` — bundled studio ACES 1.3 OCIO config
- `src/shared/ocio.ts` — IDT/ODT presets, `acesPipelineFilters` (FFmpeg `colorspace` + config)
- `src/main/export/ocio.ts` — resolves config path, `acesLookFragments` for exporter
- `ClipEffects.aces` — `{ idt, odt, useRrt? }`; inserted in `lookChain` (IDT before grade, ODT before border; skips manual HDR tonemap when active)
- Effects → Colour → **ACES pipeline** (IDT / ODT / Grade in ACEScg)
- `tests/ocio.test.ts`

---

## B08 — TIMELINE HARMONISATION ✅

Match clip/timeline look to a hero reference via sampled colour stats (FFmpeg mean RGB ×3 frames).

### Shipped
- `src/shared/harmonise.ts` — `aggregateColourSamples`, `buildHarmonisationEffects` (plate match + wheels gamma/lift + light primaries)
- `src/main/media/harmonise.ts` — multi-frame sampling + IPC `media.harmonise`
- Store: `harmoniseClip`, `harmoniseTimeline` (all video-track clips)
- Effects → Colour → **Harmonise** (Match look to Source + **All** timeline)
- `tests/harmonise.test.ts`

---

## B12 — COLLABORATIVE GRADE ✅

Live grade sync across multiple Forge windows on the same project (IPC broadcast hub).

### Shipped
- `src/shared/clipEffects.ts` — shared `pickGrade` / `adoptGrade` (grade key whitelist)
- `src/shared/gradeSync.ts` — `GradeChangeEvent`, `mergeRemoteGrade`, sanitise helpers
- `src/main/gradeSync/hub.ts` — publish, ring buffer, DB merge via `applyGradePatchToClip`
- IPC `gradeSync.publish` / `gradeSync.recent` / `gradeSync.onChange`
- Store: `gradeSyncEnabled`, `applyRemoteGradeChange`, auto-publish from `setClipEffects`
- Effects → Colour → **Collaborative Grade** (sync toggle + author name)
- `tests/gradeSync.test.ts`

### Architecture (reference)
```typescript
// Main hub broadcasts grade_change to all renderer windows except sender:
webContents.send('grade-sync:change', { timelineClipId, gradePatch, authorName, sessionId, timestamp })
// On receive: merge grade patch into clip effects + update preview
```

---

## V2-06 — AI GRADE SUGGESTIONS ✅

Vision-based creative grade suggestions via Anthropic (reuses `callVision` + keystore).

### Shipped
- `src/shared/gradeSuggest.ts` — styles, `parseGradeSuggestion`, `suggestionToClipEffectsPatch`
- `src/main/ai/gradeAdvisor.ts` — frame sample + vision prompt → JSON grade
- IPC `media.suggestGrade`
- Effects → Wheels (CDL) → **AI style** picker + **AI Suggest** → preview reasoning → **Apply** / **Dismiss**
- `tests/gradeSuggest.test.ts`

---

# PART 7 — REMAINING: VFX & COMPOSITING

## VFX-01 — NODE COMPOSITOR EXPORT PARITY AUDIT ✅

Full FFmpeg blend token mapping for upper-track / PiP composite export.

### Shipped
- `src/shared/blendMode.ts` — 29 modes, `BLEND_MODE_TO_FFMPEG`, `ffmpegBlendToken` (`add` → `addition`, etc.)
- `composite.ts` — `compositeStatement` + `pipStatements` use mapped tokens
- `exporter.ts` — `parseBlendModeValue` validation on load
- Effects → Key → **Blend** dropdown expanded (Hard/Soft Light, Dodge/Burn, Vivid/Linear/Pin, etc.)
- `tests/blendMode.test.ts`

## VFX-02 — MOTION BRUSH ✅

Paint a region on the playhead frame, set motion direction + intensity, generate via FAL, replace clip media.

### Shipped
- `src/shared/motionBrush.ts` — request/result, validation, `computeMotionBrushEdits`, `motionPromptFromVector`
- `src/renderer/lib/motionBrushCanvas.ts` — brush rasterise + overlay drawing
- `src/main/media/motionBrush.ts` — `generateMotionBrush` (FAL `fal-ai/runway-motion-brush` queue)
- IPC `media.motionBrush` + store `applyMotionBrush`
- Effects → Speed section → **Motion Brush** panel (paint canvas, dir X/Y, amount, duration)
- `tests/motionBrush.test.ts`, `tests/motionBrushCanvas.test.ts`

### Reference — src/main/media/motionBrush.ts
```typescript
// User draws a region on a frame; that region gets an independent motion direction
// Uses FAL's motion brush endpoint (Runway-style)
export async function applyMotionBrush(
  clipUrl:      string,
  maskDataUrl:  string,      // drawn region
  direction:    { x: number; y: number },  // motion vector
  intensity:    number
): Promise<string> {
  const result = await fal.subscribe('fal-ai/runway-motion-brush', {
    input: {
      image_url:     clipUrl,
      mask_url:      maskDataUrl,
      motion_vector: direction,
      intensity,
    },
  })
  return result.data.video.url
}
```

## VFX-03 — SFX LIBRARY INTEGRATION ✅

Bundled starter SFX library with searchable browser and one-click timeline placement.

### Shipped
- `resources/sfx/catalog.json` + 16 starter `.wav` assets (8 categories)
- `src/shared/sfxLibrary.ts` — catalog types + `filterSfxEntries`
- `src/main/media/sfxLibrary.ts` — `listBundledSfx`, `importBundledSfx`
- IPC `media.listBundledSfx` / `media.importBundledSfx`
- **SFX** header button → `SfxLibraryPanel` (search, category filter, click → playhead on audio track)
- Store `placeBundledSfx`
- `tests/sfxLibrary.test.ts`

---

# PART 8 — REMAINING: FORGEFLOW+

## FF-01 — GANTT LEVELING (resource conflict resolution) ✅

### Shipped
- `src/shared/ganttLevel.ts` — `levelScheduleItems` / `levelResources`, conflict detection, shot + task converters
- `src/main/db/forgeflow.ts` — `levelShotSchedule` persists leveled due dates
- IPC `forgeflow.levelSchedule` · Gantt **Level resources** button + conflict highlights
- `tests/ganttLevel.test.ts`

## FF-02 — RESOURCE REPORTS (PDF export) ✅

### Shipped
- `src/shared/resourceReport.ts` — `buildResourceUtilisation`, `buildBudgetByCategory`, `buildShotHeatMap`
- Extended `FfReportSummary` + `buildReport` with `resourceUtil`, `budgetByCategory`, `shotHeatMap`, `scheduleConflicts`
- `src/main/forgeflow/report.ts` — PDF HTML sections (heat map, utilisation table, budget variance)
- `ReportView.tsx` — live dashboard mirrors PDF content
- `tests/resourceReport.test.ts`

---

# PART 9 — REMAINING: EXPORT & DELIVERY

## EXP-01 — DCP (Digital Cinema Package) ✅

JPEG2000 MXF cinema masters + minimal SMPTE DCP folder (ASSETMAP / CPL / PKL / VOLINDEX).

### Shipped
- Export presets **DCP 4K Flat** (`4096×1716`) and **DCP 4K Scope** (`4096×858`) — `jpeg2000` @ 250 Mbps, PCM 24-bit 48 kHz, 24 fps
- `src/shared/dcp.ts` — SMPTE XML builders + `isDcpPreset`
- `src/main/export/dcpPackage.ts` — auto-wraps master MXF into `{name}_DCP/` after export
- Job card **DCP** reveal button
- `tests/dcp.test.ts`, preset tests updated

### Reference encode
```typescript
// Preset video: jpeg2000 yuv422p10le 250M · audio: pcm_s24le 48kHz · container: mxf
```

## EXP-02 — IMF (Interoperable Master Format) ✅

H.264 Rec.709 MXF streaming masters + minimal SMPTE IMF folder (ASSETMAP / OPL / CPL / PKL / VOLINDEX).

### Shipped
- Export presets **IMF APP2E 1080p** (`1920×1080`) and **IMF APP2E UHD** (`3840×2160`) — `libx264` slow CRF 18, bt709, PCM 24-bit 48 kHz
- `src/shared/imf.ts` — SMPTE XML builders + `isImfPreset`
- `src/main/export/imfPackage.ts` — auto-wraps master MXF into `{name}_IMF/` with SHA-256 PKL digests
- Job card **IMF** reveal button
- `tests/imf.test.ts`, preset tests updated

### Reference encode
```typescript
// Preset video: libx264 yuv420p bt709 · audio: pcm_s24le 48kHz · container: mxf
```

## EXP-03 — C2PA (Content Authenticity) ✅

Post-export provenance: sidecar manifest, FFmpeg metadata embed, optional cryptographic signing.

### Shipped
- `src/shared/c2pa.ts` — manifest builders, `canEmbedC2pa`, metadata map
- `src/main/export/c2paSign.ts` — writes `.c2pa.manifest.json`; remuxes MP4/MOV with claim metadata; uses `@contentauth/c2pa-node` when `C2PA_CERT_PATH` + `C2PA_KEY_PATH` are set
- Export checkbox **Embed C2PA content credentials**
- Job card **C2PA** reveal button (tooltip shows crypto vs metadata-only)
- `tests/c2pa.test.ts`

### Reference
```typescript
// Cryptographic signing (optional — requires env certs):
// C2PA_CERT_PATH=/path/to/cert.pem  C2PA_KEY_PATH=/path/to/key.pem
import { Builder, LocalSigner } from '@contentauth/c2pa-node'
```

## EXP-04 — EDL / CHAPTERS / CAPTIONS ✅

Bundled delivery sidecars: CMX3600 EDL, text-overlay SRT/VTT, marker chapters (embed + optional sidecars), transcript SRT export.

### Shipped
- `src/shared/edl.ts` + `buildEdl` — export `.edl` checkbox + `writeEdlSidecar`
- `src/shared/subtitle.ts` — text-overlay `.srt` + `.vtt` via `writeSrtSidecar`
- `src/shared/chapters.ts` — `buildFfmetaChapters`, `buildChaptersTxt`, trim-aware `adjustMarkersForTrim`
- Chapters embedded at export via temp `.embed.ffmeta`; optional `exportChapters` persists `.chapters.ffmeta` + `.chapters.txt`
- `src/shared/transcriptSrt.ts` — group words (max 8 / 4s) → SRT/VTT
- IPC `media.saveTranscriptSrt` + Transcript panel **Export SRT**
- `tests/chapters.test.ts`, `tests/transcriptSrt.test.ts`

### EDL export (reference)
```typescript
// CMX 3600 EDL format:
function buildEDL(clips: Clip[]): string {
  const lines = ['TITLE: Cinematic Forge Export', 'FCM: NON-DROP FRAME', '']
  clips.forEach((c, i) => {
    const src = toTimecode(c.inPoint)
    const dst = toTimecode(c.outPoint)
    lines.push(`${String(i+1).padStart(3,'0')}  AX       V     C   ${src} ${dst} ${toTimecode(c.startSec)} ${toTimecode(c.startSec + c.duration)}`)
  })
  return lines.join('\n')
}
```

### Captions (SRT export)
```typescript
function buildSRT(transcript: TranscriptWord[]): string {
  // Group words into caption blocks of max 8 words / 4 seconds
  return captionBlocks.map((block, i) =>
    `${i+1}\n${toSRTTime(block.startSec)} --> ${toSRTTime(block.endSec)}\n${block.text}\n`
  ).join('\n')
}
function toSRTTime(sec: number): string {
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = Math.floor(sec%60), ms = Math.round((sec%1)*1000)
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`
}
```

---

# PART 10 — REMAINING: DESKTOP PACKAGING

## PKG-01 — AUTO-UPDATE (electron-updater) ✅

Background update checks in production builds; manual check + restart from Preferences.

### Shipped
- `electron-updater` dependency + generic `publish` feed in `electron-builder.config.cjs` (`UPDATE_FEED_URL` override)
- `src/shared/updater.ts` — `UpdateStatus` types + label helpers
- `src/main/updater.ts` — deferred startup check, download progress broadcast, restart dialog
- IPC `updater.status` / `updater.check` / `updater.install` + `onStatus` events
- Preferences → General → **Check for updates** + **Restart to install**
- `tests/updater.test.ts`

### Reference
```typescript
// Production only — disabled when NODE_ENV=development
autoUpdater.checkForUpdatesAndNotify()
```

## PKG-02 — CRASH REPORTING ✅

Native minidump upload + JS-level error capture with local log and recovery dialog.

### Shipped
- `src/shared/crash.ts` — report entry builders + upload payload
- `src/main/crash.ts` — `crashReporter.start` (production), `uncaughtException` / `unhandledRejection` → `userData/logs/crash.log`
- Recovery dialog on uncaught exceptions (Continue / Quit)
- Best-effort JSON POST to `CRASH_SUBMIT_URL` (default `https://forgecinema.vercel.app/api/crash`; disable with `CRASH_UPLOAD=false`)
- Preferences → **Reveal crash log**
- `tests/crash.test.ts`

### Reference
```typescript
crashReporter.start({ productName: 'Cinematic Forge V3', submitURL, uploadToServer: true })
```

---

# PART 11 — REMAINING: AVATAR (N01–N03)

## N01 — TEXT-TO-CHARACTER ✅

Avatar from text description → reference portrait + vault character.

### Shipped
- `src/shared/avatarGen.ts` — style presets, prompt builder, validation, credits
- `src/main/media/avatarGen.ts` — FAL `flux/dev` text-to-image → import + `characters` row with `referenceImagePath`
- IPC `media.generateAvatarFromPrompt`
- Generate panel → Characters → **Generate from description**
- `tests/avatarGen.test.ts`

### Reference
```typescript
// Routed via fal-ai/flux/dev (doc alias: fal-ai/avatar-gen)
fal.queue.submit(endpoint, { input: { prompt, image_size: 'portrait_16_9', num_images: 1 } })
```

## N02 — LIP-SYNC TO VOICEOVER ✅

Portrait or reference video driven by an external voiceover clip via OmniHuman 1.5.

### Shipped
- `src/shared/avatarLipsync.ts` — validation, resolution limits (1080p=30s, 720p=60s), credits
- `src/main/media/avatarLipsync.ts` — FAL `bytedance/omnihuman/v1.5` (`image_url` + `audio_url`); video portraits extract first frame
- IPC `media.lipsyncAvatarToVoiceover`
- Media bin context menu → **Lip-sync to voiceover…** (portrait picker + audio clip + resolution + optional prompt)
- `tests/avatarLipsync.test.ts`

### Reference
```typescript
// Routed via fal-ai/bytedance/omnihuman/v1.5 (doc alias: fal-ai/omnihuman-1.5)
fal.subscribe(endpoint, { input: { image_url, audio_url, prompt? } })
```

## N03 — ANIMATE WITH MOTION CAPTURE ✅

Portrait driven by performance motion via DWPose skeleton extraction + Hunyuan video-to-video.

### Shipped
- `src/shared/avatarMocap.ts` — validation, draw modes, strength clamp, credits, prompt builder
- `src/main/media/avatarMocap.ts` — FAL `dwpose/video` → `hunyuan-video/video-to-video` pipeline
- IPC `media.animateAvatarWithMocap`
- Media bin context menu → **Animate with mocap…** (motion picker, pose mode, resolution, strength, prompt)
- `tests/avatarMocap.test.ts`

### Reference
```typescript
// Step 1: DWPose skeleton from motion reference
fal.queue.submit('fal-ai/dwpose/video', { input: { video_url, draw_mode: 'body-pose' } })
// Step 2: Hunyuan HY-Motion (doc alias: hunyuan-hy-motion)
fal.queue.submit('fal-ai/hunyuan-video/video-to-video', {
  input: { prompt, video_url: poseVideoUrl, resolution: '720p', strength: 0.85 },
})
```

---

# PART 11b — FORGECAST / FORGEMOTION (CHAR) ✅

Full character DNA pipeline (`.fcc`) on top of N01–N03 avatar stack — ingest, three-lock identity, wardrobe, motion, anime, roto.

## Schema v41
- `characters.fcc_json TEXT` — serialized `FCCCharacter` DNA blob
- `src/shared/fccSchema.ts` — types, `emptyFCCCharacter`, serialize/deserialize
- `tests/fccSchema.test.ts`

## Identity lock (three-lock)
- `src/shared/identityLock.ts` — face ref + appearance sliders + wardrobe prompts → generation tokens
- `src/shared/characterResolve.ts` — match character name in shot prompts
- Swarm integration: `src/main/ai/swarm.ts` + `providers.ts` inject `identityTokens` when shot names a cast member
- `tests/identityLock.test.ts`, `tests/characterResolve.test.ts`

## Main services (`src/main/character/`)
| Module | Role |
|--------|------|
| `fccManager.ts` | Load/save/import/export `.fcc` on project `characters` row |
| `ingestion.ts` | Photo / video / sketch → cast DNA (FAL ip-adapter + embeddings) |
| `apparel.ts` | CatVTON wardrobe apply per region |
| `appearanceBake.ts` | FLUX image-to-image bake from micro-sliders |
| `choreography.ts` | Claude motion plan segments |
| `anime.ts` | Video anime stylize (shonen / seinen / cell_shade) |
| `rotoOverlay.ts` | Live-action roto + character/VFX overlay |
| `service.ts` | Orchestration entry points for IPC |

## IPC (`window.forge.fcc.*`)
- `listSummaries`, `get`, `save`, `patchAppearance`, `patchBehavioral`
- `ingestPhoto`, `ingestVideo`, `ingestSketch`, `applyWardrobe`, `planChoreography`
- `bakeAppearance`, `runMocap`, `animeTransform`, `rotoOverlay`
- `export`, `import`, `importFile` (native file picker)

## Collaborative sync (`window.forge.fccSync.*`)
- Local multi-window broadcast (same pattern as `gradeSync`) — `publish`, `recent`, `onChange`
- `src/main/fccSync/hub.ts` — in-memory ring buffer
- `tests/fccSync.test.ts`

## UI
- Workspace header **Cast** → `CharacterStudioPanel`
- **ForgeCast** tab: ingestion, micro-sliders + bake, wardrobe, persona (behavioral prompt), 3DGS preview stub
- **ForgeMotion** tab: choreography plan, mocap (reuses N03 DWPose pipeline on `refFront`), anime transform, roto overlay
- `src/shared/mediaDisplay.ts` — `forge-media://` URLs for renderer preview
- `tests/mediaDisplay.test.ts`, `tests/appearanceBake.test.ts`

## N01 integration
- `avatarGen.ts` seeds `.fcc` with `refFront` after portrait generation

## V2 transfer (web) ✅
- Extended `VaultCharacter` + `WardrobeItem` in Prisma
- `src/lib/character/` — fccSchema, fccManager, identityLock, ingestion, apparel, appearanceBake, mocap, anime, roto, choreography, jobIdentity
- API: FCC CRUD + `…/choreography`, `…/mocap`, `…/anime`, `…/roto`, `…/export`, `POST /api/vault/character/import`
- Generation: `jobs/create` + `/api/generate` enrich payloads with three-lock identity tokens
- Cognition bridge: director mode injects vault character persona/wardrobe/appearance into `think()` when prompt names a cast member
- UI: `ForgeCastPanel` (Cast + Motion tabs) in Vault + Cast panels (API-backed list)
- `tests/unit/character.test.ts`

### Cognition (consciousness) scope
- **V2 web (`cinema`)** ✅ — `src/lib/cognition/` (intent/affect/ideation/critique agents, episodic + procedural memory, knowledge graph, learning loop). Wired in `render.worker` (`think` + `learn`), `dagRouter` live routing, `/api/feedback/signal`, `/api/health/cognition`. Character DNA feeds the cognitive director when vault cast matches the prompt.
- **V3 desktop cloud relay** ✅ — Preferences → Forge Cloud → **Cloud cognition**. Desktop calls `POST /api/desktop/cognition/think` + `/learn` on your hosted Forge app (`src/main/cognition/relayClient.ts`). Script decomposition enriches via cloud director; batch assembly uploads learning signals. Requires API URL + web user id + `FORGE_CLOUD_TOKEN` bearer (optional server-side).
- **fccSync Supabase relay** ✅ — `fcc_sync` broadcast on project Supabase channel (`projectSync/relay.ts`); pairs with local IPC fan-out.
- **3D preview** ✅ — TripoSG GLB via `fcc:generate-preview-mesh` + `model-viewer` in ForgeCast 3D tab.

---

# PART 12 — REMAINING: REALTIME COLLAB (V2-05, V2-14)

## V2-14 — MULTI-USER REVIEW WITH TIMESTAMPS ✅

### Shipped
- `src/shared/reviewSync.ts` — `comment_add` / `comment_resolve` / `comment_delete` events + validation
- `src/main/reviewSync/hub.ts` — ring buffer, idempotent upsert, optional Supabase `review_sync` relay
- `src/main/db/forgereview.ts` — `upsertCommentFromSync` for stable comment ids
- IPC `reviewSync.publish` · `reviewSync.recent` · `reviewSync.onChange`
- `ForgeReviewPanel.tsx` — publishes on add/resolve; live **Live** badge when project sync enabled; auto-refresh on remote events
- Reuses COLLAB-01 toggle (Preferences → Realtime project sync) + author name
- `tests/reviewSync.test.ts`

### Note
Desktop V2-14 syncs timestamped ForgeReview comments across local Forge windows (and Supabase when configured). Presence cursors shipped separately in V2-05.

---

## V2-05 — MULTIPLAYER EDITING (PRESENCE) ✅

Peer playhead cursors + avatar bar on top of COLLAB-01 realtime sync.

### Shipped
- `src/shared/presenceSync.ts` — `PresenceState`, TTL pruning, `colorForSession`, validation
- `src/main/presenceSync/hub.ts` — in-memory presence per project + optional Supabase `presence_sync` relay
- `src/main/projectSync/relay.ts` — `presence_sync` broadcast on channel `project:{projectId}`
- IPC `presenceSync.publish` · `presenceSync.list` · `presenceSync.leave` · `presenceSync.onChange`
- `src/renderer/hooks/usePresenceSync.ts` — heartbeat playhead + selection (2s push, 5s poll)
- `src/renderer/store/presence.ts` — peer list merge
- `src/renderer/components/collab/PresenceBar.tsx` — toolbar avatars + timecode tooltip
- `Timeline.tsx` — dashed ghost playhead lines per peer + remote clip selection outlines (peer color + initials)
- `usePresenceSync.ts` — pushes on playhead **and** selection changes (debounced 2s)
- Reuses Preferences → **Realtime project sync** toggle + author name + `projectSyncSessionId`
- `tests/presenceSync.test.ts`

### Reference
```typescript
// Heartbeat when project sync enabled
await forge.presenceSync.publish({ sessionId, displayName, playheadFrame, selectedClipId })
// Relay: same Supabase channel as project_sync / review_sync
channel.send({ type: 'broadcast', event: 'presence_sync', payload: state })
```

---

## COLLAB-01 — REALTIME PROJECT SYNC ✅

Live clip moves + automation edits across Forge windows (and optional Supabase Realtime relay).

### Shipped
- `src/shared/projectSync.ts` — event types, validation, clip LWW, automation op-transform merge
- `src/main/projectSync/hub.ts` — publish, persist, ring buffer, ingest dedup
- `src/main/projectSync/relay.ts` — optional Supabase broadcast when `SUPABASE_URL` + `SUPABASE_ANON_KEY` set
- IPC `projectSync.publish` / `recent` / `status` / `onChange`
- Store: `projectSyncEnabled`, publish from `moveClip` + `setTrackAutomation`, `applyRemoteProjectSyncEvent`
- Preferences → General → **Realtime project sync** (toggle + author name)
- Grade changes remain on B12 **Collaborative Grade** (Effects panel)
- `tests/projectSync.test.ts`

### Reference
```typescript
// Local IPC fan-out + optional Supabase channel `project:{projectId}`
channel.on('broadcast', { event: 'project_sync' }, ({ payload }) => applyRemote(payload))
// Conflict: clip patches last-write-wins; automation op-transform per point id
```

---

# PART 13 — REMAINING: EXTENSIBILITY

## EXT-01 — SANDBOXED PLUGIN LOADER ✅

Third-party plugins run in an isolated `BrowserWindow` with a dedicated preload bridge.

### Shipped
- `src/shared/pluginHost.ts` — manifest schema, permission checks, validation
- `src/main/plugins/pluginHost.ts` — discover plugins in userData/plugins, seed bundled `sample-gain`
- `src/preload/pluginSandbox.ts` — `forgePlugin` API (effects read/write, toolbar register, invoke)
- IPC `plugins.list` / `setEnabled` / `open` / `toolbarItems` / `invokeToolbar` / `onEffectsChanged`
- Plugins panel → third-party section + **Open sandbox** + reveal plugins folder
- Main toolbar renders plugin-registered buttons (purple badges)
- Bundled sample: **Sample Gain Boost** (+0.25 exposure on selected clip)
- `tests/pluginHost.test.ts`

### Security boundary
- Permissions: `clip.effects.read`, `clip.effects.write`, `toolbar.register`
- No keystore, AI providers, or arbitrary filesystem access
- Entry paths validated to stay inside plugin root
```

## EXT-02 — PLUGIN AUTHOR SDK ✅

### Shipped
- `src/shared/pluginSdk.ts` — `ForgePluginAPI` types, manifest template, scaffold generator (`buildPluginScaffold`), API reference markdown
- `PLUGIN_SDK_VERSION` · `sanitisePluginId` · `formatPluginApiReference`
- IPC `plugins.scaffold` — writes starter folder (`manifest.json`, `index.html`, `main.js`, `README.md`) to userData/plugins
- `PluginsPanel.tsx` — **Scaffold starter plugin** + **Copy API reference** (SDK v1.0.0)
- `tests/pluginSdk.test.ts`

### Note
Desktop EXT-02 ships author tooling on top of EXT-01 loader. Plugins remain sandboxed HTML/JS — no npm publishable `@forge/plugin-sdk` package yet (deferred).

---

# PART 14 — 3D / MOTION GRAPHICS (E01–E10)

## E01 — TEXT PROMPT → 3D ASSET ✅

### Shipped
- `src/shared/textTo3d.ts` — validation, prompt builder, TripoSG response parsers
- `src/main/media/textTo3d.ts` — FAL `fal-ai/triposg` → download GLB/OBJ → media bin
- IPC `media.generate3DFromPrompt`
- Generate panel → **3D Assets** section
- Media bin **3D** badge + `assetKind: model3d` metadata
- `tests/textTo3d.test.ts`

### Reference
```typescript
fal.subscribe('fal-ai/triposg', { input: { prompt } })
// mesh: data.model_mesh.url → import to project media/cgi/
```

## E05 — MOTION GRAPHICS TEMPLATES (200+) ✅

### Shipped
- `src/shared/mogrt.ts` — 200 programmatic templates (50 LT · 40 TC · 40 TR · 30 social · 20 end · 20 other)
- `src/main/mogrt/place.ts` — places `TextOverlay` clips on **Motion Graphics** title track (ASS export)
- `MoGRTPanel.tsx` — browse, search, category filter, hover preview, drag-to-timeline
- IPC `mogrt.place` · toolbar **Motion** button
- `tests/mogrt.test.ts`

### Note
Desktop ships MoGRT-lite via existing `TextAnimation` ASS burn-in (not Remotion render jobs). Full Remotion pipeline deferred to E06.

---

## E06 — AI-GENERATED MOGRT ON DEMAND ✅

### Shipped
- `src/shared/aiMogrt.ts` — prompt validation, AI JSON parse → `CustomMogrtTemplate`, field substitution
- `src/main/mogrt/generate.ts` — Casting Director (Anthropic) generates overlay spec
- `src/main/mogrt/custom.ts` — per-project `mogrt_custom_templates` table (schema v38)
- IPC `mogrt.generate` · `mogrt.listCustom` · `mogrt.deleteCustom`
- `MoGRTPanel.tsx` — AI prompt bar, Custom/Bundled/All tabs, delete from library
- Custom templates (`ai-*` ids) place/drag like bundled via existing `mogrt.place`
- `tests/aiMogrt.test.ts`

### Note
Desktop E06 uses MoGRT-lite text overlays (ASS export), not Remotion video render. Web V2 Remotion path remains a separate adapter.

---

## E08 — PARTICLE BEHAVIOURS (GRAVITY + WIND) ✅

### Shipped
- `src/shared/particlePhysics.ts` — shared deterministic orbit + gravity (quadratic y) + wind (linear x)
- `Particles.gravity` (0..100) · `Particles.wind` (-100..100) on `ClipEffects`
- `particles.ts` export + `particlesPreview.ts` live Viz use shared sampler
- EffectsPanel **Gravity** / **Wind** sliders in Particles section
- `tests/particlePhysics.test.ts` · extended preview tests

### Note
Classic path (gravity=0, wind=0) emits byte-identical FFmpeg graphs to pre-E08. Full GPU InstancedMesh deferred to web V2.

---

## E10 — USD SCENE EXPORT ✅

### Shipped
- `src/shared/usdScene.ts` — `buildUsda`, prim sanitization, transform → USDA placement
- `src/main/export/usdScene.ts` — gather timeline `model3d` clips, write sidecar / save dialog
- Export checkbox **Export .usda scene** + job `.usda` reveal link
- IPC `exporter.exportUsdScene` · Generate panel **Export USD** button
- `tests/usdScene.test.ts`

### Note
Desktop writes USDA ASCII with relative GLB/OBJ references + Forge timeline metadata (frames, transforms). Full Three.js→USD pipeline deferred to web V2.

---

## E04 — PERSPECTIVE-MATCHED INSERTION ✅

### Shipped
- `src/shared/perspectiveInsert.ts` — `PerspectiveQuad`, presets (screen/left wall/right wall/floor), `perspectiveFilterFragment`, validation
- `ClipEffects.perspectiveQuad` — normalised 0–1 destination corners on the output frame
- `composite.ts` — `perspectiveWarpStatement` + `pipStatements` E04 path (warp then overlay at 0,0; supersedes scale/position)
- `exporter.ts` — parse + thread quad through upper-track PiP and non-PiP overlay paths
- `EffectsPanel.tsx` — **Corner Pin** presets + per-corner x/y sliders in Transform section
- `tests/perspectiveInsert.test.ts` · extended `tests/composite.test.ts`

### Note
Desktop E04 is export-side FFmpeg `perspective` corner-pin warping for upper-track inserts (keyed/PiP overlays). Per-frame planar tracking + animated quads deferred to web V2 CoTracker path.

---

## E03 — SCENE LIGHTING ESTIMATION ✅

### Shipped
- `src/shared/sceneLighting.ts` — presets, VLM JSON parse, IC-Light prompt builder, validation
- `src/main/ai/sceneLightingAdvisor.ts` — vision analysis (Claude) → `SceneLightingProfile`
- `src/main/media/sceneLighting.ts` — estimate + `fal-ai/iclight-v2` relight preview import
- `ClipEffects.sceneLighting` — persisted profile on timeline clip
- IPC `media.estimateSceneLighting` · `media.relightClipPreview`
- `timeline.applySceneLightingEstimate` · `timeline.relightClipPreview`
- `EffectsPanel.tsx` — **Estimate lighting** + **Preview** (IC-Light) in Colour section
- `tests/sceneLighting.test.ts`

### Note
Desktop E03 stores a lighting profile for CGI/compositing workflows (E04). Relight preview is a single-frame IC-Light still in `lighting-previews/` (not full-video relight). Full sequence relight deferred to web V2.

---

## E02 — DEPTH-AWARE COMPOSITING ✅

### Shipped
- `src/shared/depthEstimate.ts` — playhead→frame math, FAL response parsing, validation
- `src/main/media/depthEstimate.ts` — extract frame → FAL `fal-ai/depth-anything-v2` → import to `depth-maps/`
- IPC `media.estimateDepth` · preload · `timeline.applyEstimatedDepth`
- `EffectsPanel.tsx` — **AI** button on Depth row (estimates at playhead, sets `externalDepth`)
- Reuses existing depth matte export path (constrain windows/particles/keys/grade, live Viz)
- `tests/depthEstimate.test.ts`

### Note
Desktop E02 auto-estimates a single reference depth plate at the playhead (not full depth video seq). Manual import + per-frame seq deferred; feeds the S263–S273 depth-constrained compositing stack.

---

## E07 — 3D EXTRUDED TEXT ✅

### Shipped
- `src/shared/textExtrude3d.ts` — block-font glyph rects, OBJ/MTL builder, overlay→transform mapping, validation
- `src/main/media/textExtrude3d.ts` — write OBJ+MTL to `text3d/`, import as `model3d`, optional **3D Text** track placement
- IPC `media.generateExtrudedText` · preload · `timeline.placeExtrudedText`
- `ThreeDSection.tsx` — Extruded Text panel (depth, height, colour, place at playhead)
- `EffectsPanel.tsx` — **Extrude to 3D** per title overlay (inherits position/colour)
- `tests/textExtrude3d.test.ts`

### Note
Desktop E07 ships local block-font extrusion (no Three.js runtime). Meshes export via E10 USD with timeline transform. True TextGeometry/bevel path deferred to web V2.

---

## E09 — DIFFUSION PHYSICS VFX ✅

### Shipped
- `src/shared/diffusionPhysics.ts` — presets, prompt builder, strength mapping, validation, segment math, edit patch
- `src/main/media/diffusionPhysics.ts` — extract clip segment → FAL `fal-ai/video-to-video` → import to `physics-vfx/`
- IPC `media.diffusionPhysics` · preload `forge.media.diffusionPhysics`
- `timeline.ts` `applyDiffusionPhysics` — replaces clip media in place (mirrors motion brush)
- `EffectsPanel.tsx` — prompt input, preset chips, intensity slider, Apply button
- `tests/diffusionPhysics.test.ts`

### Note
Desktop E09 ports web `DiffusionPhysics.ts` (video-to-video, photoreal prompt wrapper). Max 8s segment, requires 1× speed. Masked regional physics deferred to web V2 motion-brush hybrid.

---

# PART 14B — COMMERCE (V2-08–10, V2-15)

## V2-08 — SHOPPABLE EXPORT ✅

### Shipped
- `src/shared/shoppable.ts` — `ShoppableTag` types, trim adjustment, `buildShoppableSidecar`, embed snippet
- Schema v39 — `shoppable_tags` table (time, product fields, normalized hotspot x/y, provider)
- `src/main/db/shoppable.ts` — CRUD
- IPC `shoppable.list` · `shoppable.add` · `shoppable.update` · `shoppable.remove`
- `src/renderer/store/shoppable.ts` — zustand mirror of markers pattern
- `ShoppablePanel.tsx` — add/edit/delete product tags at playhead; toolbar **Shop** button
- `ExportRequest.exportShoppable` + `ExportJob.shoppablePath` — `.shoppable.json` sidecar after render
- `ExportPanel.tsx` — checkbox + job reveal link
- `tests/shoppable.test.ts`

### Note
Desktop V2-08 exports a commerce-player JSON sidecar alongside the video (hotspots with timestamps + normalized positions). Shopify/WooCommerce API sync shipped in V2-09/V2-10; local program-monitor preview in V2-11; hosted embed player still deferred to web.

## V2-11 — SHOPPABLE PREVIEW (LOCAL) ✅

### Shipped
- `src/shared/shoppable.ts` — `activeShoppableTagsAtTime`, `formatShoppablePrice`
- `src/renderer/components/commerce/ShoppableHotspotOverlay.tsx` — live hotspots on program monitor
- `src/renderer/store/shoppable.ts` — `previewOnMonitor` (auto-on while Shoppable panel open)
- `ProgramMonitor.tsx` — overlay wired; hotspots pulse at playhead time, product card on click
- `tests/shoppable.test.ts` — active-window + price format tests

## V2-09 — SHOPIFY INTEGRATION ✅

### Shipped
- `src/shared/shopify.ts` — product mapping, search filter, `shopifyProductToTagInput`, variant index
- `src/shared/commerceSettings.ts` — shop domain persistence (non-secret)
- `src/main/commerce/shopify.ts` — Admin API catalog fetch (`products.json`)
- `src/main/commerce/settings.ts` — `commerce-settings.json` in userData
- Keystore `shopify` key (+ `SHOPIFY_ADMIN_TOKEN` env fallback)
- IPC `commerce.settings` · `commerce.shopify.configured` · `commerce.shopify.listProducts`
- Preferences → **Commerce** — shop domain; API Keys → **Shopify Admin** token
- `ShoppablePanel.tsx` — Shopify catalog sidebar: search, **+ at playhead**, link to selected tag
- Export sidecar enriches Shopify tags with live variants + `shopDomain` when configured
- `tests/shopify.test.ts` · `tests/commerceSettings.test.ts`

### Note
Desktop V2-09 uses manual Admin API token + shop domain (no OAuth web flow). Storefront cart/checkout (Storefront API) deferred; WooCommerce sync is V2-10.

## V2-10 — WOOCOMMERCE INTEGRATION ✅

### Shipped
- `src/shared/woocommerce.ts` — Woo REST product mapping, `wooProductToTagInput`, URL builder
- `commerceSettings.ts` — `woocommerce.storeUrl` + `isWooCommerceConfigured`
- `src/main/commerce/woocommerce.ts` — Basic Auth catalog fetch (`/wp-json/wc/v3/products`)
- Keystore `woocommerceKey` · `woocommerceSecret` (+ env `WOOCOMMERCE_CONSUMER_KEY` / `WOOCOMMERCE_CONSUMER_SECRET`)
- IPC `commerce.woocommerce.configured` · `commerce.woocommerce.listProducts`
- Preferences → Commerce — WooCommerce store URL; API Keys — consumer key + secret
- `ShoppablePanel.tsx` — Shopify/Woo catalog tabs when both connected; same + at playhead / link flows
- Export sidecar adds `wooStoreUrl` + live variant enrichment for Woo tags
- `tests/woocommerce.test.ts` · extended `commerceSettings.test.ts`

### Note
Desktop V2-10 mirrors web `WooCommerceClient.ts` (manual REST credentials, no OAuth). Hosted checkout redirect deferred.

## V2-15 — BRANCHING VIDEO ✅

### Shipped
- `src/shared/branching.ts` — `BranchingGraph`, validation (cycles, reachability), `buildBranchingSidecar`, embed snippet
- Schema v40 — `branching_graphs` table (title, start node, theme, nodes JSON per project)
- `src/main/db/branching.ts` — get/save graph
- IPC `branching.get` · `branching.save`
- `BranchingPanel.tsx` — add nodes from media bin, choices, start node, validate, copy embed snippet
- Toolbar **Branch** button
- `ExportRequest.exportBranching` + `ExportJob.branchingPath` — `.branching.json` sidecar on video export
- `ExportPanel.tsx` — checkbox + job reveal link
- `tests/branching.test.ts`

### Note
Desktop V2-15 authors interactive graphs locally; sidecar references node media filenames (host alongside export). Local in-app preview shipped in V2-16; hosted web player + DB embed still deferred.

## V2-17 — HOSTED EMBED PUBLISH (DESKTOP → CLOUD) ✅

### Shipped
- `src/shared/embedPublish.ts` — map shoppable hotspots → web `ProductTag`, branching upload payload
- `src/shared/commerceSettings.ts` — `forgeCloud.apiBaseUrl` + `forgeCloud.userId`
- `src/main/commerce/embedPublish.ts` — multipart upload to Forge Cloud APIs
- Keystore `forgeCloud` (+ `FORGE_CLOUD_TOKEN` env optional)
- IPC `commerce.embedPublish.configured` · `shoppable` · `branching`
- Preferences → Commerce → **Forge Cloud embeds** (API URL + web user id)
- `ExportPanel.tsx` — **host shop** / **host branch** on completed jobs (copies iframe)
- Web `POST /api/commerce/shoppable/create-with-upload` — video → R2 + `shoppableEmbed` row
- Web `POST /api/branch/create-with-upload` — node clips → R2 + `branchingEmbed` row
- `tests/embedPublish.test.ts`

### Note
Branching cloud publish deducts web credits (5) like the web export path. Shoppable upload requires a configured Forge Cloud user id matching your web account.

## V2-16 — BRANCHING PREVIEW (LOCAL) ✅

### Shipped
- `src/shared/branching.ts` — `branchThemeColors`, `isTerminalBranchNode`, `shouldPauseForBranchChoices`
- `src/renderer/components/branching/BranchingPreviewPlayer.tsx` — choice overlays, auto-advance, restart
- `BranchingPanel.tsx` — **Preview** button (validates graph first; uses `forge-clip://` URLs)
- `tests/branching.test.ts` — theme + terminal + trigger helpers

---

# PART 15 — V2 MIGRATION MATRIX (transfer from V3 to web app)

After completing each V3 sprint group, transfer these to V2 (Next.js):

| V3 Feature | V3 File | V2 Target | Adapter needed |
|---|---|---|---|
| Time-varying aux wet | `sendMix.ts` | `/api/audio/render` | SQLite → Postgres |
| Sidechain ducking | `audioFilter.ts` | FAL ffmpeg endpoint | wrap in FAL call |
| Morph cut | `morphCut.ts` | `/api/clips/morph-cut` | copy FAL logic |
| Auto-reframe | `autoReframe.ts` | `/api/clips/reframe` | copy FAL logic |
| Clip extend | `clipExtend.ts` | `/api/clips/extend` | copy FAL logic |
| AI grade suggest | `gradeAdvisor.ts` | `/api/grade/suggest` | copy Claude call |
| Transcript edit | `transcriptEdit.ts` | `/api/clips/transcribe` | copy FAL Whisper |
| C2PA signing | `exporter.ts` | `/api/export/sign` | server-side c2pa |
| ACES filter | `ocio.ts` | FAL colour endpoint | if available |
| Character pipeline | `character/*.ts` | `/api/characters/*` | SQLite → Prisma |

---

# PART 16 — PRIORITY ORDER (complete feed sequence)

```
IMMEDIATE (unblocks other work):
  S334  Time-varying aux wet                    ✅
  S335  Aux FX automation                       ✅
  S338  Automation lane toolbar                 ✅
  S336  Pre-fader send polish                   ✅
  S337  Send automation copy across tracks      ✅

DAW COMPLETION:
  S339  Solo/mute badges
  S340  Ducking / sidechain
  S341  Stem export UX
  S342  Real-time mixer preview

NLE GAPS (user-visible):
  A08   Morph cut
  A12   AI auto-reframe ✅
  A13   Clip extend ✅
  A09   Transcript editing ✅

COLOUR:
  B06   OCIO / ACES ✅
  B08   Timeline harmonisation ✅
  V206  AI grade suggestions ✅
  B12   Collaborative grade ✅

VFX:
  VFX-01  Blend mode export parity audit ✅
  VFX-02  Motion brush ✅
  VFX-03  SFX library browser ✅

EXPORT:
  EXP-01  DCP ✅
  EXP-02  IMF ✅
  EXP-03  C2PA ✅
  EXP-04  EDL / captions / chapters ✅

PACKAGING:
  PKG-01  Auto-update ✅
  PKG-02  Crash reporting ✅

REMAINING PHASES:
  Avatar N01–N03 ✅
  ForgeFlow FF-01 ✅ FF-02 ✅
  3D/MoGRT E01 ✅ E02 ✅ E03 ✅ E04 ✅ E05 ✅ E06 ✅ E07 ✅ E08 ✅ E09 ✅ E10 ✅
  Realtime collab COLLAB-01 ✅ V2-14 ✅ V2-05 ✅
  Commerce V2-08 ✅ V2-09 ✅ V2-10 ✅ V2-11 ✅ V2-15 ✅ V2-16 ✅ V2-17 ✅
  Extensibility EXT-01 ✅ EXT-02 ✅
```
