import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { executeCompositorGraphToPng, type CompositorGraph } from '@/lib/compositor'
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
  if (wantsMatte && !confirmed) {
    return NextResponse.json({ estimateCredits: 8, metered: true, note: 'AI matte is priced. The manual roto still renders.' })
  }

  try {
    const png = await executeCompositorGraphToPng(
      parsed.data.graph as CompositorGraph,
      { mediaUrls: parsed.data.mediaUrls },
    )

    const key = `compositor/${userId}/${nanoid()}.png`
    const url = await uploadToR2(png, key, 'image/png')

    return NextResponse.json({ url, key, size: png.length })
  } catch (err) {
    console.warn("[caught] src/app/api/studio/compositor/render/route.ts:41", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
