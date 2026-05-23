import Redis from 'ioredis'

// Every key written by Cinema is prefixed so it cannot collide with other tenants.
export const CINEMA_KEY_PREFIX = 'cinema:'

// Accepted REDIS_URL patterns (set ONE of these on Vercel/Railway):
//   rediss://default:<token>@<host>.upstash.io:6380  (preferred, all-in-one)
//   https://<host>.upstash.io  +  REDIS_TOKEN=<token>  (Upstash REST URL split)
//   redis://localhost:6379  (local / Docker)
function buildRedisUrl(): string {
  const raw = process.env.REDIS_URL ?? ''

  // During Next.js build (page-data collection) Redis env vars are not injected.
  // Return a non-connecting placeholder so module evaluation succeeds;
  // actual connections fail gracefully at runtime if misconfigured.
  if (!raw || process.env.NEXT_PHASE === 'phase-production-build') {
    return 'redis://build-placeholder:6379'
  }

  if (raw.startsWith('https://') || raw.startsWith('http://')) {
    const token = process.env.REDIS_TOKEN
    if (!token) {
      throw new Error(
        '[Redis] REDIS_TOKEN is required when REDIS_URL is an HTTP endpoint. ' +
        'Copy the token from your Upstash dashboard -> Database -> Connect -> ioredis. ' +
        'Or set REDIS_URL directly to the full rediss:// wire-protocol URL.'
      )
    }
    const host = raw.replace(/^https?:\/\//, '').replace(/\/$/, '')
    return `rediss://default:${token}@${host}:6380`
  }

  // Already a redis:// or rediss:// URL — use as-is
  return raw
}

// Export so SSE subscriber routes can create their own dedicated connections
// (ioredis cannot share one connection for pub/sub).
export function createRedisConnection(): Redis {
  return new Redis(buildRedisUrl(), {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    keyPrefix: CINEMA_KEY_PREFIX,
    tls: {},
    enableOfflineQueue: false,
    reconnectOnError: (err: Error) => err.message.includes('READONLY'),
  })
}

const globalForRedis = globalThis as unknown as { redis: Redis }

export const redis =
  globalForRedis.redis ??
  createRedisConnection()

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis

// BullMQ cannot use ioredis `keyPrefix` — use BullMQ's `prefix` option instead.
export function createBullMQConnection(): Redis {
  return new Redis(buildRedisUrl(), {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    tls: {},
    enableOfflineQueue: false,
    reconnectOnError: (err: Error) => err.message.includes('READONLY'),
  })
}

const globalForBullMQ = globalThis as unknown as { bullmqRedis: Redis }

export const bullmqRedis =
  globalForBullMQ.bullmqRedis ?? createBullMQConnection()

if (process.env.NODE_ENV !== 'production') globalForBullMQ.bullmqRedis = bullmqRedis

export const bullMQPrefix = CINEMA_KEY_PREFIX

// ioredis `keyPrefix` does NOT apply to pub/sub channel names.
// Always run channel strings through this function before publish/subscribe.
export function channelKey(channel: string): string {
  return `${CINEMA_KEY_PREFIX}${channel}`
}
