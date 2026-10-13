import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { checkAndDeductCredits, refundOperationCredits } from '@/lib/credits'
import { Recaster } from '@/lib/casting/Recaster'
import type { CastMember } from '@/lib/casting/types'
import { requireUser } from '@/lib/auth/requireUser'
import { recordConsent } from '@/lib/privacy/consent'

const recaster = new Recaster()

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = (await requireUser(req))?.id ??  session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    projectId: string
    sourceVideoUrl?: string
    originalCharacterId: string
    replacementCharacterId?: string
    replacementCharacter?: CastMember
    scope: 'face_only' | 'full_character' | 'silhouette_only'
    applyToAllClips?: boolean
    intensity?: number
    likenessConsent?: boolean
    notMinor?: boolean
  }

  if (!body.projectId || !body.originalCharacterId || !body.scope) {
    return NextResponse.json({ error: 'projectId, originalCharacterId and scope are required' }, { status: 400 })
  }
  if (body.likenessConsent !== true || body.notMinor !== true) {
    return NextResponse.json({ error: 'Likeness consent is required, and the person must not be a minor. Nothing was recast.' }, { status: 400 })
  }
  await recordConsent(userId, 'likeness', 'casting.recast')

  const creditKey = body.scope === 'face_only' ? 'recast_face_swap'
    : body.applyToAllClips ? 'recast_project_wide'
    : 'recast_full_character'

  try {
    await checkAndDeductCredits(userId, creditKey)
  } catch (err) {
    console.warn("[caught] src/app/api/casting/recast/route.ts:36", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: (err as Error).message }, { status: 402 })
  }

  try {
    // Fetch replacement character data if ID provided
    let replacementCharacter = body.replacementCharacter
    if (!replacementCharacter && body.replacementCharacterId) {
      const raw = await db.castMember.findUnique({ where: { id: body.replacementCharacterId } })
      if (!raw) {
        await refundOperationCredits(userId, creditKey)
        return NextResponse.json({ error: 'Replacement character not found' }, { status: 404 })
      }
      replacementCharacter = raw as unknown as CastMember
    }

    if (!replacementCharacter) {
      await refundOperationCredits(userId, creditKey)
      return NextResponse.json({ error: 'replacementCharacter or replacementCharacterId required' }, { status: 400 })
    }

    if (body.applyToAllClips) {
      const result = await recaster.recastAcrossProject({
        projectId: body.projectId,
        originalCharacterId: body.originalCharacterId,
        replacementCharacter,
        recastScope: body.scope as 'face_only' | 'full_character',
        userId,
      })
      return NextResponse.json({
        updatedClips: result.updatedClips,
        jobIds: result.jobIds,
        estimatedCredits: result.updatedClips * (body.scope === 'face_only' ? 8 : 15),
      })
    }

    if (!body.sourceVideoUrl) {
      await refundOperationCredits(userId, creditKey)
      return NextResponse.json({ error: 'sourceVideoUrl required for single clip recast' }, { status: 400 })
    }

    const originalCharacterRaw = await db.castMember.findUnique({ where: { id: body.originalCharacterId } })
    if (!originalCharacterRaw) {
      await refundOperationCredits(userId, creditKey)
      return NextResponse.json({ error: 'Original character not found' }, { status: 404 })
    }

    const outputUrl = await recaster.recastCharacter({
      sourceVideoUrl: body.sourceVideoUrl,
      originalCharacter: originalCharacterRaw as unknown as CastMember,
      replacementCharacter,
      recastScope: body.scope,
      preserveVoice: false,
      intensity: body.intensity ?? 0.85,
    })

    return NextResponse.json({ outputUrl })
  } catch (err) {
    console.warn("[caught] src/app/api/casting/recast/route.ts:93", err instanceof Error ? { name: err.name, message: err.message } : err)

    await refundOperationCredits(userId, creditKey)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Recast failed' }, { status: 500 })
  }
}
