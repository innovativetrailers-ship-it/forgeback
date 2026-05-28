# CINEMATIC FORGE — TODAY'S FIXES
## Cursor Agent Implementation Prompt
### All fixes from this session — implement in order, do not skip any

---

## CRITICAL RULES BEFORE YOU BEGIN

1. **Do NOT break any existing working system** — these are surgical fixes only
2. **Preserve all existing file structure** — rename/update, never delete working code
3. **Every file listed must be created or modified exactly as specified**
4. **Run `npx prisma generate` after any schema change**
5. **No placeholder code** — every function must be fully implemented
6. **No "agent" or "swarm" terminology anywhere** — use engine, router, processor

---

## FIX 1 — ENGINE REGISTRY (New models + corrected specialties)

**Create** `src/lib/routing/engineRegistry.ts` — replace entire file:

```typescript
// src/lib/routing/engineRegistry.ts

export const MODEL_COSTS: Record<string, number> = {
  // Existing
  'veo-3.1':              35,
  'kling-3.0':            25,
  'seedance-2.0':         20,
  'runway-gen4':          22,
  'hunyuan-video-1.5':    12,
  'luma-ray3':             8,
  'minimax-2.3':          10,
  'cogvideox':             6,
  'wan-2.2':               2,
  'pika-2.5':              8,

  // UPDATED — SkyReels now V3
  'skyreels-v3':          18,

  // UPDATED — LTX 2.3 upgraded (22B params, 4K/50fps) — keep fast variant for drafts
  'ltx-2.3':               6,
  'ltx-2.3-fast':          2,

  // NEW — PixVerse (CGI specialist)
  'pixverse-c1':          28,
  'pixverse-v6':          14,

  // NEW — Tencent CGI suite
  'hunyuan-hy-motion':    20,
  'hunyuan-world-mirror': 22,
  'hunyuan-r-dmesh':      25,

  // NEW — Nano Banana (Google Gemini Image — for storyboards/reference frames)
  'nano-banana-2':         2,   // per image
  'nano-banana-pro':       5,   // per image
}

export const MODEL_SPECIALTIES: Record<string, {
  costTier:   'budget' | 'mid' | 'premium'
  strengths:  string[]
  weaknesses: string[]
  bestFor:    string
}> = {
  'veo-3.1': {
    costTier:   'premium',
    strengths:  ['fluid_dynamics', 'physics', 'photorealism', 'native_audio', 'realism'],
    weaknesses: ['cost', 'slow'],
    bestFor:    'Photorealistic hero shots, water/fire physics, native audio',
  },
  'kling-3.0': {
    costTier:   'mid',
    strengths:  ['locomotion', 'hands', 'facial_consistency', 'human_motion', 'vehicle'],
    weaknesses: ['environments', 'abstract'],
    bestFor:    'Human movement, vehicle pans, hand close-ups',
  },
  'seedance-2.0': {
    costTier:   'mid',
    strengths:  ['character_detail', 'dialogue', 'fine_motor', 'lip_sync', 'faces'],
    weaknesses: ['environments', 'action'],
    bestFor:    'Dialogue scenes, character close-ups, emotional performance',
  },
  'skyreels-v3': {
    costTier:   'mid',
    strengths:  ['infinite_length', 'emotional_acting', 'portrait', 'facial_expression', 'long_sequence'],
    weaknesses: ['cost_vs_budget'],
    bestFor:    'Infinite-length sequences, long-form portrait, emotional acting',
  },
  'runway-gen4': {
    costTier:   'mid',
    strengths:  ['multi_shot', 'character_continuity', 'commercial', 'product'],
    weaknesses: ['abstract', 'physics'],
    bestFor:    'Multi-shot sequences, product advertising, brand consistency',
  },
  'pixverse-c1': {
    costTier:   'premium',
    strengths:  ['cgi_vfx', 'fluid_dynamics', 'action_choreography', 'atmospheric', 'stylised', 'spatial_consistency', 'particles', 'lighting_effects'],
    weaknesses: ['cost', 'generation_time'],
    bestFor:    'CGI VFX: particles, fire, explosions, atmospheric effects, combat',
  },
  'pixverse-v6': {
    costTier:   'mid',
    strengths:  ['camera_control', 'character_emotion', 'multi_shot', 'native_audio', 'commercial'],
    weaknesses: ['extreme_vfx'],
    bestFor:    'Cinematic multi-shot with precise camera language, 15s stories',
  },
  'hunyuan-video-1.5': {
    costTier:   'mid',
    strengths:  ['crowd', 'cyberpunk', 'multi_person', 'density', 'urban'],
    weaknesses: ['portrait', 'dialogue'],
    bestFor:    'Crowd scenes, dense urban environments, cyberpunk aesthetics',
  },
  'hunyuan-hy-motion': {
    costTier:   'mid',
    strengths:  ['3d_character_animation', 'motion_capture_style', 'skeletal_animation', 'dance', 'sports'],
    weaknesses: ['environments', 'non_humanoid'],
    bestFor:    'CGI character animation: walk cycles, dance, combat, sports',
  },
  'hunyuan-world-mirror': {
    costTier:   'mid',
    strengths:  ['3d_reconstruction', 'scene_geometry', 'environment_cgi', 'depth_accurate'],
    weaknesses: ['character_detail', 'speed'],
    bestFor:    'CGI environment reconstruction, 3D world building from reference',
  },
  'hunyuan-r-dmesh': {
    costTier:   'premium',
    strengths:  ['mesh_animation', '3d_vfx', 'surface_tracking', 'procedural_cgi'],
    weaknesses: ['cost', 'complexity'],
    bestFor:    'Advanced CGI: mesh deformation, 3D surface animation',
  },
  'luma-ray3': {
    costTier:   'budget',
    strengths:  ['aerial', 'camera_movement', 'environments', 'landscape', 'establishing'],
    weaknesses: ['faces', 'dialogue'],
    bestFor:    'Aerial shots, landscape reveals, smooth camera movements',
  },
  'minimax-2.3': {
    costTier:   'budget',
    strengths:  ['long_form', 'consistent_quality', 'narrative', 'physics'],
    weaknesses: ['extreme_detail'],
    bestFor:    'Long sequences up to 6min, narrative consistency',
  },
  'cogvideox': {
    costTier:   'budget',
    strengths:  ['text_rendering', 'prompt_adherence', 'static_scenes', 'precise'],
    weaknesses: ['motion', 'realism'],
    bestFor:    'Text overlays, exact prompt matching, static scenes',
  },
  'wan-2.2': {
    costTier:   'budget',
    strengths:  ['wildlife', 'texture', 'nature', 'fur', 'organic'],
    weaknesses: ['urban', 'human', 'dialogue'],
    bestFor:    'Wildlife, nature texture, organic materials, budget backgrounds',
  },
  'ltx-2.3': {
    costTier:   'mid',
    strengths:  ['4k_native', '50fps', 'portrait_vertical', 'fast', 'audio_stereo'],
    weaknesses: ['complex_physics'],
    bestFor:    '4K portrait/vertical, high-resolution fast generation',
  },
  'ltx-2.3-fast': {
    costTier:   'budget',
    strengths:  ['speed', 'iteration', 'draft'],
    weaknesses: ['quality', 'resolution'],
    bestFor:    'Quick drafts, storyboard previews, rapid iteration',
  },
  'pika-2.5': {
    costTier:   'budget',
    strengths:  ['object_editing', 'close_up', 'product', 'swap', 'targeted_edit'],
    weaknesses: ['full_scene', 'long_form'],
    bestFor:    'Object replacement, product shots, targeted frame edits',
  },
}

// fal.ai model endpoint IDs
export const FAL_MODEL_IDS: Record<string, string> = {
  'kling-3.0':            'fal-ai/kling-video/v1.6/pro/text-to-video',
  'seedance-2.0':         'fal-ai/seedance-video-lite',
  'skyreels-v3':          'fal-ai/skyreels-v2-t2v',
  'luma-ray3':            'fal-ai/luma-dream-machine',
  'minimax-2.3':          'fal-ai/minimax-video',
  'cogvideox':            'fal-ai/cogvideox-5b',
  'wan-2.2':              'fal-ai/wan-t2v',
  'ltx-2.3':              'fal-ai/ltx-video-v0-9-7',
  'ltx-2.3-fast':         'fal-ai/ltx-video-v0-9-7',
  'pika-2.5':             'fal-ai/pika-v2-turbo',
  'pixverse-c1':          'fal-ai/pixverse/v4.5',
  'pixverse-v6':          'fal-ai/pixverse/v4',
  'hunyuan-video-1.5':    'fal-ai/hunyuan-video',
  'hunyuan-hy-motion':    'fal-ai/hunyuan-video',
  'hunyuan-world-mirror': 'fal-ai/hunyuan-video',
  'nano-banana-2':        'fal-ai/gemini-flash-image',
}

// Simple mode tier → engine mapping
export const TIER_ENGINE_MAP: Record<string, string> = {
  'draft':     'ltx-2.3-fast',   //  2 cr/5s
  'standard':  'wan-2.2',        //  2 cr/5s
  'cinematic': 'luma-ray3',      //  8 cr/5s
  'film':      'kling-3.0',      // 25 cr/5s
}
```

