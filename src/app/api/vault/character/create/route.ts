import { NextRequest, NextResponse } from 'next/server'
import { createCharacter, queueCharacterLoraTraining } from '@/lib/vault/character'
import { CharacterIngestionError } from '@/lib/character/ingestion'
import { ensureOwnedProject } from '@/lib/projects/ensureOwnedProject'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(request: NextRequest) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await request.formData()
    const name = formData.get('name') as string
    const projectId = formData.get('projectId') as string
    const description = (formData.get('description') as string | null)?.trim() ?? ''
    const triggerWord = (formData.get('triggerWord') as string | null) ?? undefined
    const modelFamily = (formData.get('modelFamily') as string | null) ?? undefined
    const trainLora = formData.get('trainLora') === 'true'

    if (!name?.trim() || !projectId) {
      return NextResponse.json({ error: 'name and projectId required' }, { status: 400 })
    }

    try {
      await ensureOwnedProject(userId, projectId)
    } catch (err) {
      console.warn("[caught] src/app/api/vault/character/create/route.ts:25", err instanceof Error ? { name: err.name, message: err.message } : err)

      const message = err instanceof Error ? err.message : 'A saved project is required'
      const status = message === 'Forbidden' ? 403 : 400
      return NextResponse.json({ error: message }, { status })
    }

    const imageFiles = formData.getAll('images').filter(
      (f): f is File => f instanceof File && f.size > 0,
    )

    if (imageFiles.length === 0 && !description) {
      return NextResponse.json(
        { error: 'Upload at least one reference photo or provide a character description' },
        { status: 400 },
      )
    }

    const imageBuffers = await Promise.all(
      imageFiles.slice(0, 20).map(async (file) => ({
        buffer: Buffer.from(await file.arrayBuffer()),
        filename: file.name,
        contentType: file.type || 'image/jpeg',
      })),
    )

    const character = await createCharacter({
      userId,
      projectId,
      name: name.trim(),
      description: description || undefined,
      imageBuffers,
      triggerWord,
      modelFamily,
    })

    let jobId: string | undefined
    if (trainLora && character.referenceUrls.length > 0) {
      const word = triggerWord || name.toLowerCase().replace(/\s+/g, '_')
      const confirmedRaw = formData.get('confirmedCostUsd')
      const confirmedCostUsd = typeof confirmedRaw === 'string' ? Number(confirmedRaw) : Number.NaN
      jobId = await queueCharacterLoraTraining({
        userId,
        projectId,
        characterId: character.id,
        imageUrls: character.referenceUrls,
        triggerWord: word,
        confirmedCostUsd,
        subjectConsent: formData.get('subjectConsent') === 'true',
      })
    }

    return NextResponse.json({ ...character, jobId }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Character creation failed'
    const status = err instanceof CharacterIngestionError ? 422 : 500
    const details = err instanceof CharacterIngestionError ? err.details : undefined
    console.error('[vault/character/create]', err)
    return NextResponse.json({ error: message, details }, { status })
  }
}
