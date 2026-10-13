import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({
  id: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = schema.parse(await req.json())

  const job = await db.renderJob.findFirst({ where: { id: body.id, userId } })
  if (job) {
    await db.renderJob.update({
      where: { id: job.id },
      data: {
        status: 'CANCELLED',
        errorMessage: 'Removed from the library. The file was kept.',
      },
    })
  }

  const clip = await db.studioClip.findFirst({
    where: { id: body.id, scene: { project: { userId } } },
  })
  if (clip) {
    await db.studioClip.update({
      where: { id: clip.id },
      data: {
        orphanedAt: new Date(),
        statusReason: 'removed from library',
      },
    })
  }

  if (!job && !clip) {
    return NextResponse.json({ ok: true, localOnly: true })
  }
  return NextResponse.json({ ok: true })
}
