import { falEndpoint } from '@cinema/core/endpoints'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkAccess } from '@/lib/access/guard'
import { extractImageUrl, runFal } from '@/lib/fal/client'
import { extractVideoFrame } from '@/lib/fal/frameExtract'
import { GENERATIVE_EDIT_CREDITS } from '@/lib/timeline/timeRemap'

const ENGINES = {
  inpaint: 'wan-vace-14b/inpainting',
  void: 'void-video-inpainting',
  restyle: 'hunyuan-video/video-to-video',
  swap: 'pika/v2/pikaswaps',
  bridge: 'kling-video/o1/image-to-video',
  extend: 'kling-video/o1/image-to-video',
} as const

type Op = 'inpaint' | 'bridge' | 'extend'

function videoUrlOf(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const row = data as { video?: { url?: string }; video_url?: string; audio?: { url?: string }; audio_url?: string }
  return row.video?.url
    || (typeof row.video_url === 'string' ? row.video_url : null)
    || row.audio?.url
    || (typeof row.audio_url === 'string' ? row.audio_url : null)
    || extractImageUrl(data)
    || null
}

const TOOLS = {
  upscale: 'video-upscaler',
  denoise: 'topaz/upscale/video',
  sharpen: 'topaz/upscale/video',
  depth: 'imageutils/depth',
  relight: 'iclight-v2',
  isolate: 'elevenlabs/audio-isolation',
} as const

