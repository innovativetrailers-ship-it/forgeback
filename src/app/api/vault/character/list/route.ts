import { NextRequest, NextResponse } from 'next/server'
import { listCharacters } from '@/lib/vault/character'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(request: NextRequest) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projectId = request.nextUrl.searchParams.get('projectId') ?? undefined

  const characters = await listCharacters(projectId, userId)
  return NextResponse.json(characters)
}
