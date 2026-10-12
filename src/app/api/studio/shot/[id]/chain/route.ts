import { logCaught } from '@/lib/diagnostics/caught'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({
  action: z.enum(['retry', 'alter', 'break', 'approve']),
  projectId: z.string(),
  prompt: z.string().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid chain action' }, { status: 400 })

  const clip = await db.studioClip.findFirst({
    where: { id, scene: { projectId: parsed.data.projectId, project: { userId } } },
    select: { id: true, prompt: true },
  })
  if (!clip) return NextResponse.json({ error: 'Shot not found' }, { status: 404 })

  if (parsed.data.action === 'break') {
    await db.studioClip.updateMany({
      where: { chainFrom: id, scene: { project: { userId } } },
      data: { chainFrom: null },
    })
    await db.studioClip.update({ where: { id }, data: { chainBlock: null } })
    return NextResponse.json({ ok: true, chainFrom: null })
  }

  if (parsed.data.action === 'alter') {
    const prompt = parsed.data.prompt?.trim()
    if (!prompt || prompt.length < 3) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }
    await db.studioClip.update({
      where: { id },
      data: { prompt, chainBlock: null, status: 'FAILED', statusReason: 'The chain was altered and this shot was marked failed. The clip was kept.' },
    })
    return NextResponse.json({ ok: true })
  }

  await db.studioClip.update({
    where: { id },
    data: { chainBlock: null },
  })
  if (parsed.data.action === 'approve') {
    const { recordShotOutcome } = await import('@/lib/cognition/learnOutcomes')
    await recordShotOutcome({ userId, shotId: id, signal: 'approved_at_gate' }).catch((err) => logCaught('app/api/studio/shot/[id]/chain/route', err))
  }
  return NextResponse.json({ ok: true })
}
