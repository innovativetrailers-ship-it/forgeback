'use client'

import { useState } from 'react'
import { Film, Clock, Trash2 } from 'lucide-react'
import { GenerationCard } from './GenerationCard'
import { VideoPreviewModal } from './VideoPreviewModal'
import { ClipContextMenu } from '@/components/editor/ClipContextMenu'
import { deleteFromLibrary } from '@/lib/library/deleteFromLibrary'
import { toast } from '@/lib/toast'
import type { GeneratedClip } from './types'

interface Props {
  clips: GeneratedClip[]
  onRegenerate: (clip: GeneratedClip) => void
  onAddToTimeline: (clip: GeneratedClip) => void
  onDelete: (id: string) => void
  onClearFailed?: () => void
  onOpenEditor?: () => void
}

export function ResultsGallery({
  clips,
  onRegenerate,
  onAddToTimeline,
  onDelete,
  onClearFailed,
  onOpenEditor,
}: Props) {
  const [expandedClip, setExpandedClip] = useState<GeneratedClip | null>(null)
  const [filter, setFilter] = useState<'all' | 'done' | 'generating' | 'failed'>('all')
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  const filteredClips = clips.filter((c) => {
    if (filter === 'done') return c.status === 'complete'
    if (filter === 'generating') return c.status === 'queued' || c.status === 'processing'
    if (filter === 'failed') return c.status === 'failed'
    return true
  })

  const generating = clips.filter((c) => c.status === 'queued' || c.status === 'processing').length
  const done = clips.filter((c) => c.status === 'complete').length
  const failed = clips.filter((c) => c.status === 'failed').length

  if (clips.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Film className="w-12 h-12 text-white/10 mb-4" />
        <p className="text-sm text-white/30 font-medium">No videos yet</p>
        <p className="text-xs text-white/20 mt-1">Generate your first video above</p>
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-semibold text-white/70">Results</h2>
          {generating > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-[#00e5c8]">
              <Clock className="w-3 h-3 animate-pulse" />
              {generating} generating
            </div>
          )}
          {done > 0 && (
            <span className="text-xs text-white/30">{done} complete</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {failed > 0 && onClearFailed && (
            <button
              type="button"
              onClick={onClearFailed}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-red-400/80 hover:text-red-300 hover:bg-red-500/10 transition-colors"
            >
              Clear {failed} failed
            </button>
          )}
          {(['all', 'done', 'generating', 'failed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`
                px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors capitalize
                ${filter === f ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'}
              `}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredClips.map((clip) => (
          <div
            key={clip.id}
            className="relative group/card"
            onContextMenu={(event) => {
              event.preventDefault()
              setMenu({ id: clip.id, x: event.clientX, y: event.clientY })
            }}
          >
            <GenerationCard
              clip={clip}
              onRegenerate={onRegenerate}
              onAddToTimeline={onAddToTimeline}
              onExpand={setExpandedClip}
              onOpenEditor={onOpenEditor}
            />
            <button
              onClick={() => {
                void deleteFromLibrary(clip.id).catch((err) => {
                  console.warn("[caught] src/components/simple/ResultsGallery.tsx:116", err instanceof Error ? { name: err.name, message: err.message } : err)

                  toast.error(err instanceof Error ? err.message : 'Could not delete')
                })
              }}
              className="absolute top-2 right-10 p-1 rounded-full bg-black/60 text-white/40
                opacity-0 group-hover/card:opacity-100 transition-opacity hover:text-red-400 hover:bg-black/80 z-10"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {menu && (
        <ClipContextMenu
          clipId={menu.id}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      )}

      {expandedClip && (
        <VideoPreviewModal
          clip={expandedClip}
          onClose={() => setExpandedClip(null)}
          onRegenerate={(c) => { onRegenerate(c); setExpandedClip(null) }}
          onAddToTimeline={onAddToTimeline}
          onOpenEditor={onOpenEditor}
        />
      )}
    </>
  )
}
