import { db } from '@/lib/db'

export async function queryShotErrors(filters: {
  model?: string
  category?: string
  mode?: string
  endpoint?: string
  since?: Date
  limit?: number
}) {
  return db.shotError.findMany({
    where: {
      model: filters.model,
      category: filters.category,
      mode: filters.mode,
      endpoint: filters.endpoint,
      createdAt: filters.since ? { gte: filters.since } : undefined,
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(filters.limit ?? 50, 200),
  })
}

export async function unknownErrorBucket(limit = 40) {
  const rows = await db.shotError.findMany({
    where: { category: 'unknown' },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  const grouped = new Map<string, { signature: string; count: number; latest: (typeof rows)[number]; samples: string[] }>()
  for (const row of rows) {
    const existing = grouped.get(row.signature)
    if (!existing) {
      grouped.set(row.signature, {
        signature: row.signature,
        count: 1,
        latest: row,
        samples: [row.id],
      })
    } else {
      existing.count += 1
      existing.samples.push(row.id)
    }
  }
  return [...grouped.values()]
    .sort((a, b) => b.latest.createdAt.getTime() - a.latest.createdAt.getTime())
    .slice(0, limit)
}

export async function shotLifecycle(shotId: string) {
  const clip = await db.studioClip.findUnique({
    where: { id: shotId },
    select: {
      id: true,
      assignedModel: true,
      modelOverride: true,
      purpose: true,
      delegationReason: true,
      delegatedMode: true,
      falRequestId: true,
      status: true,
      prompt: true,
    },
  })
  const errors = await db.shotError.findMany({
    where: { shotId },
    orderBy: { createdAt: 'asc' },
  })
  const latest = errors[errors.length - 1]
  return {
    clip,
    errors,
    trace: {
      director: clip ? { prompt: clip.prompt, purpose: clip.purpose } : null,
      delegate: clip
        ? {
            model: clip.assignedModel,
            override: clip.modelOverride,
            reason: clip.delegationReason,
            mode: clip.delegatedMode,
          }
        : null,
      submit: {
        falRequestId: clip?.falRequestId ?? latest?.falRequestId ?? null,
        endpoint: latest?.endpoint ?? null,
        payload: latest?.payloadSnapshot ?? null,
      },
      error: latest
        ? {
            stage: latest.stage,
            category: latest.category,
            httpStatus: latest.httpStatus,
            rawError: latest.rawError,
            userMessage: latest.userMessage,
          }
        : null,
    },
  }
}

export async function errorAlerts() {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [recent, previous, unknowns, recurring, missingShot, missingRequest] = await Promise.all([
    db.shotError.count({ where: { correctable: true, createdAt: { gte: hourAgo } } }),
    db.shotError.count({ where: { correctable: true, createdAt: { gte: dayAgo, lt: hourAgo } } }),
    db.shotError.groupBy({
      by: ['signature'],
      where: { category: 'unknown', createdAt: { gte: dayAgo } },
      _count: { signature: true },
    }),
    db.shotError.findMany({
      where: { correctable: true, createdAt: { gte: dayAgo } },
      select: { signature: true, correction: true, endpoint: true, model: true },
      take: 100,
    }),
    db.shotError.count({ where: { shotId: null, createdAt: { gte: dayAgo } } }),
    db.shotError.count({
      where: {
        createdAt: { gte: dayAgo },
        falRequestId: null,
        stage: { in: ['poll', 'completion'] },
      },
    }),
  ])
  const unknownRecurring = unknowns.filter((row) => row._count.signature >= 2)
  const correctionCounts = new Map<string, number>()
  for (const row of recurring) {
    const key = `${row.model}:${row.signature}`
    correctionCounts.set(key, (correctionCounts.get(key) ?? 0) + 1)
  }
  const stuckFixes = [...correctionCounts.entries()]
    .filter(([, count]) => count >= 3)
    .map(([key, count]) => ({ key, count }))

  return {
    correctableLastHour: recent,
    correctablePriorDayHourlyAvg: Number((previous / 23).toFixed(2)),
    risingCorrectable: recent > 3 && recent > (previous / 23) * 2,
    unknownRecurring: unknownRecurring.map((row) => ({
      signature: row.signature,
      count: row._count.signature,
    })),
    stuckFixes,
    missingCorrelation: {
      noShotId: missingShot,
      pollWithoutFalRequestId: missingRequest,
      leaked: missingShot > 0 || missingRequest > 0,
    },
  }
}

export async function latestShotError(shotId: string) {
  return db.shotError.findFirst({
    where: { shotId },
    orderBy: { createdAt: 'desc' },
  })
}
