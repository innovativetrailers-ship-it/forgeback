import os from 'os'
import { redis } from '../redis'

const HEARTBEAT_INTERVAL = 20_000  // 20 seconds
const TTL = 90                      // Redis TTL in seconds

/**
 * Publish worker heartbeat to Redis so the health endpoint can confirm liveness.
 * Returns a cleanup function to stop the interval.
 */
export function startHeartbeat(workerName: string): () => void {
  const publish = async () => {
    try {
      await redis.set(
        `worker:heartbeat:${workerName}`,
        JSON.stringify({
          ts: Date.now(),
          pid: process.pid,
          hostname: os.hostname(),
          uptime: Math.round(process.uptime()),
          memMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        }),
        'EX',
        TTL
      )
    } catch (err) {
      console.warn("[caught] src/lib/queue/heartbeat.ts:26", err instanceof Error ? { name: err.name, message: err.message } : err)

      // Non-fatal — health endpoint will report worker as offline
    }
  }

  void publish()
  const timer = setInterval(publish, HEARTBEAT_INTERVAL)
  timer.unref()

  return () => clearInterval(timer)
}
