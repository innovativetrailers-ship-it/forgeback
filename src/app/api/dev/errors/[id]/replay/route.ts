import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { replayShotError } from '@/lib/diagnostics/replay'
import { isGenerationPaused } from '@/lib/generation/pause'
import { requireUser } from '@/lib/auth/requireUser'
import { diagnosticsBypassAllowed } from '@/lib/http/rateLimit'

async function requireDiagnostics(req: NextRequest): Promise<string | NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (diagnosticsBypassAllowed()) return userId
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (user?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return userId
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireDiagnostics(req)
  if (auth instanceof NextResponse) return auth
  if (isGenerationPaused()) {
    return NextResponse.json({ error: 'Generation is paused' }, { status: 503 })
  }
  const { id } = await params
  try {
    const result = await replayShotError(id)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.warn("[caught] src/app/api/dev/errors/[id]/replay/route.ts:28", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Replay failed' },
      { status: 400 },
    )
  }
}
