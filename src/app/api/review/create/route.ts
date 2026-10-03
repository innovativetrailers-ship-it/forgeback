import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { resolveReviewVideoUrl } from '@/lib/review'
import { expiryDate, hashReviewPin, REVIEW_EXPIRY } from '@/lib/review/pin'
import { defaultApprovalChain, type ApprovalStep } from '@cinema/core'

const CreateReviewSchema = z.object({
  projectId: z.string(),
  title: z.string().min(1).max(200),
  expiry: z.enum(REVIEW_EXPIRY),
  pin: z.string().min(4).max(12),
  watermarkName: z.string().min(1).max(80),
  showWatermarkDate: z.boolean().optional(),
  allowDownload: z.boolean().optional(),
  shotId: z.string().optional(),
  roles: z.array(z.string().min(1).max(40)).min(1).max(6).optional(),
  versions: z.array(z.object({
    version: z.number().int().positive(),
    label: z.string().min(1).max(80),
    url: z.string().url(),
  })).max(12).optional(),
})

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: z.infer<typeof CreateReviewSchema>
  try {
    body = CreateReviewSchema.parse(await req.json())
  } catch (e) {
    console.warn('[caught] src/app/api/review/create/route.ts', e instanceof Error ? { name: e.name, message: e.message } : e)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const project = await db.project.findUnique({
    where: { id: body.projectId, userId },
    select: { id: true },
  })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const proxyUrl = body.versions?.[0]?.url ?? await resolveReviewVideoUrl(body.projectId)
  const versions = body.versions ?? (proxyUrl ? [{ version: 1, label: 'Proxy', url: proxyUrl }] : [])
  const chain: ApprovalStep[] = body.roles?.length
    ? body.roles.map((role) => ({ role, status: 'pending' as const }))
    : defaultApprovalChain()

  const reviewLink = await db.reviewLink.create({
    data: {
      projectId: body.projectId,
      userId,
      title: body.title,
      expiresAt: expiryDate(body.expiry),
      allowDownload: body.allowDownload ?? false,
      pinHash: hashReviewPin(body.pin),
      watermarkName: body.watermarkName.trim(),
      showWatermarkDate: body.showWatermarkDate ?? true,
      proxyUrl,
      versions,
      approvalChain: JSON.parse(JSON.stringify(chain)),
      shotId: body.shotId,
    },
  })

  const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL}/review/${reviewLink.token}`
  return NextResponse.json({
    reviewUrl,
    reviewLink: {
      id: reviewLink.id,
      token: reviewLink.token,
      title: reviewLink.title,
      status: reviewLink.status,
      expiresAt: reviewLink.expiresAt,
      approvalChain: chain,
    },
  })
}

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projectId = new URL(req.url).searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  const links = await db.reviewLink.findMany({
    where: { userId, projectId },
    include: { comments: { where: { resolved: false }, select: { id: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    links: links.map((link) => ({
      id: link.id,
      token: link.token,
      title: link.title,
      status: link.status,
      expiresAt: link.expiresAt,
      createdAt: link.createdAt,
      approvalChain: link.approvalChain,
      watermarkName: link.watermarkName,
    })),
  })
}
