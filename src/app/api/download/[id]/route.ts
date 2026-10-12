import { requireUser } from '@/lib/auth/requireUser'
/**
 * Same-origin download proxy — streams cross-origin mp4 with Content-Disposition: attachment.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function slug(s: string | null | undefined): string {
  return (s ?? 'forge')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'forge'
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const userId = (await requireUser(req))?.id ??  session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  let videoUrl: string | null = null
  let promptText: string | null = null

  const job = await db.renderJob.findFirst({
    where: { id, userId },
    select: { outputUrl: true, prompt: true, status: true },
  })

  if (job?.outputUrl && job.status === 'COMPLETE') {
    videoUrl = job.outputUrl
    promptText = job.prompt
  } else {
    const shot = await db.studioClip.findFirst({
      where: { id, scene: { project: { userId } } },
      select: { videoUrl: true, prompt: true, status: true },
    })
    if (shot?.videoUrl && shot.status === 'COMPLETED') {
      videoUrl = shot.videoUrl
      promptText = shot.prompt
    }
  }

  if (!videoUrl) {
    return NextResponse.json({ error: 'Video not found for this id' }, { status: 404 })
  }

  const upstream = await fetch(videoUrl).catch((e) => {
    console.error('download_proxy_upstream_fetch_failed', { id, videoUrl, e: String(e) })
    return null
  })

  if (!upstream?.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Upstream fetch failed (${upstream?.status ?? 'no response'})` },
      { status: 502 },
    )
  }

  const filename = `${slug(promptText)}-${id}.mp4`
  const headers: Record<string, string> = {
    'Content-Type': upstream.headers.get('content-type') ?? 'video/mp4',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'private, max-age=0, must-revalidate',
  }
  const contentLength = upstream.headers.get('content-length')
  if (contentLength) headers['Content-Length'] = contentLength

  return new Response(upstream.body, { status: 200, headers })
}
