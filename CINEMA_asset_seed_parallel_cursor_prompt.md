# CINEMATIC FORGE — ASSET-SEED PARALLEL ORCHESTRATION
## Cursor Agent Prompt (Orchestration V2 enhancement)
### Storyboard keyframes · Parallel chains · Frame-Zero conditioning · Meta-Planner

---

## WHAT THIS ADDS TO ORCHESTRATION V2

The existing V2 pipeline renders segments **sequentially** (each waits for the previous tail
frame). This enhancement adds a pre-production storyboard pass so independent scenes render
**in parallel**, collapsing total render time from *sum of segments* to *slowest segment*.

```
BEFORE (sequential):  S1 → S2 → S3 → S4         total = Σ all segments
AFTER  (hybrid):      ┌ S1 → S2 ┐  (continuity chain, sequential)
                      ├ S3      ┤  (independent cut, parallel)
                      └ S4      ┘  (independent cut, parallel)
                      total = slowest chain
```

Builds on the existing `src/lib/orchestration/` files. Does NOT replace Patient Zero —
extends it with per-segment storyboard keyframes.

---

## STEP 1 — ADD CONTINUITY GROUPING TO SHOTS

Shots in the same continuous action must stay sequential; scene cuts can parallelise.

**Edit** `src/lib/orchestration/types.ts` — add fields to `StructuredShot`:

```typescript
export interface StructuredShot {
  // ... all existing fields ...

  // NEW — continuity grouping for parallel scheduling
  continuityGroup: number    // shots with the same group are one continuous chain
  isChainStart:    boolean   // first shot of its continuity chain
  storyboardUrl?:  string    // pre-generated Frame Zero keyframe (filled in Phase 1.5)
}

// NEW — a chain is a sequential run of continuous shots; chains run in parallel
export interface ContinuityChain {
  groupId: number
  shots:   StructuredShot[]   // ordered within the chain
}
```

---

## STEP 2 — SCRIPT BREAKDOWN ASSIGNS CONTINUITY GROUPS

**Edit** `src/lib/orchestration/scriptBreakdown.ts` — the Claude prompt now also groups shots:

```typescript
// Add to the system prompt:
`Group shots into continuity chains. Shots that depict ONE continuous unbroken action
(same location, same moment, camera following through) share a continuityGroup number.
A hard cut to a different location/time/subject starts a NEW continuityGroup.
Most narrative films have several short chains rather than one long one.`

// Add to the JSON schema returned per shot:
`  "continuityGroup": number (shots in the same unbroken action share this),
  "isChainStart": boolean (true if this is the first shot of its continuityGroup),`
```

**Add a helper** to group shots into chains:

```typescript
import type { StructuredShot, ContinuityChain } from './types'

export function groupIntoChains(shots: StructuredShot[]): ContinuityChain[] {
  const groups = new Map<number, StructuredShot[]>()
  for (const shot of shots) {
    const g = shot.continuityGroup ?? shot.shotIndex   // fallback: each shot its own chain
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(shot)
  }
  return [...groups.entries()]
    .map(([groupId, s]) => ({ groupId, shots: s.sort((a, b) => a.shotIndex - b.shotIndex) }))
    .sort((a, b) => a.shots[0].shotIndex - b.shots[0].shotIndex)
}
```

---

## STEP 3 — STORYBOARD KEYFRAME PASS (Phase 1.5)

Pre-generate a high-res opening still for EACH shot, conditioned on Patient Zero refs.
These become the Frame-Zero for image-to-video. Generated in parallel — fast.

**Create** `src/lib/orchestration/storyboard.ts`:

```typescript
// src/lib/orchestration/storyboard.ts
// Phase 1.5: generate a Frame-Zero keyframe still for each shot
// Conditioned on Patient Zero character + location references

import { uploadToR2 } from '@/lib/storage/r2'
import type { StructuredShot, PatientZeroAssets } from './types'

async function generateKeyframe(
  shot:   StructuredShot,
  assets: PatientZeroAssets
): Promise<string> {
  // Pull the relevant character + location references for this shot
  const charRef = shot.charactersPresent
    .map(name => assets.characters.find(c => c.name === name)?.imageUrl)
    .filter(Boolean)[0]
  const locRef = shot.locationsPresent
    .map(name => assets.locations.find(l => l.name === name)?.imageUrl)
    .filter(Boolean)[0]

  // Build the keyframe prompt — the EXACT opening composition of this shot
  const prompt = `Cinematic storyboard keyframe, opening composition of this shot.
