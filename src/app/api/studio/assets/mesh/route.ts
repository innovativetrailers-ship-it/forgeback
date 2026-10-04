import { falEndpoint } from '@cinema/core/endpoints'
import { NextRequest, NextResponse } from 'next/server'
import { checkAccess } from '@/lib/access/guard'
import { runFal } from '@/lib/fal/client'
import { isGenerationPausedError } from '@/lib/generation/pause'
import { db } from '@/lib/db'
import { MESH_CREDITS } from '@/lib/studio/generationUtilities'

function fileUrl(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const url = (value as { url?: unknown }).url
  return typeof url === 'string' && url.trim() ? url : null
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[mesh]', err instanceof Error ? err.message : err)
    return null
  }) as { imageUrl?: string; prompt?: string; confirm?: boolean } | null
  const imageUrl = body?.imageUrl?.trim()
  if (!imageUrl) return NextResponse.json({ error: 'Image-to-3D needs a still' }, { status: 400 })
  if (!body?.confirm) return NextResponse.json({ estimateCredits: MESH_CREDITS, metered: true })
  const access = await checkAccess(userId, MESH_CREDITS)
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code })
  try {
    const input: Record<string, unknown> = { image_url: imageUrl, export_textured_glb: true }
    const prompt = body.prompt?.trim()
    if (prompt) input.prompt = prompt.slice(0, 200)
    const data = await runFal(falEndpoint('sam-3/3d-objects'), input, undefined, 180_000, undefined, undefined, 'asset.mesh')
    const meshUrl = fileUrl((data as { model_glb?: unknown }).model_glb)
    const splatUrl = fileUrl((data as { gaussian_splat?: unknown }).gaussian_splat)
    if (!meshUrl && !splatUrl) return NextResponse.json({ error: 'SAM 3D did not return a mesh or splat' }, { status: 502 })
    const asset = await db.asset.create({
      data: {
        ownerId: userId,
        kind: 'asset',
        label: prompt || '3D reference',
        sourcePrompt: prompt || 'Image to 3D',
        generatedImage: imageUrl,
        sourceRefs: [meshUrl, splatUrl].filter((url): url is string => Boolean(url)),
        resolutionState: 'generated',
        usableAsReference: false,
        boundary: { meshUrl, splatUrl, model: 'sam-3/3d-objects', note: 'Render stills before sending this to a video model.' },
      },
      select: { id: true },
    })
    return NextResponse.json({
      assetId: asset.id,
      meshUrl,
      splatUrl,
      estimateCredits: MESH_CREDITS,
      libraryTake: true,
    })
  } catch (err) {
    console.warn('[mesh]', err instanceof Error ? err.message : err)
    if (isGenerationPausedError(err)) {
      return NextResponse.json({ error: 'Generation is paused. The 3D reconstruction was not submitted.' }, { status: 503 })
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'The 3D reconstruction did not run' }, { status: 502 })
  }
}
