import { NextRequest, NextResponse } from 'next/server'
import { promptToChoreography } from '@/lib/character/choreography'
import { getFCCCharacter } from '@/lib/character/fccManager'
import { requireUserId } from '@/lib/character/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId(request)
  if (userId instanceof NextResponse) return userId

  const { id } = await params
  const body = (await request.json()) as { actionPrompt?: string; durationSec?: number }
  if (!body.actionPrompt) {
    return NextResponse.json({ error: 'actionPrompt required' }, { status: 400 })
  }

  const char = await getFCCCharacter(id, userId)
  if (!char) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const plan = await promptToChoreography(char, body.actionPrompt, Number(body.durationSec ?? 6))
  return NextResponse.json(plan)
}
