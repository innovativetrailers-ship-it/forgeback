'use client'

import { useEffect, useState, useRef } from 'react'

interface ShotStatus {
  shot_id: string
  sequence_index: number
  description: string
  assigned_model: string
  status: 'queued' | 'generating' | 'complete' | 'failed' | 'repainting'
  proxy_url?: string
  quality_score?: number
  generation_ms?: number
  cost_credits?: number
}

interface SwarmEvent {
  event: string
  shot_id?: string
  total?: number
  done?: number
  r?: {
    output_url: string
    proxy_url: string
    quality_score: number
    generation_ms: number
    cost_credits: number
    needs_repaint: boolean
  }
}

const MODEL_COLOURS: Record<string, string> = {
  seedance_2_0:   '#1D9E75',
  veo_3_1:        '#00e5c8',
  kling_3_0:      '#534AB7',
  runway_gen4_5:  '#D85A30',
  skyreels_v1:    '#993556',
  hunyuan_1_5:    '#185FA5',
  wan_2_2:        '#3B6D11',
  ltx_2_3:        '#5F5E5A',
  pika_2_2:       '#00b8a0',
  minimax_hailuo: '#378ADD',
  mochi_1:        '#444441',
}

const MODEL_LABELS: Record<string, string> = {
  seedance_2_0:   'Seedance 2.0',
  veo_3_1:        'Veo 3.1',
  kling_3_0:      'Kling 3.0',
  runway_gen4_5:  'Runway Gen-4.5',
  skyreels_v1:    'SkyReels V1',
  hunyuan_1_5:    'HunyuanVideo',
  wan_2_2:        'Wan 2.2',
  ltx_2_3:        'LTX-2.3',
  pika_2_2:       'Pika 2.2',
  minimax_hailuo: 'Minimax',
  mochi_1:        'Mochi 1',
}

interface SwarmProgressPanelProps {
  projectId: string
  shots: Array<{
    shot_id: string
    sequence_index: number
    description: string
    assigned_model: string
  }>
}

export function SwarmProgressPanel({ projectId, shots }: SwarmProgressPanelProps) {
  const [statuses, setStatuses] = useState<Record<string, ShotStatus>>(() => {
    const init: Record<string, ShotStatus> = {}
    shots.forEach(s => { init[s.shot_id] = { ...s, status: 'queued' } })
    return init
  })
  const [totalCost, setTotalCost] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())

  useEffect(() => {
    const es = new EventSource(`/api/generate/${projectId}/stream`)
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as SwarmEvent
        if (event.event === 'shot_start' && event.shot_id) {
          setStatuses(prev => ({
            ...prev,
            [event.shot_id!]: { ...prev[event.shot_id!], status: 'generating' },
          }))
        }
        if (event.event === 'shot_done' && event.shot_id && event.r) {
          setStatuses(prev => ({
            ...prev,
            [event.shot_id!]: {
              ...prev[event.shot_id!],
              status: event.r!.needs_repaint ? 'repainting' : 'complete',
              proxy_url: event.r!.proxy_url,
              quality_score: event.r!.quality_score,
              generation_ms: event.r!.generation_ms,
              cost_credits: event.r!.cost_credits,
            },
          }))
          setTotalCost(c => c + (event.r!.cost_credits ?? 0))
        }
        if (event.event === 'repaint_done' && event.shot_id) {
          setStatuses(prev => ({
            ...prev,
            [event.shot_id!]: { ...prev[event.shot_id!], status: 'complete' },
          }))
        }
      } catch (err) {
        console.warn("[caught] src/components/swarm/SwarmProgressPanel.tsx:111", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* ignore parse errors */ }
    }
    es.onerror = () => es.close()
    return () => es.close()
  }, [projectId])

  useEffect(() => {
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
    return () => clearInterval(interval)
  }, [])

  const completed = Object.values(statuses).filter(s => s.status === 'complete' || s.status === 'repainting').length
  const total = shots.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  const orderedShots = Object.values(statuses).sort((a, b) => a.sequence_index - b.sequence_index)

  const mins = Math.floor(elapsed / 60)
  const secs = String(elapsed % 60).padStart(2, '0')

  return (
    <div style={{ fontFamily: 'var(--font-sans)', padding: '12px 0' }}>
      {/* Header stats */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {[
          { label: 'shots complete', value: `${completed} / ${total}` },
          { label: 'credits used', value: totalCost },
          { label: 'elapsed', value: `${mins}:${secs}` },
        ].map(stat => (
          <div
            key={stat.label}
            style={{
              background: 'var(--color-background-secondary)',
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 8,
              padding: '6px 12px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{stat.label}</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-text-primary)' }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: 'var(--color-background-secondary)', borderRadius: 2, marginBottom: 10, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#00e5c8', borderRadius: 2, transition: 'width 0.4s' }} />
      </div>

      {/* Shot grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6 }}>
        {orderedShots.map(shot => {
          const modelColour = MODEL_COLOURS[shot.assigned_model] ?? '#888'
          const isGenerating = shot.status === 'generating'
          const isComplete = shot.status === 'complete'
          const isRepainting = shot.status === 'repainting'

          return (
            <div
              key={shot.shot_id}
              style={{
                border: `0.5px solid ${
                  isComplete ? 'var(--color-border-success)'
                  : isGenerating ? `${modelColour}60`
                  : 'var(--color-border-tertiary)'
                }`,
                borderRadius: 8,
                overflow: 'hidden',
                background: 'var(--color-background-primary)',
                position: 'relative',
              }}
            >
              {shot.proxy_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={shot.proxy_url}
                  alt={shot.description}
                  style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <div style={{
                  width: '100%',
                  aspectRatio: '16/9',
                  background: 'var(--color-background-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {isGenerating && (
                    <div style={{
                      width: 16,
                      height: 16,
                      border: `2px solid ${modelColour}`,
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }} />
                  )}
                  {shot.status === 'queued' && (
                    <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                      #{shot.sequence_index}
                    </span>
                  )}
                </div>
              )}

              {/* Model badge */}
              <div style={{ padding: '4px 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: modelColour, flexShrink: 0 }} />
                <span style={{
                  fontSize: 9,
                  color: 'var(--color-text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}>
                  {MODEL_LABELS[shot.assigned_model] ?? shot.assigned_model}
                </span>
                {shot.quality_score !== undefined && (
                  <span style={{
                    fontSize: 9,
                    color: shot.quality_score >= 7 ? 'var(--color-text-success)'
                      : shot.quality_score >= 5 ? 'var(--color-text-warning)'
                      : 'var(--color-text-danger)',
                    fontWeight: 500,
                    flexShrink: 0,
                  }}>
                    {shot.quality_score}/10
                  </span>
                )}
              </div>

              {isRepainting && (
                <div style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  background: '#00e5c8',
                  borderRadius: 4,
                  padding: '1px 5px',
                  fontSize: 8,
                  color: '#060608',
                  fontWeight: 700,
                }}>
                  REPAINT
                </div>
              )}
            </div>
          )
        })}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
