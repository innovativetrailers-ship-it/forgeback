import { type NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { generateShoppableEmbed, isProductTag, type ProductTag, type ShoppableConfig } from '@/lib/commerce/ShoppableExport'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: unknown
  try { raw = await req.json() } catch (err) {
    console.warn("[caught] src/app/api/commerce/shoppable/create/route.ts:11", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof raw !== 'object' || raw === null) return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  const o = raw as Record<string, unknown>

  if (typeof o.projectId !== 'string' || !o.projectId.trim()) return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  if (typeof o.videoUrl !== 'string' || !o.videoUrl.trim()) return NextResponse.json({ error: 'videoUrl is required' }, { status: 400 })
  if (!Array.isArray(o.tags) || !(o.tags as unknown[]).every(isProductTag))
    return NextResponse.json({ error: 'tags must be a valid ProductTag[]' }, { status: 400 })

  const tags = o.tags as ProductTag[]

  try {
    const embed = await db.shoppableEmbed.create({
      data: {
        projectId: o.projectId.trim(),
        videoUrl: o.videoUrl.trim(),
        config: {
          videoUrl: o.videoUrl.trim(),
          projectId: o.projectId.trim(),
          tags,
        } as unknown as Prisma.InputJsonValue,
      },
    })

    const config: ShoppableConfig = {
      videoUrl: o.videoUrl as string,
      projectId: o.projectId as string,
      tags,
      embedId: embed.embedId,
    }

    const { html, shareUrl } = generateShoppableEmbed(config)
    return NextResponse.json({ embedId: embed.embedId, shareUrl, html }, { status: 201 })
  } catch (err: unknown) {
    console.error('[commerce/shoppable/create]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to create shoppable embed' }, { status: 500 })
  }
}
