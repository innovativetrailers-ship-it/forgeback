import { NextRequest, NextResponse } from 'next/server'
import { getFCCCharacter } from '@/lib/character/fccManager'
import { serializeFCC } from '@/lib/character/fccSchema'
import { requireUserId } from '@/lib/character/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId(request)
  if (userId instanceof NextResponse) return userId

  const { id } = await params
  const character = await getFCCCharacter(id, userId)
  if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const json = serializeFCC(character)
  return new NextResponse(json, {
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="${character.name.replace(/\s+/g, '_')}.fcc"`,
    },
  })
}
