import { normalizeBreakdown, type EntityVariation, type ProductionBreakdown, type ResolvableEntity, type ResolutionState } from '@cinema/core'
import type { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { forgeAssetFromRow, type AssetKind } from '@/lib/assets/shape'

function assetIdFor(projectId: string, entityId: string): string {
  return `prod_${projectId}_${entityId}`.replace(/[^a-zA-Z0-9_:-]/g, '_')
}

function kindFor(kind: string): AssetKind {
  if (kind === 'character' || kind === 'location' || kind === 'asset') return kind
  return 'asset'
}

function storedVariations(value: unknown): EntityVariation[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as EntityVariation
    if (!row.variantId) return []
    return [row]
  })
}

function mergeStoredVariations(stored: unknown, incoming: EntityVariation[] | undefined): EntityVariation[] {
  const byId = new Map(storedVariations(stored).map((row) => [row.variantId, row]))
  for (const next of incoming ?? []) {
    const prev = byId.get(next.variantId)
    byId.set(next.variantId, {
      ...next,
      generatedImage: next.generatedImage || prev?.generatedImage || null,
      resolutionState: next.generatedImage ? next.resolutionState : (prev?.resolutionState ?? next.resolutionState),
      appearsInShots: next.appearsInShots.length ? next.appearsInShots : (prev?.appearsInShots ?? []),
    })
  }
  return [...byId.values()]
}

export async function saveProductionBreakdown(
  userId: string,
  projectId: string,
  breakdown: ProductionBreakdown,
): Promise<void> {
  const project = await db.project.findFirst({ where: { id: projectId, userId }, select: { id: true } })
  if (!project) throw new Error('Project not found')
  await db.project.update({
    where: { id: projectId },
    data: { productionBreakdown: JSON.parse(JSON.stringify(breakdown)) },
  })
  for (const entity of breakdown.entities) {
    const id = assetIdFor(projectId, entity.id)
    const existing = await db.asset.findUnique({ where: { id } })
    if (!existing) {
      await db.asset.create({
        data: {
          id,
          ownerId: userId,
          kind: kindFor(entity.kind),
          sourcePrompt: entity.descriptor,
          appearsInShots: entity.appearsInShots,
          resolutionState: 'unresolved',
          isPrimary: entity.isPrimary !== false,
          variations: (entity.variations ?? []) as unknown as Prisma.InputJsonValue,
        },
      })
      continue
    }
    await db.asset.update({
      where: { id },
      data: {
        appearsInShots: entity.appearsInShots,
        sourcePrompt: existing.sourcePrompt || entity.descriptor,
        isPrimary: existing.isPrimary,
        variations: mergeStoredVariations(existing.variations, entity.variations) as unknown as Prisma.InputJsonValue,
      },
    })
  }
}

export async function loadProductionBreakdown(userId: string, projectId: string): Promise<ProductionBreakdown | null> {
  const project = await db.project.findFirst({
    where: { id: projectId, userId },
    select: { productionBreakdown: true },
  })
  if (!project?.productionBreakdown || typeof project.productionBreakdown !== 'object') return null
  return normalizeBreakdown(project.productionBreakdown)
}

export async function addEntityVariation(
  userId: string,
  projectId: string,
  entityId: string,
  label: string,
  modifierPrompt: string,
): Promise<ProductionBreakdown> {
  const breakdown = await loadProductionBreakdown(userId, projectId)
  if (!breakdown) throw new Error('Import a plan before adding a variation')
  const entity = breakdown.entities.find((row) => row.id === entityId)
  if (!entity) throw new Error('Entity not found')
  const name = label.trim()
  if (!name) throw new Error('A variation needs a name')
  const variantId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `var-${Date.now()}`
  const next: EntityVariation = {
    variantId,
    label: name,
    generatedFrom: entity.id,
    modifierPrompt: modifierPrompt.trim() || name,
    generatedImage: null,
    resolutionState: 'unresolved',
    appearsInShots: [],
  }
  const variations = [...(entity.variations ?? []).filter((row) => row.variantId !== variantId), next]
  const updated: ProductionBreakdown = {
    ...breakdown,
    entities: breakdown.entities.map((row) => row.id === entityId ? { ...row, isPrimary: true, variations } : row),
  }
  await saveProductionBreakdown(userId, projectId, updated)
  return updated
}

export async function loadEntityResolutions(userId: string, projectId: string, breakdown: ProductionBreakdown): Promise<ResolvableEntity[]> {
  const ids = breakdown.entities.map((entity) => assetIdFor(projectId, entity.id))
  const rows = ids.length
    ? await db.asset.findMany({ where: { ownerId: userId, id: { in: ids } } })
    : []
  const byId = new Map(rows.map((row) => [row.id, row]))
  return breakdown.entities.map((entity) => {
    const row = byId.get(assetIdFor(projectId, entity.id))
    const shaped = row ? forgeAssetFromRow(row) : null
    return {
      id: entity.id,
      name: entity.name,
      descriptor: entity.descriptor,
      sourcePrompt: shaped?.sourcePrompt ?? entity.descriptor,
      sourceRefs: shaped?.sourceRefs ?? [],
      generatedImage: shaped?.generatedImage ?? null,
      trainedLoRA: shaped?.trainedLoRA ?? null,
      resolutionState: (shaped?.resolutionState ?? 'unresolved') as ResolutionState,
    }
  })
}

export function productionAssetId(projectId: string, entityId: string): string {
  return assetIdFor(projectId, entityId)
}
