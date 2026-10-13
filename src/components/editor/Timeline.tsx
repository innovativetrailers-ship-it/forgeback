'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { Volume2, VolumeX, Lock, Unlock, Eye } from 'lucide-react'
import { TRACK_LABEL_WIDTH, RULER_HEIGHT, TRACK_HEIGHT, MODEL_CLIP_COLOURS, TRACK_COLOURS } from './constants'
import type { TimelineRecipe, Track, Clip } from '@/lib/timeline/schema'
import { recipeForTimeline, videoTrackCount } from '@/lib/timeline/reconcileTimeline'
import { usePlaybackStore } from '@/store/playbackStore'
import { clipPosterUrl, computeTimelineDuration, isVideoMediaUrl } from '@/lib/timeline/playback'
import { ClipContextMenu } from '@/components/editor/ClipContextMenu'
import { placeDraggedLibraryItem } from '@/lib/library/placeOnTimeline'
import { toast } from '@/lib/toast'
import { useTimelineDock } from '@/components/editor/timelineDock'

interface ActiveJob { jobId: string; clipId: string; progress?: number }

interface Props {
  recipe: TimelineRecipe | null
  playheadTime: number
  selectedClipId: string | null
  zoomLevel: number
  scrollOffset: number
  activeJobs: ActiveJob[]
  onSeek: (t: number) => void
  onClipSelect: (id: string | null) => void
  onClipMove: (clipId: string, newStart: number, targetTrackId: string) => void
  onClipTrim: (clipId: string, edge: 'start' | 'end', newTime: number) => void
  onTrackToggleMute: (trackId: string) => void
  onZoomChange: (zoom: number) => void
  onScrollChange: (offset: number) => void
  razor?: boolean
  onClipSplit?: (clipId: string, atTime: number) => void
}

function timeToX(t: number, zoom: number, scroll: number): number {
  return t * zoom - scroll
}

function xToTime(x: number, zoom: number, scroll: number): number {
  return (x + scroll) / zoom
}

function formatRulerTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
}

