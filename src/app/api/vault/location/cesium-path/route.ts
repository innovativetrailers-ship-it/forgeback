import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { buildAerialPath } from '@/lib/location/cesium'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({
  waypoints: z.array(z.object({ lat: z.number(), lng: z.number() })).min(2),
  altitudeMeters: z.number().min(10).max(10000).default(200),
  gimbalTarget: z.object({ lat: z.number(), lng: z.number() }).optional(),
})

export async function POST(request: NextRequest) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const result = await buildAerialPath(parsed.data)
  return NextResponse.json(result)
}
