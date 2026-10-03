import { parsePremiseLock, type PremiseLock } from '@cinema/core'
import type { PatientZeroAssets } from '@/lib/orchestration/types'
import { db } from '@/lib/db'
import { queryProjectRAG, type ProjectRagHit } from './embed'

export interface ProjectGenerationContext {
  premise: PremiseLock | null
  rag: ProjectRagHit[]
  styleSummary: string | null
  characters: PatientZeroAssets['characters']
  locations: PatientZeroAssets['locations']
  voices: Array<{ name: string; voiceId: string; candidate: boolean }>
  shotBoundaries: Array<{ start: number; end: number }>
}

export async function loadProjectGenerationContext(input: {
  userId: string
  projectId: string
  query?: string
}): Promise<ProjectGenerationContext> {
  const { memoryAllows } = await import('@/lib/privacy/gate')
  const projectMemory = await memoryAllows(input.userId, 'project')
  const project = await db.project.findUnique({
    where: { id: input.projectId, userId: input.userId },
    select: { premiseLock: true, timelineJson: true, description: true, title: true },
  })
  const [characters, locations, voices, rag] = await Promise.all([
    db.vaultCharacter.findMany({
      where: { projectId: input.projectId },
      select: { name: true, referenceUrls: true },
    }),
    db.vaultLocation.findMany({
      where: { projectId: input.projectId },
      select: { name: true, referenceUrls: true, metaJson: true },
    }),
    db.clonedVoice.findMany({
      where: { userId: input.userId },
      select: { name: true, voiceId: true, source: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    projectMemory
      ? queryProjectRAG(input.userId, input.projectId, input.query ?? project?.title ?? 'project', 8).catch((err) => {
        console.warn("[caught] src/lib/ingest/context.ts:40", err instanceof Error ? { name: err.name, message: err.message } : err)
        return ([])
      })
      : Promise.resolve([]),
  ])

  const styleFromLoc = projectMemory
    ? locations
      .map((row) => {
        const meta = row.metaJson as { look?: { summary?: string } } | null
        return meta?.look?.summary
      })
      .find((s): s is string => Boolean(s))
    : undefined
  const styleFromRag = rag.find((hit) => /palette|contrast|style/i.test(hit.summary))?.summary
  const shotBoundaries = boundariesFromRecipe(project?.timelineJson)

  return {
    premise: parsePremiseLock(project?.premiseLock),
    rag,
    styleSummary: styleFromLoc ?? styleFromRag ?? null,
    characters: characters
      .filter((row) => row.referenceUrls[0])
      .map((row) => ({
        name: row.name,
        imageUrl: row.referenceUrls[0],
        embedUrl: row.referenceUrls[0],
      })),
    locations: locations
      .filter((row) => row.referenceUrls[0])
      .map((row) => ({ name: row.name, imageUrl: row.referenceUrls[0] })),
    voices: voices.map((row) => ({
      name: row.name,
      voiceId: row.voiceId,
      candidate: row.source === 'ingest_candidate' || row.voiceId.startsWith('candidate:'),
    })),
    shotBoundaries,
  }
}

function boundariesFromRecipe(raw: unknown): Array<{ start: number; end: number }> {
  if (!raw || typeof raw !== 'object') return []
  const recipe = raw as { tracks?: Array<{ clips?: Array<{ metadata?: { shotBoundaries?: unknown } }> }> }
  const clips = recipe.tracks?.flatMap((t) => t.clips ?? []) ?? []
  for (const clip of clips) {
    const bounds = clip.metadata?.shotBoundaries
    if (Array.isArray(bounds) && bounds.every(isBound)) return bounds
  }
  return []
}

function isBound(value: unknown): value is { start: number; end: number } {
  if (!value || typeof value !== 'object') return false
  const row = value as { start?: unknown; end?: unknown }
  return typeof row.start === 'number' && typeof row.end === 'number'
}

export function contextToPromptBlock(ctx: ProjectGenerationContext): string {
  const bits = [
    ctx.premise ? `PREMISE ${ctx.premise.story}` : '',
    ctx.styleSummary ? `LOOK ${ctx.styleSummary}` : '',
    ctx.rag.slice(0, 4).map((hit) => hit.summary).filter(Boolean).join(' | '),
  ].filter(Boolean)
  return bits.join('\n')
}
