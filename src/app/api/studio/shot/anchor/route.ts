import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { db } from '@/lib/db'
import { uploadToR2 } from '@/lib/storage/r2'
import { requireUser } from '@/lib/auth/requireUser'

const MAX_ANCHOR_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '')

function parseAspectRatio(ratio: string): number {
  const [w, h] = ratio.split(':').map(Number)
  if (!w || !h) return 16 / 9
  return w / h
}

async function normalizeToAspect(buffer: Buffer, aspectRatio: string): Promise<Buffer> {
  const target = parseAspectRatio(aspectRatio)
  const meta = await sharp(buffer).metadata()
  if (!meta.width || !meta.height) return buffer

  const current = meta.width / meta.height
  let cropW = meta.width
  let cropH = meta.height
  if (current > target) {
    cropW = Math.round(meta.height * target)
  } else {
    cropH = Math.round(meta.width / target)
  }
  const left = Math.max(0, Math.floor((meta.width - cropW) / 2))
  const top = Math.max(0, Math.floor((meta.height - cropH) / 2))

  return sharp(buffer)
    .extract({ left, top, width: cropW, height: cropH })
    .jpeg({ quality: 92 })
    .toBuffer()
}

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const shotId = form.get('shotId')
  const projectId = form.get('projectId')
  const file = form.get('file')
  const frameUrl = form.get('frameUrl')

  if (typeof shotId !== 'string' || typeof projectId !== 'string') {
    return NextResponse.json({ error: 'shotId and projectId required' }, { status: 400 })
  }

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

  let anchorUrl: string

  if (file instanceof File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'PNG, JPEG or WebP only' }, { status: 415 })
    }
    if (file.size > MAX_ANCHOR_BYTES) {
      return NextResponse.json({ error: 'Image too large (10MB max)' }, { status: 413 })
    }

    let buffer = Buffer.from(await file.arrayBuffer())
    buffer = Buffer.from(await normalizeToAspect(buffer, clip.aspectRatio))

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    anchorUrl = await uploadToR2(
      buffer,
      `anchors/${projectId}/${shotId}-${Date.now()}.${ext}`,
      file.type || 'image/jpeg',
    )
  } else if (typeof frameUrl === 'string' && frameUrl.length > 0) {
    if (PUBLIC_URL && !frameUrl.startsWith(PUBLIC_URL)) {
      return NextResponse.json({ error: 'frameUrl must be a project media URL' }, { status: 400 })
    }
    anchorUrl = frameUrl
  } else {
    return NextResponse.json({ error: 'No file or frameUrl provided' }, { status: 400 })
  }

  await db.studioClip.update({
    where: { id: shotId },
    data: { anchorFrameUrl: anchorUrl, anchorSource: 'MANUAL' },
  })

  return NextResponse.json({ anchorUrl })
}

export async function DELETE(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { shotId?: string }
  if (!body.shotId) {
    return NextResponse.json({ error: 'shotId required' }, { status: 400 })
  }

  const claimed = await db.studioClip.updateMany({
    where: {
      id: body.shotId,
      status: { not: 'GENERATING' },
      scene: { project: { userId } },
    },
    data: { anchorFrameUrl: null, anchorSource: 'NONE' },
  })

  if (claimed.count !== 1) {
    return NextResponse.json({ error: 'Cannot remove anchor now' }, { status: 409 })
  }

  return NextResponse.json({ ok: true })
}
