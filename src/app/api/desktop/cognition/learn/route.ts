import { type NextRequest, NextResponse } from 'next/server'
import { learn } from '@/lib/cognition'
import { validateDesktopCloudRequest } from '@/lib/desktop/cloudAuth'
import { meterDesktopRelay } from '@/lib/desktop/meterRelay'
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

  await meterDesktopRelay(userId, 'learn', () => learn({
    userId,
    jobId: body.jobId!,
    result: body.result ?? {},
    brief: body.brief ?? null,
  }))

  return NextResponse.json({ ok: true })
}
