import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveCollabAccess, assertCanComment } from '@/lib/collab/access'
import { broadcastCollab } from '@/lib/collab/hub'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projectId = req.nextUrl.searchParams.get('projectId')
  const clipId = req.nextUrl.searchParams.get('clipId')

  if (!projectId?.trim()) return NextResponse.json({ error: 'projectId is required' }, { status: 400 })

  const access = await resolveCollabAccess(projectId.trim(), userId)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const where = clipId?.trim()
      ? { projectId: projectId.trim(), clipId: clipId.trim(), parentId: null }
      : { projectId: projectId.trim(), parentId: null }

    const comments = await db.clipComment.findMany({
      where,
      include: { replies: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    })

    const links = await db.reviewLink.findMany({
      where: { projectId: projectId.trim() },
      select: { id: true },
    })
    const reviewComments = links.length
      ? await db.reviewComment.findMany({
          where: {
            reviewLinkId: { in: links.map((l) => l.id) },
            ...(clipId?.trim() ? { clipId: clipId.trim() } : {}),
          },
          orderBy: { createdAt: 'asc' },
        })
      : []

    const live = reviewComments.map((c) => ({
      id: c.id,
      authorId: c.authorEmail,
      timecode: c.timecode,
      text: c.text,
      resolved: c.resolved,
      createdAt: c.createdAt,
      replies: [] as never[],
    }))

    return NextResponse.json({ comments: [...live, ...comments] })
  } catch (err) {
    console.warn("[caught] src/app/api/collab/comments/route.ts:54", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ comments: [] })
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: unknown
  try { raw = await req.json() } catch (err) {
    console.warn("[caught] src/app/api/collab/comments/route.ts:64", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const o = raw as Record<string, unknown>
  if (typeof o.projectId !== 'string' || !o.projectId.trim()) return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  if (typeof o.clipId !== 'string' || !o.clipId.trim()) return NextResponse.json({ error: 'clipId is required' }, { status: 400 })
  if (typeof o.text !== 'string' || !o.text.trim()) return NextResponse.json({ error: 'text is required' }, { status: 400 })
  if (typeof o.timecode !== 'number') return NextResponse.json({ error: 'timecode is required' }, { status: 400 })

  const access = await resolveCollabAccess(o.projectId.trim(), userId)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!assertCanComment(access)) {
    return NextResponse.json({ error: 'Role cannot comment' }, { status: 403 })
  }

  try {
    const link = await db.reviewLink.findFirst({
      where: { projectId: o.projectId.trim() },
      orderBy: { createdAt: 'desc' },
    })
    if (link) {
      const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })
      const comment = await db.reviewComment.create({
        data: {
          reviewLinkId: link.id,
          authorName: user?.name ?? 'Collaborator',
          authorEmail: user?.email ?? `${userId}@forge.local`,
          timecode: o.timecode,
          text: o.text.trim(),
          clipId: o.clipId.trim(),
        },
      })
      broadcastCollab(o.projectId.trim(), { type: 'review_comment', comment, projectId: o.projectId.trim() })
      return NextResponse.json({ comment }, { status: 201 })
    }

    const comment = await db.clipComment.create({
      data: {
        projectId: o.projectId.trim(),
        clipId: o.clipId.trim(),
        authorId: userId,
        timecode: o.timecode,
        text: o.text.trim(),
        parentId: typeof o.parentId === 'string' ? o.parentId : null,
      },
      include: { replies: true },
    })
    broadcastCollab(o.projectId.trim(), { type: 'review_comment', comment, projectId: o.projectId.trim() })
    return NextResponse.json({ comment }, { status: 201 })
  } catch (err: unknown) {
    console.error('[collab/comments POST]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: unknown
  try { raw = await req.json() } catch (err) {
    console.warn("[caught] src/app/api/collab/comments/route.ts:125", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const o = raw as Record<string, unknown>
  if (typeof o.commentId !== 'string' || !o.commentId.trim())
    return NextResponse.json({ error: 'commentId is required' }, { status: 400 })
  if (typeof o.resolved !== 'boolean')
    return NextResponse.json({ error: 'resolved (boolean) is required' }, { status: 400 })

  try {
    const review = await db.reviewComment.findUnique({ where: { id: o.commentId.trim() } })
    if (review) {
      const comment = await db.reviewComment.update({
        where: { id: o.commentId.trim() },
        data: { resolved: o.resolved },
      })
      return NextResponse.json({ comment })
    }
    const comment = await db.clipComment.update({
      where: { id: o.commentId.trim() },
      data: { resolved: o.resolved },
    })
    return NextResponse.json({ comment })
  } catch (err) {
    console.warn("[caught] src/app/api/collab/comments/route.ts:149", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  }
}
