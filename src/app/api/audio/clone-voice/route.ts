import { cloneVoice }                                from '@/lib/engines/elevenLabs'
import { deductCredits, OPERATION_COSTS }            from '@/lib/credits'
import { db }                                        from '@/lib/db'
import { checkAccess, checkTierAccess }              from '@/lib/access/guard'
import { enforcePermission }                         from '@/lib/access/enforce'
import { isGenerationPaused }                        from '@/lib/generation/pause'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: Request) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (isGenerationPaused()) {
    return Response.json(
      { error: 'Generation is paused. Voice clone is a paid call.' },
      { status: 503 },
    )
  }

  const { name, description, audioUrls, subjectConsent } = await req.json() as {
    name:        string
    description: string
    audioUrls:   string[]
    subjectConsent?: boolean
  }
  if (subjectConsent !== true) {
    return Response.json(
      { error: 'Confirm the subject consents to a voice clone before training' },
      { status: 403 },
    )
  }

  // Tier check — voice cloning requires Studio or above
  const tierAccess = await checkTierAccess(userId, 'voice_clone')
  if (!tierAccess.allowed) {
    return Response.json({
      error:        tierAccess.reason,
      requiredTier: tierAccess.requiredTier,
      upgradeUrl:   '/pricing',
    }, { status: 403 })
  }

  const cost = OPERATION_COSTS['elevenlabs_clone_voice']
  const access = await checkAccess(userId, cost)
  if (!access.allowed) return Response.json({ error: access.reason }, { status: access.code })
  const voicePerm = enforcePermission(access.tier, 'voice_clone')
  if (!voicePerm.allowed) return Response.json({ error: voicePerm.reason, upgrade: voicePerm.upgrade }, { status: 403 })

  await deductCredits(db, userId, cost, `Clone voice: ${name}`)
  const { voiceId } = await cloneVoice({ name, description, audioUrls })
  await db.clonedVoice.create({ data: { userId, voiceId, name, description } })
  return Response.json({ voiceId })
}