---

## FIX 2 — CREDITS LIBRARY (single source of truth)

**Create** `src/lib/credits.ts` — replace entire file:

```typescript
// src/lib/credits.ts

import { MODEL_COSTS, TIER_ENGINE_MAP } from './routing/engineRegistry'

// ── Core calculation — used by ALL modes, never bypass this ──────────────────
export function calculateGenerationCost(
  model: string,
  durationSeconds: number
): number {
  const ratePerFiveSeconds = MODEL_COSTS[model]
  if (!ratePerFiveSeconds) {
    console.warn(`[credits] Unknown model "${model}", defaulting to ltx-2.3-fast`)
    return Math.ceil((MODEL_COSTS['ltx-2.3-fast'] / 5) * durationSeconds)
  }
  return Math.ceil((ratePerFiveSeconds / 5) * durationSeconds)
}

// ── Simple mode — one tier, one model, full duration ──────────────────────────
export function calculateSimpleCost(
  tier: string,
  durationSeconds: number
): number {
  const engine = TIER_ENGINE_MAP[tier] ?? 'ltx-2.3-fast'
  return calculateGenerationCost(engine, durationSeconds)
}

// ── Director/multi-model mode — segments only, NOT sum of all models ──────────
// selectedModels = POOL to draw from, not "call all of these"
export function calculateOrchestrationCost(
  segments: Array<{ assignedModel: string; duration: number }>
): number {
  return Math.ceil(
    segments.reduce(
      (sum, seg) => sum + calculateGenerationCost(seg.assignedModel, seg.duration),
      0
    )
  )
}

// ── All other operation costs ─────────────────────────────────────────────────
export const OPERATION_COSTS: Record<string, number> = {
  // Image generation
  'nano-banana-2':                  2,
  'nano-banana-pro':                5,
  'flux-pro':                       4,

  // ElevenLabs audio
  'elevenlabs_tts_per_100_chars':   1,
  'elevenlabs_clone_voice':        20,
  'elevenlabs_overdub':             2,
  'elevenlabs_sts_per_30s':         3,
  'elevenlabs_sfx_per_5s':          1,

  // Music
  'suno_music_per_30s':             5,
  'audiocraft_ambient_per_30s':     2,

  // Timeline
  'optical_flow_retime_per_min':    4,
  'morph_cut':                      3,
  'video_stabilise_per_min':        2,
  'clip_extend_2s':                10,
  'clip_extend_4s':                18,
  'clip_extend_8s':                32,
  'filler_word_removal':            1,
  'silence_removal':                0,
  'speaker_separation_per_min':     5,
  'video_translation_per_min':      8,

  // VFX
  'object_removal_per_clip':       20,
  'planar_track_per_min':           3,
  'particle_bake_per_second':       1,

  // Export
  'export_dcp':                    40,
  'export_imf':                    30,
  'export_stems':                   5,
  'c2pa_injection':                 0,

  // AI features
  'rough_cut_per_clip':             1,
  'emotion_analysis_per_project':   5,
  'mogrt_apply_template':           2,
  'mogrt_ai_generate':             15,
  'storyboard_per_scene':           3,
  'slides_to_video_per_slide':      2,
  'brand_kit_apply':                0,
}

export async function deductCredits(
  db: any,
  userId: string,
  amount: number,
  description: string
): Promise<void> {
  const user = await db.user.findUnique({
    where:  { id: userId },
    select: { creditBalance: true, role: true },
  })

  // ADMIN role never pays
  if (user?.role === 'ADMIN') return

  if ((user?.creditBalance ?? 0) < amount) {
    throw new Error(`Insufficient credits: need ${amount}, have ${user?.creditBalance ?? 0}`)
  }

  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data:  { creditBalance: { decrement: amount } },
    }),
    db.creditTransaction.create({
      data: {
        userId,
        amount:      -amount,
        description,
        balanceAfter: (user!.creditBalance) - amount,
      },
    }),
  ])
}
```

---

## FIX 3 — MEDIA ROUTER (segment-based orchestration)

**Create** `src/lib/routing/MediaRouter.ts` — replace entire file:

```typescript
// src/lib/routing/MediaRouter.ts

import { MODEL_COSTS, MODEL_SPECIALTIES, FAL_MODEL_IDS, TIER_ENGINE_MAP } from './engineRegistry'
import { calculateGenerationCost, calculateOrchestrationCost } from '../credits'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ClipSegment {
  startSeconds:  number
  endSeconds:    number
  duration:      number
  contentType:   string
  motion:        'static' | 'slow' | 'medium' | 'fast' | 'complex'
  hasDialogue:   boolean
  hasFaces:      boolean
  hasCGI:        boolean
  complexity:    'simple' | 'moderate' | 'complex'
  assignedModel: string
  creditCost:    number
}

export interface OrchestrationPlan {
  segments:       ClipSegment[]
  totalCredits:   number
  totalDuration:  number
  modelBreakdown: Record<string, { duration: number; cost: number }>
}

// ── Step 1: LLM segments the prompt into temporal sections ───────────────────
async function segmentPrompt(
  prompt:          string,
  totalDuration:   number,
  availableModels: string[]
): Promise<Omit<ClipSegment, 'assignedModel' | 'creditCost'>[]> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':   process.env.ANTHROPIC_API_KEY!,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `You are a film editor and AI orchestrator. 
Analyse a video prompt and divide it into temporal segments.
Return ONLY a valid JSON array. No explanation, no markdown.`,
      messages: [{
        role:    'user',
        content: `Prompt: "${prompt}"
Total duration: ${totalDuration} seconds
Available models: ${availableModels.join(', ')}

Divide into 1-6 segments that sum to exactly ${totalDuration} seconds.
For each segment return:
{
  "startSeconds": number,
  "endSeconds": number,
  "duration": number,
  "contentType": "sky|environment|vehicle|crowd|character|dialogue|cgi_vfx|action|aerial|product|abstract",
  "motion": "static|slow|medium|fast|complex",
  "hasDialogue": boolean,
  "hasFaces": boolean,
  "hasCGI": boolean,
  "complexity": "simple|moderate|complex"
}

