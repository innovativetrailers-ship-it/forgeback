import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { checkAndDeductCredits,
         refundCredits }              from '@/lib/credits'
import { transcribeAudio,
         toSRT, toVTT }              from '@/lib/audio/TranscriptSync'

/** POST /api/transcript — transcribe audio/video clip via Whisper */
export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    audioUrl:   string
    format?:    'json' | 'srt' | 'vtt' | 'txt'
  }

  const { audioUrl, format = 'json' } = body
  if (!audioUrl) return NextResponse.json({ error: 'audioUrl required' }, { status: 400 })

  await checkAndDeductCredits(userId, 'transcribe')

  try {
    const transcript = await transcribeAudio(audioUrl)

    // Return requested format
    if (format === 'srt') {
      return new Response(toSRT(transcript.segments), {
        headers: { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="transcript.srt"' },
      })
    }
    if (format === 'vtt') {
      return new Response(toVTT(transcript.segments), {
        headers: { 'Content-Type': 'text/vtt', 'Content-Disposition': 'attachment; filename="transcript.vtt"' },
      })
    }
    if (format === 'txt') {
      return new Response(transcript.text, {
        headers: { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="transcript.txt"' },
      })
    }

    return NextResponse.json(transcript)
  } catch (err) {
    await refundCredits(userId, 5, 'Transcription failed')
    console.error('[transcript]', err)
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 })
  }
}
