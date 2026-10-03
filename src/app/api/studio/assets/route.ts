import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
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
