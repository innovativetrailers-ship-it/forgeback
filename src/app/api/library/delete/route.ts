import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { logR2DeleteFailed } from '@/lib/diagnostics/caught'
import { deleteFromR2, keyFromUrl, objectKeyFromStored, renderVideoKey } from '@/lib/storage/r2'

async function deleteLibraryObject(key: string): Promise<void> {
  await deleteFromR2(key).catch((err) => {
    // The library row still clears. This log is the record of the orphaned object.
    logR2DeleteFailed(key, err)
  })
}

const schema = z.object({
  id: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = schema.parse(await req.json())

  const job = await db.renderJob.findFirst({ where: { id: body.id, userId } })
  if (job?.outputUrl || job?.storageKey) {
    const stored = job.storageKey || objectKeyFromStored(job.outputUrl)
    if (stored) await deleteLibraryObject(stored)
    await deleteLibraryObject(renderVideoKey(userId, job.id))
  }
  if (job) {
    await db.renderJob.update({
      where: { id: job.id },
      data: {
        status: 'CANCELLED',
        outputUrl: null,
        storageKey: null,
        errorMessage: 'Deleted from library',
      },
    })
  }

  const clip = await db.studioClip.findFirst({
    where: { id: body.id, scene: { project: { userId } } },
  })
  if (clip?.videoUrl || clip?.storageKey) {
    const stored = clip.storageKey || objectKeyFromStored(clip.videoUrl)
    if (stored) await deleteLibraryObject(stored)
    else if (clip.videoUrl) await deleteLibraryObject(keyFromUrl(clip.videoUrl))
  }
  if (clip) {
    await db.studioClip.update({
      where: { id: clip.id },
      data: {
        status: 'FAILED',
        videoUrl: null,
        storageKey: null,
        directionNotes: 'library-deleted',
      },
    })
  }

  if (!job && !clip) {
    return NextResponse.json({ ok: true, localOnly: true })
  }
  return NextResponse.json({ ok: true })
}
