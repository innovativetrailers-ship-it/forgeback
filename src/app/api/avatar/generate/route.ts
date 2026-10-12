import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { checkAndDeductCredits, refundCredits } from '@/lib/credits'
import { db } from '@/lib/db'
import { renderQueue } from '@/lib/queue'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = (await requireUser(req))?.id ??  session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { avatarId, script, voiceId, type } = await req.json() as {
    avatarId: string
    script: string
    voiceId?: string
    type?: 'talking_photo' | 'avatar_video'
  }

  if (!avatarId || !script) {
    return NextResponse.json({ error: 'avatarId and script required' }, { status: 400 })
  }

  const operation = type === 'talking_photo' ? 'talking_photo' : 'avatar_video'
  await checkAndDeductCredits(userId, operation)

  const avatar = await db.avatar.findFirst({ where: { id: avatarId, userId } })

  if (!avatar) {
    await refundCredits(userId, 5, `Avatar ${avatarId} not found`)
    return NextResponse.json({ error: 'Avatar not found' }, { status: 404 })
  }

  const renderJob = await db.renderJob.create({
    data: {
      userId,
      type: 'GENERATE',
      status: 'QUEUED',
      inputPayload: {
        avatarId,
        imageUrl: avatar.thumbnailUrl,
        script,
        voiceId,
        type: type ?? 'avatar_video',
      },
    },
  })

  await renderQueue.add('avatar-generate', {
    jobId: renderJob.id,
    userId,
    avatarId,
    imageUrl: avatar.thumbnailUrl,
    script,
    voiceId,
    type: type ?? 'avatar_video',
  })

  return NextResponse.json({ jobId: renderJob.id }, { status: 202 })
}