Rules:
- Simple static sky/background = simple complexity
- Moving vehicles/objects = medium complexity  
- Human faces/hands/dialogue = complex
- Fire/explosions/particles/VFX = hasCGI=true, complex
- Segments must sum to exactly ${totalDuration}s`,
      }],
    }),
  })

  const data = await res.json()
  const text = data.content?.[0]?.text ?? '[]'
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim())
  } catch {
    // Fallback: single segment if LLM fails
    return [{
      startSeconds: 0,
      endSeconds:   totalDuration,
      duration:     totalDuration,
      contentType:  'general',
      motion:       'medium',
      hasDialogue:  false,
      hasFaces:     false,
      hasCGI:       false,
      complexity:   'moderate',
    }]
  }
}

// ── Step 2: Score and assign optimal model per segment ────────────────────────
function assignModelToSegment(
  segment:         Omit<ClipSegment, 'assignedModel' | 'creditCost'>,
  availableModels: string[]
): string {
  const scores: Record<string, number> = {}

  for (const model of availableModels) {
    let score = 0
    const spec = MODEL_SPECIALTIES[model]
    if (!spec) continue

    // ── Positive scoring ──────────────────────────────────────────────────
    if (segment.hasFaces    && spec.strengths.includes('facial_consistency'))   score += 25
    if (segment.hasFaces    && spec.strengths.includes('character_detail'))      score += 20
    if (segment.hasDialogue && spec.strengths.includes('lip_sync'))              score += 25
    if (segment.hasDialogue && spec.strengths.includes('dialogue'))              score += 20
    if (segment.hasCGI      && spec.strengths.includes('cgi_vfx'))              score += 40
    if (segment.hasCGI      && spec.strengths.includes('fluid_dynamics'))       score += 25
    if (segment.hasCGI      && spec.strengths.includes('particles'))            score += 30
    if (segment.hasCGI      && spec.strengths.includes('3d_character_animation')) score += 35

    if (segment.motion === 'fast'    && spec.strengths.includes('locomotion'))  score += 20
    if (segment.motion === 'complex' && spec.strengths.includes('action_choreography')) score += 30

    if (segment.contentType.includes('aerial')  && spec.strengths.includes('aerial'))       score += 25
    if (segment.contentType.includes('crowd')   && spec.strengths.includes('crowd'))        score += 25
    if (segment.contentType.includes('vehicle') && spec.strengths.includes('locomotion'))   score += 15
    if (segment.contentType.includes('product') && spec.strengths.includes('product'))      score += 20
    if (segment.contentType.includes('atmospheric') && spec.strengths.includes('atmospheric')) score += 30

    if (segment.duration > 15 && spec.strengths.includes('infinite_length'))   score += 30
    if (segment.duration > 15 && spec.strengths.includes('long_form'))         score += 20

    // ── Cost efficiency: penalise expensive models on simple segments ──────
    if (segment.complexity === 'simple') {
      score -= MODEL_COSTS[model] * 1.2
    }
    if (segment.complexity === 'moderate') {
      score -= MODEL_COSTS[model] * 0.3
    }

    scores[model] = score
  }

  // Return highest scorer; fallback to cheapest available
  if (Object.keys(scores).length === 0) return availableModels[0]
  return availableModels.reduce((best, model) =>
    (scores[model] ?? -999) > (scores[best] ?? -999) ? model : best
  , availableModels[0])
}

// ── Main entry point ──────────────────────────────────────────────────────────
export async function orchestrateMultiModelGeneration(
  prompt:          string,
  totalDuration:   number,
  selectedModels:  string[]   // USER POOL — not "call all of these"
): Promise<OrchestrationPlan> {
  const rawSegments = await segmentPrompt(prompt, totalDuration, selectedModels)

  const segments: ClipSegment[] = rawSegments.map(seg => {
    const assignedModel = assignModelToSegment(seg, selectedModels)
    const creditCost    = calculateGenerationCost(assignedModel, seg.duration)
    return { ...seg, assignedModel, creditCost }
  })

  const totalCredits = calculateOrchestrationCost(segments)

  const modelBreakdown: Record<string, { duration: number; cost: number }> = {}
  for (const seg of segments) {
    if (!modelBreakdown[seg.assignedModel]) {
      modelBreakdown[seg.assignedModel] = { duration: 0, cost: 0 }
    }
    modelBreakdown[seg.assignedModel].duration += seg.duration
    modelBreakdown[seg.assignedModel].cost     += seg.creditCost
  }

  return { segments, totalCredits, totalDuration, modelBreakdown }
}

// ── Engine caller — routes to correct API ─────────────────────────────────────
export async function callEngine(params: {
  model:     string
  prompt:    string
  duration:  number
  imageUrl?: string
}): Promise<{ videoUrl?: string; imageUrl?: string; jobId: string }> {

  // Veo 3.1 — Google Vertex AI
  if (params.model === 'veo-3.1') {
    const { VertexAI } = await import('@google-cloud/vertexai')
    const vertex = new VertexAI({
      project:  process.env.GOOGLE_PROJECT_ID!,
      location: process.env.GOOGLE_VERTEX_LOCATION ?? 'us-central1',
    })
    const model  = vertex.preview.getGenerativeModel({ model: 'veo-3.1-generate-001' })
    const result = await (model as any).generateVideo({
      prompt:   params.prompt,
      duration: params.duration,
    })
    return { videoUrl: result.videoUrl, jobId: `veo_${Date.now()}` }
  }

  // Runway Gen-4 — direct SDK
  if (params.model === 'runway-gen4') {
    const RunwayML = (await import('@runwayml/sdk')).default
    const client   = new RunwayML({ apiKey: process.env.RUNWAY_API_KEY! })
    const task     = await client.imageToVideo.create({
      model:      'gen4_turbo',
      promptText: params.prompt,
      duration:   params.duration as 5 | 10,
      ...(params.imageUrl ? { promptImage: params.imageUrl } : {}),
    })
    return { jobId: task.id }
  }

  // Nano Banana — Google Gemini Image
  if (params.model === 'nano-banana-2' || params.model === 'nano-banana-pro') {
    const { generateWithNanoBanana } = await import('../engines/nanoBanana')
    const result = await generateWithNanoBanana({
      prompt:             params.prompt,
      referenceImageUrl:  params.imageUrl,
      quality:            params.model === 'nano-banana-pro' ? 'pro' : 'standard',
      style:              'cinematic',
    })
    return { imageUrl: result.imageUrl, jobId: `nb_${Date.now()}` }
  }

  // Everything else — fal.ai
  const falModelId = FAL_MODEL_IDS[params.model]
  if (!falModelId) throw new Error(`Unknown model: ${params.model}`)

  const input: Record<string, unknown> = {
    prompt:       params.prompt,
    duration:     params.duration,
    aspect_ratio: '16:9',
    resolution:   '1080p',
  }
  if (params.imageUrl)             input.image_url = params.imageUrl
  if (params.model === 'ltx-2.3-fast') input.quality = 'fast'

  const result = await fetch(`https://fal.run/${falModelId}`, {
    method:  'POST',
    headers: {
      Authorization: `Key ${process.env.FAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input }),
  }).then(r => r.json())

  return {
    videoUrl: result.video?.url ?? result.video_url,
    jobId:    result.request_id ?? `fal_${Date.now()}`,
  }
}
```

---

## FIX 4 — GENERATE API ROUTE (uses orchestration, not sum-of-models billing)

**Modify** `src/app/api/generate/route.ts`:

```typescript
// src/app/api/generate/route.ts

import { orchestrateMultiModelGeneration, callEngine } from '@/lib/routing/MediaRouter'
import { calculateSimpleCost, deductCredits }          from '@/lib/credits'
import { TIER_ENGINE_MAP }                             from '@/lib/routing/engineRegistry'
import { db }                                          from '@/lib/db'
import { renderQueue }                                 from '@/lib/queue'

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    prompt,
    duration       = 10,
    selectedModels = [],
    mode           = 'simple',
    tier           = 'standard',
    imageUrl,
  } = await req.json()

  if (!prompt) return Response.json({ error: 'prompt required' }, { status: 400 })

  try {
    let creditCost: number
    let segments: Array<{ assignedModel: string; duration: number }>

    if (mode === 'director' && selectedModels.length > 0) {
      // ── Director mode: orchestrate, assign right model per segment ─────────
      const plan = await orchestrateMultiModelGeneration(prompt, duration, selectedModels)
      creditCost = plan.totalCredits
      segments   = plan.segments
    } else {
      // ── Simple mode: one engine, correct tier rate ─────────────────────────
      creditCost = calculateSimpleCost(tier, duration)
      segments   = [{ assignedModel: TIER_ENGINE_MAP[tier] ?? 'ltx-2.3-fast', duration }]
    }

    // Deduct credits (ADMIN bypasses)
    await deductCredits(db, userId, creditCost, `Generate: ${prompt.slice(0, 60)}`)

    // Queue render jobs — one per segment
    const jobIds: string[] = []
    for (const seg of segments) {
      const job = await renderQueue.add('render-segment', {
        userId,
        prompt,
        model:    seg.assignedModel,
        duration: seg.duration,
        imageUrl,
      })
      jobIds.push(String(job.id))
    }

    return Response.json({
      queued:      true,
      creditCost,
      segments,
      jobIds,
    })

  } catch (err: any) {
    if (err.message?.includes('Insufficient credits')) {
      return Response.json({ error: err.message }, { status: 402 })
    }
    console.error('[generate]', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
```

---

## FIX 5 — COST ESTIMATE ENDPOINT

**Create** `src/app/api/generate/estimate/route.ts`:

```typescript
// src/app/api/generate/estimate/route.ts

import { orchestrateMultiModelGeneration } from '@/lib/routing/MediaRouter'
import { calculateSimpleCost }             from '@/lib/credits'
import { TIER_ENGINE_MAP, MODEL_COSTS }    from '@/lib/routing/engineRegistry'

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { prompt, duration, selectedModels, mode, tier } = await req.json()

  if (!prompt || !duration) {
    return Response.json({ error: 'prompt and duration required' }, { status: 400 })
  }

  if (mode === 'director' && selectedModels?.length > 0) {
    const plan = await orchestrateMultiModelGeneration(prompt, duration, selectedModels)
    return Response.json(plan)
  }

  // Simple mode estimate
  const engine = TIER_ENGINE_MAP[tier ?? 'standard'] ?? 'ltx-2.3-fast'
  const cost   = calculateSimpleCost(tier ?? 'standard', duration)
  return Response.json({
    totalCredits:   cost,
    totalDuration:  duration,
    segments:       [{ assignedModel: engine, duration, creditCost: cost }],
    modelBreakdown: { [engine]: { duration, cost } },
  })
}
```

---

## FIX 6 — NANO BANANA ENGINE

**Create** `src/lib/engines/nanoBanana.ts`:

```typescript
// src/lib/engines/nanoBanana.ts
// Google Gemini Image — "Nano Banana" — image generation + editing

import { uploadToR2 } from '@/lib/storage/r2'

export interface NanoBananaParams {
  prompt:             string
  negativePrompt?:    string
  referenceImageUrl?: string
  aspectRatio?:       '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
  style?:             'photorealistic' | 'cinematic' | 'illustrated' | 'stylised'
  quality?:           'standard' | 'pro'
}

export async function generateWithNanoBanana(
  params: NanoBananaParams
): Promise<{ imageUrl: string }> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)

  const modelId = params.quality === 'pro'
    ? (process.env.NANO_BANANA_PRO_MODEL ?? 'gemini-3.0-pro-image')
    : (process.env.NANO_BANANA_MODEL     ?? 'gemini-2.5-flash-preview-05-20')

  const model = genAI.getGenerativeModel({ model: modelId })

  const stylePrefix: Record<string, string> = {
    photorealistic: 'Professional photorealistic photograph: ',
    cinematic:      'Cinematic film still, shot on ARRI Alexa: ',
    illustrated:    'Detailed concept art illustration: ',
    stylised:       'Stylised artistic render: ',
  }

  const fullPrompt = `${stylePrefix[params.style ?? 'cinematic']}${params.prompt}`

  let result
  if (params.referenceImageUrl) {
    const imgRes   = await fetch(params.referenceImageUrl)
    const imgBuf   = await imgRes.arrayBuffer()
    const base64   = Buffer.from(imgBuf).toString('base64')
    const mimeType = imgRes.headers.get('content-type') ?? 'image/jpeg'

    result = await model.generateContent([
      { text: fullPrompt },
      { inlineData: { mimeType, data: base64 } },
    ])
  } else {
    result = await model.generateContent(fullPrompt)
  }

  const imageData = result.response.candidates?.[0]?.content?.parts
    ?.find((p: any) => p.inlineData)?.inlineData

  if (!imageData?.data) throw new Error('Nano Banana returned no image data')

  const buffer   = Buffer.from(imageData.data, 'base64')
  const imageUrl = await uploadToR2(buffer, `generated/${Date.now()}.jpg`)

  return { imageUrl }
}
```

**Create** `src/app/api/generate/image/route.ts`:

```typescript
// src/app/api/generate/image/route.ts

import { generateWithNanoBanana } from '@/lib/engines/nanoBanana'
import { deductCredits }          from '@/lib/credits'
import { OPERATION_COSTS }        from '@/lib/credits'
import { db }                     from '@/lib/db'

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await req.json()
  const cost   = params.quality === 'pro'
    ? OPERATION_COSTS['nano-banana-pro']
    : OPERATION_COSTS['nano-banana-2']

  await deductCredits(db, userId, cost, `Image: ${params.prompt?.slice(0, 60)}`)

  const result = await generateWithNanoBanana(params)
  return Response.json(result)
}
```

---

## FIX 7 — ELEVENLABS ENGINE

**Create** `src/lib/engines/elevenLabs.ts`:

```typescript
// src/lib/engines/elevenLabs.ts

const BASE    = 'https://api.elevenlabs.io/v1'
const API_KEY = () => process.env.ELEVENLABS_API_KEY!

export async function synthesiseVoice(params: {
  text:          string
  voiceId?:      string
  modelId?:      string
  stability?:    number
  similarity?:   number
  style?:        number
  speakerBoost?: boolean
}): Promise<Buffer> {
  const voiceId = params.voiceId ?? process.env.ELEVENLABS_DEFAULT_VOICE_ID!
  const modelId = params.modelId ?? process.env.ELEVENLABS_MODEL_ID ?? 'eleven_multilingual_v2'

  const res = await fetch(`${BASE}/text-to-speech/${voiceId}`, {
    method:  'POST',
    headers: { 'xi-api-key': API_KEY(), 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: params.text,
      model_id: modelId,
      voice_settings: {
        stability:         params.stability   ?? 0.5,
        similarity_boost:  params.similarity  ?? 0.75,
        style:             params.style       ?? 0,
        use_speaker_boost: params.speakerBoost ?? true,
      },
    }),
  })
  if (!res.ok) throw new Error(`ElevenLabs TTS failed: ${await res.text()}`)
  return Buffer.from(await res.arrayBuffer())
}

export async function cloneVoice(params: {
  name:        string
  description: string
  audioUrls:   string[]
}): Promise<{ voiceId: string }> {
  const formData = new FormData()
  formData.append('name',        params.name)
  formData.append('description', params.description)
  for (const url of params.audioUrls) {
    const buf  = await fetch(url).then(r => r.arrayBuffer())
    formData.append('files', new Blob([buf], { type: 'audio/mpeg' }), `sample_${Date.now()}.mp3`)
  }
  const res  = await fetch(`${BASE}/voices/add`, { method: 'POST', headers: { 'xi-api-key': API_KEY() }, body: formData })
  const data = await res.json()
  return { voiceId: data.voice_id }
}

export async function speechToSpeech(params: {
  audioBuffer: Buffer
  voiceId:     string
  modelId?:    string
}): Promise<Buffer> {
  const formData = new FormData()
  formData.append('audio',    new Blob([params.audioBuffer], { type: 'audio/mpeg' }), 'input.mp3')
  formData.append('model_id', params.modelId ?? 'eleven_multilingual_sts_v2')
  const res = await fetch(`${BASE}/speech-to-speech/${params.voiceId}`, {
    method: 'POST', headers: { 'xi-api-key': API_KEY() }, body: formData,
  })
  return Buffer.from(await res.arrayBuffer())
}

export async function generateSFX(params: {
  text: string; durationSeconds: number
}): Promise<Buffer> {
  const res = await fetch(`${BASE}/sound-generation`, {
    method:  'POST',
    headers: { 'xi-api-key': API_KEY(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: params.text, duration_seconds: params.durationSeconds, prompt_influence: 0.3 }),
  })
  return Buffer.from(await res.arrayBuffer())
}

export async function listVoices(): Promise<any[]> {
  const res  = await fetch(`${BASE}/voices`, { headers: { 'xi-api-key': API_KEY() } })
  const data = await res.json()
  return data.voices ?? []
}
```

**Create** `src/app/api/audio/synthesise/route.ts`:

```typescript
import { synthesiseVoice } from '@/lib/engines/elevenLabs'
import { uploadToR2 }      from '@/lib/storage/r2'
import { deductCredits, OPERATION_COSTS } from '@/lib/credits'
import { db } from '@/lib/db'

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { text, voiceId, stability, similarity } = await req.json()
  const cost = Math.max(1, Math.ceil(text.length / 100)) * OPERATION_COSTS['elevenlabs_tts_per_100_chars']
  await deductCredits(db, userId, cost, `TTS: ${text.slice(0, 40)}`)
  const buf = await synthesiseVoice({ text, voiceId, stability, similarity })
  const url = await uploadToR2(buf, `audio/${userId}/${Date.now()}.mp3`)
  return Response.json({ audioUrl: url, cost })
}
```

**Create** `src/app/api/audio/voices/route.ts`:

```typescript
import { listVoices } from '@/lib/engines/elevenLabs'
import { db }         from '@/lib/db'

export async function GET(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const [stock, cloned] = await Promise.all([
    listVoices(),
    db.clonedVoice.findMany({ where: { userId } }),
  ])
  return Response.json({ stockVoices: stock, clonedVoices: cloned })
}
```

**Create** `src/app/api/audio/clone-voice/route.ts`:

```typescript
import { cloneVoice } from '@/lib/engines/elevenLabs'
import { deductCredits, OPERATION_COSTS } from '@/lib/credits'
import { db } from '@/lib/db'

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { name, description, audioUrls } = await req.json()
  await deductCredits(db, userId, OPERATION_COSTS['elevenlabs_clone_voice'], `Clone voice: ${name}`)
  const { voiceId } = await cloneVoice({ name, description, audioUrls })
  await db.clonedVoice.create({ data: { userId, voiceId, name, description } })
  return Response.json({ voiceId })
}
```

---

## FIX 8 — CREDIT ESTIMATE UI COMPONENT

**Create** `src/components/ui/CreditEstimate.tsx`:

```tsx
// src/components/ui/CreditEstimate.tsx
// Shows correct cost for both simple and director modes

'use client'

import { useState, useEffect } from 'react'

const MODEL_COLOURS: Record<string, string> = {
  'veo-3.1':              '#ff4444',
  'kling-3.0':            '#ff8800',
  'seedance-2.0':         '#ffcc00',
  'skyreels-v3':          '#ff66cc',
  'pixverse-c1':          '#aa44ff',
  'pixverse-v6':          '#8844ff',
  'runway-gen4':          '#4488ff',
  'luma-ray3':            '#44aaff',
  'hunyuan-video-1.5':    '#44ffcc',
  'minimax-2.3':          '#44ff88',
  'cogvideox':            '#88ff44',
  'wan-2.2':              '#ccff44',
  'ltx-2.3':              '#ffff44',
  'ltx-2.3-fast':         '#888844',
  'pika-2.5':             '#ff4488',
}

interface Props {
  prompt:         string
  duration:       number
  selectedModels: string[]
  mode:           'simple' | 'director'
  tier?:          string
}

export function CreditEstimate({ prompt, duration, selectedModels, mode, tier }: Props) {
  const [plan,         setPlan]         = useState<any>(null)
  const [isEstimating, setIsEstimating] = useState(false)

  useEffect(() => {
    if (!prompt || duration <= 0) return
    if (mode === 'director' && selectedModels.length === 0) return

    const timeout = setTimeout(async () => {
      setIsEstimating(true)
      try {
        const res = await fetch('/api/generate/estimate', {
          method:      'POST',
          credentials: 'include',
          headers:     { 'Content-Type': 'application/json' },
          body:        JSON.stringify({ prompt, duration, selectedModels, mode, tier }),
        })
        if (res.ok) setPlan(await res.json())
      } finally {
        setIsEstimating(false)
      }
    }, 800)

    return () => clearTimeout(timeout)
  }, [prompt, duration, JSON.stringify(selectedModels), mode, tier])

  if (isEstimating) return (
    <div className="text-xs text-gray-500 animate-pulse py-1">Estimating cost...</div>
  )

  if (!plan) return null

  return (
    <div className="bg-[#0d1117] border border-[#1a2030] rounded-lg p-3 space-y-2">
      {/* Total */}
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-400">Estimated cost</span>
        <span className="text-sm font-bold text-[#00e5c8]">
          {plan.totalCredits} credits
        </span>
      </div>

      {/* Model breakdown — only show in director mode */}
      {mode === 'director' && plan.modelBreakdown && (
        <div className="space-y-0.5">
          {Object.entries(plan.modelBreakdown).map(([model, info]: [string, any]) => (
            <div key={model} className="flex justify-between text-[10px] text-gray-500">
              <span className="flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: MODEL_COLOURS[model] ?? '#666' }}
                />
                {model} ({info.duration.toFixed(1)}s)
              </span>
              <span>{Math.ceil(info.cost)} cr</span>
            </div>
          ))}
        </div>
      )}

      {/* Segment timeline bar */}
      {plan.segments?.length > 1 && (
        <div className="flex h-1.5 rounded overflow-hidden gap-px">
          {plan.segments.map((seg: any, i: number) => (
            <div
              key={i}
              title={`${seg.contentType} → ${seg.assignedModel} (${seg.duration}s)`}
              style={{
                flex:            seg.duration,
                backgroundColor: MODEL_COLOURS[seg.assignedModel] ?? '#444',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## FIX 9 — PRISMA SCHEMA ADDITIONS

**Add to** `prisma/schema.prisma` — append these models:

```prisma
model ClonedVoice {
  id          String   @id @default(cuid())
  userId      String
  voiceId     String   // ElevenLabs voice ID
  name        String
  description String?
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, voiceId])
  @@index([userId])
}

