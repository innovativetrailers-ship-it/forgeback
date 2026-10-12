import { renderQueue }  from '@/lib/queue'
import { db }           from '@/lib/db'
import { deductCredits } from '@/lib/credits'
import { checkAccess }   from '@/lib/access/guard'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: Request) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    fileUrl?:        string
    scriptMode?:     string
    voiceId?:        string
    transitionStyle?: string
    backgroundMusic?: boolean
  }
  const { fileUrl, scriptMode, voiceId, transitionStyle, backgroundMusic } = body

  if (!fileUrl) return Response.json({ error: 'fileUrl required' }, { status: 400 })

  // 5 credits per slide estimated — charged per-slide in the worker
  const access = await checkAccess(userId, 5)
  if (!access.allowed) return Response.json({ error: access.reason }, { status: access.code })

  await deductCredits(db, userId, 5, 'Slides-to-video: initial reservation')

  const job = await db.renderJob.create({
    data: {
      userId,
      type:         'EXPORT',
      status:       'QUEUED',
      inputPayload: { fileUrl, scriptMode: scriptMode ?? 'auto', voiceId, transitionStyle, backgroundMusic },
    },
  })

  await renderQueue.add('slides-to-video', {
    jobId:           job.id,
    userId,
    fileUrl,
    scriptMode:      scriptMode ?? 'auto',
    voiceId,
    transitionStyle,
    backgroundMusic,
  })

  return Response.json({ jobId: job.id })
}
