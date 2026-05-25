import { NextRequest, NextResponse } from 'next/server'
import { listCharacters } from '@/lib/vault/character'

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projectId = request.nextUrl.searchParams.get('projectId') ?? undefined

  const characters = await listCharacters(projectId, userId)
  return NextResponse.json(characters)
}
