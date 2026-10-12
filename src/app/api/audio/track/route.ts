import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/requireUser'

const createSchema = z.object({
  projectId: z.string(),
  type: z.enum(['dialogue', 'music', 'ambience', 'sfx', 'custom']),
  provider: z.enum(['elevenlabs', 'suno', 'upload']).default('elevenlabs'),
  prompt: z.string().optional(),
  voiceId: z.string().optional(),
  sunoStyle: z.string().optional(),
  sunoLyrics: z.string().optional(),
  instrumental: z.boolean().optional(),
  shotPlanId: z.string().optional(),
  sceneNumber: z.number().int().optional(),
  startSec: z.number().optional(),
  volumeDb: z.number().optional(),
  duckUnderDialogue: z.boolean().optional(),
})

function toDbType(t: string) {
  return t.toUpperCase() as 'DIALOGUE' | 'MUSIC' | 'AMBIENCE' | 'SFX' | 'CUSTOM'
}

function toDbProvider(p: string) {
  return p.toUpperCase() as 'ELEVENLABS' | 'SUNO' | 'UPLOAD'
}

export async function GET(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  const project = await db.project.findFirst({ where: { id: projectId, userId } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const tracks = await db.audioTrack.findMany({
    where: { projectId },
    orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json({ tracks })
}

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = createSchema.parse(await req.json())
  const project = await db.project.findFirst({ where: { id: body.projectId, userId } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const track = await db.audioTrack.create({
    data: {
      projectId: body.projectId,
      type: toDbType(body.type),
      provider: toDbProvider(body.provider),
      status: 'PENDING',
      prompt: body.prompt,
      voiceId: body.voiceId,
      sunoStyle: body.sunoStyle,
      sunoLyrics: body.sunoLyrics,
      instrumental: body.instrumental ?? true,
      shotPlanId: body.shotPlanId,
      sceneNumber: body.sceneNumber,
      startSec: body.startSec,
      volumeDb: body.volumeDb ?? 0,
      duckUnderDialogue: body.duckUnderDialogue ?? (body.type === 'music'),
    },
  })

  return NextResponse.json({ track })
}
