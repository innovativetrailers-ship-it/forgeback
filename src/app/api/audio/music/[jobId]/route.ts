import { type NextRequest, NextResponse } from 'next/server'
import { getMusicStatus } from '@/lib/engines/suno'
import { requireUser } from '@/lib/auth/requireUser'

// GET — poll Suno job status
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jobId } = await params

  if (!jobId?.trim())
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 })

  try {
    const status = await getMusicStatus(jobId.trim())
    return NextResponse.json(status)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch music status'
    console.error('[api/audio/music/[jobId]]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
