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

        if (event.status === 'COMPLETED' || event.status === 'COMPLETE') {
          setProgress(100)
          setStage('complete')
          sse.close()
          if (event.outputUrl) onComplete(event.outputUrl)
        }
        if (event.status === 'FAILED') {
          setStage('failed')
          sse.close()
          onError?.(event.error ?? 'Generation failed')
        }
      } catch { /* ignore malformed events */ }
    }

    sse.onerror = () => {
      sse.close()
      setStage('failed')
      onError?.('Connection lost')
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
