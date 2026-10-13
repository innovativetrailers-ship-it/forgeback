import { logCaught } from '@/lib/diagnostics/caught'
import Redis, { type RedisOptions } from 'ioredis'

export const CINEMA_KEY_PREFIX = 'cinema:'

const isBuildTime =
  process.env.NEXT_PHASE === 'phase-production-build' ||
  process.env.NEXT_PHASE === 'phase-export'

// Accepted REDIS_URL patterns (set ONE on Vercel/Railway):
//   rediss://default:<token>@<host>.upstash.io:6379  (preferred, all-in-one)
//   https://<host>.upstash.io  +  REDIS_TOKEN=<token>
//   redis://localhost:6379  (local / Docker)
function buildRedisUrl(): string {
  const raw = process.env.REDIS_URL ?? ''

  if (!raw || isBuildTime) return 'redis://build-placeholder:6379'

  if (raw.startsWith('https://') || raw.startsWith('http://')) {
    const token = process.env.REDIS_TOKEN
    if (!token) {
      throw new Error(
        '[Redis] REDIS_TOKEN is required when REDIS_URL is an HTTP endpoint. ' +
        'Or set REDIS_URL to the full rediss:// wire-protocol URL.'
      )
    }
    const host = raw.replace(/^https?:\/\//, '').replace(/\/$/, '')
    return `rediss://default:${token}@${host}:6379`
  }

  // Upstash TLS uses port 6379 (6380 times out); normalise legacy URLs.
  if (raw.startsWith('rediss://') && raw.includes(':6380')) {
    return raw.replace(':6380', ':6379')
  }

  return raw
}

function getRedisOptions(overrides: Partial<RedisOptions> = {}): RedisOptions {
  const url = buildRedisUrl()

  // Parse wire URL so TLS + IPv4 are explicit (fixes Railway → Upstash ETIMEDOUT).
  if (url.startsWith('rediss://') || url.startsWith('redis://')) {
    const parsed = new URL(url)
    return {
      host: parsed.hostname,
      port: Number(parsed.port) || 6379,
      username: parsed.username || 'default',
      password: decodeURIComponent(parsed.password),
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
      family: 4,
      connectTimeout: 15_000,
      ...overrides,
    }
  }

  return { ...overrides }
}

const TEARDOWN_MSGS = ['Connection is closed', "stream isn't writeable", 'ECONNRESET']

function suppressTeardown(client: Redis): Redis {
  client.on('error', (err: Error) => {
    if (TEARDOWN_MSGS.some((m) => err.message?.includes(m))) return
    console.error('[Redis] Error:', err.message)
  })
  return client
}

function makeRetryStrategy(label: string) {
  return (times: number) => {
    if (times > 5) {
      console.error(`[Redis:${label}] Max retries reached, giving up`)
      return null
    }
    return Math.min(times * 500, 3000)
  }
}

function makeReconnectOnError(err: Error): boolean {
  return err.message.includes('READONLY') || err.message.includes('ETIMEDOUT')
}

export function createRedisConnection(): Redis {
  return suppressTeardown(
    new Redis(getRedisOptions({
      // Serverless-friendly: commands queue until the TLS socket is ready,
      // avoiding "Stream isn't writeable" on cold-start invocations.
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keyPrefix: CINEMA_KEY_PREFIX,
      enableOfflineQueue: true,
      retryStrategy: makeRetryStrategy('app'),
      reconnectOnError: makeReconnectOnError,
    }))
  )
}

export function createBullMQConnection(): Redis {
  return suppressTeardown(
    new Redis(getRedisOptions({
      maxRetriesPerRequest: null,
      lazyConnect: false,
      enableOfflineQueue: false,
      retryStrategy: makeRetryStrategy('bullmq'),
      reconnectOnError: makeReconnectOnError,
    }))
  )
}

// Producer-side connection for BullMQ queues (e.g. API routes adding jobs).
// CRITICAL: no `keyPrefix` — BullMQ rejects ioredis keyPrefix and throws at
// `new Queue()`. Key namespacing is done via BullMQ's own `prefix` option
// (see `bullMQPrefix`). enableOfflineQueue:true + lazyConnect:true keep this
// serverless-safe: commands buffer until the TLS socket is ready on cold start.
export function createQueueConnection(): Redis {
  return suppressTeardown(
    new Redis(getRedisOptions({
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableOfflineQueue: true,
      retryStrategy: makeRetryStrategy('queue'),
      reconnectOnError: makeReconnectOnError,
    }))
  )
}

// Build-time stub — never opens a TCP connection
class RedisStub {
  on() { return this }
  off() { return this }
  async get() { return null }
  async set() { return null }
  async del() { return 0 }
  async incr() { return 0 }
  async expire() { return 0 }
  async lpush() { return 0 }
  async lrange() { return [] as string[] }
  async publish() { return 0 }
  async subscribe() { return null }
  async quit() { return 'OK' as const }
}

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined
  bullmqRedis: Redis | undefined
  queueConnection: Redis | undefined
}

export const redis: Redis = isBuildTime
  ? (new RedisStub() as unknown as Redis)
  : (globalForRedis.redis ?? createRedisConnection())

export const bullmqRedis: Redis = isBuildTime
  ? (new RedisStub() as unknown as Redis)
  : (globalForRedis.bullmqRedis ?? createBullMQConnection())

// Prefix-free connection used by BullMQ queue producers (see createQueueConnection).
export const queueConnection: Redis = isBuildTime
  ? (new RedisStub() as unknown as Redis)
  : (globalForRedis.queueConnection ?? createQueueConnection())

if (!isBuildTime && process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis
  globalForRedis.bullmqRedis = bullmqRedis
  globalForRedis.queueConnection = queueConnection
}

export const bullMQPrefix = CINEMA_KEY_PREFIX

if (!isBuildTime) {
  const shutdown = async () => {
    await Promise.all([
      globalForRedis.redis?.quit().catch((err) => logCaught('lib/redis', err)),
      globalForRedis.bullmqRedis?.quit().catch((err) => logCaught('lib/redis', err)),
      globalForRedis.queueConnection?.quit().catch((err) => logCaught('lib/redis', err)),
    ])
    globalForRedis.redis = undefined
    globalForRedis.bullmqRedis = undefined
    globalForRedis.queueConnection = undefined
  }
  process.on('beforeExit', shutdown)
  process.on('SIGTERM', shutdown)
}

// ioredis keyPrefix does NOT apply to pub/sub channel names.
export function channelKey(channel: string): string {
  return `${CINEMA_KEY_PREFIX}${channel}`
}
