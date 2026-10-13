import { claudeCall } from '@/lib/llm/anthropicClient'
import { renderQueue } from '@/lib/queue'

export type BlendMode = 'seamless' | 'conservative' | 'aggressive'

export interface MaskArea {
  x: number; y: number; w: number; h: number  // normalised 0–1
}

export interface RemovalRequest {
  clipId: string
  videoUrl: string
  frameUrl?: string
  objectDescription: string
  maskArea?: MaskArea
  includeArtifacts: boolean
  blendMode: BlendMode
  userId: string
}

export interface RemovalJobPayload {
  jobId: string
  clipId: string
  videoUrl: string
  maskArea: MaskArea
  includeArtifacts: boolean
  blendMode: BlendMode
  objectDescription: string
  userId: string
  falRequestId?: string
}

export interface ObjectAnalysis {
  objectPresent: boolean
  maskSuggestion: MaskArea
  artifacts: string[]
  inpaintingStrategy: string
}

function isMaskArea(v: unknown): v is MaskArea {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.x === 'number' && typeof o.y === 'number' &&
    typeof o.w === 'number' && typeof o.h === 'number'
}

function isObjectAnalysis(v: unknown): v is ObjectAnalysis {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.objectPresent === 'boolean' && isMaskArea(o.maskSuggestion) &&
    Array.isArray(o.artifacts) && (o.artifacts as unknown[]).every((a) => typeof a === 'string') &&
    typeof o.inpaintingStrategy === 'string'
}

export function isRemovalJobPayload(v: unknown): v is RemovalJobPayload {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.jobId === 'string' && typeof o.clipId === 'string' &&
    typeof o.videoUrl === 'string' && isMaskArea(o.maskArea) &&
    typeof o.includeArtifacts === 'boolean' && typeof o.blendMode === 'string' &&
    ['seamless', 'conservative', 'aggressive'].includes(o.blendMode as string) &&
    typeof o.objectDescription === 'string' && typeof o.userId === 'string'
}

// ─── Claude vision analysis ───────────────────────────────────────────────────

export async function analyzeObjectWithClaude(
  imageUrl: string,
  objectDescription: string,
): Promise<ObjectAnalysis> {
  const response = await claudeCall({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system: `You are a video inpainting analyst. Analyse images and return JSON bounding box data for object removal.
Output ONLY valid JSON:
{ "objectPresent": bool, "maskSuggestion": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 }, "artifacts": ["shadow", "reflection"], "inpaintingStrategy": "string" }
Coordinates are normalised 0–1 (top-left origin). maskSuggestion should include 10% padding around the object.`,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'url', url: imageUrl } },
        { type: 'text', text: `Find and return a bounding box mask for: "${objectDescription}". Include artifacts like shadows and reflections in your analysis.` },
      ],
    }],
  }, { source: 'vfx.objremoval' })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('No response from Claude')

  let jsonText = (textBlock.text ?? '').trim()
  const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) jsonText = fence[1].trim()

  let parsed: unknown
  try { parsed = JSON.parse(jsonText) } catch {
    throw new Error('Failed to parse Claude mask analysis')
  }

  if (!isObjectAnalysis(parsed)) {
    // Return safe fallback — center 50% of frame
    return {
      objectPresent: true,
      maskSuggestion: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
      artifacts: [],
      inpaintingStrategy: 'seamless fill',
    }
  }

  return parsed
}

// ─── Queue removal job ────────────────────────────────────────────────────────

export async function queueObjectRemoval(req: RemovalRequest): Promise<{ jobId: string; estimatedSeconds: number }> {
  const jobId = `removal_${Date.now()}_${req.clipId.slice(-6)}`

  // Get mask — either provided by caller or via Claude analysis
  let maskArea: MaskArea
  if (req.maskArea) {
    maskArea = req.maskArea
  } else {
    const imageUrl = req.frameUrl ?? req.videoUrl
    const analysis = await analyzeObjectWithClaude(imageUrl, req.objectDescription)
    maskArea = analysis.maskSuggestion
  }

  const payload: RemovalJobPayload = {
    jobId,
    clipId: req.clipId,
    videoUrl: req.videoUrl,
    maskArea,
    includeArtifacts: req.includeArtifacts,
    blendMode: req.blendMode,
    objectDescription: req.objectDescription,
    userId: req.userId,
  }

  await renderQueue.add('object_removal', payload, {
    jobId,
    priority: 10,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  })

  return { jobId, estimatedSeconds: 120 }
}
