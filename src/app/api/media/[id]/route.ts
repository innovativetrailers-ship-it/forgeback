import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { contentTypeForKey } from '@/lib/library/model'
import { mediaMissMessage, resolveOwnedMedia, signedUrlForStoredKey } from '@/lib/media/resolveStoredMedia'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  context: { params: Promise<unknown> },
) {
  const session = await auth()
  const userId = request.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { id } = (await context.params) as { id: string }
  const resolved = await resolveOwnedMedia(id, userId)
  if (resolved.remoteUrl) {
    return NextResponse.redirect(resolved.remoteUrl, 302)
  }
  const key = resolved.reason === 'ok' ? resolved.key : null
  const signed = key ? await signedUrlForStoredKey(key) : null

  if (!signed || !key) {
    const reason = signed ? resolved.reason : (key ? 'object_missing' : resolved.reason)
    console.warn('[media_resolve_miss]', JSON.stringify({ id, key, reason }))
    return new Response(mediaMissMessage(id, { ...resolved, reason, key }), { status: 404 })
  }

  const asset = await db.asset.findFirst({
    where: { id, ownerId: userId },
    select: { contentType: true, mediaKind: true },
  })
  const contentType = contentTypeForKey(key, asset?.contentType)
  console.log('[media_resolve]', JSON.stringify({ id, key, contentType, mediaKind: asset?.mediaKind ?? null }))
  const response = NextResponse.redirect(signed, 302)
  response.headers.set('Content-Type', contentType)
  if (request.nextUrl.searchParams.get('download') === '1') {
    response.headers.set('Content-Disposition', `attachment; filename="cinema_${id}.mp4"`)
  }
  return response
}
