import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { openReviewLink, reviewPinFrom } from '@/lib/review/gate'

const commentSchema = z.object({
  text: z.string().min(1),
  timecode: z.number().optional().default(0),
  authorName: z.string().min(1),
  authorEmail: z.string().email(),
  clipId: z.string().optional(),
  annotationData: z.unknown().optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const opened = await openReviewLink(token, reviewPinFrom(req))
  if (!opened.ok) return NextResponse.json({ error: opened.error }, { status: opened.status })

  return NextResponse.json({
    comments: opened.link.comments.map((comment) => ({
      id: comment.id,
      authorName: comment.authorName,
      timecode: comment.timecode,
      text: comment.text,
      resolved: comment.resolved,
      createdAt: comment.createdAt.toISOString(),
    })),
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const opened = await openReviewLink(token, reviewPinFrom(req))
  if (!opened.ok) return NextResponse.json({ error: opened.error }, { status: opened.status })
  const link = opened.link

  const body = await req.json()
  const parsed = commentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const comment = await db.reviewComment.create({
    data: {
      reviewLinkId: link.id,
      text: parsed.data.text,
      timecode: parsed.data.timecode ?? 0,
      authorName: parsed.data.authorName,
      authorEmail: parsed.data.authorEmail,
      clipId: parsed.data.clipId,
      annotationData: (parsed.data.annotationData ?? null) as never,
    },
  })

  const { broadcastCollab } = await import('@/lib/collab/hub')
  broadcastCollab(link.projectId, { type: 'review_comment', comment, projectId: link.projectId })

  return NextResponse.json({ comment }, { status: 201 })
}
