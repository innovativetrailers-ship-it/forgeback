'use client'

import { useState } from 'react'
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { useSession } from 'next-auth/react'
import type { QualityTier, AspectRatio, Duration, GeneratedClip } from './types'
import { QUALITY_PILLS, DURATION_OPTIONS, ASPECT_RATIOS, ALL_MODELS } from './types'
import { nanoid } from 'nanoid'

interface Props {
  onGenerated: (clip: GeneratedClip) => void
  creditBalance: number
  userRole: string
}

export function TextToVideoTab({ onGenerated, creditBalance, userRole }: Props) {
  const [prompt, setPrompt] = useState('')
  const [quality, setQuality] = useState<QualityTier>('standard')
  const [duration, setDuration] = useState<Duration>(5)
  const [customDuration, setCustomDuration] = useState(8)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [modelOverride, setModelOverride] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const selectedPill = QUALITY_PILLS.find((p) => p.id === quality)!
  const actualDuration = duration === 'custom' ? customDuration : duration
  const canAdvanced = userRole === 'PRO' || userRole === 'STUDIO' || userRole === 'ADMIN'

  const handleGenerate = async () => {
    if (!prompt.trim() || isLoading) return
    setIsLoading(true)

    const clipId = nanoid()
    const baseClip: GeneratedClip = {
      id: clipId,
      jobId: clipId,
      prompt,
      model: modelOverride || selectedPill.model,
      quality,
      creditsUsed: selectedPill.credits,
      duration: actualDuration,
      aspectRatio,
      status: 'queued',
      progress: 0,
      createdAt: new Date(),
    }

    try {
      const res = await fetch('/api/jobs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'GENERATE',
          payload: {
            prompt,
            model: modelOverride || selectedPill.model,
            duration: actualDuration,
            aspectRatio,
            quality,
          },
        }),
      })

      if (!res.ok) {
        const err = await res.json() as { error?: string }
        onGenerated({ ...baseClip, status: 'failed', error: err.error ?? 'Failed to create job' })
        return
      }

      const { jobId } = await res.json() as { jobId: string }
      const activeClip = { ...baseClip, jobId, status: 'processing' as const }
      onGenerated(activeClip)

      const sse = new EventSource(`/api/jobs/${jobId}/stream`)

      sse.onmessage = (e) => {
        const data = JSON.parse(e.data) as {
          status: string
          progress?: number
          message?: string
          outputUrl?: string
          error?: string
          userMessage?: string
        }

        if (data.status === 'complete' && data.outputUrl) {
          onGenerated({
            ...activeClip,
            status: 'complete',
            videoUrl: data.outputUrl,
            progress: 100,
          })
          sse.close()
        } else if (data.status === 'failed') {
          onGenerated({
            ...activeClip,
            status: 'failed',
            error: data.userMessage ?? data.error ?? 'Generation failed',
            userMessage: data.userMessage,
          })
          sse.close()
        } else {
          onGenerated({
            ...activeClip,
            status: 'processing',
            progress: data.progress ?? 0,
            progressMessage: data.userMessage ?? data.message,
            userMessage: data.userMessage,
          })
        }
      }

      // Transient disconnect — let EventSource auto-reconnect and re-sync from
      // the DB-polling stream rather than marking the clip failed.
      sse.onerror = () => {}
    } catch (err) {
      console.warn("[caught] src/components/simple/TextToVideoTab.tsx:114", err instanceof Error ? { name: err.name, message: err.message } : err)

      onGenerated({ ...baseClip, status: 'failed', error: (err as Error).message })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Prompt */}
      <div className="relative">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your video... A cinematic drone shot flying over a misty mountain range at golden hour, photorealistic..."
          className="w-full min-h-[140px] bg-[#12121a] border border-white/10 rounded-xl px-4 py-3.5
            text-white/90 placeholder:text-white/25 text-sm leading-relaxed resize-none
            focus:outline-none focus:border-[#00e5c8]/50 focus:ring-1 focus:ring-[#00e5c8]/15
            transition-colors"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate()
          }}
        />
        <span className="absolute bottom-3 right-3 text-[10px] text-white/20">
          {prompt.length}/2000
        </span>
      </div>

      {/* Quality pills */}
      <div>
        <p className="text-xs text-white/40 uppercase tracking-wider mb-2.5 font-medium">Quality</p>
        <div className="grid grid-cols-4 gap-2">
          {QUALITY_PILLS.map((pill) => (
            <button
              key={pill.id}
              onClick={() => setQuality(pill.id)}
              disabled={pill.credits > creditBalance}
              className={`
                group px-3 py-2.5 rounded-xl border text-left transition-all
                ${quality === pill.id
                  ? 'border-[#00e5c8] bg-[#00e5c8]/15 shadow-sm shadow-[#00e5c8]/15'
                  : 'border-white/8 bg-white/3 hover:border-white/20 hover:bg-white/5'}
                disabled:opacity-30 disabled:cursor-not-allowed
              `}
            >
              <div className={`text-xs font-semibold mb-0.5 ${quality === pill.id ? 'text-[#00e5c8]' : 'text-white/80'}`}>
                {pill.label}
              </div>
              <div className="text-[10px] text-white/40">{pill.description}</div>
              <div className={`text-[10px] mt-1 font-medium ${pill.credits > creditBalance ? 'text-red-400' : 'text-[#00e5c8]/70'}`}>
                ⬡ {pill.credits}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Duration + Aspect ratio */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2.5 font-medium">Duration</p>
          <div className="flex flex-wrap gap-1.5">
            {DURATION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDuration(opt.value)}
                className={`
                  px-2.5 py-1 rounded-lg text-xs border transition-colors
                  ${duration === opt.value
                    ? 'border-[#00e5c8] bg-[#00e5c8]/15 text-[#00e5c8]'
                    : 'border-white/8 bg-white/3 text-white/50 hover:border-white/20 hover:text-white/80'}
                `}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {duration === 'custom' && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="range"
                min={2}
                max={120}
                value={customDuration}
                onChange={(e) => setCustomDuration(Number(e.target.value))}
                className="flex-1 accent-[#00e5c8]"
              />
              <span className="text-xs text-[#00e5c8] w-10 text-right">{customDuration}s</span>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2.5 font-medium">Aspect Ratio</p>
          <div className="flex flex-wrap gap-1.5">
            {ASPECT_RATIOS.map((ar) => (
              <button
                key={ar.value}
                onClick={() => setAspectRatio(ar.value)}
                className={`
                  px-3 py-1 rounded-lg text-xs border transition-colors
                  ${aspectRatio === ar.value
                    ? 'border-[#00e5c8] bg-[#00e5c8]/15 text-[#00e5c8]'
                    : 'border-white/8 bg-white/3 text-white/50 hover:border-white/20 hover:text-white/80'}
                `}
              >
                {ar.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Advanced toggle (PRO+) */}
      {canAdvanced && (
        <div>
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Model override
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-2">
              <select
                value={modelOverride}
                onChange={(e) => setModelOverride(e.target.value)}
                className="w-full bg-[#12121a] border border-white/10 rounded-lg px-3 py-2
                  text-sm text-white/80 focus:outline-none focus:border-[#00e5c8]/50"
              >
                <option value="">Auto (recommended)</option>
                {ALL_MODELS.map((group) =>
                  group.models.map((m) => (
                    <option key={m} value={m}>
                      [{group.group}] {m.replace('_', ' ')}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={!prompt.trim() || isLoading || selectedPill.credits > creditBalance}
        className="
          w-full py-4 rounded-xl font-semibold text-base
          bg-gradient-to-r from-teal-500 to-teal-600
          text-black shadow-lg shadow-teal-500/25
          hover:from-teal-400 hover:to-teal-500 hover:shadow-teal-400/30
          active:scale-[0.99]
          disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
          transition-all duration-150 flex items-center justify-center gap-2
        "
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" />
            Creating job…
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5" />
            Generate Video · ⬡ {selectedPill.credits}
          </>
        )}
      </button>

      {selectedPill.credits > creditBalance && (
        <p className="text-xs text-center text-red-400">
          Insufficient credits — <span className="text-white/60">need ⬡ {selectedPill.credits}, have ⬡ {creditBalance}</span>
        </p>
      )}

      <p className="text-[10px] text-center text-white/20">
        ⌘/Ctrl + Enter to generate
      </p>
    </div>
  )
}
