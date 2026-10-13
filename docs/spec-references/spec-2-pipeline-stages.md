# SPEC PHASE 2 — PIPELINE STAGE CONTRACTS (the 7 stages, fully specified)
## Imports all types from spec-1-data-contracts.md. Each stage = a pure-ish
## function with a typed contract, an owner, error paths, and a Cursor prompt.
## Host-agnostic: stages call the HostAdapter, never a concrete host.

## PIPELINE OVERVIEW (data flow)
## userPrompt → [S1 Breakdown] → Shot[] → [S0 PreProd] → refs/keyframes
##   → [S2 Route] → selectedModelId → [S3 Dispatch] → GenerationResult
##   → [mirror] → Shot.videoUrl → [S4 AdvanceChain] → next shot anchor
##   → [S5 QualityGate] → pass/repair → [S6 Timeline] → Clip[] → export
##   → [S7 Audio] runs parallel, composited at assembly

═══════════════════════════════════════════════════════════════════════
# STAGE 1 — SCRIPT BREAKDOWN  [v1 MINIMAL, cognitive-ready interface]
═══════════════════════════════════════════════════════════════════════
CONTRACT:
```typescript
breakdown(input: { prompt: string, settings: ProjectSettings }, ctx: Ctx)
  : Promise<{ brief: CreativeBrief, shots: ShotDraft[] }>
interface ShotDraft {
  prompt: string; order: number; durationSec: number
  contentType: 'dialogue'|'action'|'nature'|'product'|'aerial'|'abstract'|'vfx'
  suggestedModelId: string      // Claude's pool-aware suggestion (advisory in manual mode)
  continuityGroupId: string | null
  emotionalWeight: number       // 0-1
  characterNames: string[]      // parsed character mentions → linked in S0
}
```
OWNER: main process (desktop) / API route (web). Calls claudeCall() chokepoint.
LOGIC (v1 minimal): ONE Claude call. System prompt instructs: decompose the
brief into a shot list with the ShotDraft fields. Output strict JSON. Parse,
validate against schema, persist Shots (status='pending').
COGNITIVE-READY: the `brief` output is already CreativeBrief shape. In Phase 3,
the 5-stage cognitive director produces the enriched brief BEFORE this call and
feeds it in — this contract does not change.
ERROR PATHS:
- Claude returns non-JSON → retry once with stricter instruction → fail scene.
- Zero shots parsed → fail with "breakdown produced no shots", surface to UI.
- claudeCall throws (paused/no-source) → scene stays un-broken-down; UI shows retry.
CURSOR PROMPT:
```
Implement Stage 1 breakdown() per spec-2 §Stage1. Single claudeCall() with a
system prompt that emits strict JSON ShotDraft[]. Validate with zod against the
ShotDraft schema; on parse failure retry once then fail. Persist shots via
adapter.saveShot. Do NOT call any video model here. The claudeCall must pass
ctx.source='breakdown'.
```

═══════════════════════════════════════════════════════════════════════
# STAGE 0 — PRE-PRODUCTION (Patient Zero)  [v1 MINIMAL]
═══════════════════════════════════════════════════════════════════════
CONTRACT:
```typescript
preProduction(input: { projectId: string, shots: Shot[], brief: CreativeBrief }, ctx)
  : Promise<{ characters: Character[], keyframes: Map<shotId, url> }>
```
OWNER: worker/JobRunner. Uses the DRAFT model (ltx-fast) for cheap image gen.
LOGIC (v1 minimal):
1. For each unique characterName across shots → generate ONE reference image
   (text→image via draft model), create Character{referenceImageUrl, seed}.
   Store the seed for cross-shot consistency (S3 passes it).
2. For each shot → generate a storyboard keyframe (opening composition still) via
   draft model; set Shot.anchorFrameUrl=keyframe, anchorSource='keyframe'.
DEFERRED: style-consistent multi-ref generation, location plate generation.
DEPENDENCY: this is what makes character→director real (Phase 4 builds on it).
ERROR PATHS:
- keyframe gen fails → shot proceeds with anchorSource='none' (T2V), logged.
- character ref fails → character created without ref; S3 falls back to prompt-only.
CURSOR PROMPT:
```
Implement Stage 0 preProduction() per spec-2 §Stage0. Character refs + per-shot
keyframes via the draft model through providerSubmit() (ctx.source='preprod').
Persist Character rows with referenceImageUrl+seed. Set Shot.anchorFrameUrl from
keyframe. All generation through the chokepoint; respect pause. Mirror images to
host origin via adapter.persistMedia.
```