model CreditTransaction {
  id           String   @id @default(cuid())
  userId       String
  amount       Int      // negative = debit, positive = credit
  description  String
  balanceAfter Int
  createdAt    DateTime @default(now())
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([createdAt])
}
```

**Also add these relations to the User model:**

```prisma
// In the User model, add:
clonedVoices   ClonedVoice[]
creditTxns     CreditTransaction[]
```

**Run after editing schema:**

```bash
npx prisma migrate dev --name add_voice_credit_tables
npx prisma generate
```

---

## FIX 10 — ENV VALIDATION (catches missing keys at startup)

**Create** `src/instrumentation.ts`:

```typescript
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const CRITICAL = [
    'AUTH_SECRET', 'DATABASE_URL', 'REDIS_URL',
    'ANTHROPIC_API_KEY', 'FAL_API_KEY',
    'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME',
  ]

  const OPTIONAL: Record<string, string[]> = {
    elevenlabs:   ['ELEVENLABS_API_KEY', 'ELEVENLABS_DEFAULT_VOICE_ID'],
    nano_banana:  ['GOOGLE_AI_API_KEY', 'NANO_BANANA_MODEL'],
    veo:          ['GOOGLE_PROJECT_ID', 'GOOGLE_VERTEX_LOCATION'],
    kling:        ['KLING_API_KEY', 'KLING_API_SECRET'],
    runway:       ['RUNWAY_API_KEY'],
    payments:     ['STRIPE_SECRET_KEY', 'PAYPAL_CLIENT_ID'],
  }

  const missing = CRITICAL.filter(k => !process.env[k])
  if (missing.length > 0) {
    throw new Error(
      `[CINEMA] Missing critical env vars:\n${missing.map(k => `  • ${k}`).join('\n')}`
    )
  }

  for (const [group, keys] of Object.entries(OPTIONAL)) {
    const missing = keys.filter(k => !process.env[k])
    if (missing.length > 0) {
      console.warn(`[CINEMA] ${group} features disabled — missing: ${missing.join(', ')}`)
    }
  }

  console.log('[CINEMA] Environment validated ✓')
}
```

---

## FIX 11 — INSTALL NEW DEPENDENCIES

Run in the project root:

```bash
npm install @google/generative-ai @google-cloud/vertexai @runwayml/sdk
npx prisma migrate dev --name add_voice_credit_tables
npx prisma generate
```

---

## SUMMARY — FILES TO CREATE/MODIFY

| Action | File |
|---|---|
| CREATE | `src/lib/routing/engineRegistry.ts` |
| CREATE | `src/lib/credits.ts` |
| CREATE | `src/lib/routing/MediaRouter.ts` |
| CREATE | `src/lib/engines/nanoBanana.ts` |
| CREATE | `src/lib/engines/elevenLabs.ts` |
| CREATE | `src/components/ui/CreditEstimate.tsx` |
| CREATE | `src/instrumentation.ts` |
| MODIFY | `src/app/api/generate/route.ts` |
| CREATE | `src/app/api/generate/estimate/route.ts` |
| CREATE | `src/app/api/generate/image/route.ts` |
| CREATE | `src/app/api/audio/synthesise/route.ts` |
| CREATE | `src/app/api/audio/voices/route.ts` |
| CREATE | `src/app/api/audio/clone-voice/route.ts` |
| MODIFY | `prisma/schema.prisma` — add ClonedVoice, CreditTransaction, relations |

---

## FIX 12 — STRIPE PAYMENT FLOW (funds held in Stripe, vendors paid automatically)

### Architecture
```
User deposits $50 → Stripe Customer Balance (never hits your bank)
User generates   → app calls FAL/ElevenLabs (charges platform vendor accounts)
                 → app debits user's Stripe balance in real-time