${shot.visualPrompt}
Camera: ${shot.cameraMove}. Lighting: ${shot.lighting}. Mood: ${shot.mood}.
Film still, photorealistic, composed exactly as the first frame of the shot.`

  const input: Record<string, unknown> = { prompt }
  // Decoupled reference conditioning — character identity locked via its own input lane
  if (charRef) input.image_url           = charRef    // primary reference
  if (locRef)  input.reference_image_url = locRef     // location plate

  const res = await fetch('https://fal.run/fal-ai/gemini-pro-image', {
    method:  'POST',
    headers: { Authorization: `Key ${process.env.FAL_API_KEY}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ input }),
  }).then(r => r.json())

  const rawUrl = res.images?.[0]?.url ?? res.image?.url
  const buf    = await fetch(rawUrl).then(r => r.arrayBuffer())
  return uploadToR2(Buffer.from(buf), `storyboard/${shot.shotIndex}_${Date.now()}.jpg`)
}

// Generate keyframes for ALL shots in parallel
export async function generateStoryboard(
  shots:  StructuredShot[],
  assets: PatientZeroAssets,
  onProgress?: (done: number, total: number) => void
): Promise<StructuredShot[]> {
  let done = 0
  const withKeyframes = await Promise.all(
    shots.map(async shot => {
      try {
        const storyboardUrl = await generateKeyframe(shot, assets)
        done++
        onProgress?.(done, shots.length)
        return { ...shot, storyboardUrl }
      } catch (err: any) {
        console.warn(`[storyboard] keyframe failed for shot ${shot.shotIndex}:`, err.message)
        done++
        onProgress?.(done, shots.length)
        return shot   // proceed without keyframe — falls back to T2V
      }
    })
  )
  return withKeyframes
}
```

---

## STEP 4 — PARALLEL CHAIN GENERATION

Replace sequential generation with parallel chains. Within a chain: sequential tail-to-head.
Across chains: parallel. Each chain's first shot starts from its storyboard keyframe.

**Create** `src/lib/orchestration/parallelGeneration.ts`:

```typescript
// src/lib/orchestration/parallelGeneration.ts
// Hybrid: parallel across continuity chains, sequential within each chain

import { callVideoModel, extractTailFrame } from './bridgedGeneration'
import { analyseFrameMotion, injectMotionContext } from './opticalFlow'
import type { ContinuityChain, DAGNode, GeneratedSegment, PatientZeroAssets } from './types'

// Limit concurrent FAL calls so we don't hit rate limits — tune to your FAL plan
const MAX_PARALLEL_CHAINS = 4

async function generateChain(
  chain:       ContinuityChain,
  dagByIndex:  Map<number, DAGNode>,
  assets:      PatientZeroAssets,
  onProgress:  (shotIndex: number, status: string, sub?: { pct: number; message: string }) => void
): Promise<GeneratedSegment[]> {

  const results: GeneratedSegment[] = []
  let previousTail: string | undefined

  for (const shot of chain.shots) {
    const node = dagByIndex.get(shot.shotIndex)!
    onProgress(shot.shotIndex, 'generating')

    let prompt = shot.visualPrompt

    // First shot of chain → start from its storyboard keyframe (Frame Zero)
    // Subsequent shots in chain → start from previous shot's tail frame (continuity)
    let startFrame: string | undefined
    if (shot.isChainStart || !previousTail) {
      startFrame = shot.storyboardUrl          // Frame-Zero conditioning
    } else {
      startFrame = previousTail                 // tail-to-head bridge within chain
      // optical flow continuity within the chain
      try {
        const motion = await analyseFrameMotion(previousTail)
        prompt = injectMotionContext(prompt, motion, { contentType: shot.contentType, lighting: shot.lighting })
      } catch {}
    }

    const characterRef = shot.charactersPresent.length > 0
      ? assets.characters.find(c => c.name === shot.charactersPresent[0])?.imageUrl
      : undefined

    const { videoUrl } = await callVideoModel({
      model:          node.assignedModel,
      prompt,
      duration:       shot.duration,
      imageUrl:       startFrame,
      patientZeroUrl: characterRef,
      onSubProgress:  (s) => onProgress(shot.shotIndex, 'generating', { pct: s.pct, message: s.message }),
    })

    // Extract tail frame for the next shot IN THIS CHAIN only
    try { previousTail = await extractTailFrame(videoUrl!) } catch { previousTail = undefined }

    results.push({
      shotIndex: shot.shotIndex, videoUrl: videoUrl!, duration: shot.duration,
      model: node.assignedModel, tailFrameUrl: previousTail ?? '', qualityScore: 1.0, retryCount: 0,
    })
    onProgress(shot.shotIndex, 'complete')
  }

  return results
}

