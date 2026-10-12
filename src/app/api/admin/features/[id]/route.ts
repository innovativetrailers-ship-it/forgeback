import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cleanText, parseStatus } from '@/lib/features/request'
import { requireUser } from '@/lib/auth/requireUser'

async function allowed(userId: string | null) {
  if (!userId) return false
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, isInternal: true } })
  return Boolean(user && (user.role === 'ADMIN' || user.isInternal))
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = (await requireUser(req))?.id ?? null
  if (!(await allowed(userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json().catch((err) => {
    console.warn('[feature-request]', err instanceof Error ? err.message : err)
    return null
  }) as { status?: unknown; devNote?: unknown } | null
  const status = parseStatus(body?.status)
  if (!status) return NextResponse.json({ error: 'Choose a status' }, { status: 400 })
  const devNote = cleanText(body?.devNote, 2000)
  const updated = await db.featureRequest.update({
    where: { id },
    data: { status, devNote: devNote || null },
    select: { id: true, status: true, devNote: true },
  })
  return NextResponse.json(updated)
}
