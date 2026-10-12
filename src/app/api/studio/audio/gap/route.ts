import { buildWhisperSttInput, falEndpoint } from '@cinema/core/endpoints'
import { NextRequest, NextResponse } from 'next/server'
import { checkAccess } from '@/lib/access/guard'
import { runFal } from '@/lib/fal/client'
import { speakerRanges, type TranscriptWord } from '@/lib/editor/gapFixes'
import { requireUser } from '@/lib/auth/requireUser'

const CREDITS = 8

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[gap-audio]', err instanceof Error ? err.message : err)
    return null
  }) as { op?: 'crosstalk' | 'soundscape' | 'transcribe'; confirm?: boolean; audioUrl?: string; text?: string; duration?: number } | null
  if (!body?.op) return NextResponse.json({ error: 'Choose crosstalk, soundscape, or transcribe' }, { status: 400 })
  if (!body.confirm) return NextResponse.json({ estimateCredits: CREDITS })

  const access = await checkAccess(userId, CREDITS)
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code })

  if (body.op === 'transcribe') {
    if (!body.audioUrl) return NextResponse.json({ error: 'Transcription needs an audio address' }, { status: 400 })
    const data = await runFal(falEndpoint('whisper'), buildWhisperSttInput({
      audioUrl: body.audioUrl,
      chunkLevel: 'word',
    }), undefined, 180_000, undefined, undefined, 'transcript')
    const words = ((data as { chunks?: Array<{ text?: string; timestamp?: [number, number] }> }).chunks ?? [])
      .flatMap((chunk): TranscriptWord[] => {
        const text = chunk.text?.trim()
        const start = chunk.timestamp?.[0]
        const end = chunk.timestamp?.[1]
        if (!text || typeof start !== 'number' || typeof end !== 'number') return []
        return [{ text, start, end }]
      })
    if (!words.length) return NextResponse.json({ error: 'Transcription did not return word times' }, { status: 502 })
    return NextResponse.json({ words, estimateCredits: CREDITS })
  }

  if (body.op === 'soundscape') {
    const text = body.text?.trim()
    if (!text) return NextResponse.json({ error: 'A soundscape needs a description' }, { status: 400 })
    const data = await runFal(falEndpoint('elevenlabs/sound-effects'), {
      text,
      duration_seconds: Math.min(22, Math.max(1, body.duration ?? 8)),
    }, undefined, 120_000, undefined, undefined, 'soundscape')
    const audioUrl = (data as { audio?: { url?: string } }).audio?.url
    if (!audioUrl) return NextResponse.json({ error: 'The soundscape did not return audio' }, { status: 502 })
    return NextResponse.json({ audioUrl, estimateCredits: CREDITS, libraryTake: true })
  }

  if (!body.audioUrl) return NextResponse.json({ error: 'Crosstalk needs an audio address' }, { status: 400 })
  const data = await runFal(falEndpoint('elevenlabs/speech-to-text'), {
    audio_url: body.audioUrl,
    diarize: true,
  }, undefined, 180_000, undefined, undefined, 'crosstalk')
  const words = ((data as { words?: Array<{ text?: string; start?: number; end?: number; speaker_id?: string; type?: string }> }).words ?? [])
    .filter((word) => word.type !== 'spacing' && typeof word.text === 'string' && typeof word.start === 'number' && typeof word.end === 'number')
    .map((word): TranscriptWord => ({
      text: word.text as string,
      start: word.start as number,
      end: word.end as number,
      speaker: word.speaker_id,
    }))
  return NextResponse.json({
    takes: speakerRanges(words).map((range) => ({ ...range, sourceUrl: body.audioUrl })),
    estimateCredits: CREDITS,
    libraryTake: true,
  })
}