// Run all chains in parallel (bounded by MAX_PARALLEL_CHAINS)
export async function generateParallel(
  chains:     ContinuityChain[],
  dag:        DAGNode[],
  assets:     PatientZeroAssets,
  onProgress: (data: { shotIndex: number; totalShots: number; status: string; subProgress?: number; subMessage?: string }) => void
): Promise<GeneratedSegment[]> {

  const dagByIndex = new Map(dag.map(n => [n.shot.shotIndex, n]))
  const totalShots = dag.length
  const all: GeneratedSegment[] = []

  // Process chains in parallel batches
  for (let i = 0; i < chains.length; i += MAX_PARALLEL_CHAINS) {
    const batch = chains.slice(i, i + MAX_PARALLEL_CHAINS)
    const batchResults = await Promise.all(
      batch.map(chain =>
        generateChain(chain, dagByIndex, assets, (shotIndex, status, sub) =>
          onProgress({
            shotIndex, totalShots, status,
            subProgress: sub?.pct,
            subMessage:  sub ? `Shot ${shotIndex + 1}/${totalShots}: ${sub.message}` : undefined,
          })
        )
      )
    )
    batchResults.forEach(r => all.push(...r))
  }

  return all.sort((a, b) => a.shotIndex - b.shotIndex)
}
```

> **Export `callVideoModel` and `extractTailFrame`** from `bridgedGeneration.ts` (add `export`)
> so `parallelGeneration.ts` can reuse them.

---

## STEP 5 — META-PLANNER (auto-rewarp failed segments)

Enhance the quality gate: instead of just scoring, actively fix low-quality segments by
re-warping them back to the storyboard keyframe via Nano Banana.

**Edit** `src/lib/orchestration/qualityGate.ts` — add a repair pass:

```typescript
// Add to qualityGate.ts

import { uploadToR2 } from '@/lib/storage/r2'

/**
 * Meta-Planner repair: if a segment scored poorly AND we have its storyboard keyframe,
 * attempt a single corrective regeneration anchored harder to the keyframe.
 */
export async function repairSegment(
  videoUrl:      string,
  storyboardUrl: string | undefined,
  shotPrompt:    string,
  model:         string,
  duration:      number
): Promise<string | null> {
  if (!storyboardUrl) return null   // nothing to anchor to

  try {
    // Regenerate I2V from the storyboard keyframe with a stronger structural lock
    const { callVideoModel } = await import('./bridgedGeneration')
    const { videoUrl: repaired } = await callVideoModel({
      model,
      prompt:   `${shotPrompt}. Match the reference composition exactly. Stable, no distortion.`,
      duration,
      imageUrl: storyboardUrl,   // hard re-anchor to the blueprint
    })
    return repaired ?? null
  } catch (err: any) {
    console.warn('[meta-planner] repair failed:', err.message)
    return null
  }
}
```

---

## STEP 6 — WIRE INTO THE MAIN PIPELINE

**Edit** `src/lib/orchestration/index.ts` — insert Phase 1.5 (storyboard) and swap to parallel:

```typescript
import { generateStoryboard }   from './storyboard'
import { groupIntoChains }      from './scriptBreakdown'
import { generateParallel }     from './parallelGeneration'
import { scoreSegment, repairSegment } from './qualityGate'

// ... inside orchestrateGeneration, after Phase 2 (breakdown) and Phase 3 (DAG):

  // ── Phase 1.5: Storyboard keyframes (parallel pre-vis) ────────────────────
  progress('storyboard', 'Generating storyboard keyframes...', 25)
  const shotsWithKeyframes = await generateStoryboard(
    shots, patientZero,
    (done, total) => progress('storyboard', `Keyframe ${done}/${total}`, 25 + Math.round((done / total) * 10))
  )

  // Group into continuity chains
  const chains = groupIntoChains(shotsWithKeyframes)
  progress('routing', `Planning ${chains.length} parallel chains...`, 36)

  // Rebuild DAG with keyframed shots
  const dag = buildDAG(shotsWithKeyframes, selectedModels)

  // ── Phase 4: PARALLEL generation across chains ────────────────────────────
  progress('generating', `Rendering ${chains.length} chains in parallel...`, 40)
  const segments = await generateParallel(chains, dag, patientZero, (data) => {
    const pct = 40 + Math.round((data.shotIndex / shots.length) * 45)
    progress('generating', data.subMessage ?? `Shot ${data.shotIndex + 1}`, pct)
  })

  // ── Phase 5: Quality gate + Meta-Planner repair ───────────────────────────
  progress('quality_gate', 'Scoring and repairing segments...', 86)
  for (const seg of segments) {
    const shot  = shotsWithKeyframes[seg.shotIndex]
    const score = await scoreSegment(seg.videoUrl, shot.hasFaces)
    seg.qualityScore = score.overall

    // Meta-Planner: repair sub-threshold segments by re-anchoring to storyboard
    if (!score.passed && shot.storyboardUrl) {
      progress('quality_gate', `Repairing shot ${seg.shotIndex + 1}...`, 88)
      const repaired = await repairSegment(
        seg.videoUrl, shot.storyboardUrl, shot.visualPrompt,
        segments[seg.shotIndex].model, shot.duration
      )
      if (repaired) seg.videoUrl = repaired
    }
  }

  // ── Phase 6: Stitching (unchanged) ────────────────────────────────────────
  // ... existing stitchSegments call ...