═══════════════════════════════════════════════════════════════════════
# STAGE 2 — ROUTING / MODEL SELECTION  [v1 MANUAL + reliable]
═══════════════════════════════════════════════════════════════════════
CONTRACT:
```typescript
resolveSelection(shot: Shot): { modelId: string, provider: Provider, endpoint: string }
```
OWNER: dispatch (READS Shot.selectedModelId; never writes it).
LOGIC (v1 manual):
- If shot.modelOverride → use shot.selectedModelId verbatim.
- resolveModel(selectedModelId) → ModelDef (THROWS on unknown — no default).
- provider/endpoint derived from ModelDef.
- assertModelIntegrity: the endpoint about to be submitted == ModelDef.endpoint
  for selectedModelId. Mismatch → throw ModelIntegrityError. NO substitution, ever.
COGNITIVE-READY: when the MoE router (Phase 3) is on and modelOverride=false, it
writes selectedModelId BEFORE this runs. resolveSelection is unchanged — it always
just reads the field. Manual override always wins.
ERROR PATHS:
- unknown modelId → ModelResolveError → shot fails "unknown model" (not a default).
- integrity mismatch → ModelIntegrityError → shot fails, logged with before/after.
CURSOR PROMPT:
```
Implement Stage 2 resolveSelection() + resolveModel() + assertModelIntegrity()
per spec-2 §Stage2. resolveModel THROWS on unknown id (never returns a default).
assertModelIntegrity throws if submitted endpoint != registry endpoint for the
selected id. The pipeline has READ-ONLY access to selectedModelId (enforce via
the access boundary from Phase 1). No fallback-to-different-model anywhere.
```

═══════════════════════════════════════════════════════════════════════
# STAGE 3 — GENERATION DISPATCH  [v1 FULL — the moat + all chokepoints]
═══════════════════════════════════════════════════════════════════════
CONTRACT:
```typescript
generateVideo(shot: Shot, ctx: Ctx): Promise<GenerationResult>
```
OWNER: worker/JobRunner → providerSubmit() chokepoint.
DISPATCH SWITCH (by ModelDef.provider):
```typescript
switch (model.provider) {
  case 'fal':    return falVideo(model, shot, ctx)
  case 'runway': return runwayVideo(model, shot, ctx)
  case 'grok':   return grokVideo(model, shot, ctx)
  default: throw new Error(`no video client for ${model.provider}`)
}
```

