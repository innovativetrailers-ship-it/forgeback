import { NextRequest, NextResponse } from 'next/server'
import { auth }                       from '@/lib/auth'
import { checkAndDeductCredits,
         refundCredits }              from '@/lib/credits'
import { applyMorphCut }             from '@/lib/timeline/MorphCut'

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId  = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    clipAUrl:   string
    clipBUrl:   string
    frames?:    number
    blendMode?: 'film' | 'dissolve'
  }

  const { clipAUrl, clipBUrl } = body
  if (!clipAUrl || !clipBUrl) {
    return NextResponse.json({ error: 'clipAUrl and clipBUrl required' }, { status: 400 })
  }

  await checkAndDeductCredits(userId, 'morph_cut')

  try {
    const result = await applyMorphCut(body)
    return NextResponse.json(result)
  } catch (err) {
    await refundCredits(userId, 15, 'Morph cut failed')
    console.error('[timeline/morphcut]', err)
    return NextResponse.json({ error: 'Morph cut failed' }, { status: 500 })
  }
}
