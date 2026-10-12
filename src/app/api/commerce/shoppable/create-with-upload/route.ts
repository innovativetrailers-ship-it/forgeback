import { type NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import {
  generateShoppableEmbed,
  isProductTag,
  type ProductTag,
  type ShoppableConfig,
} from '@/lib/commerce/ShoppableExport'
import { uploadToR2 } from '@/lib/storage/r2'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let form: FormData
  try {
    form = await req.formData()
  } catch (err) {
    console.warn("[caught] src/app/api/commerce/shoppable/create-with-upload/route.ts:19", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 })
  }

  const projectId = form.get('projectId')
  const tagsRaw = form.get('tags')
  const video = form.get('video')

  if (typeof projectId !== 'string' || !projectId.trim()) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }
  if (typeof tagsRaw !== 'string') {
    return NextResponse.json({ error: 'tags JSON is required' }, { status: 400 })
  }
  if (!(video instanceof Blob) || video.size === 0) {
    return NextResponse.json({ error: 'video file is required' }, { status: 400 })
  }

  let tags: ProductTag[]
  try {
    const parsed = JSON.parse(tagsRaw) as unknown
    if (!Array.isArray(parsed) || !parsed.every(isProductTag)) {
      return NextResponse.json({ error: 'tags must be a valid ProductTag[]' }, { status: 400 })
    }
    tags = parsed
  } catch (err) {
    console.warn("[caught] src/app/api/commerce/shoppable/create-with-upload/route.ts:44", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid tags JSON' }, { status: 400 })
  }

  try {
    const buffer = Buffer.from(await video.arrayBuffer())
    const ext = video.type.includes('webm') ? 'webm' : 'mp4'
    const contentType = ext === 'webm' ? 'video/webm' : 'video/mp4'
    const key = `embeds/shoppable/${userId}/${Date.now()}.${ext}`
    const videoUrl = await uploadToR2(buffer, key, contentType)

    const embed = await db.shoppableEmbed.create({
      data: {
        projectId: projectId.trim(),
        videoUrl,
        config: {
          videoUrl,
          projectId: projectId.trim(),
          tags,
        } as unknown as Prisma.InputJsonValue,
      },
    })

    const config: ShoppableConfig = {
      videoUrl,
      projectId: projectId.trim(),
      tags,
      embedId: embed.embedId,
    }

    const { html, shareUrl } = generateShoppableEmbed(config)
    return NextResponse.json({ embedId: embed.embedId, shareUrl, html }, { status: 201 })
  } catch (err: unknown) {
    console.error('[commerce/shoppable/create-with-upload]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to create shoppable embed' }, { status: 500 })
  }
}
