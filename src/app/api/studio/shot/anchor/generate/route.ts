import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { EscrowError, withCreditHold } from '@/lib/billing/withCreditHold'
import { generateImage } from '@/lib/engines/imageGen'
import { uploadToR2 } from '@/lib/storage/r2'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({
  shotId: z.string(),
  projectId: z.string(),
  prompt: z.string().min(3).optional(),
})

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const { shotId, projectId, prompt: promptOverride } = parsed.data

  const clip = await db.studioClip.findUnique({
    where: { id: shotId },
    include: { scene: { include: { project: { select: { userId: true, id: true } } } } },
  })
  if (!clip || clip.scene.projectId !== projectId || clip.scene.project.userId !== userId) {
    return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
  }
  if (clip.status === 'GENERATING') {
    return NextResponse.json({ error: 'Shot is generating — cannot change anchor' }, { status: 409 })
  }
  if (!['AWAITING_DIRECTION', 'PENDING', 'FAILED'].includes(clip.status)) {
    return NextResponse.json({ error: 'Shot is not in a directable state' }, { status: 409 })
  }

  const prompt = (promptOverride ?? clip.prompt).trim()
  if (prompt.length < 3) {
    return NextResponse.json({ error: 'Prompt is required to generate a start frame' }, { status: 400 })
  }

  const imagePrompt = `Cinematic film still, opening frame of this shot.
${prompt}
Photorealistic, composed exactly as the first frame before motion begins.`

  let rawUrl: string | undefined
  try {
  ;[rawUrl] = await withCreditHold(userId, 1, () => generateImage(imagePrompt, {
    quality: 'reference',
    aspectRatio: clip.aspectRatio || '16:9',
  }))
  } catch (err) {
    if (err instanceof EscrowError) return NextResponse.json({ error: err.message }, { status: 402 })
    throw err
  }
  if (!rawUrl) {
    return NextResponse.json({ error: 'Image model returned no URL' }, { status: 502 })
  }

  const buf = await fetch(rawUrl).then((r) => r.arrayBuffer())
  const anchorUrl = await uploadToR2(
    Buffer.from(buf),
    `anchors/${projectId}/${shotId}-generated-${Date.now()}.jpg`,
    'image/jpeg',
  )

  await db.studioClip.update({
    where: { id: shotId },
    data: { anchorFrameUrl: anchorUrl, anchorSource: 'KEYFRAME' },
  })

  return NextResponse.json({ anchorUrl })
}
