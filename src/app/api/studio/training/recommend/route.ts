import { NextRequest, NextResponse } from 'next/server'
import { isStudioTab, recommendTrainer, trainingCostUsd, domainFromSubcategory, importPrep, presetsForFamily, isGenreFamily } from '@cinema/core'
import { OPERATION_COSTS } from '@/lib/credits'

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tab = req.nextUrl.searchParams.get('tab') ?? ''
  const subcategory = req.nextUrl.searchParams.get('subcategory') ?? undefined
  const kinds = (req.nextUrl.searchParams.get('kinds') ?? '')
    .split(',')
    .filter((value): value is 'image' | 'video' | 'audio' =>
      value === 'image' || value === 'video' || value === 'audio',
    )
  if (!isStudioTab(tab) || tab === 'voices') {
    return NextResponse.json({ error: 'Tab has no LoRA trainer' }, { status: 400 })
  }
  try {
    const picked = recommendTrainer({ tab, subcategory, kinds })
    const steps = Number(req.nextUrl.searchParams.get('steps') ?? 1000)
    const costUsd = trainingCostUsd(picked.trainer, steps)
    const domain = domainFromSubcategory(subcategory)
    const prep = domain ? importPrep({ domain, kinds, tab }) : null
    return NextResponse.json({
      trainerKey: picked.trainerKey,
      trainerId: picked.trainer.id,
      trains: picked.trainer.trains,
      costPerStep: picked.trainer.costPerStep,
      minItems: picked.trainer.dataset.minItems,
      types: picked.trainer.dataset.types,
      captions: picked.trainer.dataset.captions,
      triggerPhrase: picked.trainer.dataset.triggerPhrase,
      steps,
      costUsd,
      creditCost: OPERATION_COSTS.lora_training ?? 50,
      captionGuidance: prep?.captionGuidance ?? null,
      isolateSubject: prep?.isolateSubject ?? (tab === 'cast' || tab === 'assets'),
      requiresOwnedOrLicensed: prep?.requiresOwnedOrLicensed ?? false,
      requiresSubjectConsent: tab === 'cast',
      rightsNotice: prep?.rightsNotice ?? null,
      presets: domain && isGenreFamily(domain) ? presetsForFamily(domain).map((row) => ({
        id: row.id,
        label: row.label,
        family: row.family,
      })) : [],
    })
  } catch (err) {
    console.warn("[caught] src/app/api/studio/training/recommend/route.ts:47", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'No trainer' },
      { status: 400 },
    )
  }
}
