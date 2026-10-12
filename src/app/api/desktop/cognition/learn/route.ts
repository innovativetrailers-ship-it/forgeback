import { logCaught } from '@/lib/diagnostics/caught'
import { type NextRequest, NextResponse } from 'next/server'
import { learn } from '@/lib/cognition'
import { validateDesktopCloudRequest } from '@/lib/desktop/cloudAuth'
import type { CreativeBrief } from '@/lib/cognition/director'

export const maxDuration = 60

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = await validateDesktopCloudRequest(request)
  if (userId instanceof NextResponse) return userId

  const body = (await request.json()) as {
    jobId?: string
    result?: {
      segments?: Array<{ model: string; contentType?: string; qualityScore?: number }>
      qualityScores?: Record<string, number>
    }
    brief?: CreativeBrief | null
  }

  if (!body.jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })

  void learn({
    userId,
    jobId: body.jobId,
    result: body.result ?? {},
    brief: body.brief ?? null,
  }).catch((err) => logCaught('app/api/desktop/cognition/learn/route', err))

  return NextResponse.json({ ok: true })
}
