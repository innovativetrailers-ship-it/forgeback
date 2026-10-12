import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { advanceApproval, parseApprovalChain } from '@cinema/core'
import { db } from '@/lib/db'
import { openReviewLink, reviewPinFrom } from '@/lib/review/gate'
import { notifyProjectOwner } from '@/lib/review'
import { requireUser } from '@/lib/auth/requireUser'

const approveSchema = z.object({
  decision: z.enum(['approved', 'changes_requested']),
  approverName: z.string().min(1).max(100),
  note: z.string().max(2000).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const opened = await openReviewLink(token, reviewPinFrom(req))
  if (!opened.ok) return NextResponse.json({ error: opened.error }, { status: opened.status })

  const parsed = approveSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const link = opened.link
  const chain = parseApprovalChain(link.approvalChain)
  const index = chain.findIndex((step) => step.status !== 'approved')
  if (index < 0) return NextResponse.json({ status: 'approved', approvalChain: chain, shotApproved: true })

  const step = chain[index]
  const userId = (await requireUser(req))?.id ?? null
  const guestStep = step.role.toLowerCase() === 'client'
  if (guestStep) {
    if (userId && userId !== link.userId && step.userId && step.userId !== userId) {
      return NextResponse.json({ error: `This step is waiting for ${step.role}.` }, { status: 403 })
    }
  } else if (userId !== link.userId && step.userId !== userId) {
    return NextResponse.json({ error: `This step is waiting for ${step.role}.` }, { status: 403 })
  }

  const decision = parsed.data.decision === 'approved' ? 'approved' : 'changes-requested'
  const result = advanceApproval(chain, {
    decision,
    actor: parsed.data.approverName,
    note: parsed.data.note,
  })
  const status = result.overall === 'approved'
    ? 'approved'
    : result.overall === 'changes-requested'
      ? 'changes_requested'
      : 'pending'

  await db.reviewLink.update({
    where: { id: link.id },
    data: { status, approvalChain: JSON.parse(JSON.stringify(result.chain)) },
  })
  await db.reviewComment.create({
    data: {
      reviewLinkId: link.id,
      text: `${step.role} ${decision === 'approved' ? 'approved' : 'requested changes'}${parsed.data.note ? `: ${parsed.data.note}` : ''}`,
      timecode: 0,
      authorName: parsed.data.approverName,
      authorEmail: 'review-step@local',
    },
  })
  await notifyProjectOwner({
    reviewLinkId: token,
    projectId: link.projectId,
    ownerUserId: link.userId,
    title: link.title,
    decision: decision === 'approved' ? 'approved' : 'changes_requested',
    approverName: parsed.data.approverName,
    approverEmail: step.role,
    note: parsed.data.note,
  })

  return NextResponse.json({
    success: true,
    status,
    shotApproved: result.shotApproved,
    approvalChain: result.chain,
  })
}
