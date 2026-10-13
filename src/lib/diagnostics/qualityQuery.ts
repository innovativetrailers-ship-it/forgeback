import { db } from '@/lib/db'

export async function queryQualityLogs(filters: {
  model?: string
  purpose?: string
  dimension?: string
  source?: string
  verdict?: string
  since?: Date
  limit?: number
}) {
  return db.qualityLog.findMany({
    where: {
      model: filters.model,
      purpose: filters.purpose,
      dimension: filters.dimension,
      source: filters.source,
      verdict: filters.verdict,
      createdAt: filters.since ? { gte: filters.since } : undefined,
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(filters.limit ?? 50, 200),
  })
}

export async function unexplainedQualityBucket(limit = 40) {
  const rows = await db.qualityLog.findMany({
    where: {
      source: 'vision',
      verdict: { in: ['fail', 'soft_fail'] },
      OR: [{ reason: null }, { reason: '' }, { dimension: 'unexplained' }],
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  const shotIds = rows.map((row) => row.shotId).filter((id): id is string => Boolean(id))
  const rated = shotIds.length
    ? await db.shotRating.findMany({
      where: { shotId: { in: shotIds } },
      select: { shotId: true },
    })
    : []
  const ratedIds = new Set(rated.map((row) => row.shotId))
  const unexplained = rows.filter((row) => !row.shotId || !ratedIds.has(row.shotId))
  const grouped = new Map<string, { key: string; count: number; latest: (typeof rows)[number]; samples: string[] }>()
  for (const row of unexplained) {
    const key = `${row.model}:${row.purpose ?? 'none'}:${row.dimension ?? 'unexplained'}`
    const existing = grouped.get(key)
    if (!existing) {
      grouped.set(key, { key, count: 1, latest: row, samples: [row.id] })
    } else {
      existing.count += 1
      existing.samples.push(row.id)
    }
  }
  return [...grouped.values()]
    .sort((a, b) => b.latest.createdAt.getTime() - a.latest.createdAt.getTime())
    .slice(0, limit)
}

export async function qualityTrends(days = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const rows = await db.qualityLog.findMany({
    where: { createdAt: { gte: since } },
    select: {
      model: true,
      purpose: true,
      dimension: true,
      verdict: true,
      characterMatch: true,
      createdAt: true,
      source: true,
    },
  })
  const byModel = new Map<string, {
    model: string
    total: number
    fails: number
    characterSum: number
    characterN: number
    byDay: Record<string, { total: number; fails: number }>
  }>()
  for (const row of rows) {
    const day = row.createdAt.toISOString().slice(0, 10)
    const entry = byModel.get(row.model) ?? {
      model: row.model,
      total: 0,
      fails: 0,
      characterSum: 0,
      characterN: 0,
      byDay: {},
    }
    entry.total += 1
    if (row.verdict !== 'pass') entry.fails += 1
    if (typeof row.characterMatch === 'number') {
      entry.characterSum += row.characterMatch
      entry.characterN += 1
    }
    const dayRow = entry.byDay[day] ?? { total: 0, fails: 0 }
    dayRow.total += 1
    if (row.verdict !== 'pass') dayRow.fails += 1
    entry.byDay[day] = dayRow
    byModel.set(row.model, entry)
  }
  return [...byModel.values()].map((row) => ({
    model: row.model,
    total: row.total,
    fails: row.fails,
    failRate: row.total ? Number((row.fails / row.total).toFixed(3)) : 0,
    avgCharacterMatch: row.characterN ? Number((row.characterSum / row.characterN).toFixed(3)) : null,
    byDay: row.byDay,
  }))
}

export async function latestQualityLog(shotId: string) {
  return db.qualityLog.findFirst({
    where: { shotId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function latestQualityByShotIds(shotIds: string[]) {
  if (!shotIds.length) return new Map<string, Awaited<ReturnType<typeof latestQualityLog>>>()
  const rows = await db.qualityLog.findMany({
    where: { shotId: { in: shotIds } },
    orderBy: { createdAt: 'desc' },
  })
  const first = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    if (row.shotId && !first.has(row.shotId)) first.set(row.shotId, row)
  }
  return first
}
