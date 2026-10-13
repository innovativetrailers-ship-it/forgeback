'use client'


import { logCaught } from '@/lib/diagnostics/caught'
import { useEffect, useRef, useState } from 'react'
import { X, Download, Plus, RefreshCw } from 'lucide-react'
import type { GeneratedClip } from './types'
import { MODEL_FAMILY_COLOURS } from './types'
import { jobPlaybackPath } from '@/lib/media/jobPlayback'
import { placeFinishedClip } from '@/lib/library/placeFinishedClip'
import { toast } from '@/lib/toast'

interface Props {
  clip: GeneratedClip
  onClose: () => void
  onRegenerate: (clip: GeneratedClip) => void
  onAddToTimeline?: (clip: GeneratedClip) => void
  onOpenEditor?: () => void
}

function downloadFilename(clip: GeneratedClip): string {
  const slug = (clip.prompt ?? 'forge')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)
  return `${slug}-${clip.jobId}.mp4`
}

export function VideoPreviewModal({
  clip,
  onClose,
  onRegenerate,
  onAddToTimeline,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const playSrc = jobPlaybackPath(clip.jobId)
  const [playbackError, setPlaybackError] = useState(false)
  const [adding, setAdding] = useState(false)
  const modelColour = MODEL_FAMILY_COLOURS[clip.model] ?? '#6b7280'

  useEffect(() => {
    setPlaybackError(false)
    videoRef.current?.play().catch((err) => logCaught('components/simple/VideoPreviewModal', err))
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, playSrc])

  async function handleAddToLibrary() {
    if (!playSrc && !clip.videoUrl) {
      toast.error('This result has no video to add')
      return
    }
    setAdding(true)
    try {
      await placeFinishedClip(clip)
      onAddToTimeline?.(clip)
      toast.success('Added to the library')
      onClose()
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
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl w-full bg-[#0c0c14] rounded-2xl overflow-hidden border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-black">
          {playSrc && !playbackError ? (
            <video
              ref={videoRef}
              src={playSrc}
              className="w-full max-h-[70vh] object-contain"
              controls
              loop
              poster={clip.thumbnailUrl}
              onError={() => setPlaybackError(true)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[240px] px-6 text-center">
              <p className="text-sm text-white/70 mb-3">
                {playbackError
                  ? 'This video link expired before it was archived to your vault.'
                  : 'Video playback is not available for this clip.'}
              </p>
              <button
                type="button"
                onClick={() => { onRegenerate(clip); onClose() }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00e5c8]/20 text-[#00e5c8] text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Regenerate
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span
                className="px-2 py-0.5 rounded text-xs font-medium text-white"
                style={{ backgroundColor: modelColour }}
              >
                {clip.model.replace('_', ' ').toUpperCase()}
              </span>
              <span className="text-xs text-[#00e5c8] font-medium">⬡ {clip.creditsUsed} credits</span>
              <span className="text-xs text-white/40">{clip.duration}s</span>
            </div>
            <p className="text-sm text-white/70 leading-relaxed">{clip.prompt}</p>
          </div>

          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => { onRegenerate(clip); onClose() }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10
                text-white/70 hover:text-white text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Regenerate
            </button>
            <button
              type="button"
              onClick={handleAddToLibrary}
              disabled={adding || !playSrc || playbackError}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#00e5c8]/20 hover:bg-[#00e5c8]/30
                text-[#00e5c8] text-sm transition-colors disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
              {adding ? 'Adding…' : 'Add to Library'}
            </button>
            <a
              href={downloadHref}
              download={downloadFilename(clip)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10
                text-white/70 hover:text-white text-sm transition-colors
                ${!playSrc || playbackError ? 'pointer-events-none opacity-40' : ''}`}
            >
              <Download className="w-4 h-4" />
              Download
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
