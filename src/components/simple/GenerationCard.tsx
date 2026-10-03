'use client'


import { logCaught } from '@/lib/diagnostics/caught'
import { useEffect, useRef, useState } from 'react'
import { Download, RefreshCw, Plus, Play, X, Loader2 } from 'lucide-react'
import type { GeneratedClip } from './types'
import { MODEL_FAMILY_COLOURS } from './types'
import { jobPlaybackPath } from '@/lib/media/jobPlayback'
import { humanStatusText } from '@/lib/jobs/humanStatus'
import { placeFinishedClip } from '@/lib/library/placeFinishedClip'
import { toast } from '@/lib/toast'

interface Props {
  clip: GeneratedClip
  onRegenerate: (clip: GeneratedClip) => void
  onAddToTimeline?: (clip: GeneratedClip) => void
  onExpand: (clip: GeneratedClip) => void
  onOpenEditor?: () => void
}

function ProgressRing({ progress }: { progress: number }) {
  const r = 20
  const circ = 2 * Math.PI * r
  const offset = circ - (progress / 100) * circ

  return (
    <svg width="52" height="52" className="absolute inset-0 m-auto">
      <circle cx="26" cy="26" r={r} fill="none" stroke="#1a1a24" strokeWidth="3" />
      <circle
        cx="26"
        cy="26"
        r={r}
        fill="none"
        stroke="#00e5c8"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform="rotate(-90 26 26)"
        style={{ transition: 'stroke-dashoffset 0.4s ease' }}
      />
    </svg>
  )
}

function downloadFilename(clip: GeneratedClip): string {
  const slug = (clip.prompt ?? 'forge')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)
  return `${slug}-${clip.jobId}.mp4`
}

export function GenerationCard({
  clip,
  onRegenerate,
  onAddToTimeline,
  onExpand,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [adding, setAdding] = useState(false)
  const modelColour = MODEL_FAMILY_COLOURS[clip.model] ?? '#6b7280'

  const isGenerating = clip.status === 'queued' || clip.status === 'processing'
  const isFailed = clip.status === 'failed'
  const isDone = clip.status === 'complete'
  const playSrc = jobPlaybackPath(clip.jobId)

  useEffect(() => {
    if (isHovered && videoRef.current && isDone) {
      videoRef.current.play().catch((err) => logCaught('components/simple/GenerationCard', err))
    } else if (!isHovered && videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    }
  }, [isHovered, isDone])

  async function handleAddToLibrary(e: React.MouseEvent) {
    e.stopPropagation()
    if (!playSrc && !clip.videoUrl) {
      toast.error('This result has no video to add')
      return
    }
    setAdding(true)
    try {
      await placeFinishedClip(clip)
      onAddToTimeline?.(clip)
      toast.success('Added to the library')
    } catch (err) {
      console.warn('[library] placement failed', err instanceof Error ? err.message : err)
      toast.error(err instanceof Error ? err.message : 'Could not add to the library')
    } finally {
      setAdding(false)
    }
  }

  const downloadHref = `/api/download/${clip.jobId}`

  return (
    <div
      className={`
        group relative rounded-xl overflow-hidden cursor-pointer
        bg-[#12121a] border transition-all duration-200
        ${isDone ? 'border-white/10 hover:border-[#00e5c8]/50 hover:shadow-lg hover:shadow-[#00e5c8]/10' : ''}
        ${isGenerating ? 'border-[#00e5c8]/30 animate-pulse-subtle' : ''}
        ${isFailed ? 'border-red-500/30' : ''}
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => isDone && onExpand(clip)}
    >
      <div className="relative aspect-video bg-[#0c0c14]">
        {isDone && playSrc && (
          <video
            ref={videoRef}
            src={playSrc}
            className="w-full h-full object-cover"
            muted
            loop
            playsInline
            poster={clip.thumbnailUrl}
          />
        )}

        {!isDone && !isFailed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="relative w-14 h-14">
              <ProgressRing progress={clip.progress ?? 0} />
              <Loader2 className="absolute inset-0 m-auto w-5 h-5 text-[#00e5c8] animate-spin" />
            </div>
            <p className="text-xs text-white/50 text-center px-3">
              {humanStatusText(clip.userMessage, clip.progressMessage) ?? 'Generating…'}
            </p>
            {clip.etaSeconds != null && clip.etaSeconds > 0 && (
              <p className="text-[10px] text-white/30">
                ~{clip.etaSeconds < 60 ? `${clip.etaSeconds}s` : `${Math.ceil(clip.etaSeconds / 60)} min`} left
              </p>
            )}
          </div>
        )}

        {isFailed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <X className="w-8 h-8 text-red-400" />
            <p className="text-xs text-red-400 text-center px-3">{humanStatusText(clip.userMessage, clip.error) ?? 'Generation failed'}</p>
          </div>
        )}

        {isDone && (
          <div className={`
            absolute inset-0 bg-black/60 flex items-center justify-center
            transition-opacity duration-200
            ${isHovered ? 'opacity-100' : 'opacity-0'}
          `}>
            <Play className="w-12 h-12 text-white" fill="white" />
          </div>
        )}

        <div
          className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
          style={{ backgroundColor: modelColour }}
        >
          {clip.model.replace('_', ' ').toUpperCase()}
        </div>

        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-[#00e5c8] font-medium">
          ⬡ {clip.creditsUsed}
        </div>
      </div>

      <div className="p-3">
        <p className="text-xs text-white/70 line-clamp-2 mb-3 leading-relaxed">
          {clip.prompt}
        </p>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRegenerate(clip) }}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg
              bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs transition-colors"
            title="Regenerate"
          >
            <RefreshCw className="w-3 h-3" />
            Redo
          </button>

          <button
            type="button"
            onClick={handleAddToLibrary}
            disabled={!isDone || adding}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg
              bg-white/5 hover:bg-[#00e5c8]/20 text-white/60 hover:text-[#00e5c8] text-xs
              disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Add to library"
          >
            <Plus className="w-3 h-3" />
            {adding ? 'Adding…' : 'Library'}
          </button>

          <a
            href={downloadHref}
            download={downloadFilename(clip)}
            onClick={(e) => e.stopPropagation()}
            className={`p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white
              transition-colors inline-flex items-center justify-center
              ${!isDone ? 'pointer-events-none opacity-30' : ''}`}
            title="Download"
            aria-disabled={!isDone}
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}
