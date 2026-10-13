'use client'

import { useState } from 'react'

interface TimelineHighlightEditProps {
  clipId: string
  clipUrl: string
  clipDuration: number
  projectId: string
  tier: 'Draft' | 'Studio' | 'Blockbuster'
  onComplete: (result: { stitchedUrl: string; model: string; quality: number }) => void
  onClose: () => void
}

type Phase = 'select' | 'analyse' | 'generating' | 'done'

interface AnalysisResult {
  model: string
  reasoning: string
  enhanced_instruction: string
}

interface EditResult {
  stitchedUrl: string
  model: string
  quality: number
}

export function TimelineHighlightEdit({
  clipId,
  clipUrl,
  clipDuration,
  projectId,
  tier,
  onComplete,
  onClose,
}: TimelineHighlightEditProps) {
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState(Math.min(3, clipDuration))
  const [instruction, setInstruction] = useState('')
  const [phase, setPhase] = useState<Phase>('select')
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [result, setResult] = useState<EditResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const editDuration = endTime - startTime
  const creditEstimate = Math.ceil(editDuration * 3) + 2

  const selectionWidth = `${(editDuration / clipDuration) * 100}%`
  const selectionLeft = `${(startTime / clipDuration) * 100}%`

  const handleAnalyse = async () => {
    if (!instruction.trim() || endTime <= startTime) return
    setError(null)
    setPhase('analyse')
    try {
      const resp = await fetch('/api/timeline/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clip_url: clipUrl,
          start_time: startTime,
          end_time: endTime,
          user_instruction: instruction,
          tier,
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error ?? 'Analysis failed')
      setAnalysisResult(data)
    } catch (e) {
      console.warn("[caught] src/components/editor/TimelineHighlightEdit.tsx:71", e instanceof Error ? { name: e.name, message: e.message } : e)

      setError(e instanceof Error ? e.message : 'Analysis failed')
      setPhase('select')
    }
  }

  const handleExecute = async () => {
    setPhase('generating')
    setError(null)
    try {
      const resp = await fetch('/api/timeline/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          clip_id: clipId,
          clip_url: clipUrl,
          start_time: startTime,
          end_time: endTime,
          user_instruction: instruction,
          tier,
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error ?? 'Edit failed')
      const editResult: EditResult = {
        stitchedUrl: data.stitched_clip_url,
        model: data.model_used,
        quality: data.quality_score,
      }
      setResult(editResult)
      setPhase('done')
      onComplete(editResult)
    } catch (e) {
      console.warn("[caught] src/components/editor/TimelineHighlightEdit.tsx:104", e instanceof Error ? { name: e.name, message: e.message } : e)

      setError(e instanceof Error ? e.message : 'Edit failed')
      setPhase('analyse')
    }
  }

  return (
    <div style={{
      background: 'var(--color-background-primary)',
      border: '0.5px solid var(--color-border-secondary)',
      borderRadius: 12,
      padding: 16,
      width: '100%',
      maxWidth: 480,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
          Precision edit
        </span>
        <button
          onClick={onClose}
          style={{ fontSize: 11, color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          ✕ close
        </button>
      </div>

      {/* Selection scrubber */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 5 }}>
          Selection: {startTime.toFixed(1)}s → {endTime.toFixed(1)}s ({editDuration.toFixed(1)}s)
        </div>
        <div style={{
          height: 32,
          background: 'var(--color-background-tertiary)',
          borderRadius: 4,
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: selectionLeft,
            width: selectionWidth,
            background: '#00e5c830',
            border: '1.5px solid #00e5c8',
            borderRadius: 2,
          }} />
          <input
            type="range"
            min={0}
            max={clipDuration}
            step={0.1}
            value={startTime}
            onChange={e => setStartTime(Math.min(+e.target.value, endTime - 0.5))}
            style={{ position: 'absolute', width: '100%', opacity: 0, cursor: 'col-resize' }}
          />
          <input
            type="range"
            min={0}
            max={clipDuration}
            step={0.1}
            value={endTime}
            onChange={e => setEndTime(Math.max(+e.target.value, startTime + 0.5))}
            style={{ position: 'absolute', width: '100%', opacity: 0, cursor: 'col-resize' }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <input
            type="number"
            value={startTime.toFixed(1)}
            step={0.1}
            min={0}
            max={clipDuration}
            onChange={e => setStartTime(Math.min(+e.target.value, endTime - 0.5))}
            style={{
              width: 60,
              fontSize: 11,
              padding: '2px 4px',
              background: 'var(--color-background-secondary)',
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 4,
              color: 'var(--color-text-primary)',
            }}
          />
          <input
            type="number"
            value={endTime.toFixed(1)}
            step={0.1}
            min={0}
            max={clipDuration}
            onChange={e => setEndTime(Math.max(+e.target.value, startTime + 0.5))}
            style={{
              width: 60,
              fontSize: 11,
              padding: '2px 4px',
              background: 'var(--color-background-secondary)',
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 4,
              color: 'var(--color-text-primary)',
            }}
          />
        </div>
      </div>

      {/* Instruction input */}
      <textarea
        value={instruction}
        onChange={e => setInstruction(e.target.value)}
        placeholder="What should change? e.g. 'Make the building taller' / 'The lighting should be warmer' / 'Replace the car with a truck'"
        rows={3}
        disabled={phase === 'generating'}
        style={{
          width: '100%',
          fontSize: 12,
          padding: 8,
          background: 'var(--color-background-secondary)',
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: 6,
          color: 'var(--color-text-primary)',
          resize: 'vertical',
          marginBottom: 10,
          boxSizing: 'border-box',
          opacity: phase === 'generating' ? 0.5 : 1,
        }}
      />

      {/* Error */}
      {error && (
        <div style={{
          background: 'var(--color-background-danger)',
          border: '0.5px solid var(--color-border-danger)',
          borderRadius: 6,
          padding: '6px 10px',
          fontSize: 11,
          color: 'var(--color-text-danger)',
          marginBottom: 10,
        }}>
          {error}
        </div>
      )}

      {/* Analysis result preview */}
      {analysisResult && phase === 'analyse' && (
        <div style={{
          background: 'var(--color-background-secondary)',
          border: '0.5px solid var(--color-border-info)',
          borderRadius: 8,
          padding: 10,
          marginBottom: 10,
        }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-info)', marginBottom: 4 }}>
            Crew analysis
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
            Model:{' '}
            <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
              {analysisResult.model.replace(/_/g, ' ')}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6, lineHeight: 1.4 }}>
            {analysisResult.reasoning}
          </div>
          <div style={{
            fontSize: 10,
            color: 'var(--color-text-tertiary)',
            background: 'var(--color-background-primary)',
            borderRadius: 4,
            padding: '4px 6px',
            fontFamily: 'var(--font-mono)',
          }}>
            {analysisResult.enhanced_instruction.substring(0, 120)}...
          </div>
        </div>
      )}

      {/* Result preview */}
      {result && phase === 'done' && (
        <div style={{ marginBottom: 10 }}>
          <video
            src={result.stitchedUrl}
            controls
            style={{ width: '100%', borderRadius: 6, aspectRatio: '16/9' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11, color: 'var(--color-text-secondary)' }}>
            <span>
              Quality:{' '}
              <strong style={{ color: result.quality >= 7 ? 'var(--color-text-success)' : 'var(--color-text-warning)' }}>
                {result.quality}/10
              </strong>
            </span>
            <span>Model: {result.model.replace(/_/g, ' ')}</span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6 }}>
        {phase === 'select' && (
          <button
            onClick={handleAnalyse}
            disabled={!instruction.trim() || endTime <= startTime}
            style={{
              flex: 1,
              padding: '8px 0',
              background: 'var(--color-background-secondary)',
              border: '0.5px solid var(--color-border-secondary)',
              borderRadius: 6,
              fontSize: 12,
              cursor: instruction.trim() ? 'pointer' : 'not-allowed',
              color: 'var(--color-text-primary)',
              opacity: instruction.trim() ? 1 : 0.5,
            }}
          >
            Analyse →
          </button>
        )}

        {phase === 'analyse' && (
          <>
            <button
              onClick={() => setPhase('select')}
              style={{
                padding: '8px 14px',
                background: 'none',
                border: '0.5px solid var(--color-border-tertiary)',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
                color: 'var(--color-text-secondary)',
              }}
            >
              Back
            </button>
            <button
              onClick={handleExecute}
              style={{
                flex: 1,
                padding: '8px 0',
                background: '#00e5c8',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                color: '#060608',
              }}
            >
              Execute ({creditEstimate} credits)
            </button>
          </>
        )}

        {phase === 'generating' && (
          <div style={{ flex: 1, textAlign: 'center', padding: '8px 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Crew is working...
          </div>
        )}

        {phase === 'done' && (
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '8px 0',
              background: 'var(--color-text-success)',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              color: '#fff',
            }}
          >
            Apply to timeline ✓
          </button>
        )}
      </div>
    </div>
  )
}