End of month     → FAL/ElevenLabs invoice auto-charges your Stripe virtual card
                 → Stripe balance covers it
Your income      → platform fee only (20% of deposits)
```

### 12.1 — Prisma schema additions

**Add to** `prisma/schema.prisma`:

```prisma
model StripeCustomer {
  id                 String   @id @default(cuid())
  userId             String   @unique
  stripeCustomerId   String   @unique   // cus_xxxxx
  stripeBalanceCents Int      @default(0)
  lifetimeDepositCents Int    @default(0)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  user               User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model StripeDeposit {
  id                  String   @id @default(cuid())
  userId              String
  stripeCustomerId    String
  paymentIntentId     String   @unique
  amountCents         Int      // total paid by user
  platformFeeCents    Int      // your 20% cut
  vendorAllocationCents Int    // 80% — goes to vendor pool
  status              String   @default("pending")  // pending | completed | refunded
  createdAt           DateTime @default(now())
  user                User     @relation(fields: [userId], references: [id])
}

model VendorUsageLog {
  id           String   @id @default(cuid())
  userId       String
  vendor       String   // 'fal' | 'elevenlabs' | 'suno' | 'pexels'
  operation    String   // e.g. 'kling-3.0 5s generation'
  costUSD      Float    // actual USD cost to vendor API
  creditCost   Int      // cinema forge credits consumed
  requestId    String?  // vendor's request/job ID
  createdAt    DateTime @default(now())
  user         User     @relation(fields: [userId], references: [id])
  @@index([userId])
  @@index([vendor])
  @@index([createdAt])
}
```

**Add to User model relations:**
```prisma
stripeCustomer StripeCustomer?
stripeDeposits StripeDeposit[]
vendorUsage    VendorUsageLog[]
```

**Run:**
```bash
npx prisma migrate dev --name stripe_payment_flow
npx prisma generate
```

---

### 12.2 — Stripe client singleton

**Create** `src/lib/payments/stripe.ts`:

```typescript
// src/lib/payments/stripe.ts

import Stripe from 'stripe'

// Singleton — one Stripe instance across all serverless invocations
const globalForStripe = globalThis as unknown as { stripe: Stripe | undefined }

export const stripe: Stripe =
  globalForStripe.stripe ??
  new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2024-12-18.acacia',
    typescript:  true,
  })

