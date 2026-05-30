/**
 * POST /api/export/dcp — Digital Cinema Package (DCP) export
 * Calls the Python DCP microservice running on port 7433.
 * Output: DCP package folder (ASSETMAP, CPL, PKL, MXF video + audio)
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
    contentKind?:  'feature' | 'trailer' | 'short'
    rating?:       string   // e.g. "PG-13"
  }

  if (!body.videoUrl || !body.title) {
    return NextResponse.json({ error: 'videoUrl and title required' }, { status: 400 })
  }

  await checkAndDeductCredits(userId, 'dcp_export')

  const imfUrl = process.env.IMF_SERVICE_URL ?? 'http://localhost:7433'

  try {
    const res = await fetch(`${imfUrl}/export/dcp`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...body, userId }),
      signal:  AbortSignal.timeout(600_000),  // 10 minute timeout for DCP creation
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`DCP service error: ${err}`)
    }

    const result = await res.json() as { dcpUrl: string; packageSize: number; assetList: string[] }
    return NextResponse.json(result)
  } catch (err) {
    await refundCredits(userId, 50, 'DCP export failed')
    console.error('[export/dcp]', err)
    return NextResponse.json({ error: 'DCP export failed — microservice unavailable' }, { status: 503 })
  }
}
