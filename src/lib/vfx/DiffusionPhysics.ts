/**
 * Diffusion-based physics simulation for VFX (E09).
 * Calls fal.ai video-to-video with physics-conditioned prompts.
 */
import { falEndpoint } from '@cinema/core/endpoints'
import { fal, falSubscribeBound} from '@/lib/fal/client'
const falSubscribe = falSubscribeBound('lib.vfx.DiffusionPhysics')
import { randomUUID } from 'crypto'
import { uploadToR2 } from '@/lib/storage/r2'

export interface PhysicsParams {
  videoUrl: string
  prompt: string   // e.g. "water splashing", "fire spreading"
  intensity: number  // 0.0–1.0
}

export interface PhysicsResult {
  outputUrl: string
  framesProcessed: number
}

interface FalVideoResponse {
  video: { url: string }
  num_frames?: number
}

function isFalVideoResponse(v: unknown): v is FalVideoResponse {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (typeof o.video !== 'object' || o.video === null) return false
  return typeof (o.video as Record<string, unknown>).url === 'string'
}

function buildPhysicsPrompt(userPrompt: string, intensity: number): string {
  const strengthWord =
    intensity < 0.3 ? 'subtle, barely visible' :
    intensity < 0.6 ? 'moderate, clearly visible' :
    intensity < 0.8 ? 'strong, dramatic' :
    'extreme, overwhelming'

  return `Physically accurate ${userPrompt}. Effect intensity: ${strengthWord}. Maintain photorealistic lighting and shadows. Preserve original scene composition and camera angle.`
}

export async function applyDiffusionPhysics(params: PhysicsParams): Promise<PhysicsResult> {
  const { videoUrl, prompt, intensity } = params

  if (!videoUrl) throw new Error('[DiffusionPhysics] videoUrl is required')
  if (!prompt.trim()) throw new Error('[DiffusionPhysics] prompt is required')
  if (intensity < 0 || intensity > 1) throw new Error(`[DiffusionPhysics] intensity ${intensity} out of range (0.0–1.0)`)

  const physicsPrompt = buildPhysicsPrompt(prompt, intensity)
  const strength = 0.3 + intensity * 0.5

  let falResult: unknown
  try {
    falResult = await falSubscribe(falEndpoint('wan/v2.2/a14b/video-to-video'), {
      input: {
        video_url: videoUrl,
        prompt: physicsPrompt,
        strength,
        negative_prompt: 'cartoon, anime, drawing, blurry, artifacts',
        num_inference_steps: 30,
        guidance_scale: 7.5,
      },
      pollInterval: 3000,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'fal.ai call failed'
    throw new Error(`[DiffusionPhysics] Physics simulation failed: ${message}`)
  }

  if (!isFalVideoResponse(falResult)) {
    throw new Error('[DiffusionPhysics] Unexpected fal.ai response shape')
  }

  const response = await fetch(falResult.video.url)
  if (!response.ok) throw new Error(`[DiffusionPhysics] Fetch failed: HTTP ${response.status}`)

  const buffer = Buffer.from(await response.arrayBuffer())
  const r2Key = `physics/${randomUUID()}.mp4`
  const outputUrl = await uploadToR2(buffer, r2Key, 'video/mp4')

  return {
    outputUrl,
    framesProcessed: typeof falResult.num_frames === 'number' ? falResult.num_frames : 0,
  }
}
