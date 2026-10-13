import { NextRequest, NextResponse } from 'next/server'
import { musicBreakdown, treatmentFromPlan } from '@/lib/orchestration/musicVideo'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[music-video]', err instanceof Error ? err.message : err)
    return null
  }) as { audioUrl?: string; rights?: boolean; duration?: number; bpm?: number; energy?: number[]; performer?: string } | null
  if (!body?.audioUrl?.trim()) return NextResponse.json({ error: 'A music video needs a track address' }, { status: 400 })
  if (body.rights !== true) {
    return NextResponse.json({ error: 'Music rights are required before a video can be made from this track' }, { status: 400 })
  }
  const plan = musicBreakdown({
    audioUrl: body.audioUrl.trim(),
    duration: body.duration ?? 60,
    bpm: body.bpm,
    energy: Array.isArray(body.energy) ? body.energy.filter((value) => typeof value === 'number') : undefined,
    performer: body.performer,
  })
  plan.rights = true
  return NextResponse.json({ ...plan, treatment: treatmentFromPlan(plan), metered: false })
}
