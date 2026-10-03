'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useJobsStore } from '@/store/jobs'
import type { JobEvent } from '@/lib/queue/events'

export function useSSE(jobId: string | null) {
  const updateJob = useJobsStore((s) => s.updateJob)
  const esRef = useRef<EventSource | null>(null)

  const connect = useCallback(
    (id: string) => {
      if (esRef.current) {
        esRef.current.close()
      }

      const es = new EventSource(`/api/jobs/${id}/stream`)
      esRef.current = es

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as JobEvent
          updateJob(id, {
            status: data.status,
            progress: data.progress ?? 0,
            message: data.message,
            outputUrl: data.outputUrl,
            outputUrls: data.outputUrls,
            error: data.error,
          })

          if (data.status === 'complete' || data.status === 'failed') {
            es.close()
          }
        } catch (err) {
          console.warn("[caught] src/hooks/useSSE.ts:35", err instanceof Error ? { name: err.name, message: err.message } : err)

          // ignore parse errors
        }
      }

      es.onerror = () => {
        es.close()
      }

      return () => {
        es.close()
      }
    },
    [updateJob]
  )

  useEffect(() => {
    if (!jobId) return
    const cleanup = connect(jobId)
    return cleanup
  }, [jobId, connect])

  return {
    disconnect: () => esRef.current?.close(),
  }
}
