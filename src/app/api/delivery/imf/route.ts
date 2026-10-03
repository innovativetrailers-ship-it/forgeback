import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkAndDeductCredits } from '@/lib/credits'
import { packageIMF, type IMFPackageSpec } from '@/lib/delivery/IMFPackager'

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Partial<IMFPackageSpec> & { projectId?: string }
  try {
    body = await req.json()
  } catch (err) {
    console.warn("[caught] src/app/api/delivery/imf/route.ts:13", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { projectId, profile = 'APP2E', videoProfile = 'h264_level4', frameRate = 24,
    resolution = { width: 1920, height: 1080 }, colourSpace = 'Rec.709',
    audioBitDepth = 24, audioSampleRate = 48000, captions, dolbyVision, hdr10 } = body

  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 })

  const project = await db.project.findFirst({ where: { id: projectId, userId } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  try {
    await checkAndDeductCredits(userId, 'imf_package')
  } catch (err: unknown) {
    console.warn("[caught] src/app/api/delivery/imf/route.ts:28", err instanceof Error ? { name: err.name, message: err.message } : err)

    const msg = err instanceof Error ? err.message : 'Insufficient credits'
    return NextResponse.json({ error: msg }, { status: 402 })
  }

  const recipe = project.timelineJson as ReturnType<typeof JSON.parse> | null
  if (!recipe) return NextResponse.json({ error: 'No timeline data found' }, { status: 422 })

  // Collect video and audio URLs from the timeline
  const videoClips = recipe.tracks
    ?.filter((t: { type: string }) => t.type === 'video')
    .flatMap((t: { clips: Array<{ sourceUrl: string }> }) => t.clips)
    .filter((c: { sourceUrl: string }) => c.sourceUrl) ?? []

  const audioTracks = recipe.tracks
    ?.filter((t: { type: string }) => t.type === 'audio')
    .map((t: { clips: Array<{ sourceUrl: string }>; label: string }, i: number) => ({
      url: t.clips[0]?.sourceUrl ?? '',
      channels: 2,
      label: t.label ?? `Audio ${i + 1}`,
    }))
    .filter((t: { url: string }) => t.url) ?? []

  if (videoClips.length === 0) {
    return NextResponse.json({ error: 'No video clips found in timeline' }, { status: 422 })
  }

  const spec: IMFPackageSpec = {
    recipe,
    videoUrl: videoClips[0].sourceUrl,
    audioTracks,
    profile: profile as IMFPackageSpec['profile'],
    videoProfile: videoProfile as IMFPackageSpec['videoProfile'],
    frameRate,
    resolution,
    colourSpace: colourSpace as IMFPackageSpec['colourSpace'],
    audioBitDepth: audioBitDepth as 16 | 24,
    audioSampleRate: audioSampleRate as 48000 | 96000,
    captions,
    dolbyVision,
    hdr10,
  }

  try {
    const imfResponse = await packageIMF(spec)
    const zipBuffer = Buffer.from(await imfResponse.arrayBuffer())
    const packageId = `imf_${Date.now()}`

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${packageId}.zip"`,
        'Content-Length': String(zipBuffer.byteLength),
      },
    })
  } catch (err: unknown) {
    console.warn("[caught] src/app/api/delivery/imf/route.ts:84", err instanceof Error ? { name: err.name, message: err.message } : err)

    const msg = err instanceof Error ? err.message : 'IMF packaging failed'
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch')) {
      return NextResponse.json(
        { error: 'IMF service unavailable. Ensure the Python IMF service is running on port 7433.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
