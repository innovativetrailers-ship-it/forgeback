import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      dateOfBirth: true,
      createdAt: true,
      consentRecords: { select: { subject: true, scope: true, textVersion: true, createdAt: true } },
      projects: { select: { id: true, title: true, createdAt: true } },
    },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ export: user })
}