export function Timeline({
  recipe,
  playheadTime,
  selectedClipId,
  zoomLevel,
  scrollOffset,
  activeJobs,
  onSeek,
  onClipSelect,
  onClipMove,
  onClipTrim,
  onTrackToggleMute,
  onZoomChange,
  onScrollChange,
  razor = false,
  onClipSplit,
}: Props) {
  const rulerRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<{
    type: 'clip' | 'trim-start' | 'trim-end' | 'playhead'
    clipId?: string
    startX: number
    startTime: number
    trackId?: string
  } | null>(null)
  const [hoveredClipId, setHoveredClipId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const tracksRef = useRef<HTMLDivElement>(null)
  const projectId = usePlaybackStore((state) => state.projectId)
  const heightKey = `cinema-track-height:${projectId || 'local'}`
  const [rowHeight, setRowHeight] = useState(TRACK_HEIGHT)
  const [heightMode, setHeightMode] = useState<'S' | 'M' | 'L' | 'fit'>('M')

  useEffect(() => {
    const saved = window.localStorage.getItem(heightKey)
    if (saved === 'S' || saved === 'M' || saved === 'L' || saved === 'fit') {
      setHeightMode(saved)
      if (saved !== 'fit') setRowHeight(saved === 'S' ? 28 : saved === 'L' ? 72 : TRACK_HEIGHT)
    }
  }, [heightKey])

  function chooseHeight(mode: 'S' | 'M' | 'L') {
    const next = mode === 'S' ? 28 : mode === 'L' ? 72 : TRACK_HEIGHT
    setHeightMode(mode)
    setRowHeight(next)
    window.localStorage.setItem(heightKey, mode)
  }

  function fitTracks() {
    const box = tracksRef.current
    const count = Math.max(1, tracks.length)
    const next = Math.max(22, Math.floor((box?.clientHeight ?? 0) / count))
    setHeightMode('fit')
    setRowHeight(next)
    window.localStorage.setItem(heightKey, 'fit')
  }

  const storeRecipe = usePlaybackStore((state) => state.recipe)
  const rendered = recipeForTimeline(storeRecipe, recipe)
  const tracks = rendered?.tracks ?? []

  useEffect(() => {
    console.log('[timeline_render]', { clips: videoTrackCount(rendered) })
  }, [rendered])
  const totalDuration = computeTimelineDuration(tracks, recipe?.durationSeconds ?? 60)

  useEffect(() => {
    if (heightMode !== 'fit') return
    const box = tracksRef.current
    if (!box || box.clientHeight <= 0) return
    const count = Math.max(1, tracks.length)
    setRowHeight(Math.max(22, Math.floor(box.clientHeight / count)))
  }, [heightMode, tracks.length])

  // Ruler tick marks
  const tickInterval = zoomLevel >= 100 ? 1 : zoomLevel >= 40 ? 5 : 10
  const ticks: number[] = []
  for (let t = 0; t <= totalDuration; t += tickInterval) ticks.push(t)

  // Handle ruler click → seek
  const handleRulerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const contentX = x - TRACK_LABEL_WIDTH
    if (contentX < 0) return
    onSeek(xToTime(contentX, zoomLevel, scrollOffset))
  }, [zoomLevel, scrollOffset, onSeek])

  // Ctrl/Cmd zooms. Shift scrolls time. A plain wheel scrolls tracks vertically.
  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = -e.deltaY * 0.5
      onZoomChange(Math.max(20, Math.min(400, zoomLevel + delta)))
      return
    }
    if (e.shiftKey) {
      e.preventDefault()
      onScrollChange(Math.max(0, scrollOffset + (e.deltaY || e.deltaX)))
    }
  }, [zoomLevel, scrollOffset, onZoomChange, onScrollChange])

  useEffect(() => {
    const el = timelineRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  useEffect(() => {
    if (!selectedClipId) return
    const clip = tracks.flatMap((track) => track.clips).find((row) => row.id === selectedClipId)
    if (!clip) return
    document.getElementById(`track-row-${clip.trackId}`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedClipId, tracks])

  // Mouse events for drag/trim
  const handleMouseDown = useCallback((
    e: React.MouseEvent,
    type: 'clip' | 'trim-start' | 'trim-end',
    clip: Clip,
  ) => {
    e.preventDefault()
    e.stopPropagation()
    onClipSelect(clip.id)
    if (razor && type === 'clip' && onClipSplit) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const span = Math.max(0.1, clip.endTime - clip.startTime)
      const ratio = rect.width > 0 ? Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) : 0.5
      onClipSplit(clip.id, clip.startTime + ratio * span)
      return
    }
    setDragging({
      type,
      clipId: clip.id,
      startX: e.clientX,
      startTime: type === 'clip' ? clip.startTime : type === 'trim-start' ? clip.startTime : clip.endTime,
      trackId: clip.trackId,
    })
  }, [onClipSelect, onClipSplit, razor])

  useEffect(() => {
    if (!dragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.clipId || !recipe) return
      const dx = e.clientX - dragging.startX
      const dt = dx / zoomLevel

      if (dragging.type === 'clip') {
        const newStart = Math.max(0, dragging.startTime + dt)
        onClipMove(dragging.clipId, newStart, dragging.trackId!)
      } else if (dragging.type === 'trim-start') {
        onClipTrim(dragging.clipId, 'start', Math.max(0, dragging.startTime + dt))
      } else if (dragging.type === 'trim-end') {
        onClipTrim(dragging.clipId, 'end', Math.max(0, dragging.startTime + dt))
      }
    }

    const handleMouseUp = () => {
      if (dragging.type === 'trim-end' && dragging.clipId && recipe) {
        const clip = recipe.tracks.flatMap((track) => track.clips).find((row) => row.id === dragging.clipId)
        const extra = clip ? clip.endTime - dragging.startTime : 0
        if (extra > 0.4) {
          window.dispatchEvent(new CustomEvent('cinema:extend-offer', {
            detail: { clipId: dragging.clipId, seconds: Math.max(1, Math.round(extra)) },
          }))
        }
      }
      setDragging(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging, zoomLevel, recipe, onClipMove, onClipTrim])

  // Playhead drag
  const playheadX = timeToX(playheadTime, zoomLevel, scrollOffset) + TRACK_LABEL_WIDTH

  const clipJobMap = new Map(activeJobs.map((j) => [j.clipId, j]))
  const dock = useTimelineDock()
  const duration = recipe ? computeTimelineDuration(recipe.tracks) : 1

  if (recipe && dock.mode !== 'full') {
    const clips = recipe.tracks.flatMap((track) => track.clips.map((clip) => ({ clip, track })))
    return (
      <div className={`flex items-center gap-2 bg-[#0c0c14] px-2 ${dock.mode === 'hidden' ? 'h-7' : 'h-16'} motion-safe:transition-[height] motion-safe:duration-150`}>
        <button
          type="button"
          className="shrink-0 rounded bg-white/10 px-2 py-1 text-[10px] text-white"
          title="The mini-strip scrubs and selects. Full edits need the expanded timeline. Press \\ to cycle."
          onDoubleClick={() => dock.setMode(dock.mode === 'hidden' ? 'compact' : 'full')}
          onClick={() => dock.setMode(dock.mode === 'hidden' ? 'compact' : 'full')}
        >
          Timeline {playheadTime.toFixed(1)}s
        </button>
        {dock.mode === 'compact' && (
          <div
            className="relative h-8 flex-1 overflow-hidden rounded bg-black/40"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              onSeek(Math.max(0, ((event.clientX - rect.left) / rect.width) * duration))
            }}
          >
            {clips.map(({ clip, track }) => {
              const span = Math.max(duration, 0.1)
              const left = (clip.startTime / span) * 100
              const width = Math.max(0.4, ((clip.endTime - clip.startTime) / span) * 100)
              const colour = TRACK_COLOURS[track.label] ?? TRACK_COLOURS[track.type.toUpperCase()] ?? '#3b82f6'
              return (
                <button
                  key={clip.id}
                  type="button"
                  title={clip.prompt || clip.id}
                  className={`absolute top-1 h-6 rounded-sm ${selectedClipId === clip.id ? 'ring-1 ring-white' : ''}`}
                  style={{ left: `${left}%`, width: `${width}%`, background: colour }}
                  onClick={(event) => { event.stopPropagation(); onClipSelect(clip.id); onSeek(clip.startTime) }}
                />
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={timelineRef}
      className="flex h-full min-h-0 flex-col overflow-hidden bg-[#0c0c14] select-none"
    >
      {/* Ruler. Height controls sit in the label column, not on a second bar. */}
      <div
        ref={rulerRef}
        className="flex-shrink-0 relative border-b border-white/8 bg-[#0a0a12] cursor-pointer"
        style={{ height: RULER_HEIGHT }}
        onClick={handleRulerClick}
      >
        {/* Track label spacer */}
        <div className="absolute left-0 top-0 bottom-0 flex items-center gap-0.5 border-r border-white/8 px-1 text-[9px] text-white/45" style={{ width: TRACK_LABEL_WIDTH }}>
          {(['S', 'M', 'L'] as const).map((mode) => (
            <button key={mode} type="button" className={heightMode === mode ? 'text-[#00e5c8]' : ''} onClick={(event) => { event.stopPropagation(); chooseHeight(mode) }}>{mode}</button>
          ))}
          <button type="button" className={heightMode === 'fit' ? 'text-[#00e5c8]' : ''} onClick={(event) => { event.stopPropagation(); fitTracks() }}>Fit</button>
        </div>

        {/* Tick marks */}
        {ticks.map((t) => {
          const x = timeToX(t, zoomLevel, scrollOffset) + TRACK_LABEL_WIDTH
          if (x < TRACK_LABEL_WIDTH || x > 4000) return null
          return (
            <div key={t} className="absolute top-0 flex flex-col" style={{ left: x }}>
              <div className="w-px h-3 bg-white/20" />
              <span className="text-[9px] text-white/30 ml-1 mt-0.5 select-none">{formatRulerTime(t)}</span>
            </div>
          )
        })}

        {/* Playhead triangle on ruler */}
        <div
          className="absolute top-0 w-2.5 h-full flex flex-col items-center pointer-events-none"
          style={{ left: playheadX - 5 }}
        >
          <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[8px] border-l-transparent border-r-transparent border-t-teal-500" />
          <div className="w-px flex-1 bg-[#00e5c8]/60" />
        </div>
      </div>

      {menu && (
        <ClipContextMenu
          clipId={menu.id}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      )}

      {/* Track rows */}
      <div ref={tracksRef} className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
        {tracks.map((track) => (
          <TrackRow
            key={track.id}
            rowHeight={rowHeight}
            track={track}
            zoomLevel={zoomLevel}
            scrollOffset={scrollOffset}
            selectedClipId={selectedClipId}
            hoveredClipId={hoveredClipId}
            playheadX={playheadX}
            clipJobMap={clipJobMap}
            onClipSelect={onClipSelect}
            onMouseDown={handleMouseDown}
            onHover={setHoveredClipId}
            onToggleMute={() => onTrackToggleMute(track.id)}
            onClipMenu={(id, x, y) => setMenu({ id, x, y })}
            onLibraryDrop={(raw, x) => {
              const hint = track.id === 't-music' ? 'music' : track.id === 't-voice' ? 'voice' : track.type === 'audio' ? 'voice' : 'video'
              const startSec = Math.max(0, xToTime(x, zoomLevel, scrollOffset))
              void (async () => {
                let payload = raw
                if (hint === 'video') {
                  try {
                    const item = JSON.parse(raw) as { id?: string; kind?: string; sourceUrl?: string }
                    if (item.id && item.kind === 'video') {
                      const infoRes = await fetch(`/api/studio/library/compose?itemId=${encodeURIComponent(item.id)}`)
                      const info = await infoRes.json() as {
                        dialogue?: boolean
                        voiceReady?: boolean
                        lipSyncReady?: boolean
                        estimateCredits?: number
                        voiceMediaId?: string | null
                      }
                      const needsCompose = Boolean(info.dialogue) && (!info.voiceReady || !info.lipSyncReady)
                      if (needsCompose) {
                        const credits = info.estimateCredits ?? 0
                        const ok = window.confirm(`This shot has dialogue. Generate voice and lip-sync for ${credits} credit(s)? Cancel places the video silent.`)
                        if (ok) {
                          const composed = await fetch('/api/studio/library/compose', {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ itemId: item.id, confirm: true }),
                          })
                          const body = await composed.json() as { error?: string; voiceMediaId?: string | null; videoUrl?: string | null }
                          if (!composed.ok) toast.error(body.error || 'Voice was not generated. Placing the video silent.')
                          else {
                            if (body.videoUrl) payload = JSON.stringify({ ...item, sourceUrl: body.videoUrl })
                            if (body.voiceMediaId) {
                              placeDraggedLibraryItem(JSON.stringify({
                                id: body.voiceMediaId,
                                kind: 'voice',
                                sourceUrl: `/api/media/${body.voiceMediaId}`,
                                label: 'Voice',
                                folderId: null,
                                createdBy: 'generate',
                                durationSec: 5,
                              }), 'voice', startSec)
                            }
                          }
                        }
                      } else if (info.voiceMediaId) {
                        placeDraggedLibraryItem(JSON.stringify({
                          id: info.voiceMediaId,
                          kind: 'voice',
                          sourceUrl: `/api/media/${info.voiceMediaId}`,
                          label: 'Voice',
                          folderId: null,
                          createdBy: 'generate',
                          durationSec: 5,
                        }), 'voice', startSec)
                      }
                    }
                  } catch (err) {
                    console.warn('[library] compose', err instanceof Error ? err.message : err)
                  }
                }
                const rejected = placeDraggedLibraryItem(payload, hint, startSec)
                if (rejected) toast.error(rejected)
              })()
            }}
          />
        ))}
      </div>

      {/* Playhead line (full height) */}
      <div
        className="absolute top-0 bottom-0 w-px bg-[#00e5c8]/50 pointer-events-none z-10"
        style={{ left: playheadX }}
      />
    </div>
  )
}

interface TrackRowProps {
  rowHeight: number
  track: Track
  zoomLevel: number
  scrollOffset: number
  selectedClipId: string | null
  hoveredClipId: string | null
  playheadX: number
  clipJobMap: Map<string, ActiveJob>
  onClipSelect: (id: string | null) => void
  onMouseDown: (e: React.MouseEvent, type: 'clip' | 'trim-start' | 'trim-end', clip: Clip) => void
  onHover: (id: string | null) => void
  onToggleMute: () => void
  onClipMenu: (id: string, x: number, y: number) => void
  onLibraryDrop: (raw: string, x: number) => void
}

function TrackRow({
  rowHeight,
  track,
  zoomLevel,
  scrollOffset,
  selectedClipId,
  hoveredClipId,
  playheadX,
  clipJobMap,
  onClipSelect,
  onMouseDown,
  onHover,
  onToggleMute,
  onClipMenu,
  onLibraryDrop,
}: TrackRowProps) {
  const colour = TRACK_COLOURS[track.label] ?? '#6b7280'
  const isAudio = track.type === 'audio'

  return (
    <div
      id={`track-row-${track.id}`}
      className="flex border-b border-white/5 hover:bg-white/[0.015] transition-colors"
      style={{ height: rowHeight }}
    >
      {/* Label column */}
      <div
        className="flex-shrink-0 flex items-center gap-2 px-2 border-r border-white/8"
        style={{ width: TRACK_LABEL_WIDTH }}
      >
        <div className="w-1.5 h-6 rounded-sm flex-shrink-0" style={{ backgroundColor: colour }} />
        <span className="text-[9px] text-white/45 font-medium truncate flex-1">{track.label}</span>
        <button
          onClick={onToggleMute}
          className={`flex-shrink-0 transition-colors ${track.muted ? 'text-red-400' : 'text-white/20 hover:text-white/60'}`}
          title={track.muted ? 'Unmute' : 'Mute'}
        >
          {track.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
        </button>
      </div>

      {/* Clip area */}
      <div
        className="flex-1 relative overflow-hidden"
        onClick={() => onClipSelect(null)}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('application/x-cinema-media')) {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'copy'
          }
        }}
        onDrop={(event) => {
          const raw = event.dataTransfer.getData('application/x-cinema-media')
          if (!raw) return
          event.preventDefault()
          const bounds = event.currentTarget.getBoundingClientRect()
          onLibraryDrop(raw, event.clientX - bounds.left)
        }}
      >
        {track.clips.map((clip) => {
          const x = timeToX(clip.startTime, zoomLevel, scrollOffset)
          const w = (clip.endTime - clip.startTime) * zoomLevel
          if (x + w < 0 || x > 4000) return null

          const isSelected = clip.id === selectedClipId
          const isHovered = clip.id === hoveredClipId
          const activeJob = clipJobMap.get(clip.id)
          const isGenerating = Boolean(activeJob)
          const clipColour = clip.modelUsed ? (MODEL_CLIP_COLOURS[clip.modelUsed] ?? colour + '80') : colour + '60'

          return (
            <div
              key={clip.id}
              className={`
                absolute top-1.5 rounded-md cursor-grab active:cursor-grabbing
                flex items-center overflow-hidden
                border transition-all duration-100
                ${isSelected ? 'ring-1 ring-teal-500 border-[#00e5c8] z-20' : isHovered ? 'border-white/40 z-10' : 'border-transparent'}
                ${isGenerating ? 'border-[#00e5c8]/40 animate-pulse-subtle' : ''}
              `}
              style={{
                left: Math.max(0, x),
                width: Math.max(20, w - 2),
                height: Math.max(12, rowHeight - 12),
                backgroundColor: clipColour,
              }}
              onMouseDown={(e) => onMouseDown(e, 'clip', clip)}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onClipSelect(clip.id)
                onClipMenu(clip.id, e.clientX, e.clientY)
              }}
              onMouseEnter={() => onHover(clip.id)}
              onMouseLeave={() => onHover(null)}
            >
              {/* Trim handle start */}
              <div
                className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize z-30
                  bg-black/30 hover:bg-[#00e5c8]/40 transition-colors"
                onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, 'trim-start', clip) }}
              />

              {/* Content */}
              <div className="flex-1 px-2 min-w-0 relative h-full">
                {isGenerating ? (
                  <div className="flex items-center gap-1 h-full">
                    <div className="w-2 h-2 rounded-full bg-[#00f0d5] animate-pulse" />
                    <span className="text-[9px] text-white/80 truncate">
                      ⟳ {activeJob?.progress != null ? `${activeJob.progress}%` : 'Generating…'}
                    </span>
                  </div>
                ) : !clip.sourceUrl || !isVideoMediaUrl(clip.sourceUrl) ? (
                  <div className="flex items-center h-full text-[9px] text-red-300/90 truncate">
                    ⚠ no media — re-render
                  </div>
                ) : (
                  <>
                    {clipPosterUrl(clip) && w > 40 && (
                      <img
                        src={clipPosterUrl(clip)}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover opacity-40 pointer-events-none rounded-sm"
                      />
                    )}
                    <span className="relative z-[1] text-[9px] text-white/90 truncate block leading-none drop-shadow">
                      {clip.prompt ? clip.prompt.slice(0, 30) : clip.modelUsed ?? 'Clip'}
                    </span>
                  </>
                )}
                {isAudio && (
                  <div className="flex gap-0.5 mt-1 h-2 items-end">
                    {Array.from({ length: Math.floor(w / 4) }, (_, i) => (
                      <div
                        key={i}
                        className="w-px bg-white/30 rounded-sm"
                        style={{ height: `${20 + Math.sin(i * 0.8) * 60 + 20}%` }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Model badge */}
              {clip.modelUsed && w > 60 && (
                <div className="absolute top-0.5 right-1.5 text-[8px] text-white/50 font-medium bg-black/30 px-1 rounded">
                  {clip.modelUsed.replace('_', ' ')}
                </div>
              )}

              {/* Trim handle end */}
              <div
                className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-30
                  bg-black/30 hover:bg-[#00e5c8]/40 transition-colors"
                onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, 'trim-end', clip) }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
