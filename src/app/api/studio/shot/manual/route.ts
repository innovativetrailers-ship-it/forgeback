import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { uploadToR2 } from '@/lib/storage/r2'
import { extractTailFrame } from '@/lib/orchestration/bridgedGeneration'
import { advanceChain } from '@/lib/studio/advanceChain'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file')
  const clipId = form.get('clipId')
  const projectId = form.get('projectId')

  if (!(file instanceof File) || typeof clipId !== 'string' || typeof projectId !== 'string') {
    return NextResponse.json({ error: 'file, clipId, and projectId required' }, { status: 400 })
  }

  const clip = await db.studioClip.findUnique({
    where: { id: clipId },
    include: { scene: { include: { project: { select: { userId: true, id: true } } } } },
  })
  if (!clip || clip.scene.projectId !== projectId || clip.scene.project.userId !== userId) {
    return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  const url = await uploadToR2(buf, `manual/${projectId}/${clipId}_${Date.now()}.mp4`, file.type || 'video/mp4')

  let lastFrame = ''
  try {
    lastFrame = (await extractTailFrame(url)) ?? ''
  } catch (err) {
    console.warn("[caught] src/app/api/studio/shot/manual/route.ts:34", err instanceof Error ? { name: err.name, message: err.message } : err)

    lastFrame = ''
  }

  await db.$transaction(async (tx) => {
    await tx.studioClip.update({
      where: { id: clipId },
      data: {
        status: 'MANUAL',
        manualVideo: true,
        videoUrl: url,
        lastFrame: lastFrame || null,
        generatingAt: null,
      },
    })
    await advanceChain(tx, projectId, clipId, lastFrame || null)
  })

  return NextResponse.json({ url, lastFrame })
}
