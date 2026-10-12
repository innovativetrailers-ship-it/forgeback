import { falEndpoint } from '@cinema/core/endpoints'
import { NextRequest, NextResponse } from 'next/server'
import { uploadToR2 } from '@/lib/storage/r2'
import { relightImage } from '@/lib/fal/lighting'
import { runFal, extractImageUrl } from '@/lib/fal/client'
import type { MaskOperation } from '@/lib/playback/interactiveTypes'
import { requireUser } from '@/lib/auth/requireUser'

export const runtime = 'nodejs'
export const maxDuration = 120

interface AiEditBody {
  frameB64:  string
  maskB64?:  string
  operation: MaskOperation
  prompt?:   string
  relight?:  { intensity: number; colorTemp: number; direction: { x: number; y: number } }
}

// Server-composed prompts keep frame-editing on-brand and prevent the client
// from injecting arbitrary fill instructions for the non-prompt operations.
const OP_PROMPTS: Record<MaskOperation, string> = {
  remove:       'Clean background continuation, seamless fill, photorealistic, remove the masked subject',
  fill_ai:      'seamless photorealistic fill',
  correct:      'Fix visual artifacts, correct generation defects, clean and seamless',
  relight_mask: '', // handled by relightImage
  add_gore:     'Realistic practical film makeup FX, seamlessly integrated, professional',
}

interface FluxFillResult {
  images?: Array<{ url: string }>
  image?:  { url: string }
}

function decodeB64(b64: string): Buffer {
  return Buffer.from(b64.replace(/^data:[^,]+,/, ''), 'base64')
}

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: AiEditBody
  try {
    body = (await req.json()) as AiEditBody
  } catch (err) {
    console.warn("[caught] src/app/api/clips/ai-edit/route.ts:44", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { frameB64, maskB64, operation, prompt, relight } = body
  if (!frameB64 || !operation) {
    return NextResponse.json({ error: 'frameB64 and operation are required' }, { status: 400 })
  }

  try {
    const stamp = `${userId}/${Date.now()}`
    const frameUrl = await uploadToR2(decodeB64(frameB64), `edits/${stamp}_frame.jpg`, 'image/jpeg')
    const maskUrl = maskB64
      ? await uploadToR2(decodeB64(maskB64), `edits/${stamp}_mask.png`, 'image/png')
      : undefined

    // IC-Light relight — full-frame, reuses the existing lighting helper.
    if (operation === 'relight_mask') {
      const dir = relight?.direction ?? { x: 0, y: -0.5 }
      const dirPrompt =
        dir.x > 0.3 ? 'light from the right' :
        dir.x < -0.3 ? 'light from the left' :
        dir.y < -0.3 ? 'light from above' :
        dir.y > 0.3 ? 'light from below' : 'soft ambient light'
      const temp = relight?.colorTemp ?? 5600
      const tempPrompt =
        temp < 4000 ? 'warm golden light' :
        temp > 6000 ? 'cool blue daylight' : 'neutral white light'
      const { imageUrl } = await relightImage({
        imageUrl: frameUrl,
        prompt: `${dirPrompt}, ${tempPrompt}, intensity ${(relight?.intensity ?? 1).toFixed(1)}, photorealistic`,
      })
      return NextResponse.json({ url: imageUrl })
    }

    // Inpaint-style operations (remove / fill / correct / gore) require a mask.
    if (!maskUrl) {
      return NextResponse.json({ error: 'A selection mask is required for this operation' }, { status: 400 })
    }

    const finalPrompt =
      operation === 'fill_ai' || operation === 'add_gore'
        ? `${prompt?.trim() || OP_PROMPTS[operation]}, ${OP_PROMPTS.fill_ai}`
        : OP_PROMPTS[operation]

    const result = await runFal<FluxFillResult>(falEndpoint('flux-pro/v1/fill'), {
      image_url: frameUrl,
      mask_url: maskUrl,
      prompt: finalPrompt,
      enhance_prompt: true,
    })

    const url = extractImageUrl(result)
    if (!url) return NextResponse.json({ error: 'Edit produced no image' }, { status: 502 })
    return NextResponse.json({ url })
  } catch (err) {
    console.warn("[caught] src/app/api/clips/ai-edit/route.ts:99", err instanceof Error ? { name: err.name, message: err.message } : err)

    const message = err instanceof Error ? err.message : 'AI edit failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
