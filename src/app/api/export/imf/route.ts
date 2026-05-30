/**
 * POST /api/export/imf — IMF (Interoperable Master Format) package export.
 * Calls the Python IMF microservice on port 7433.
 * Output: IMF package passing Netflix/Amazon validation.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { checkAndDeductCredits,
         refundCredits }              from '@/lib/credits'

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    videoUrl:      string
    audioUrl?:     string
    subtitleUrl?:  string
    title:         string
    contentType?:  'movie' | 'episode' | 'trailer'
    hdrVersion?:   'hdr10' | 'hlg' | 'sdr'
    platform?:     'netflix' | 'amazon' | 'apple' | 'generic'
  }

  if (!body.videoUrl || !body.title) {
    return NextResponse.json({ error: 'videoUrl and title required' }, { status: 400 })
  }

  await checkAndDeductCredits(userId, 'imf_export')

  const imfUrl = process.env.IMF_SERVICE_URL ?? 'http://localhost:7433'

  try {
    const res = await fetch(`${imfUrl}/export/imf`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...body, userId }),
      signal:  AbortSignal.timeout(900_000),  // 15 minute timeout
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`IMF service error: ${err}`)
    }

    const result = await res.json() as {
      imfPackageUrl:  string
      validationReport: Record<string, unknown>
      assetList:      string[]
    }
    return NextResponse.json(result)
  } catch (err) {
    await refundCredits(userId, 50, 'IMF export failed')
    console.error('[export/imf]', err)
    return NextResponse.json({ error: 'IMF export failed — microservice unavailable' }, { status: 503 })
  }
}
