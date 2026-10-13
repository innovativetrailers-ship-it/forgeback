import { rememberObject } from '@/lib/storage/objects'
import { opaqueObjectKey } from '@/lib/upload/sniff'
import { falEndpoint } from '@cinema/core/endpoints'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { executeCompositorGraphToPng, type CompositorGraph } from '@/lib/compositor'
import { AI_MATTE_CREDITS } from '@/lib/compositor/vfx'
import { checkAccess } from '@/lib/access/guard'
import { EscrowError, withCreditHold } from '@/lib/billing/withCreditHold'
import { runFal } from '@/lib/fal/client'
import { isGenerationPausedError } from '@/lib/generation/pause'
import { uploadToR2 } from '@/lib/storage/r2'
import { nanoid } from 'nanoid'
import { requireUser } from '@/lib/auth/requireUser'

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
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const nodes = parsed.data.graph.nodes as Array<{ params?: { aiMatte?: boolean; cutout?: boolean; subjectUrl?: string } }>
  const wantsMatte = nodes.some((node) => node.params?.aiMatte === true)
  const cutout = nodes.some((node) => node.params?.cutout === true)
  const confirmed = (body as { confirm?: boolean }).confirm === true
  const consent = (body as { consent?: boolean }).consent === true
  const subjectUrl = nodes.find((node) => typeof node.params?.subjectUrl === 'string')?.params?.subjectUrl

  if (cutout && wantsMatte && !confirmed) {
    return NextResponse.json({
      estimateCredits: AI_MATTE_CREDITS,
      metered: true,
      perFrame: true,
      note: 'BiRefNet keys one still. This is not a video matte. The published price is $0 per compute second. Confirm to submit. A paused server still refuses the call.',
    })
  }

  if (cutout && wantsMatte && confirmed) {
    if (!consent) {
      return NextResponse.json({ error: 'Consent is required before a neural matte. The still was not submitted.' }, { status: 400 })
    }
    if (!subjectUrl) {
      return NextResponse.json({ error: 'A subject image is required.' }, { status: 400 })
    }
    const access = await checkAccess(userId, AI_MATTE_CREDITS)
    if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code })
    try {
      const matte = await withCreditHold(userId, AI_MATTE_CREDITS, () => runFal(
        falEndpoint('birefnet'),
        { image_url: subjectUrl },
        undefined,
        120_000,
        undefined,
        undefined,
        'greenscreen.remove-background',
      ))
      const cutoutRemote = (matte as { image?: { url?: string } }).image?.url
      if (!cutoutRemote) return NextResponse.json({ error: 'BiRefNet returned no cutout.' }, { status: 502 })
      const png = await executeCompositorGraphToPng(parsed.data.graph as CompositorGraph, {
        mediaUrls: { ...(parsed.data.mediaUrls ?? {}), subject: cutoutRemote },
      })
      const key = opaqueObjectKey('png')
      await rememberObject(userId, key)
      const url = await uploadToR2(png, key, 'image/png')
      return NextResponse.json({
        url,
        cutoutUrl: cutoutRemote,
        key,
        perFrame: true,
        libraryTake: true,
        estimateCredits: AI_MATTE_CREDITS,
        note: 'Per-frame BiRefNet on one still. Not a video-quality matte. The original file was not replaced. C2PA is not embedded; this take is marked AI-modified.',
      })
    } catch (err) {
      console.warn('[greenscreen]', err instanceof Error ? err.message : err)
      if (err instanceof EscrowError) return NextResponse.json({ error: err.message }, { status: 402 })
    if (isGenerationPausedError(err)) {
        return NextResponse.json({ error: 'Generation is paused. The AI matte was not submitted.' }, { status: 503 })
      }
      return NextResponse.json({ error: err instanceof Error ? err.message : 'The matte did not run' }, { status: 502 })
    }
  }

  try {
    const png = await executeCompositorGraphToPng(
      parsed.data.graph as CompositorGraph,
      { mediaUrls: parsed.data.mediaUrls },
    )

    const key = opaqueObjectKey('png')
    await rememberObject(userId, key)
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
    if (!consent) {
      return NextResponse.json({ error: 'Consent is required before a neural matte. The still was not submitted.', url }, { status: 400 })
    }
    const access = await checkAccess(userId, AI_MATTE_CREDITS)
    if (!access.allowed) return NextResponse.json({ error: access.reason, url }, { status: access.code })
    const matte = await withCreditHold(userId, AI_MATTE_CREDITS, () => runFal(falEndpoint('birefnet'), { image_url: url, output_mask: true }, undefined, 120_000, undefined, undefined, 'compositor.ai-matte'))
    const matteUrl = (matte as { image?: { url?: string } }).image?.url ?? null
    return NextResponse.json({ url, matteUrl, key, size: png.length, estimateCredits: AI_MATTE_CREDITS, libraryTake: true })
  } catch (err) {
    console.warn("[caught] src/app/api/studio/compositor/render/route.ts:41", err instanceof Error ? { name: err.name, message: err.message } : err)
    if (err instanceof EscrowError) return NextResponse.json({ error: err.message }, { status: 402 })
    if (isGenerationPausedError(err)) {
      return NextResponse.json({ error: 'Generation is paused. The AI matte was not submitted.' }, { status: 503 })
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