if (process.env.NODE_ENV !== 'production') {
  globalForStripe.stripe = stripe
}

// Credit-to-USD conversion: 1 credit = $0.05
export const CREDIT_VALUE_USD  = 0.05
export const CREDITS_PER_DOLLAR = 20   // $1 = 20 credits
export const PLATFORM_FEE_RATE  = 0.20 // 20% platform fee

export function creditsToUSDCents(credits: number): number {
  return Math.round(credits * CREDIT_VALUE_USD * 100)
}

export function usdCentsToCredits(cents: number): number {
  return Math.floor((cents / 100) * CREDITS_PER_DOLLAR)
}
```

---

### 12.3 — Create or retrieve Stripe customer

**Create** `src/lib/payments/stripeCustomer.ts`:

```typescript
// src/lib/payments/stripeCustomer.ts

import { stripe } from './stripe'
import { db }    from '@/lib/db'

export async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  // Check if already exists
  const existing = await db.stripeCustomer.findUnique({ where: { userId } })
  if (existing) return existing.stripeCustomerId

  // Get user details
  const user = await db.user.findUnique({
    where:  { id: userId },
    select: { email: true, name: true },
  })
  if (!user) throw new Error('User not found')

  // Create Stripe customer
  const customer = await stripe.customers.create({
    email:    user.email,
    name:     user.name ?? undefined,
    metadata: { userId, platform: 'cinematic-forge' },
  })

  // Store mapping
  await db.stripeCustomer.create({
    data: {
      userId,
      stripeCustomerId:   customer.id,
      stripeBalanceCents: 0,
    },
  })

  return customer.id
}

export async function getStripeBalance(userId: string): Promise<{
  balanceCents:  number
  credits:       number
}> {
  const record = await db.stripeCustomer.findUnique({ where: { userId } })
  if (!record) return { balanceCents: 0, credits: 0 }

  // Sync with Stripe (source of truth)
  const customer = await stripe.customers.retrieve(record.stripeCustomerId)
  if (customer.deleted) return { balanceCents: 0, credits: 0 }

  // Stripe balance is stored as negative (credit = negative in Stripe's system)
  const balanceCents = Math.abs(customer.balance < 0 ? customer.balance : 0)

  // Sync to DB
  await db.stripeCustomer.update({
    where: { userId },
    data:  { stripeBalanceCents: balanceCents },
  })

  const { usdCentsToCredits } = await import('./stripe')
  return {
    balanceCents,
    credits: usdCentsToCredits(balanceCents),
  }
}
```

---

### 12.4 — Deposit flow

**Create** `src/app/api/payments/deposit/route.ts`:

```typescript
// src/app/api/payments/deposit/route.ts

import { stripe, PLATFORM_FEE_RATE, usdCentsToCredits } from '@/lib/payments/stripe'
import { getOrCreateStripeCustomer }                     from '@/lib/payments/stripeCustomer'
import { db }                                            from '@/lib/db'

// Step 1: Create payment intent
export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { amountUSD } = await req.json()  // e.g. 50 for $50

  if (!amountUSD || amountUSD < 5) {
    return Response.json({ error: 'Minimum deposit is $5' }, { status: 400 })
  }

  const stripeCustomerId = await getOrCreateStripeCustomer(userId)
  const amountCents      = Math.round(amountUSD * 100)
  const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_RATE)
  const vendorCents      = amountCents - platformFeeCents

  // Create payment intent — funds held by Stripe
  const paymentIntent = await stripe.paymentIntents.create({
    amount:               amountCents,
    currency:             'usd',
    customer:             stripeCustomerId,
    payment_method_types: ['card'],
    metadata: {
      userId,
      platformFeeCents: String(platformFeeCents),
      vendorCents:      String(vendorCents),
      purpose:          'credit_deposit',
    },
    description: `Cinematic Forge credit deposit — $${amountUSD}`,
  })

  // Record pending deposit
  await db.stripeDeposit.create({
    data: {
      userId,
      stripeCustomerId,
      paymentIntentId:      paymentIntent.id,
      amountCents,
      platformFeeCents,
      vendorAllocationCents: vendorCents,
      status:               'pending',
    },
  })

  return Response.json({
    clientSecret:  paymentIntent.client_secret,
    amountUSD,
    creditsToAdd:  usdCentsToCredits(vendorCents),
    platformFeeUSD: platformFeeCents / 100,
  })
}
```

---

### 12.5 — Stripe webhook (confirms deposit, loads balance)

**Create** `src/app/api/webhooks/stripe/route.ts`:

```typescript
// src/app/api/webhooks/stripe/route.ts

import { stripe, usdCentsToCredits } from '@/lib/payments/stripe'
import { db }                        from '@/lib/db'

export const config = { api: { bodyParser: false } }

