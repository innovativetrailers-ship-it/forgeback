import { type NextRequest, NextResponse } from 'next/server'
import { importSpatialClip } from '@/lib/spatial/SpatialImport'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: unknown
  try { raw = await req.json() } catch (err) {
    console.warn("[caught] src/app/api/spatial/import/route.ts:9", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const o = raw as Record<string, unknown>
  if (typeof o.url !== 'string' || !o.url.trim())
    return NextResponse.json({ error: 'url is required' }, { status: 400 })

  try {
    const clipData = importSpatialClip(o.url.trim())
    return NextResponse.json({ clipData })
  } catch (err: unknown) {
    console.error('[spatial/import]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to import spatial clip' }, { status: 500 })
  }
}
