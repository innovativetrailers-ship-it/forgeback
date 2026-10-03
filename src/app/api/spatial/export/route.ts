import { type NextRequest, NextResponse } from 'next/server'
import { encodeSpatialVideo } from '@/lib/spatial/SpatialExport'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: unknown
  try { raw = await req.json() } catch (err) {
    console.warn("[caught] src/app/api/spatial/export/route.ts:9", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const o = raw as Record<string, unknown>
  if (typeof o.leftEyeUrl !== 'string' || !o.leftEyeUrl)
    return NextResponse.json({ error: 'leftEyeUrl is required' }, { status: 400 })
  if (typeof o.rightEyeUrl !== 'string' || !o.rightEyeUrl)
    return NextResponse.json({ error: 'rightEyeUrl is required' }, { status: 400 })

  const fov = typeof o.fov === 'number' ? o.fov : 90

  try {
    const result = await encodeSpatialVideo({
      leftEyeUrl: o.leftEyeUrl,
      rightEyeUrl: o.rightEyeUrl,
      fov,
    })
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Spatial encoding failed'
    console.error('[spatial/export]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