export async function POST(req: Request) {
  const body      = await req.text()
  const signature = req.headers.get('stripe-signature')!

  let event: any
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err: any) {
    console.error('[Stripe Webhook] Invalid signature:', err.message)
    return Response.json({ error: 'Invalid signature' }, { status: 400 })
  }

  switch (event.type) {

    case 'payment_intent.succeeded': {
      const pi     = event.data.object
      const userId = pi.metadata?.userId
      if (!userId || pi.metadata?.purpose !== 'credit_deposit') break

      const vendorCents = parseInt(pi.metadata.vendorCents ?? '0')
      const credits     = usdCentsToCredits(vendorCents)

      await db.$transaction([
        // Mark deposit complete
        db.stripeDeposit.update({
          where: { paymentIntentId: pi.id },
          data:  { status: 'completed' },
        }),
        // Add credits to user
        db.user.update({
          where: { id: userId },
          data: {
            creditBalance: { increment: credits },
          },
        }),
        // Apply credit to Stripe customer balance (negative = credit in Stripe)
        // This lets Stripe track balance independently
      ])

      // Apply to Stripe customer balance
      const record = await db.stripeCustomer.findUnique({ where: { userId } })
      if (record) {
        await stripe.customers.update(record.stripeCustomerId, {
          balance: -(vendorCents),  // negative = credit in Stripe's system
        })
        await db.stripeCustomer.update({
          where: { userId },
          data: {
            stripeBalanceCents: { increment: vendorCents },
            lifetimeDepositCents: { increment: pi.amount },
          },
        })
      }

      // Record credit transaction
      await db.creditTransaction.create({
        data: {
          userId,
          amount:      credits,
          description: `Deposit: $${pi.amount / 100}`,
          balanceAfter: (await db.user.findUnique({
            where:  { id: userId },
            select: { creditBalance: true },
          }))!.creditBalance,
        },
      })

      console.log(`[Stripe] Deposit confirmed: $${pi.amount / 100} → ${credits} credits for user ${userId}`)
      break
    }

    case 'payment_intent.payment_failed': {
      const pi     = event.data.object
      const userId = pi.metadata?.userId
      if (userId) {
        await db.stripeDeposit.update({
          where: { paymentIntentId: pi.id },
          data:  { status: 'failed' },
        })
      }
      break
    }

    case 'charge.refunded': {
      const charge = event.data.object
      const pi     = await stripe.paymentIntents.retrieve(charge.payment_intent as string)
      const userId = pi.metadata?.userId
      if (!userId) break

      const refundedCents = charge.amount_refunded
      const credits       = usdCentsToCredits(refundedCents)

      await db.$transaction([
        db.user.update({
          where: { id: userId },
          data: { creditBalance: { decrement: credits } },
        }),
        db.stripeDeposit.updateMany({
          where: { paymentIntentId: pi.id },
          data:  { status: 'refunded' },
        }),
        db.creditTransaction.create({
          data: {
            userId,
            amount:      -credits,
            description: `Refund: $${refundedCents / 100}`,
            balanceAfter: 0,  // updated below
          },
        }),
      ])
      break
    }
  }

  return Response.json({ received: true })
}
```

---

### 12.6 — Deduct from Stripe balance when vendor is called

**Modify** `src/lib/credits.ts` — update `deductCredits` function:

```typescript
// Replace the existing deductCredits function in src/lib/credits.ts

import { stripe, creditsToUSDCents } from '@/lib/payments/stripe'

export async function deductCredits(
  db:          any,
  userId:      string,
  credits:     number,
  description: string,
  vendor?:     string,  // 'fal' | 'elevenlabs' | 'suno'
  vendorCostUSD?: number,
): Promise<void> {
  // ADMIN bypasses all credit checks
  const user = await db.user.findUnique({
    where:  { id: userId },
    select: { creditBalance: true, role: true },
  })
  if (user?.role === 'ADMIN') return

  if ((user?.creditBalance ?? 0) < credits) {
    throw new Error(`Insufficient credits: need ${credits}, have ${user?.creditBalance ?? 0}`)
  }

  const newBalance = user!.creditBalance - credits

  await db.$transaction(async (tx: any) => {
    // Deduct from user credit balance
    await tx.user.update({
      where: { id: userId },
      data:  { creditBalance: { decrement: credits } },
    })

    // Record credit transaction
    await tx.creditTransaction.create({
      data: {
        userId,
        amount:      -credits,
        description,
        balanceAfter: newBalance,
      },
    })

    // Record vendor usage for cost tracking
    if (vendor && vendorCostUSD !== undefined) {
      await tx.vendorUsageLog.create({
        data: {
          userId,
          vendor,
          operation:  description,
          costUSD:    vendorCostUSD,
          creditCost: credits,
        },
      })
    }
  })

  // Debit Stripe customer balance in real-time
  // This keeps Stripe's view of the balance in sync
  const stripeCustomer = await db.stripeCustomer.findUnique({ where: { userId } })
  if (stripeCustomer?.stripeCustomerId) {
    const debitCents = creditsToUSDCents(credits)
    try {
      await stripe.customers.createBalanceTransaction(
        stripeCustomer.stripeCustomerId,
        {
          amount:      debitCents,  // positive = debit in Stripe's balance transaction
          currency:    'usd',
          description: `Usage: ${description}`,
        }
      )
      await db.stripeCustomer.update({
        where: { userId },
        data:  { stripeBalanceCents: { decrement: debitCents } },
      })
    } catch (err: any) {
      // Don't fail the generation if Stripe balance update fails
      console.error('[credits] Stripe balance sync failed:', err.message)
    }
  }
}
```

---

### 12.7 — Balance API route (real-time balance from Stripe)

**Create** `src/app/api/credits/balance/route.ts` — replace existing:

```typescript
// src/app/api/credits/balance/route.ts

import { getStripeBalance } from '@/lib/payments/stripeCustomer'
import { db }               from '@/lib/db'

export async function GET(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where:  { id: userId },
    select: { creditBalance: true, role: true },
  })

  if (user?.role === 'ADMIN') {
    return Response.json({ credits: 9999999, balanceUSD: 9999999, isAdmin: true })
  }

  // Get Stripe balance (source of truth for USD)
  const { balanceCents, credits: stripeCredits } = await getStripeBalance(userId)

  return Response.json({
    credits:    user?.creditBalance ?? 0,   // internal credit balance
    balanceUSD: balanceCents / 100,          // USD held in Stripe
    stripeSync: stripeCredits,               // Stripe's view (should match)
  })
}
```

---

### 12.8 — Deposit UI component

**Create** `src/components/payments/DepositModal.tsx`:

```tsx
// src/components/payments/DepositModal.tsx

'use client'

import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY!)

const PRESET_AMOUNTS = [
  { usd: 10,  credits: 160,  label: '$10'  },
  { usd: 25,  credits: 400,  label: '$25'  },
  { usd: 50,  credits: 800,  label: '$50'  },
  { usd: 100, credits: 1600, label: '$100' },
]