```

---

## STEP 7 — UPDATE COST ESTIMATE FOR STORYBOARD PASS

Storyboard keyframes cost ~2cr each (Nano Banana Pro). Add to the estimate.

**Edit** `src/lib/orchestration/fastEstimate.ts`:

```typescript
export function fastEstimateCost(selectedModels: string[], duration: number): number {
  // ... existing video cost ...

  const estimatedShots    = Math.max(1, Math.ceil(duration / 6))
  const storyboardCost    = estimatedShots * 2    // ~2cr per keyframe
  const patientZeroCost   = 10

  return videoCost + storyboardCost + patientZeroCost
}
```

---

## SPEED IMPACT

```
Example: 30s film, 5 shots, one slow Wan segment

SEQUENTIAL (current V2):
  S1 (Kling 90s) → S2 (Luma 60s) → S3 (Wan 900s) → S4 (Seedance 90s) → S5 (PixVerse 120s)
  Total: 1260s (21 min)

HYBRID PARALLEL (this enhancement):
  Storyboard pass: 5 keyframes in parallel = ~20s
  Chain A: S1 → S2 (continuous, 150s sequential)
  Chain B: S3 (Wan, 900s)        ┐
  Chain C: S4 (Seedance, 90s)    ├ all parallel
  Chain D: S5 (PixVerse, 120s)   ┘
  Total: 20s + max(150, 900, 90, 120) = ~920s (15 min)

  → 28% faster, and the slow Wan no longer blocks the fast shots
```

The more independent scene cuts a film has, the bigger the speed win.

---

## TRADE-OFFS & GUARDS

| Concern | Mitigation |
|---|---|
| Parallel FAL calls hit rate limits | `MAX_PARALLEL_CHAINS = 4` — tune to your FAL plan |
| Continuity across cuts | Storyboard keyframes share Patient Zero refs → visually consistent |
| Continuity within a scene | Chains stay sequential with tail-to-head bridging |
| Cost of storyboard pass | ~2cr/shot — small vs the render cost, big consistency gain |
| A keyframe fails | Falls back to text-to-video for that shot — non-fatal |

---

## SUMMARY — FILES

| File | Action |
|---|---|
| `src/lib/orchestration/types.ts` | EDIT — continuityGroup, isChainStart, storyboardUrl, ContinuityChain |
| `src/lib/orchestration/scriptBreakdown.ts` | EDIT — group shots into chains + groupIntoChains() |
| `src/lib/orchestration/storyboard.ts` | CREATE — Phase 1.5 parallel keyframe generation |
| `src/lib/orchestration/parallelGeneration.ts` | CREATE — hybrid parallel/sequential chains |
| `src/lib/orchestration/bridgedGeneration.ts` | EDIT — export callVideoModel + extractTailFrame |
| `src/lib/orchestration/qualityGate.ts` | EDIT — repairSegment() meta-planner |
| `src/lib/orchestration/index.ts` | EDIT — insert Phase 1.5, swap to generateParallel |
| `src/lib/orchestration/fastEstimate.ts` | EDIT — add storyboard cost |

---

## VERIFICATION

```bash
npx tsc --noEmit

# Multi-scene prompt — should produce multiple parallel chains
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" -H "x-user-id: test" \
  -d '{"prompt":"A detective leaves his office (scene 1), drives across town (scene 2), arrives at a crime scene (scene 3)","duration":30,"mode":"director","selectedModels":["kling-3.0","luma-ray3","seedance-2.0"]}'

# Poll — should show storyboard pass then parallel rendering:
#   "Generating storyboard keyframes... Keyframe 5/5"
#   "Rendering 3 chains in parallel..."
#   "Shot 1/5: AI engine generating 50%"   (multiple shots advancing together)
#   "Repairing shot 3..."                   (if quality gate flags one)
#   "Assembling final film..."
```

---

## WHAT WE DID NOT IMPLEMENT (and why)

- **ControlNet rigs (depth/Canny/OpenPose)**: only a subset of FAL video models accept control
  inputs, and the IDs vary. Revisit per-model once you confirm which of your pool support
  `controlnet` or `pose` conditioning. The storyboard keyframe already gives most of the
  structural lock without it.
- **Fully decoupled IP-Adapter cross-attention**: this is internal to each model. We expose
  what we can via `image_url` (Frame Zero) + `reference_image_url` (character lock); true
  decoupled attention is the model's job, not the orchestrator's.
