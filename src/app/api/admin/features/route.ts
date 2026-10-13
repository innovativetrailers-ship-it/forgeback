import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cleanText } from '@/lib/features/request'
import { requireUser } from '@/lib/auth/requireUser'

async function allowed(userId: string | null) {
  if (!userId) return false
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, isInternal: true } })
  return Boolean(user && (user.role === 'ADMIN' || user.isInternal))
}

export async function GET(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!(await allowed(userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const rows = await db.featureRequest.findMany({
    orderBy: [{ upvotes: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    select: { id: true, userId: true, kind: true, title: true, body: true, context: true, status: true, devNote: true, upvotes: true, createdAt: true },
  })
  return NextResponse.json({
    requests: rows.map((row) => ({
      ...row,
      title: cleanText(row.title, 120),
      body: cleanText(row.body, 4000),
      devNote: row.devNote ? cleanText(row.devNote, 2000) : null,
    })),
  })
}