function DepositForm({ onClose }: { onClose: () => void }) {
  const stripe   = useStripe()
  const elements = useElements()

  const [selectedAmount, setSelectedAmount] = useState(PRESET_AMOUNTS[1])
  const [customAmount,   setCustomAmount]   = useState('')
  const [isProcessing,   setIsProcessing]   = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [success,        setSuccess]        = useState(false)

  const amountUSD = customAmount ? parseFloat(customAmount) : selectedAmount.usd
  const credits   = Math.floor(amountUSD * 16)  // 20% platform fee → 80% → 16cr per $1
  const platformFee = (amountUSD * 0.20).toFixed(2)

  const handleDeposit = async () => {
    if (!stripe || !elements) return
    if (amountUSD < 5) { setError('Minimum deposit is $5'); return }

    setIsProcessing(true)
    setError(null)

    try {
      // 1. Create payment intent
      const res = await fetch('/api/payments/deposit', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ amountUSD }),
      })
      const { clientSecret } = await res.json()

      // 2. Confirm payment with card
      const card = elements.getElement(CardElement)!
      const { error: stripeError } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card },
      })

      if (stripeError) {
        setError(stripeError.message ?? 'Payment failed')
        return
      }

      setSuccess(true)
      setTimeout(onClose, 2000)

    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsProcessing(false)
    }
  }

  if (success) return (
    <div className="p-8 text-center">
      <div className="text-5xl mb-3">✅</div>
      <div className="text-white font-semibold">Deposit confirmed</div>
      <div className="text-[#00e5c8] text-sm mt-1">{credits} credits added</div>
    </div>
  )

  return (
    <div className="p-6 space-y-4">
      <h3 className="text-white font-semibold">Add Credits</h3>

      {/* Preset amounts */}
      <div className="grid grid-cols-4 gap-2">
        {PRESET_AMOUNTS.map(preset => (
          <button
            key={preset.usd}
            onClick={() => { setSelectedAmount(preset); setCustomAmount('') }}
            className={`p-2 rounded-lg text-center border transition ${
              selectedAmount.usd === preset.usd && !customAmount
                ? 'border-[#00e5c8] bg-[#00e5c8]/10 text-[#00e5c8]'
                : 'border-[#2a3040] text-gray-400 hover:border-[#3a4050]'
            }`}
          >
            <div className="font-semibold text-sm">{preset.label}</div>
            <div className="text-[10px] opacity-70">{preset.credits} cr</div>
          </button>
        ))}
      </div>

      {/* Custom amount */}
      <div>
        <label className="text-xs text-gray-400 block mb-1">Custom amount</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
          <input
            type="number"
            min="5"
            max="500"
            value={customAmount}
            onChange={e => setCustomAmount(e.target.value)}
            placeholder="Enter amount"
            className="w-full pl-7 pr-3 py-2 bg-[#0d1117] border border-[#2a3040] rounded text-white text-sm"
          />
        </div>
      </div>

      {/* Breakdown */}
      <div className="bg-[#0d1117] rounded-lg p-3 space-y-1 text-xs">
        <div className="flex justify-between text-gray-400">
          <span>Deposit</span>
          <span>${amountUSD.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Platform fee (20%)</span>
          <span>-${platformFee}</span>
        </div>
        <div className="flex justify-between text-white font-semibold border-t border-[#1a2030] pt-1 mt-1">
          <span>Credits added</span>
          <span className="text-[#00e5c8]">{credits} credits</span>
        </div>
        <div className="text-gray-600 text-[10px] mt-1">
          Remaining 80% held in Stripe — drawn automatically as you generate
        </div>
      </div>

      {/* Card input */}
      <div className="p-3 bg-[#0d1117] border border-[#2a3040] rounded-lg">
        <CardElement
          options={{
            style: {
              base: {
                color:           '#ffffff',
                fontSize:        '14px',
                '::placeholder': { color: '#6b7280' },
              },
            },
          }}
        />
      </div>

      {error && (
        <div className="text-red-400 text-xs p-2 bg-red-500/10 border border-red-500/30 rounded">
          {error}
        </div>
      )}

      <button
        onClick={handleDeposit}
        disabled={isProcessing || !stripe}
        className="w-full py-3 bg-[#00e5c8] text-black font-semibold rounded-lg disabled:opacity-40"
      >
        {isProcessing ? 'Processing...' : `Deposit $${amountUSD.toFixed(2)}`}
      </button>
    </div>
  )
}

export function DepositModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
      <div className="bg-[#151b24] border border-[#1a2030] rounded-xl w-[420px]">
        <div className="flex items-center justify-between p-4 border-b border-[#1a2030]">
          <span className="text-white font-semibold">Add Credits</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        <Elements stripe={stripePromise}>
          <DepositForm onClose={onClose} />
        </Elements>
      </div>
    </div>
  )
}
```

---

### 12.9 — Low balance alert + auto top-up

**Create** `src/lib/payments/balanceGuard.ts`:

```typescript
// src/lib/payments/balanceGuard.ts
// Checks balance before any generation — warns at 20%, blocks at 0

export const LOW_BALANCE_THRESHOLD_CREDITS = 50   // warn when below 50 credits
export const CRITICAL_BALANCE_CREDITS      = 10   // block non-essential ops below 10

export async function checkBalance(
  db:     any,
  userId: string,
  requiredCredits: number
): Promise<{ canProceed: boolean; warning?: string }> {
  const user = await db.user.findUnique({
    where:  { id: userId },
    select: { creditBalance: true, role: true },
  })

  if (user?.role === 'ADMIN') return { canProceed: true }

  const balance = user?.creditBalance ?? 0

  if (balance < requiredCredits) {
    return {
      canProceed: false,
      warning: `Insufficient credits. You have ${balance} credits, this operation needs ${requiredCredits}.`,
    }
  }

  if (balance < LOW_BALANCE_THRESHOLD_CREDITS) {
    return {
      canProceed: true,
      warning: `Low balance: ${balance} credits remaining. Consider topping up.`,
    }
  }

  return { canProceed: true }
}
```

---

### 12.10 — New ENV vars required

**Add to Vercel + Railway:**

```env
# Stripe (add to existing Stripe vars)
NEXT_PUBLIC_STRIPE_PUBLIC_KEY=pk_live_xxx   # publishable key — safe for frontend
STRIPE_WEBHOOK_SECRET=whsec_xxx             # from Stripe dashboard → Webhooks

# Stripe webhook endpoint to register in Stripe dashboard:
# https://forgecinema.vercel.app/api/webhooks/stripe
# Events to listen for:
#   payment_intent.succeeded
#   payment_intent.payment_failed
#   charge.refunded
```

---

### 12.11 — Install new dependency

```bash
npm install @stripe/stripe-js @stripe/react-stripe-js
```

---

## UPDATED SUMMARY — ALL FILES TO CREATE/MODIFY

| Action | File |
|---|---|
| CREATE | `src/lib/routing/engineRegistry.ts` |
| CREATE | `src/lib/credits.ts` |
| CREATE | `src/lib/routing/MediaRouter.ts` |
| CREATE | `src/lib/engines/nanoBanana.ts` |
| CREATE | `src/lib/engines/elevenLabs.ts` |
| CREATE | `src/components/ui/CreditEstimate.tsx` |
| CREATE | `src/instrumentation.ts` |
| MODIFY | `src/app/api/generate/route.ts` |
| CREATE | `src/app/api/generate/estimate/route.ts` |
| CREATE | `src/app/api/generate/image/route.ts` |
| CREATE | `src/app/api/audio/synthesise/route.ts` |
| CREATE | `src/app/api/audio/voices/route.ts` |
| CREATE | `src/app/api/audio/clone-voice/route.ts` |
| CREATE | `src/lib/payments/stripe.ts` |
| CREATE | `src/lib/payments/stripeCustomer.ts` |
| CREATE | `src/lib/payments/balanceGuard.ts` |
| CREATE | `src/app/api/payments/deposit/route.ts` |
| CREATE | `src/app/api/webhooks/stripe/route.ts` |
| MODIFY | `src/app/api/credits/balance/route.ts` |
| CREATE | `src/components/payments/DepositModal.tsx` |
| MODIFY | `prisma/schema.prisma` — add all new models + User relations |

## VERIFICATION AFTER IMPLEMENTATION

```bash
# 1. TypeScript must pass
npx tsc --noEmit

# 2. All migrations
npx prisma migrate dev --name stripe_payment_flow_and_audio
npx prisma generate

# 3. Test credit estimate — must NOT be 220cr for multi-model 10s clip
curl -X POST http://localhost:3000/api/generate/estimate \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -d '{"prompt":"blue sky then car chase then character dialogue","duration":10,"selectedModels":["kling-3.0","seedance-2.0","luma-ray3","ltx-2.3-fast"],"mode":"director"}'
# Expected: totalCredits 15-40 range (NOT 220)

# 4. Simple mode rate check
curl -X POST http://localhost:3000/api/generate/estimate \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -d '{"prompt":"sunset landscape","duration":15,"mode":"simple","tier":"cinematic"}'
# Expected: totalCredits = 24

# 5. Deposit creates payment intent
curl -X POST http://localhost:3000/api/payments/deposit \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -d '{"amountUSD": 50}'
# Expected: { clientSecret: "pi_xxx_secret_xxx", creditsToAdd: 800, platformFeeUSD: 10 }

# 6. Balance check
curl http://localhost:3000/api/credits/balance \
  -H "x-user-id: test-user"
# Expected: { credits: N, balanceUSD: N, stripeSync: N }

# 7. ElevenLabs TTS
curl -X POST http://localhost:3000/api/audio/synthesise \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -d '{"text":"Welcome to Cinematic Forge"}'
# Expected: { audioUrl: "https://...", cost: 1 }

# 8. Nano Banana image
curl -X POST http://localhost:3000/api/generate/image \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -d '{"prompt":"neon-lit Tokyo street","style":"cinematic","quality":"standard"}'
# Expected: { imageUrl: "https://..." }

# 9. Register Stripe webhook in dashboard:
# URL: https://forgecinema.vercel.app/api/webhooks/stripe
# Events: payment_intent.succeeded, payment_intent.payment_failed, charge.refunded
```
