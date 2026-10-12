import { NextRequest, NextResponse } from 'next/server'
import { getFCCCharacter } from '@/lib/character/fccManager'
import { deleteCharacter } from '@/lib/vault/character'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const character = await getFCCCharacter(id, userId)
  if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(character)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await deleteCharacter(id)
  return NextResponse.json({ deleted: true })
}
