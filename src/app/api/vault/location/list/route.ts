import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ plates: [] })

  try {
    const plates = await db.locationPlate.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      take:    100,
    })
    return NextResponse.json({ plates })
  } catch (err) {
    console.error('[vault/location/list]', (err as Error).message)
    return NextResponse.json({ plates: [] })
  }
}
