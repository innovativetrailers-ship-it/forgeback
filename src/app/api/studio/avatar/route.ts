import { falEndpoint } from '@cinema/core/endpoints'
import { NextRequest, NextResponse } from 'next/server'
import { checkAccess } from '@/lib/access/guard'
import { EscrowError, withCreditHold } from '@/lib/billing/withCreditHold'
import { runFal } from '@/lib/fal/client'
import { isGenerationPausedError } from '@/lib/generation/pause'
import { uploadToR2 } from '@/lib/storage/r2'
import { omniCredits, omniMaxSeconds, splitPerformance, type OmniResolution } from '@/lib/orchestration/omniHuman'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[avatar]', err instanceof Error ? err.message : err)
    return null
  }) as {
    imageUrl?: string
    audioUrl?: string
    seconds?: number
    resolution?: OmniResolution
    prompt?: string
    likenessConsent?: boolean
    audioRights?: boolean
    notMinor?: boolean
    confirm?: boolean
  } | null
  const resolution: OmniResolution = body?.resolution === '720p' ? '720p' : '1080p'
  const seconds = Math.max(1, Math.ceil(body?.seconds ?? 0))
  const max = omniMaxSeconds(resolution)
  const parts = splitPerformance(seconds, resolution)
  if (!body?.imageUrl || !body.audioUrl) {
    return NextResponse.json({ error: 'A portrait and an audio file are required', parts, max }, { status: 400 })
  }
  if (seconds > max) {
    return NextResponse.json({
      error: `This is longer than ${max}s at ${resolution}. It is split into ${parts.join('s, ')}s and was not truncated or submitted.`,
      parts,
    }, { status: 400 })
  }
  const estimateCredits = omniCredits(seconds)
  if (!body.confirm) return NextResponse.json({ estimateCredits, metered: true, parts, max })
  if (body.likenessConsent !== true || body.audioRights !== true || body.notMinor !== true) {
    return NextResponse.json({ error: 'Likeness, audio rights, and a not-a-minor confirmation are required' }, { status: 400 })
  }
  const access = await checkAccess(userId, estimateCredits)
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code })
  try {
    const data = await withCreditHold(userId, estimateCredits, () => runFal(
      falEndpoint('bytedance/omnihuman/v1.5'),
      { image_url: body.imageUrl, audio_url: body.audioUrl, resolution, turbo_mode: false, prompt: body.prompt?.slice(0, 400) },
      undefined,
      12 * 60_000,
      undefined,
      undefined,
      'omnihuman',
    ))
    const remote = (data as { video?: { url?: string } }).video?.url
    if (!remote) return NextResponse.json({ error: 'OmniHuman did not return a video' }, { status: 502 })
    const stored = await uploadToR2(Buffer.from(await (await fetch(remote)).arrayBuffer()), `avatar/${userId}/${Date.now()}.mp4`, 'video/mp4')
    return NextResponse.json({
      videoUrl: stored,
      estimateCredits,
      libraryTake: true,
      note: 'AI-generated talking portrait. C2PA is not embedded. The original files were not replaced.',
    })
  } catch (err) {
    console.warn('[avatar]', err instanceof Error ? err.message : err)
    if (err instanceof EscrowError) return NextResponse.json({ error: err.message }, { status: 402 })
    if (isGenerationPausedError(err)) {
      return NextResponse.json({ error: 'Generation is paused. The avatar was not submitted.' }, { status: 503 })
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'The avatar did not run' }, { status: 502 })
  }
}