── 3a. THE CHOKEPOINT (every provider's submit goes through this) ──
```typescript
async function providerSubmit(provider, endpoint, payload, ctx: Ctx) {
  if (!ctx?.source || ctx.source==='UNKNOWN') throw new Error('no caller source')
  if (await adapter.isGenerationPaused()) throw new GenerationPausedError(endpoint)
  logger.info('provider_submit', { provider, endpoint, source: ctx.source,
    promptHead: String(payload?.prompt).slice(0,50) })
  // idempotency: caller persists requestId BEFORE polling (see 3d)
  return doSubmit(provider, endpoint, payload)
}
```

── 3b. FAL PATH ──  (buildPayload schema-driven + mirror)
```typescript
async function falVideo(model, shot, ctx): Promise<GenerationResult> {
  const payload = await buildPayload(model.endpoint, shot)   // §3c
  const sub = await providerSubmit('fal', model.endpoint, payload, ctx)
  await adapter.saveShot({ id: shot.id, falRequestId: sub.request_id })  // 3d idempotency
  const result = await pollFalResult(sub.response_url, model.endpoint, ctx)
  return { videoUrl: extractFalUrl(result), lastFrame: extractLastFrame(result),
           durationSec: shot.durationSec, provider:'fal', requestId: sub.request_id }
}
```
SCENE→PROVIDER WIRING (fal): payload carries prompt, aspect_ratio (from
ProjectSettings), resolution, duration, and — if shot.anchorFrameUrl — image_url
(I2V). If shot has characterIds, the character.referenceImageUrl + seed flow in
as reference/seed where the model supports it. Location.plateUrl → reference too.

── 3b-runway. RUNWAY PATH (NOT fal — @runwayml/sdk, own key) ──
```typescript
async function runwayVideo(model, shot, ctx): Promise<GenerationResult> {
  const key = await adapter.getSecret('RUNWAYML_API_SECRET')
  const client = new RunwayML({ apiKey: key })
  // pause+source gate still applies — wrap the create in providerSubmit semantics:
  if (await adapter.isGenerationPaused()) throw new GenerationPausedError('runway')
  const task = await client.textToVideo.create({
    model: model.endpoint,                         // 'gen4.5' | 'gen4_turbo'
    promptText: shot.prompt,
    ...(shot.anchorFrameUrl ? { promptImage: shot.anchorFrameUrl } : {}),
    ratio: mapAspect(project.aspectRatio),
    duration: clampRunwayDuration(shot.durationSec),
  }).waitForTaskOutput()
  return { videoUrl: task.output[0], provider:'runway', requestId: task.id,
           durationSec: shot.durationSec }
}
```
SCENE→RUNWAY WIRING (explicit answer to "is Runway wired to the scene"):
- shot.prompt → promptText
- shot.anchorFrameUrl → promptImage (this is how the anchor chain drives Runway I2V)
- project.aspectRatio → ratio (mapped to Runway's ratio strings)
- shot.durationSec → duration (clamped to Runway's allowed set)
- Runway's Motion Brush / camera controls (Phase 5 UI) → passed as Runway params
  when the CONTROL role is used. Result mirrored to origin like all providers.

── 3b-grok. GROK PATH (FAL-hosted, native audio) ──
The sample below is retired. Live endpoints are `xai/grok-imagine-video/text-to-video`
and `xai/grok-imagine-video/image-to-video`, submitted through the FAL chokepoint.
Sora 2 is not the physics model.
```typescript
async function grokVideo(model, shot, ctx): Promise<GenerationResult> {
  const key = await adapter.getSecret('XAI_API_KEY')
  if (await adapter.isGenerationPaused()) throw new GenerationPausedError('grok')
  const res = await fetch('https://api.x.ai/v1/video/generations', {   // VERIFY path vs xAI docs
    method:'POST', headers:{ Authorization:`Bearer ${key}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ model: model.endpoint, prompt: shot.prompt,
      duration: shot.durationSec, aspect_ratio: project.aspectRatio,
      ...(shot.anchorFrameUrl ? { image_url: shot.anchorFrameUrl } : {}) }),
  })
  if (!res.ok) throw new Error(`grok ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return { videoUrl: extractGrokUrl(data), provider:'grok', requestId: data.id,
           durationSec: shot.durationSec }
}
// NOTE: Grok = AUDIO-NATIVE. This is the ONE model NOT forced silent (silentOnly=false).
```

── 3c. SCHEMA-DRIVEN buildPayload (fal) ──
```typescript
async function buildPayload(endpoint, shot): Promise<object> {
  const C = await getConstraints(endpoint)          // ModelConstraints (schema-sync)
  const p: any = { prompt: shot.prompt, aspect_ratio: project.aspectRatio,
    resolution: project.resolution, duration: shot.durationSec,
    ...(shot.anchorFrameUrl ? { image_url: shot.anchorFrameUrl } : {}) }
  for (const [f,allowed] of Object.entries(C.enums)) if (f in p) p[f]=snapEnum(f,p[f],allowed)
  for (const [f,t] of Object.entries(C.types)) if (f in p) p[f]=coerce(p[f],t)
  for (const k of C.forbidden) delete p[k]           // e.g. duration on veo
  if (C.audioField) p[C.audioField]=false            // audio-off unless silentOnly=false
  for (const k of C.required) if (p[k]==null) throw new PayloadError(`${endpoint} needs ${k}`)
  return p
}
```

── 3d. IDEMPOTENCY (runaway-loop fix) ──
- Persist falRequestId BEFORE polling.
- On job retry: if shot.status==='completed' && videoUrl → skip (already paid).
  if falRequestId exists → poll THAT result, don't resubmit.
- attempts cap = 2; 422/validation = non-retryable.

── 3e. MIRROR (CORS/expiry immunity) ──
After GenerationResult: `videoUrl = await adapter.persistMedia(result.videoUrl,
'clips/${projectId}/${shotId}.mp4')`. Store mirrored url as Shot.videoUrl,
raw as sourceProviderUrl. (Desktop: copy to MEDIA_DIR. Web: fetch→R2.)

ERROR PATHS: provider 4xx validation → fail shot, surface detail, no retry.
network/5xx → retry ≤2. no videoUrl in result → fail loud (never complete empty).
CURSOR PROMPT:
```
Implement Stage 3 per spec-2 §Stage3. generateVideo dispatch switch (fal/runway/
grok). providerSubmit() chokepoint: mandatory ctx.source, pause gate, logging.
falVideo with schema-driven buildPayload (§3c), idempotent falRequestId (§3d),
mirror to origin (§3e). runwayVideo via @runwayml/sdk with the scene→runway field
mapping (§3b-runway). grokVideo via xAI direct (verify endpoint path). Grok is the
only silentOnly=false model. Every provider result normalized to GenerationResult
and mirrored. No model-swap fallback anywhere.
```

═══════════════════════════════════════════════════════════════════════
# STAGE 4 — ANCHOR CHAIN / CONTINUITY  [v1 MINIMAL]
═══════════════════════════════════════════════════════════════════════
CONTRACT:
```typescript
advanceChain(completedShot: Shot, lastFrame: string | null, ctx): Promise<void>
```
OWNER: worker, inside the shot-complete transaction.
LOGIC:
- Find next shot in the same continuityGroup (or next by order) that is 'pending'.
- Set it status='awaiting_direction', anchorFrameUrl=lastFrame, anchorSource='auto'
  (unless it already has a manual/keyframe anchor — don't overwrite user intent).
- Director UI (Phase 5) renders the AwaitingDirectionCard for it.
ERROR PATHS: no lastFrame → next shot anchorSource='none' (T2V) with UI affordance
to upload/generate. No next shot → chain ends, film ready for assembly.
CURSOR PROMPT:
```
Implement Stage 4 advanceChain() per spec-2 §Stage4, INSIDE the shot-complete DB
transaction (both manual and batch paths). Promote next shot to
'awaiting_direction' with the previous lastFrame as anchor. Never overwrite a
manual/keyframe anchor. Emit a job event so the UI renders the direction card.
```

═══════════════════════════════════════════════════════════════════════
# STAGE 5 — QUALITY GATE  [v1 STUB, interface real]
═══════════════════════════════════════════════════════════════════════
CONTRACT:
```typescript
qualityGate(shot: Shot, ctx): Promise<{ score: number, action: 'pass'|'repair' }>
```
OWNER: worker, after generation.
LOGIC (v1 stub): return { score: 10, action: 'pass' }. Interface exists so the
Claude-Vision scorer + re-anchor-and-repair lands later (Phase 3) with no rewiring.
COGNITIVE VERSION (deferred): Claude Vision scores 0-10 coherence; <6 → re-anchor
to storyboard keyframe + regenerate (bounded retries); ≥6 → pass.
CURSOR PROMPT:
```
Implement Stage 5 qualityGate() per spec-2 §Stage5 as a pass-through stub
returning score 10. Wire it into the pipeline AFTER generation, BEFORE timeline
projection, so the real scorer can replace the stub body later without changing
callers. Persist Shot.qualityScore.
```

═══════════════════════════════════════════════════════════════════════
# STAGE 6 — TIMELINE / ASSEMBLY  [v1 MINIMAL]
═══════════════════════════════════════════════════════════════════════
CONTRACT:
```typescript
reconcileTimeline(shots: Shot[]): void          // DB-projection → clips
assembleFilm(clips: Clip[], audio: AudioAsset[]): Promise<{ url: string }>
```
OWNER: reconcile = renderer/timeline store. assemble = worker (FFmpeg).
LOGIC:
- reconcileTimeline: for each completed shot with videoUrl and no clip → addClip
  (sourceUrl=videoUrl, durationSec, poster=lastFrame). Map-based fill-or-add for
  empty shells. Single store. Runs on load + every shots refetch (self-healing).
- assembleFilm (v1 minimal): FFmpeg concat of clips + mix audio tracks. Deferred:
  RIFE optical-flow interpolation at boundaries.
CURSOR PROMPT:
```
Implement Stage 6 per spec-2 §Stage6. reconcileTimeline as a DB projection into
the SINGLE shared timeline store (Map-based fill-or-add; videoUrl→sourceUrl).
Call it on project load and every shots refetch. assembleFilm: FFmpeg concat +
audio mix (minimal; no RIFE yet). Clips play from adapter.mediaPlaybackUrl.
```

═══════════════════════════════════════════════════════════════════════
# STAGE 7 — AUDIO  [v1 MINIMAL, parallel path]
═══════════════════════════════════════════════════════════════════════
CONTRACT:
```typescript
generateAudio(input: { shots: Shot[], characters: Character[], brief: CreativeBrief }, ctx)
  : Promise<AudioAsset[]>
```
OWNER: worker → providerSubmit (elevenlabs/suno paths).
LOGIC (v1 minimal):
- Voice: per character with dialogue → ElevenLabs voice (character.voiceId), one
  .wav stem, placed on 'voice' track.
- Music: Suno v4 from brief mood/genre → one music track.
- Video stays SILENT (buildPayload audio-off) EXCEPT Grok (native audio).
- Composited by assembleFilm (S6). Audio is the single sound source (except Grok).
DEFERRED: lip-sync (OmniHuman), SFX generation, the full DAW, spatial audio.
CURSOR PROMPT:
```
Implement Stage 7 generateAudio() per spec-2 §Stage7. ElevenLabs voice per
speaking character (persist voiceId on Character), Suno music from brief. Through
providerSubmit (ctx.source='audio'). Produce AudioAsset[] on voice/music tracks.
Do NOT lip-sync or SFX in v1. Video remains silent except Grok.
```

## NEXT
Phase 2 (this doc) = the 7 pipeline stage contracts, incl. the explicit
Runway/Grok/FAL scene-wiring you asked about.
Say "next" to build PHASE 3 — Cognitive Director / MoE pipeline (the 5 cognitive
stages, 4 memory stores, the gating/routing logic, live performance matrix, RLAIF
— specced as real contracts that slot behind Stage 1 and Stage 2).
