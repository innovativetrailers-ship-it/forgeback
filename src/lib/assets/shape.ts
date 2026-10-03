export const ASSET_KINDS = ['character', 'location', 'style', 'asset', 'voice'] as const
export type AssetKind = (typeof ASSET_KINDS)[number]

export interface TrainedLoRA {
  weightsKey: string
  baseModel: string
  baseVersion: string
  baseBackupKey: string
}

export const RESOLUTION_STATES = ['unresolved', 'imported', 'generated', 'trained'] as const
export type ResolutionState = (typeof RESOLUTION_STATES)[number]

export interface ForgeAsset {
  id: string
  ownerId: string
  kind: AssetKind
  sourcePrompt: string | null
  sourceRefs: string[]
  generatedImage: string | null
  trainedLoRA: TrainedLoRA | null
  usableAsReference: boolean
  isPrimary: boolean
  variations: Array<{
    variantId: string
    label: string
    generatedFrom: string
    modifierPrompt: string
    generatedImage?: string | null
    resolutionState: ResolutionState
    appearsInShots: string[]
  }>
  resolutionState: ResolutionState
  appearsInShots: string[]
  createdAt: string
  updatedAt: string
}

export function forgeAssetFromRow(row: {
  id: string
  ownerId: string
  kind: string
  sourcePrompt: string | null
  sourceRefs: string[]
  generatedImage: string | null
  weightsKey: string | null
  baseModel: string | null
  baseVersion: string | null
  baseBackupKey: string | null
  usableAsReference: boolean
  isPrimary?: boolean | null
  variations?: unknown
  resolutionState?: string | null
  appearsInShots?: string[] | null
  createdAt: Date
  updatedAt: Date
}): ForgeAsset {
  const kind = (ASSET_KINDS as readonly string[]).includes(row.kind) ? row.kind as AssetKind : 'asset'
  const trainedLoRA = row.weightsKey && row.baseModel && row.baseVersion && row.baseBackupKey
    ? {
      weightsKey: row.weightsKey,
      baseModel: row.baseModel,
      baseVersion: row.baseVersion,
      baseBackupKey: row.baseBackupKey,
    }
    : null
  return {
    id: row.id,
    ownerId: row.ownerId,
    kind,
    sourcePrompt: row.sourcePrompt,
    sourceRefs: row.sourceRefs,
    generatedImage: row.generatedImage,
    trainedLoRA,
    usableAsReference: row.usableAsReference,
    isPrimary: row.isPrimary !== false,
    variations: Array.isArray(row.variations)
      ? row.variations.flatMap((item) => {
        if (!item || typeof item !== 'object') return []
        const variation = item as ForgeAsset['variations'][number]
        if (!variation.variantId) return []
        return [variation]
      })
      : [],
    resolutionState: (RESOLUTION_STATES as readonly string[]).includes(row.resolutionState ?? '')
      ? row.resolutionState as ResolutionState
      : 'unresolved',
    appearsInShots: row.appearsInShots ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
