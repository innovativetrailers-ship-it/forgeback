import { db } from '../db'

export async function createLocation(params: {
  projectId: string
  name: string
  source: 'MAPILLARY' | 'CESIUM' | 'OSM_FALLBACK' | 'USER_UPLOAD'
  lat?: number
  lng?: number
  imageUrls?: string[]
  generativePrompt?: string
  hdriUrl?: string
  depthMapUrl?: string
  metaJson?: Record<string, unknown>
}) {
  const project = await db.project.findUnique({
    where: { id: params.projectId },
    select: { userId: true },
  })
  if (!project) throw new Error('Project not found')
  return db.asset.create({
    data: {
      ownerId: project.userId,
      kind: 'location',
      label: params.name,
      sourcePrompt: params.generativePrompt ?? params.name,
      generatedImage: params.imageUrls?.[0],
      sourceRefs: params.imageUrls ?? [],
      usableAsReference: Boolean(params.imageUrls?.[0]),
      boundary: {
        projectId: params.projectId,
        source: params.source,
        lat: params.lat ?? null,
        lng: params.lng ?? null,
        hdriUrl: params.hdriUrl ?? null,
        depthMapUrl: params.depthMapUrl ?? null,
        look: params.metaJson?.look ?? null,
      },
    },
  })
}

export async function listLocations(projectId: string) {
  return db.asset.findMany({
    where: { kind: 'location', boundary: { path: ['projectId'], equals: projectId } },
    orderBy: { createdAt: 'desc' },
  })
}
