/**
 * In-memory SSE hub for project collab (presence, document, review, generation).
 * Same process pattern as GradeSync. Presence records also live in Redis.
 * Not WebSockets — project.mdc / overlay.
 */

export type CollabHubEvent =
  | { type: 'hello'; peers: unknown[]; docClock: number; recipe?: unknown }
  | { type: 'presence'; peers: unknown[] }
  | { type: 'doc'; recipe: unknown; script?: string; warnings: unknown[]; docClock: number; actor: string }
  | { type: 'conflict'; warnings: unknown[] }
  | { type: 'review_comment'; comment: unknown; projectId: string }
  | { type: 'generation'; clipId: string; jobId: string; status: string; attached?: boolean }
  | { type: 'ping' }

const HEARTBEAT_MS = 25_000
const ROTATE_MS = 280_000

const subscribers = new Map<string, Set<ReadableStreamDefaultController>>()

function getSubs(projectId: string): Set<ReadableStreamDefaultController> {
  if (!subscribers.has(projectId)) subscribers.set(projectId, new Set())
  return subscribers.get(projectId)!
}

function formatEvent(event: CollabHubEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}

export function broadcastCollab(projectId: string, event: CollabHubEvent): void {
  const payload = formatEvent(event)
  const subs = getSubs(projectId)
  for (const controller of subs) {
    try {
      controller.enqueue(payload)
    } catch (err) {
      console.warn("[caught] src/lib/collab/hub.ts:36", err instanceof Error ? { name: err.name, message: err.message } : err)

      subs.delete(controller)
    }
  }
}

export function subscribeCollab(
  projectId: string,
  hello: CollabHubEvent,
  signal?: AbortSignal,
): ReadableStream {
  const subs = getSubs(projectId)

  return new ReadableStream({
    start(controller) {
      let closed = false
      subs.add(controller)
      try {
        controller.enqueue(formatEvent(hello))
      } catch (err) {
        console.warn("[caught] src/lib/collab/hub.ts:55", err instanceof Error ? { name: err.name, message: err.message } : err)

        subs.delete(controller)
        return
      }

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(formatEvent({ type: 'ping' }))
        } catch (err) {
          console.warn("[caught] src/lib/collab/hub.ts:63", err instanceof Error ? { name: err.name, message: err.message } : err)

          cleanup()
        }
      }, HEARTBEAT_MS)
      const rotate = setTimeout(() => cleanup(), ROTATE_MS)

      const cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        clearTimeout(rotate)
        subs.delete(controller)
        try { controller.close() } catch (err) {
          console.warn("[caught] src/lib/collab/hub.ts:75", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* already closed */ }
      }

      signal?.addEventListener('abort', cleanup)
    },
    cancel(controller) {
      subs.delete(controller as ReadableStreamDefaultController)
    },
  })
}

export function collabStreamHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  }
}
