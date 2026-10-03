import { logCaught } from '@/lib/diagnostics/caught'
import dns from 'node:dns'
import net from 'node:net'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// Railway containers have no working IPv6 egress, but Neon resolves to both
// A and AAAA records. Two changes are needed so node-postgres connects on IPv4:
//   1. Prefer IPv4 in DNS results.
//   2. Disable Happy-Eyeballs (autoSelectFamily) — otherwise Node races the
//      unroutable IPv6 address and the connection dies with a fast ETIMEDOUT
//      (~750ms) before the IPv4 attempt completes.
dns.setDefaultResultOrder('ipv4first')
if (typeof net.setDefaultAutoSelectFamily === 'function') {
  net.setDefaultAutoSelectFamily(false)
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

const isBuildTime =
  process.env.NEXT_PHASE === 'phase-production-build' ||
  process.env.NEXT_PHASE === 'phase-export'

function createPrismaClient(): PrismaClient {
  const connectionString =
    process.env.WORKER_DATABASE_URL?.trim() || process.env.DATABASE_URL!
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter, log: ['error'] })
}

// During build (static page generation) return a Proxy that never opens a
// DB connection. All model methods resolve to null/[] so pages render safely.
const buildStub = new Proxy({} as PrismaClient, {
  get: (_target, prop) => {
    if (prop === '$disconnect' || prop === '$connect') return async () => {}
    if (prop === '$transaction') return async (fn: (tx: unknown) => unknown) => fn(buildStub)
    // Return a model-like object whose methods resolve to empty values
    return new Proxy({} as Record<string, unknown>, {
      get: (_m, method) => {
        if (method === 'findMany') return async () => []
        if (method === 'count') return async () => 0
        return async () => null
      },
    })
  },
})

export const db: PrismaClient = isBuildTime
  ? buildStub
  : (globalForPrisma.prisma ?? createPrismaClient())

if (!isBuildTime && process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}

// Ensure clean shutdown to prevent "Connection is closed" on process exit.
if (!isBuildTime) {
  const shutdown = async () => {
    await db.$disconnect().catch((err) => logCaught('lib/db', err))
  }
  process.on('beforeExit', shutdown)
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
