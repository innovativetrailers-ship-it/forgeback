import { NextRequest, NextResponse } from 'next/server'
import { parseApprovalChain } from '@cinema/core'
import { openReviewLink, reviewPinFrom } from '@/lib/review/gate'
import { watermarkLabel } from '@/lib/review/pin'

/** Public review portal. PIN + expiry. No project or account fields. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const opened = await openReviewLink(token, reviewPinFrom(req))
  if (!opened.ok) return NextResponse.json({ error: opened.error }, { status: opened.status })

  const link = opened.link
  const versions = Array.isArray(link.versions) ? link.versions : []
  return NextResponse.json({
    title: link.title,
    status: link.status,
    allowDownload: link.allowDownload,
    videoUrl: link.proxyUrl,
    watermark: watermarkLabel(link.watermarkName ?? link.title, link.showWatermarkDate),
    versions,
    approvalChain: parseApprovalChain(link.approvalChain),
    comments: link.comments.map((comment) => ({
      id: comment.id,
      authorName: comment.authorName,
      timecode: comment.timecode,
      text: comment.text,
      resolved: comment.resolved,
      createdAt: comment.createdAt.toISOString(),
    })),
  })
}
