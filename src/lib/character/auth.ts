import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/requireUser'

export async function requireUserId(request: NextRequest): Promise<string | NextResponse> {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return userId
}

export async function requireVaultCharacter(characterId: string, userId: string) {
  const character = await db.vaultCharacter.findUnique({
    where: { id: characterId },
    include: { project: { select: { userId: true } } },
  })
  if (!character || character.project.userId !== userId) return null
  return character
}
