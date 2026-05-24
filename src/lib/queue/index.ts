import { Queue, QueueEvents, type QueueOptions } from 'bullmq'
import type { Redis } from 'ioredis'

// ─── Build-time guard ───────────────────────────────────────────────────────
const isBuildTime =
  process.env.NEXT_PHASE === 'phase-production-build' ||
  process.env.NEXT_PHASE === 'phase-export'

// ─── Stub used during `next build` ──────────────────────────────────────────
const queueStub = new Proxy({} as unknown, {
  get: (_t, prop) => {
    if (prop === 'add')    return async () => ({ id: 'stub' })
    if (prop === 'close')  return async () => {}
    if (prop === 'pause')  return async () => {}
    if (prop === 'resume') return async () => {}
    return () => {}
  },
}) as unknown as Queue

const eventStub = new Proxy({} as unknown, {
  get: () => async () => {},
}) as unknown as QueueEvents

// ─── Lazy connection (imported only when first queue is created) ─────────────
function getConnection(): Redis {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { redis } = require('../redis') as { redis: Redis }
  return redis
}

// ─── Default job options ─────────────────────────────────────────────────────
const DEFAULT_JOB_OPTIONS: QueueOptions['defaultJobOptions'] = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { count: 500 },
  removeOnFail:     { count: 100 },
}

// ─── Lazy queue factory ───────────────────────────────────────────────────────
// Queues are created on first access — not on module import.
// This prevents ioredis from connecting during `next build`.
const _queues = new Map<string, Queue>()
const _events = new Map<string, QueueEvents>()

function lazyQueue(name: string, extraOpts: Omit<QueueOptions, 'connection'> = {}): Queue {
  if (isBuildTime) return queueStub

  if (!_queues.has(name)) {
    _queues.set(name, new Queue(name, {
      connection: getConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
      ...extraOpts,
    }))
  }
  return _queues.get(name)!
}

function lazyEvents(name: string): QueueEvents {
  if (isBuildTime) return eventStub

  if (!_events.has(name)) {
    _events.set(name, new QueueEvents(name, {
      connection: getConnection(),
    }))
  }
  return _events.get(name)!
}

// ─── Queue exports ────────────────────────────────────────────────────────────
// Using ES getters so callers write `renderQueue.add(...)` unchanged —
// no `.current` suffix required anywhere.
export const renderQueue       = new Proxy({} as Queue,       { get: (_, p) => Reflect.get(lazyQueue('render'),       p) })
export const trainingQueue     = new Proxy({} as Queue,       { get: (_, p) => Reflect.get(lazyQueue('training'),     p) })
export const exportQueue       = new Proxy({} as Queue,       { get: (_, p) => Reflect.get(lazyQueue('export'),       p) })
export const upscaleQueue      = new Proxy({} as Queue,       { get: (_, p) => Reflect.get(lazyQueue('upscale'),      p) })
export const cameraQueue       = new Proxy({} as Queue,       { get: (_, p) => Reflect.get(lazyQueue('camera'),       p) })
export const renderQueueEvents = new Proxy({} as QueueEvents, { get: (_, p) => Reflect.get(lazyEvents('render'),      p) })

// ─── Graceful shutdown ────────────────────────────────────────────────────────
if (!isBuildTime) {
  const shutdown = async () => {
    await Promise.allSettled([
      ...[..._queues.values()].map(q => q.close()),
      ...[..._events.values()].map(e => e.close()),
    ])
  }
  process.on('beforeExit', shutdown)
  process.on('SIGTERM',    shutdown)
  process.on('SIGINT',     shutdown)
}

export function getPriorityForRole(role: string): number {
  switch (role) {
    case 'ADMIN':  return 1
    case 'STUDIO': return 5
    case 'PRO':    return 10
    default:       return 20
  }
}
