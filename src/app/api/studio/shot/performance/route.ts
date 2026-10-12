import { falEndpoint } from '@cinema/core/endpoints'
import { NextRequest, NextResponse } from 'next/server'
import { checkAccess } from '@/lib/access/guard'
import { runFal } from '@/lib/fal/client'
import { isGenerationPausedError } from '@/lib/generation/pause'
import { db } from '@/lib/db'
import { signedUrlForStoredKey } from '@/lib/media/resolveStoredMedia'
import { objectKeyFromStored } from '@/lib/storage/r2'
import { omniCredits, omniMaxSeconds, splitPerformance, type OmniResolution } from '@/lib/orchestration/omniHuman'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[omnihuman]', err instanceof Error ? err.message : err)
    return null
  }) as {
    projectId?: string
    shotId?: string
    resolution?: OmniResolution
    prompt?: string
    maskUrl?: string
    likenessConsent?: boolean
    audioRights?: boolean
    confirm?: boolean
  } | null
  if (!body?.projectId || !body.shotId) {
    return NextResponse.json({ error: 'A performance shot needs a project and a shot' }, { status: 400 })
  }
  const resolution: OmniResolution = body.resolution === '720p' ? '720p' : '1080p'
  const clip = await db.studioClip.findFirst({
    where: { id: body.shotId, scene: { projectId: body.projectId } },
    select: { duration: true, keyframeUrl: true, anchorFrameUrl: true },
  })
  if (!clip) return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
  const max = omniMaxSeconds(resolution)
  if (clip.duration > max) {
    return NextResponse.json({
      error: `This audio is longer than ${max}s at ${resolution}. Split it into shots.`,
      split: splitPerformance(clip.duration, resolution),
    }, { status: 400 })
  }
  const estimateCredits = omniCredits(clip.duration)
  if (!body.confirm) return NextResponse.json({ estimateCredits, metered: true })
  if (body.likenessConsent !== true || body.audioRights !== true) {
    return NextResponse.json({ error: 'Likeness consent and audio rights are required' }, { status: 400 })
  }
  const imageUrl = clip.anchorFrameUrl || clip.keyframeUrl
  if (!imageUrl) return NextResponse.json({ error: 'A performance shot needs a still of the performer' }, { status: 400 })
  const line = await db.audioTrack.findFirst({
    where: { projectId: body.projectId, shotPlanId: body.shotId, type: 'DIALOGUE' },
  })
  if (!line?.url) return NextResponse.json({ error: 'Select a voice or vocal take first' }, { status: 400 })
  const key = objectKeyFromStored(line.url)
  const audioUrl = key ? await signedUrlForStoredKey(key) : line.url
  if (!audioUrl) return NextResponse.json({ error: 'The vocal is not stored' }, { status: 404 })
  const access = await checkAccess(userId, estimateCredits)
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code })
  try {
    const input: Record<string, unknown> = {
      image_url: imageUrl,
      audio_url: audioUrl,
      resolution,
      turbo_mode: false,
    }
    const prompt = body.prompt?.trim()
    if (prompt) input.prompt = prompt.slice(0, 400)
    if (body.maskUrl?.trim()) input.mask_url = body.maskUrl.trim()
    const data = await runFal(falEndpoint('bytedance/omnihuman/v1.5'), input, undefined, 12 * 60_000, undefined, undefined, 'omnihuman')
    const videoUrl = (data as { video?: { url?: string } }).video?.url
    if (!videoUrl) return NextResponse.json({ error: 'OmniHuman did not return a video' }, { status: 502 })
    return NextResponse.json({ videoUrl, estimateCredits, libraryTake: true })
  } catch (err) {
    console.warn('[omnihuman]', err instanceof Error ? err.message : err)
    if (isGenerationPausedError(err)) {
      return NextResponse.json({ error: 'Generation is paused. The performance was not submitted.' }, { status: 503 })
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'The performance did not run' }, { status: 502 })
  }
}
