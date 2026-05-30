/* eslint-disable @typescript-eslint/no-explicit-any */
import { MODEL_COSTS, MODEL_SPECIALTIES, FAL_MODEL_IDS, TIER_ENGINE_MAP } from './engineRegistry'
import { calculateGenerationCost, calculateOrchestrationCost } from '../credits'

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

async function segmentPrompt(
  prompt:          string,
  totalDuration:   number,
  availableModels: string[]
): Promise<Omit<ClipSegment, 'assignedModel' | 'creditCost'>[]> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         process.env.ANTHROPIC_API_KEY!,
      'content-type':      'application/json',
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
    return [{
      startSeconds: 0,
      endSeconds:   totalDuration,
      duration:     totalDuration,
      contentType:  'general',
      motion:       'medium' as const,
      hasDialogue:  false,
      hasFaces:     false,
      hasCGI:       false,
      complexity:   'moderate' as const,
    }]
  }
}

function assignModelToSegment(
  segment:         Omit<ClipSegment, 'assignedModel' | 'creditCost'>,
  availableModels: string[]
): string {
  const scores: Record<string, number> = {}

  for (const model of availableModels) {
    let score = 0
    const spec = MODEL_SPECIALTIES[model]
    if (!spec) continue

    if (segment.hasFaces    && spec.strengths.includes('facial_consistency'))      score += 25
    if (segment.hasFaces    && spec.strengths.includes('character_detail'))         score += 20
    if (segment.hasDialogue && spec.strengths.includes('lip_sync'))                 score += 25
    if (segment.hasDialogue && spec.strengths.includes('dialogue'))                 score += 20
    if (segment.hasCGI      && spec.strengths.includes('cgi_vfx'))                 score += 40
    if (segment.hasCGI      && spec.strengths.includes('fluid_dynamics'))          score += 25
    if (segment.hasCGI      && spec.strengths.includes('particles'))               score += 30
    if (segment.hasCGI      && spec.strengths.includes('3d_character_animation'))  score += 35
    if (segment.motion === 'fast'    && spec.strengths.includes('locomotion'))     score += 20
    if (segment.motion === 'complex' && spec.strengths.includes('action_choreography')) score += 30
    if (segment.contentType.includes('aerial')      && spec.strengths.includes('aerial'))      score += 25
    if (segment.contentType.includes('crowd')       && spec.strengths.includes('crowd'))       score += 25
    if (segment.contentType.includes('vehicle')     && spec.strengths.includes('locomotion'))  score += 15
    if (segment.contentType.includes('product')     && spec.strengths.includes('product'))     score += 20
    if (segment.contentType.includes('atmospheric') && spec.strengths.includes('atmospheric')) score += 30
    if (segment.duration > 15 && spec.strengths.includes('infinite_length'))  score += 30
    if (segment.duration > 15 && spec.strengths.includes('long_form'))        score += 20

    if (segment.complexity === 'simple')   score -= MODEL_COSTS[model] * 1.2
    if (segment.complexity === 'moderate') score -= MODEL_COSTS[model] * 0.3

    scores[model] = score
  }

  if (Object.keys(scores).length === 0) return availableModels[0]
  return availableModels.reduce((best, model) =>
    (scores[model] ?? -999) > (scores[best] ?? -999) ? model : best
  , availableModels[0])
}

export async function orchestrateMultiModelGeneration(
  prompt:         string,
  totalDuration:  number,
  selectedModels: string[]
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

export async function callEngine(params: {
  model:     string
  prompt:    string
  duration:  number
  imageUrl?: string
}): Promise<{ videoUrl?: string; imageUrl?: string; jobId: string }> {

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

  // Everything else — FAL (covers all 20+ models via single key)
  const falModelId = FAL_MODEL_IDS[params.model]
  if (!falModelId) throw new Error(`Unknown model: ${params.model}`)

  const input: Record<string, unknown> = {
    prompt:       params.prompt,
    duration:     params.duration,
    aspect_ratio: '16:9',
    resolution:   '1080p',
  }
  if (params.imageUrl)                  input.image_url = params.imageUrl
  if (params.model === 'ltx-2.3-fast') input.quality   = 'fast'

  const result: any = await fetch(`https://fal.run/${falModelId}`, {
    method:  'POST',
    headers: {
      Authorization:  `Key ${process.env.FAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input }),
  }).then(r => r.json())

  return {
    videoUrl: result.video?.url ?? result.video_url ?? result.image?.url,
    imageUrl: result.image?.url,
    jobId:    result.request_id ?? `fal_${Date.now()}`,
  }
}

export { TIER_ENGINE_MAP }
