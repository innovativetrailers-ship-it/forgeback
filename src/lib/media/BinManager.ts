// @ts-nocheck — schema migration in progress (MediaBin ↔ BinClipEntry)
/**
 * Avid-style media bin management.
 * Bins are colour-coded organisational containers for clips within a project.
 * Supports nested bins, semantic search, ratings, and AI auto-organisation.
 */

import { db } from '../db'
import { claudeCall, claudeText } from '@/lib/llm/anthropicClient'

export interface BinClip {
  id: string
  name: string
  duration: number
  frameRate: number
  resolution: string
  mediaUrl: string
  proxyUrl?: string
  thumbnailUrl?: string
  modelUsed?: string
  cameraAngle?: string
  scene?: string
  take?: number
  tags: string[]
  rating: 1 | 2 | 3 | 4 | 5 | null
  colour?: string
  inPoint?: number
  outPoint?: number
}

export interface MediaBin {
  id: string
  name: string
  projectId: string
  parentId?: string | null
  colour?: string | null
  createdAt: Date
  clips: BinClip[]
}

// ── Bin CRUD ─────────────────────────────────────────────────────────────────

export async function createBin(params: {
  name: string
  projectId: string
  parentId?: string
  colour?: string
}): Promise<MediaBin> {
  const bin = await db.mediaBin.create({
    data: {
      name: params.name,
      projectId: params.projectId,
      parentId: params.parentId ?? null,
      colour: params.colour,
    },
    include: { clips: true },
  })

  return {
    ...bin,
    clips: bin.clips.map(normaliseBinClip),
  }
}

export async function getBinsForProject(projectId: string): Promise<MediaBin[]> {
  const bins = await db.mediaBin.findMany({
    where: { projectId, retiredAt: null },
    include: { clips: { where: { retiredAt: null } } },
    orderBy: { createdAt: 'asc' },
  })
  return bins.map(b => ({ ...b, clips: b.clips.map(normaliseBinClip) }))
}

export async function deleteBin(binId: string): Promise<void> {
  const retiredAt = new Date()
  await db.binClipEntry.updateMany({ where: { binId }, data: { retiredAt } })
  await db.mediaBin.update({ where: { id: binId }, data: { retiredAt } })
}

// ── Clip management ───────────────────────────────────────────────────────────

export async function addClipToBin(params: {
  binId: string
  clip: Omit<BinClip, 'id'>
}): Promise<BinClip> {
  const entry = await db.binClipEntry.create({
    data: {
      binId: params.binId,
      name: params.clip.name,
      clipUrl: params.clip.mediaUrl,
      duration: params.clip.duration,
      modelUsed: params.clip.modelUsed ?? null,
      rating: params.clip.rating ?? null,
      tags: params.clip.tags,
      inPoint: params.clip.inPoint ?? null,
      outPoint: params.clip.outPoint ?? null,
    },
  })
  return normaliseBinClip(entry)
}

export async function moveToBin(clipIds: string[], binId: string): Promise<void> {
  await db.binClipEntry.updateMany({
    where: { id: { in: clipIds } },
    data: { binId },
  })
}

export async function updateClipRating(clipId: string, rating: 1 | 2 | 3 | 4 | 5 | null): Promise<void> {
  await db.binClipEntry.update({
    where: { id: clipId },
    data: { rating },
  })
}

export async function updateClipTags(clipId: string, tags: string[]): Promise<void> {
  await db.binClipEntry.update({
    where: { id: clipId },
    data: { tags },
  })
}

export async function removeClipFromBin(clipId: string): Promise<void> {
  await db.binClipEntry.update({ where: { id: clipId }, data: { retiredAt: new Date() } })
}

// ── Semantic search ───────────────────────────────────────────────────────────