type Tool = keyof typeof TOOLS

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ items: [] })
  const items = await db.asset.findMany({
    where: {
      ownerId: userId,
      OR: [
        { label: { contains: q, mode: 'insensitive' } },
        { sourcePrompt: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: 12,
    select: { id: true, label: true, sourcePrompt: true },
  })
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[timeline-edit] body', err instanceof Error ? err.message : err)
    return null
  }) as {
    op?: Op
    confirm?: boolean
    prompt?: string
    engine?: keyof typeof ENGINES
    videoUrl?: string
    otherVideoUrl?: string
    parentClipId?: string
    tool?: Tool
    scale?: number
    mood?: string
    mask?: { x: number; y: number; w: number; h: number }
    fast?: boolean
  } | null
  if (body?.tool && TOOLS[body.tool]) {
    return runTool(userId, body.tool, body)
  }
  const op = body?.op
  if (op !== 'inpaint' && op !== 'bridge' && op !== 'extend') {
    return NextResponse.json({ error: 'op must be inpaint, bridge, or extend' }, { status: 400 })
  }
  if (!body?.confirm) {
    return NextResponse.json({ confirm: false, estimateCredits: GENERATIVE_EDIT_CREDITS })
  }
  const prompt = body.prompt?.trim()
  const videoUrl = body.videoUrl?.trim()
  if (!prompt || !videoUrl?.startsWith('http')) {
    return NextResponse.json({ error: 'A prompt and a video URL are required' }, { status: 400 })
  }
  const access = await checkAccess(userId, GENERATIVE_EDIT_CREDITS)
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code })
  const engineKey = body.engine && ENGINES[body.engine] ? body.engine : (op === 'inpaint' ? 'inpaint' : 'bridge')
  try {
    let input: Record<string, unknown>
    if (op === 'inpaint') {
      input = { prompt, video_url: videoUrl }
    } else if (op === 'bridge') {
      const other = body.otherVideoUrl?.trim()
      if (!other?.startsWith('http')) return NextResponse.json({ error: 'A second clip is required for a bridge' }, { status: 400 })
      const start = await extractVideoFrame(videoUrl, { frameType: 'last' })
      const end = await extractVideoFrame(other, { frameType: 'first' })
      input = { prompt, start_image_url: start, end_image_url: end, duration: '5' }
    } else {
      const start = await extractVideoFrame(videoUrl, { frameType: 'last' })
      input = { prompt, start_image_url: start, duration: '5' }
    }
    const result = await runFal<unknown>(falEndpoint(ENGINES[engineKey]), input, undefined, 1_200_000, undefined, undefined, `timeline.${op}`)
    const takeUrl = videoUrlOf(result)
    if (!takeUrl) return NextResponse.json({ error: 'The edit returned no video' }, { status: 502 })
    await db.asset.create({
      data: {
        ownerId: userId,
        kind: 'asset',
        sourcePrompt: prompt,
        sourceRefs: [takeUrl],
        generatedImage: takeUrl,
        usableAsReference: true,
        isPrimary: false,
        label: `${op} take`,
        mediaKind: 'video',
        resolutionState: 'generated',
        boundary: {
          op: {
            type: op === 'inpaint' ? 'fx-inpaint' : op,
            parentClipId: body.parentClipId ?? '',
            engine: ENGINES[engineKey],
            prompt,
            mask: body.mask ?? null,
            fast: Boolean(body.fast),
            accepted: false,
          },
        },
      },
    })
    return NextResponse.json({ takeUrl, estimateCredits: GENERATIVE_EDIT_CREDITS })
  } catch (err) {
    console.warn('[timeline-edit]', err instanceof Error ? err.message : err)
    const message = err instanceof Error ? err.message : 'The edit did not run'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

async function runTool(
  userId: string,
  tool: Tool,
  body: { confirm?: boolean; prompt?: string; videoUrl?: string; parentClipId?: string; scale?: number; mood?: string },
) {
  if (!body.confirm) return NextResponse.json({ confirm: false, estimateCredits: GENERATIVE_EDIT_CREDITS, tool })
  const videoUrl = body.videoUrl?.trim()
  if (!videoUrl?.startsWith('http')) return NextResponse.json({ error: 'A video URL is required' }, { status: 400 })
  const access = await checkAccess(userId, GENERATIVE_EDIT_CREDITS)
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code })
  const scale = body.scale === 3 || body.scale === 4 ? body.scale : 2
  try {
    let endpoint = falEndpoint(TOOLS[tool])
    let input: Record<string, unknown>
    if (tool === 'upscale') input = { video_url: videoUrl, scale }
    else if (tool === 'denoise') input = { video_url: videoUrl, upscale_factor: 2, model: 'Nyx' }
    else if (tool === 'sharpen') input = { video_url: videoUrl, upscale_factor: 2, model: 'Starlight Sharp' }
    else if (tool === 'isolate') input = { video_url: videoUrl }
    else {
      const frame = await extractVideoFrame(videoUrl, { frameType: 'middle' })
      if (tool === 'depth') input = { image_url: frame }
      else input = { image_url: frame, prompt: body.mood?.trim() || body.prompt?.trim() || 'soft key light from the left' }
    }
    const result = await runFal<unknown>(endpoint, input, undefined, 1_200_000, undefined, undefined, `timeline.${tool}`)
    const takeUrl = videoUrlOf(result)
    if (!takeUrl) return NextResponse.json({ error: 'The tool returned no media' }, { status: 502 })
    await db.asset.create({
      data: {
        ownerId: userId,
        kind: 'asset',
        sourcePrompt: body.prompt?.trim() || tool,
        sourceRefs: [takeUrl],
        generatedImage: takeUrl,
        usableAsReference: true,
        isPrimary: false,
        label: `${tool} take`,
        mediaKind: tool === 'isolate' ? 'audio' : 'video',
        resolutionState: 'generated',
        boundary: {
          op: { type: tool, parentClipId: body.parentClipId ?? '', engine: TOOLS[tool], accepted: false },
        },
      },
    })
    return NextResponse.json({ takeUrl, estimateCredits: GENERATIVE_EDIT_CREDITS, tool })
  } catch (err) {
    console.warn('[timeline-tool]', err instanceof Error ? err.message : err)
    const message = err instanceof Error ? err.message : 'The tool did not run'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
