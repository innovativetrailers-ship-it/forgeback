import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const type = req.nextUrl.searchParams.get('type')
  const assets = await db.trainedAsset.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(type ? { type } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return NextResponse.json({ assets })
}
