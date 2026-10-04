import { falEndpoint } from '@cinema/core/endpoints'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { executeCompositorGraphToPng, type CompositorGraph } from '@/lib/compositor'
import { AI_MATTE_CREDITS } from '@/lib/compositor/vfx'
import { checkAccess } from '@/lib/access/guard'
import { runFal } from '@/lib/fal/client'
import { isGenerationPausedError } from '@/lib/generation/pause'
import { uploadToR2 } from '@/lib/storage/r2'
import { nanoid } from 'nanoid'

const schema = z.object({
  graph: z.object({
    nodes: z.array(z.unknown()),
    connections: z.array(z.unknown()),
    outputNodeId: z.string().optional(),
  }),
  mediaUrls: z.record(z.string(), z.string()).optional(),
})

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const nodes = parsed.data.graph.nodes as Array<{ params?: { aiMatte?: boolean } }>
  const wantsMatte = nodes.some((node) => node.params?.aiMatte === true)
  const confirmed = (body as { confirm?: boolean }).confirm === true

  try {
    const png = await executeCompositorGraphToPng(
      parsed.data.graph as CompositorGraph,
      { mediaUrls: parsed.data.mediaUrls },
    )

    const key = `compositor/${userId}/${nanoid()}.png`
    const url = await uploadToR2(png, key, 'image/png')
    if (!wantsMatte) return NextResponse.json({ url, key, size: png.length })
    if (!confirmed) {
      return NextResponse.json({
        url,
        key,
        size: png.length,
        estimateCredits: AI_MATTE_CREDITS,
        metered: true,
        aiMatte: 'quoted',
        note: 'BiRefNet is $0. Confirm to submit the matte. The manual roto is already in this image.',
      })
    }
    const access = await checkAccess(userId, AI_MATTE_CREDITS)
    if (!access.allowed) return NextResponse.json({ error: access.reason, url }, { status: access.code })
    const matte = await runFal(falEndpoint('birefnet'), { image_url: url, output_mask: true }, undefined, 120_000, undefined, undefined, 'compositor.ai-matte')
    const matteUrl = (matte as { image?: { url?: string } }).image?.url ?? null
    return NextResponse.json({ url, matteUrl, key, size: png.length, estimateCredits: AI_MATTE_CREDITS, libraryTake: true })
  } catch (err) {
    console.warn("[caught] src/app/api/studio/compositor/render/route.ts:41", err instanceof Error ? { name: err.name, message: err.message } : err)
    if (isGenerationPausedError(err)) {
      return NextResponse.json({ error: 'Generation is paused. The AI matte was not submitted.' }, { status: 503 })
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