export async function findClips(query: string, projectId: string): Promise<BinClip[]> {
  // Fetch all clips in this project across all bins
  const bins = await db.mediaBin.findMany({
    where: { projectId },
    include: { clips: true },
  })
  const allClips = bins.flatMap(b => b.clips)

  if (allClips.length === 0) return []

  // Simple keyword match first
  const queryLower = query.toLowerCase()
  const keywordMatches = allClips.filter(c => {
    const searchable = [c.name, c.modelUsed ?? '', ...(c.tags ?? [])].join(' ').toLowerCase()
    return searchable.includes(queryLower)
  })

  if (keywordMatches.length > 0) {
    return keywordMatches.map(normaliseBinClip)
  }

  // Fall back to AI semantic search
  const clipSummaries = allClips.map(c => ({
    id: c.id,
    summary: `name: ${c.name}, tags: ${(c.tags ?? []).join(',')}, model: ${c.modelUsed ?? 'unknown'}`,
  }))

  const response = await claudeCall({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Find clips matching the query "${query}" from this list. Return ONLY a JSON array of matching IDs.\nClips:\n${clipSummaries.map(c => `${c.id}: ${c.summary}`).join('\n')}`,
      },
    ],
  }, { source: 'media.bin' })

  try {
    const text = claudeText(response) || '[]'
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    const matchedIds = jsonMatch ? (JSON.parse(jsonMatch[0]) as string[]) : []
    const matchedClips = allClips.filter(c => matchedIds.includes(c.id))
    return matchedClips.map(normaliseBinClip)
  } catch (err) {
    console.warn("[caught] src/lib/media/BinManager.ts:173", err instanceof Error ? { name: err.name, message: err.message } : err)

    return []
  }
}

// ── AI auto-organisation ──────────────────────────────────────────────────────

export async function autoOrganiseBins(projectId: string): Promise<{ created: number; moved: number }> {
  const bins = await db.mediaBin.findMany({
    where: { projectId },
    include: { clips: true },
  })
  const allClips = bins.flatMap(b => b.clips)

  if (allClips.length === 0) return { created: 0, moved: 0 }

  const response = await claudeCall({
    model: 'claude-haiku-4-5',
    max_tokens: 2048,
    system: 'You are a film editor organising media bins. Analyse clips and group them into logical bins by scene, character, or camera angle. Return JSON only.',
    messages: [
      {
        role: 'user',
        content: `Organise these ${allClips.length} clips into bins. Return JSON: { "bins": [ { "name": "Bin name", "colour": "#hex", "clipIds": ["id1","id2"] } ] }

Clips:
${allClips.map(c => `${c.id}: ${c.name} | tags: ${(c.tags ?? []).join(',')} | model: ${c.modelUsed ?? 'unknown'}`).join('\n')}`,
      },
    ],
  }, { source: 'media.bin' })

  const text = claudeText(response) || '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return { created: 0, moved: 0 }

  const plan = JSON.parse(jsonMatch[0]) as {
    bins: Array<{ name: string; colour?: string; clipIds: string[] }>
  }

  let created = 0
  let moved = 0

  for (const binPlan of plan.bins ?? []) {
    if (!binPlan.clipIds?.length) continue

    const bin = await db.mediaBin.create({
      data: {
        name: binPlan.name,
        projectId,
        colour: binPlan.colour ?? null,
      },
    })
    created++

    for (const clipId of binPlan.clipIds) {
      await db.binClipEntry.updateMany({
        where: { id: clipId },
        data: { binId: bin.id },
      })
      moved++
    }
  }

  return { created, moved }
}

// ── Helper ────────────────────────────────────────────────────────────────────

function normaliseBinClip(entry: {
  id: string
  name: string
  clipUrl: string
  duration: number
  modelUsed?: string | null
  rating?: number | null
  tags: string[]
  inPoint?: number | null
  outPoint?: number | null
}): BinClip {
  return {
    id: entry.id,
    name: entry.name,
    duration: entry.duration,
    frameRate: 24,
    resolution: '1920x1080',
    mediaUrl: entry.clipUrl,
    modelUsed: entry.modelUsed ?? undefined,
    tags: entry.tags ?? [],
    rating: (entry.rating as 1 | 2 | 3 | 4 | 5 | null) ?? null,
    inPoint: entry.inPoint ?? undefined,
    outPoint: entry.outPoint ?? undefined,
  }
}
