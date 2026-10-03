import { nanoid } from 'nanoid'
import { db } from '@/lib/db'
import { contentTypeForKey, isLibraryKind, readBoundary, type LibraryFolder, type LibraryItem, type LibraryKind } from './model'

export async function ensureMainFolder(projectId: string): Promise<LibraryFolder> {
  const existing = await db.mediaFolder.findFirst({ where: { projectId, kind: 'main' } })
  if (existing) return toFolder(existing)
  const created = await db.mediaFolder.create({
    data: { projectId, name: 'Main', kind: 'main', order: 0 },
  })
  return toFolder(created)
}

export async function ensureSceneFolder(projectId: string, sceneId: string, name: string): Promise<LibraryFolder> {
  const existing = await db.mediaFolder.findFirst({ where: { projectId, kind: 'scene', sceneId } })
  if (existing) return toFolder(existing)
  const main = await ensureMainFolder(projectId)
  const created = await db.mediaFolder.create({
    data: {
      projectId,
      name: name.trim() || 'Scene',
      kind: 'scene',
      sceneId,
      parentId: main.id,
      order: 1,
    },
  })
  return toFolder(created)
}

function toFolder(row: {
  id: string
  projectId: string
  name: string
  parentId: string | null
  kind: string
  sceneId: string | null
  order: number
}): LibraryFolder {
  const kind = row.kind === 'scene' || row.kind === 'custom' ? row.kind : 'main'
  return { ...row, kind }
}

function thumbFor(row: { generatedImage: string | null; contentType: string | null; sourceRefs: string[] }): string | undefined {
  const image = row.generatedImage?.trim()
  if (image && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(image)) return image
  const type = (row.contentType ?? '').toLowerCase()
  if (type.startsWith('image/') && image) return image
  const ref = row.sourceRefs.find((item) => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(item))
  return ref
}

export async function listLibrary(userId: string, projectId: string): Promise<{
  folders: LibraryFolder[]
  items: LibraryItem[]
}> {
  const project = await db.project.findFirst({ where: { id: projectId, userId }, select: { id: true } })
  if (!project) throw new Error('Project not found')
  const main = await ensureMainFolder(projectId)
  const folders = (await db.mediaFolder.findMany({
    where: { projectId },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
  })).map(toFolder)
  const folderIds = new Set(folders.map((folder) => folder.id))
  const assets = await db.asset.findMany({
    where: { ownerId: userId, mediaKind: { not: null } },
    orderBy: { createdAt: 'desc' },
  })
  const items: LibraryItem[] = assets
    .filter((row) => row.mediaKind && isLibraryKind(row.mediaKind))
    .filter((row) => !row.folderId || folderIds.has(row.folderId))
    .map((row) => ({
      id: row.id,
      kind: row.mediaKind as LibraryKind,
      sourceUrl: `/api/media/${row.id}`,
      folderId: row.folderId ?? main.id,
      thumbUrl: thumbFor(row),
      label: row.label || row.sourcePrompt || row.mediaKind || 'Clip',
      createdBy: row.mediaKind === 'imported' ? 'import' : row.variationOf ? 'director' : 'generate',
      variationOf: row.variationOf,
      durationSec: 5,
      contentType: row.contentType ?? contentTypeForKey(row.sourceRefs[0] ?? '', row.contentType),
      transition: readBoundary(row.boundary),
    }))
  return { folders, items }
}

export async function createLibraryAsset(input: {
  userId: string
  projectId: string
  kind: LibraryKind
  storageKey: string
  label: string
  contentType?: string
  folderId?: string | null
  variationOf?: string | null
  sceneId?: string | null
  sceneName?: string | null
  shotId?: string | null
  transition?: LibraryItem['transition']
  pendingCopy?: boolean
}): Promise<LibraryItem> {
  const folder = input.sceneId
    ? await ensureSceneFolder(input.projectId, input.sceneId, input.sceneName || 'Scene')
    : input.folderId
      ? await db.mediaFolder.findFirst({ where: { id: input.folderId, projectId: input.projectId } })
      : await ensureMainFolder(input.projectId)
  const main = await ensureMainFolder(input.projectId)
  const folderId = folder?.id ?? main.id
  const id = `lib_${nanoid()}`
  await db.asset.create({
    data: {
      id,
      ownerId: input.userId,
      kind: 'video',
      sourceRefs: [input.storageKey],
      mediaKind: input.kind,
      label: input.label,
      folderId,
      variationOf: input.variationOf,
      appearsInShots: input.shotId ? [input.shotId] : [],
      contentType: contentTypeForKey(input.storageKey, input.contentType),
      usableAsReference: false,
      boundary: input.transition ?? undefined,
      pendingCopy: input.pendingCopy ?? false,
    },
  })
  return {
    id,
    kind: input.kind,
    sourceUrl: `/api/media/${id}`,
    folderId,
    label: input.label,
    createdBy: input.kind === 'imported' ? 'import' : input.variationOf ? 'director' : 'generate',
    variationOf: input.variationOf,
    durationSec: 5,
    contentType: contentTypeForKey(input.storageKey, input.contentType),
    transition: input.transition,
  }
}

export async function placeDirectorTakes(input: {
  userId: string
  projectId: string
  shots: Array<{
    sceneId: string
    sceneName: string
    primary: { storageKey: string; label: string; contentType?: string }
    variations?: Array<{ storageKey: string; label: string; contentType?: string }>
  }>
}): Promise<{ placements: LibraryItem[]; variations: LibraryItem[] }> {
  const placements: LibraryItem[] = []
  const variations: LibraryItem[] = []
  for (const shot of input.shots) {
    const folder = await ensureSceneFolder(input.projectId, shot.sceneId, shot.sceneName)
    const primary = await createLibraryAsset({
      userId: input.userId,
      projectId: input.projectId,
      kind: 'video',
      storageKey: shot.primary.storageKey,
      label: shot.primary.label,
      contentType: shot.primary.contentType,
      folderId: folder.id,
    })
    placements.push(primary)
    for (const take of shot.variations ?? []) {
      variations.push(await createLibraryAsset({
        userId: input.userId,
        projectId: input.projectId,
        kind: 'video',
        storageKey: take.storageKey,
        label: take.label,
        contentType: take.contentType,
        folderId: folder.id,
        variationOf: primary.id,
      }))
    }
  }
  return { placements, variations }
}
