import { redis, channelKey } from '../redis'

export interface JobEvent {
  jobId: string
  status: 'queued' | 'processing' | 'complete' | 'failed' | 'cancelled'
  progress?: number
  message?: string
  userMessage?: string
  outputUrl?: string
  outputUrls?: string[]
  error?: string
}

// Pub/sub channel names must be manually prefixed — ioredis keyPrefix does not apply to pub/sub
const RAW_CHANNEL_PREFIX = 'job:'

export async function broadcastJobEvent(event: JobEvent): Promise<void> {
  const channel = channelKey(`${RAW_CHANNEL_PREFIX}${event.jobId}`)
  await redis.publish(channel, JSON.stringify(event))
}

export function subscribeToJob(
  jobId: string,
  onEvent: (event: JobEvent) => void,
  onClose: () => void
): () => void {
  // Each subscription needs its own Redis connection
  const subscriber = redis.duplicate()
  const channel = channelKey(`${RAW_CHANNEL_PREFIX}${jobId}`)

  subscriber.subscribe(channel)
  subscriber.on('message', (_ch: string, message: string) => {
    try {
      const event = JSON.parse(message) as JobEvent
      onEvent(event)

      if (event.status === 'complete' || event.status === 'failed') {
        subscriber.unsubscribe(channel)
        subscriber.quit()
        onClose()
      }
    } catch (err) {
      console.warn("[caught] src/lib/queue/events.ts:41", err instanceof Error ? { name: err.name, message: err.message } : err)

      // Ignore malformed messages
    }
  })

  return () => {
    subscriber.unsubscribe(channel)
    subscriber.quit()
  }
}
