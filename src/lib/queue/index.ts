import { Queue, QueueEvents, type QueueOptions } from 'bullmq'
import type { Redis } from 'ioredis'
import {
  EXPORT_QUEUE_NAME,
  RENDER_QUEUE_NAME,
  TRAINING_QUEUE_NAME,
} from './names'

// ─── Build-time guard ───────────────────────────────────────────────────────
const isBuildTime =
  process.env.NEXT_PHASE === 'phase-production-build' ||
  process.env.NEXT_PHASE === 'phase-export'

// ─── Stub used during `next build` ──────────────────────────────────────────
const queueStub = new Proxy({} as object, {
  get: (_t, prop) => {
    if (prop === 'add')    return async () => ({ id: 'stub' })
    if (prop === 'close')  return async () => {}
    if (prop === 'pause')  return async () => {}
    if (prop === 'resume') return async () => {}
    return () => {}
  },
}) as unknown as Queue

const eventStub = new Proxy({} as object, {
  get: () => async () => {},
}) as unknown as QueueEvents

// ─── Lazy connection (imported only when first queue is created) ─────────────
// Uses the prefix-free `queueConnection` — BullMQ rejects ioredis keyPrefix.
function getConnection(): Redis {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { queueConnection } = require('../redis') as { queueConnection: Redis }
  return queueConnection
}

// Key namespace must match the workers, which pass `prefix: bullMQPrefix`.
function getQueuePrefix(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { bullMQPrefix } = require('../redis') as { bullMQPrefix: string }
  return bullMQPrefix
}

// ─── Default job options ─────────────────────────────────────────────────────
const DEFAULT_JOB_OPTIONS: QueueOptions['defaultJobOptions'] = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { count: 500 },
  removeOnFail:     { count: 100 },
}

// Paid AI generations (render, LoRA training) call external providers (fal.ai)
// that CHARGE on every submit. Auto-retrying re-submits and multiplies the
// cost — a single timed-out job at attempts:3 = 3 paid generations. Fail once
// and let the user retry deliberately.
const PAID_JOB_OPTIONS: QueueOptions['defaultJobOptions'] = {
  ...DEFAULT_JOB_OPTIONS,
  attempts: 1,
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
      prefix: getQueuePrefix(),
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
      prefix: getQueuePrefix(),
    }))
  }
  return _events.get(name)!
}

// ─── Queue exports ────────────────────────────────────────────────────────────
// Using ES getters so callers write `renderQueue.add(...)` unchanged —
// no `.current` suffix required anywhere.
export const renderQueue       = new Proxy({} as Queue,       { get: (_, p) => Reflect.get(lazyQueue(RENDER_QUEUE_NAME,   { defaultJobOptions: PAID_JOB_OPTIONS }), p) })
export const trainingQueue     = new Proxy({} as Queue,       { get: (_, p) => Reflect.get(lazyQueue(TRAINING_QUEUE_NAME, { defaultJobOptions: PAID_JOB_OPTIONS }), p) })
export const exportQueue       = new Proxy({} as Queue,       { get: (_, p) => Reflect.get(lazyQueue(EXPORT_QUEUE_NAME),       p) })
export const upscaleQueue      = new Proxy({} as Queue,       { get: (_, p) => Reflect.get(lazyQueue('upscale'),      p) })
export const cameraQueue       = new Proxy({} as Queue,       { get: (_, p) => Reflect.get(lazyQueue('camera'),       p) })
export const renderQueueEvents = new Proxy({} as QueueEvents, { get: (_, p) => Reflect.get(lazyEvents(RENDER_QUEUE_NAME),      p) })

if (!isBuildTime) {
  lazyEvents(RENDER_QUEUE_NAME).on('error', (e: Error) => {
    console.error('[queue_events_error]', String(e))
  })
}

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
