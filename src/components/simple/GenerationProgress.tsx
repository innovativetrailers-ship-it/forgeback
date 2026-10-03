'use client'

import { useEffect, useState } from 'react'

interface Props {
  jobId:      string
  onComplete: (outputUrl: string) => void
  onError?:   (error: string) => void
}

type Stage = 'queued' | 'processing' | 'compositing' | 'finalising' | 'complete' | 'failed'

const STAGE_LABELS: Record<Stage, string> = {
  queued:      'Queued...',
  processing:  'Generating frames',
  compositing: 'Compositing',
  finalising:  'Finalising',
  complete:    'Complete',
  failed:      'Failed',
}

export function GenerationProgress({ jobId, onComplete, onError }: Props) {
  const [progress, setProgress] = useState(0)
  const [stage,    setStage]    = useState<Stage>('queued')

  useEffect(() => {
    if (!jobId) return
    const sse = new EventSource(`/api/jobs/${jobId}/stream`)

    sse.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as {
          progress?:  number
          status?:    string
          stage?:     string
          outputUrl?: string
          error?:     string
        }
        if (typeof event.progress === 'number') setProgress(event.progress)
        if (event.stage) setStage(event.stage as Stage)

        const status = (event.status ?? '').toLowerCase()

        if (status === 'complete' || status === 'completed') {
          setProgress(100)
          setStage('complete')
          sse.close()
          if (event.outputUrl) onComplete(event.outputUrl)
        }
        if (status === 'failed' || status === 'cancelled') {
          setStage('failed')
          sse.close()
          onError?.(event.error ?? 'Generation failed')
        }
      } catch (err) {
        console.warn("[caught] src/components/simple/GenerationProgress.tsx:55", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* ignore malformed events */ }
    }

    // Transient disconnects (e.g. serverless function recycle) are not fatal —
    // the browser EventSource reconnects and the stream re-emits current state.
    sse.onerror = () => {
      // Intentionally do not close or surface an error; allow auto-reconnect.
    }

    return () => sse.close()
  }, [jobId, onComplete, onError])

  const isFailed = stage === 'failed'

  return (
    <div className="space-y-2 py-2">
      <div className="flex justify-between items-center text-xs">
        <span className={isFailed ? 'text-red-400' : 'text-[#00e5c8]'}>
          {STAGE_LABELS[stage]}
        </span>
        <span className="text-gray-500 font-mono">{progress}%</span>
      </div>
      <div className="h-1.5 bg-[#1a1f2e] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isFailed ? 'bg-red-500' : 'bg-[#00e5c8]'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
