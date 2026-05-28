'use client'

import { useState, useEffect } from 'react'

const MODEL_COLOURS: Record<string, string> = {
  'veo-3.1':              '#ff4444',
  'kling-3.0':            '#ff8800',
  'seedance-2.0':         '#ffcc00',
  'skyreels-v3':          '#ff66cc',
  'pixverse-c1':          '#aa44ff',
  'pixverse-v6':          '#8844ff',
  'runway-gen4':          '#4488ff',
  'luma-ray3':            '#44aaff',
  'hunyuan-video-1.5':    '#44ffcc',
  'minimax-2.3':          '#44ff88',
  'cogvideox':            '#88ff44',
  'wan-2.2':              '#ccff44',
  'ltx-2.3':              '#ffff44',
  'ltx-2.3-fast':         '#888844',
  'pika-2.5':             '#ff4488',
}

interface Props {
  prompt:         string
  duration:       number
  selectedModels: string[]
  mode:           'simple' | 'director'
  tier?:          string
}

interface EstimatePlan {
  totalCredits:   number
  totalDuration:  number
  segments?:      Array<{ assignedModel: string; duration: number; contentType: string; creditCost: number }>
  modelBreakdown?: Record<string, { duration: number; cost: number }>
}

export function CreditEstimate({ prompt, duration, selectedModels, mode, tier }: Props) {
  const [plan,         setPlan]         = useState<EstimatePlan | null>(null)
  const [isEstimating, setIsEstimating] = useState(false)

  // Stable key for effect deps — avoids array reference churn
  const modelsKey = JSON.stringify(selectedModels)

  useEffect(() => {
    if (!prompt || duration <= 0) return
    if (mode === 'director' && selectedModels.length === 0) return

    const timeout = setTimeout(async () => {
      setIsEstimating(true)
      try {
        const res = await fetch('/api/generate/estimate', {
          method:      'POST',
          credentials: 'include',
          headers:     { 'Content-Type': 'application/json' },
          body:        JSON.stringify({ prompt, duration, selectedModels, mode, tier }),
        })
        if (res.ok) setPlan(await res.json() as EstimatePlan)
      } finally {
        setIsEstimating(false)
      }
    }, 800)

    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, duration, modelsKey, mode, tier])

  if (isEstimating) return (
    <div className="text-xs text-gray-500 animate-pulse py-1">Estimating cost...</div>
  )

  if (!plan) return null

  return (
    <div className="bg-[#0d1117] border border-[#1a2030] rounded-lg p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-400">Estimated cost</span>
        <span className="text-sm font-bold text-[#00e5c8]">{plan.totalCredits} credits</span>
      </div>

      {mode === 'director' && plan.modelBreakdown && (
        <div className="space-y-0.5">
          {Object.entries(plan.modelBreakdown).map(([model, info]) => (
            <div key={model} className="flex justify-between text-[10px] text-gray-500">
              <span className="flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: MODEL_COLOURS[model] ?? '#666' }}
                />
                {model} ({info.duration.toFixed(1)}s)
              </span>
              <span>{Math.ceil(info.cost)} cr</span>
            </div>
          ))}
        </div>
      )}

      {plan.segments && plan.segments.length > 1 && (
        <div className="flex h-1.5 rounded overflow-hidden gap-px">
          {plan.segments.map((seg, i) => (
            <div
              key={i}
              title={`${seg.contentType} → ${seg.assignedModel} (${seg.duration}s)`}
              style={{
                flex:            seg.duration,
                backgroundColor: MODEL_COLOURS[seg.assignedModel] ?? '#444',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
