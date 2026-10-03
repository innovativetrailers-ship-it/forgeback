'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Play, Pause, SkipBack, SkipForward, Maximize2, Loader2 } from 'lucide-react'
import { PREVIEW_HEIGHT } from './constants'
import type { Clip, Track } from '@/lib/timeline/schema'
import { clipMediaPath } from '@/lib/media/clipPlayback'
import { isVideoMediaUrl, canPlaySrc, playMedia, pauseAfterPlay } from '@/lib/timeline/playback'
import { sampleControl } from '@/lib/timeline/controlLayer'
import { sampleSpeed } from '@/lib/timeline/timeRemap'
import { usePlaybackStore } from '@/store/playbackStore'
import { previewAt } from '@/lib/timeline/nleDepth'
import { deepGradeCss, gradeHasDesktopDepth } from '@cinema/core'
import { Scopes } from '@/components/editor/Scopes'
import { ClipControlBar } from '@/components/editor/ClipControlBar'

interface ActiveJob {
  jobId: string
  clipId: string
  progress?: number
  message?: string
}

interface Props {
  clips: Clip[]
  tracks?: Track[]
  playheadTime: number
  isPlaying: boolean
  duration: number
  activeJobs: ActiveJob[]
  onPlayPause: () => void
  onSeek: (t: number) => void
  onSkipToStart: () => void
  onSkipToEnd: () => void
  /** Advance to next clip when the active video ends. */
  onPlaybackEnded?: () => void
}

function formatTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const f = Math.floor((seconds % 1) * 24)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`
}

function playbackSrc(clip: Clip): string {
  const url = clip.sourceUrl.trim()
  const meta = clip.metadata as { shotPlanId?: string; jobId?: string } | undefined
  if (url.startsWith('/api/media/') || url.startsWith('/api/jobs/')) return url
  if (meta?.jobId) return clipMediaPath(meta.jobId)
  if (meta?.shotPlanId) return clipMediaPath(meta.shotPlanId)
  if (url.startsWith('/')) return url
  if (/^https?:\/\//i.test(url) && meta?.shotPlanId) return clipMediaPath(meta.shotPlanId)
  if (/^https?:\/\//i.test(url)) return url
  return ''
}

function pickClipAtPlayhead(clips: Clip[], playheadTime: number): Clip | undefined {
  return clips
    .filter((c) => c.sourceUrl && isVideoMediaUrl(c.sourceUrl)
      && c.startTime <= playheadTime && c.endTime > playheadTime)
    .sort((a, b) => b.startTime - a.startTime)[0]
}

export function VideoPreview({
  clips,
  tracks,
  playheadTime,
  isPlaying,
  duration,
  activeJobs,
  onPlayPause,
  onSeek,
  onSkipToStart,
  onSkipToEnd,
  onPlaybackEnded,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map())
  const isPlayingRef = useRef(isPlaying)
  const [noMedia, setNoMedia] = useState(false)

  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])

  const storedRecipe = usePlaybackStore((state) => state.recipe)
  const fromRecipe = storedRecipe ? previewAt(storedRecipe, playheadTime) : null
  const currentClip = fromRecipe?.clip ?? pickClipAtPlayhead(clips, playheadTime)
  const resolvedSrc = fromRecipe?.src || (currentClip ? playbackSrc(currentClip) : '')
  const hasGenerating = activeJobs.length > 0

  useEffect(() => { setNoMedia(false) }, [currentClip?.id, resolvedSrc])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (!currentClip?.timeRemap?.enabled) {
      video.playbackRate = 1
      return
    }
    const span = Math.max(0.1, currentClip.endTime - currentClip.startTime)
    const local = Math.max(0, playheadTime - currentClip.startTime)
    video.playbackRate = Math.min(4, Math.max(0.25, sampleSpeed(currentClip, local, span)))
  }, [currentClip, playheadTime])

  // Load src when active clip changes; seek when paused.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !resolvedSrc || !canPlaySrc(resolvedSrc)) return

    const localTime = Math.max(0, playheadTime - (currentClip?.startTime ?? 0))

    if (!video.src.includes(resolvedSrc.split('?')[0] ?? resolvedSrc)) {
      video.src = resolvedSrc
      video.load()
    }

    if (!isPlaying && Math.abs(video.currentTime - localTime) > 0.05) {
      video.currentTime = localTime
    }
  }, [currentClip?.id, currentClip?.startTime, resolvedSrc, playheadTime, isPlaying])

  // Play / pause the media element (not just React state).
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (!resolvedSrc || !canPlaySrc(resolvedSrc)) return
    setNoMedia(false)

    if (isPlaying) {
      const result = playMedia(video, resolvedSrc)
      if (result === 'unsupported') setNoMedia(true)
    } else {
      void pauseAfterPlay(video)
    }
  }, [isPlaying, currentClip?.id, resolvedSrc])

  // Multi-track audio mixer
  useEffect(() => {
    const audioTracks = (tracks ?? []).filter((t) => t.type === 'audio' && !t.muted)
    const active = audioTracks.flatMap((t) =>
      t.clips
        .filter((c) => c.sourceUrl && c.startTime <= playheadTime && c.endTime >= playheadTime)
        .map((c) => ({ clip: c, track: t })),
    )
    const activeIds = new Set(active.map((a) => a.clip.id))

    audioRefs.current.forEach((el, id) => {
      if (!activeIds.has(id)) { el.pause(); audioRefs.current.delete(id) }
    })

    for (const { clip, track } of active) {
      let el = audioRefs.current.get(clip.id)
      if (!el) {
        el = new Audio(clip.sourceUrl)
        audioRefs.current.set(clip.id, el)
      }
      const raw = clip.audioSettings?.volume ?? track.volume ?? 1
      el.volume = Math.max(0, Math.min(1, raw > 1 ? raw / 100 : raw))
      const target = playheadTime - clip.startTime
      if (Math.abs(el.currentTime - target) > 0.2) el.currentTime = target
      if (isPlaying && el.paused) {
        if (canPlaySrc(clip.sourceUrl)) playMedia(el, clip.sourceUrl)
      }
      if (!isPlaying && !el.paused) void pauseAfterPlay(el)
    }
  }, [tracks, playheadTime, isPlaying])

  useEffect(() => {
    const refs = audioRefs.current
    return () => { refs.forEach((el) => el.pause()); refs.clear() }
  }, [])

  const handleTimeUpdate = useCallback(() => {
    if (!isPlayingRef.current) return
    const video = videoRef.current
    if (!video || !currentClip) return
    onSeek(currentClip.startTime + video.currentTime)
  }, [currentClip, onSeek])

  const handleEnded = useCallback(() => {
    onPlaybackEnded?.()
  }, [onPlaybackEnded])

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = async () => {
    const el = containerRef.current
    if (!el) return
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch (e) {
      console.error('fullscreen failed', e)
      const v = videoRef.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void }
      v?.webkitEnterFullscreen?.()
    }
  }

  const localControlTime = Math.max(0, playheadTime - (currentClip?.startTime ?? 0))
  const control = currentClip ? sampleControl(currentClip.control, localControlTime) : null

  return (
    <div
      ref={containerRef}
      className="preview-container relative flex flex-col bg-black border-b border-white/8"
      style={{ height: PREVIEW_HEIGHT }}
    >
      <div className="relative flex flex-1 items-center justify-center bg-[#050508]">
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={control ? { transform: `translate(${control.x}px, ${control.y}px) scale(${control.scale}) rotate(${control.rotation}deg)` } : undefined}
        >
          {resolvedSrc && canPlaySrc(resolvedSrc) && isVideoMediaUrl(resolvedSrc) && !noMedia ? (
            <video
              ref={videoRef}
              className="preview-video max-h-full max-w-full object-contain"
              style={{
                ...previewGrade(currentClip),
                transform: currentClip?.transform
                  ? `translate(${currentClip.transform.x}px, ${currentClip.transform.y}px) scale(${currentClip.transform.scale}) rotate(${currentClip.transform.rotation}deg)`
                  : undefined,
                objectFit: currentClip?.reframe && currentClip.reframe !== '16:9' ? 'cover' : undefined,
              }}
              crossOrigin="anonymous"
              playsInline
              onTimeUpdate={handleTimeUpdate}
              onEnded={handleEnded}
              onError={() => {
                console.warn('play_aborted', { src: videoRef.current?.currentSrc })
                setNoMedia(true)
              }}
              onLoadedMetadata={(e) => {
                const v = e.currentTarget
                if (!isPlayingRef.current && currentClip) {
                  v.currentTime = Math.max(0, playheadTime - currentClip.startTime)
                }
              }}
            />
          ) : (
            <div className="px-4 text-center text-sm text-red-400/80">
              No media
            </div>
          )}
          {control && (
            <div className="pointer-events-none absolute inset-0">
              {control.insert && (
                <img
                  src={control.insert.imageUrl}
                  alt=""
                  className="absolute object-contain"
                  style={{
                    left: `${control.insert.x * 100}%`,
                    top: `${control.insert.y * 100}%`,
                    width: `${control.insert.w * 100}%`,
                    height: `${control.insert.h * 100}%`,
                  }}
                />
              )}
              {control.chart && (
                <div className="absolute bottom-24 left-4 flex items-end gap-1">
                  {control.chart.bars.map((bar) => (
                    <div key={bar.label} className="w-3 bg-white/90" style={{ height: `${bar.height * 48}px` }} title={bar.label} />
                  ))}
                </div>
              )}
              {control.lowerThird && (
                <div className="absolute bottom-6 left-4 text-white">
                  <p className="text-sm font-semibold">{control.lowerThird.title}</p>
                  {control.lowerThird.subtitle && <p className="text-xs opacity-80">{control.lowerThird.subtitle}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="absolute top-2 left-3 font-mono text-xs text-white/70 bg-black/60 px-2 py-0.5 rounded">
          {formatTimecode(playheadTime)}
        </div>

        {hasGenerating && (
          <div className="absolute top-2 right-3 flex items-center gap-1.5 bg-[#00e5c8]/20 border border-[#00e5c8]/30
            text-[#00e5c8] text-[10px] px-2.5 py-1 rounded-full font-medium">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            {activeJobs.length} generating
            {activeJobs[0]?.progress !== undefined && ` · ${activeJobs[0].progress}%`}
          </div>
        )}

        <button
          type="button"
          onClick={toggleFullscreen}
          title="Fullscreen (F)"
          className="absolute bottom-2 right-3 p-1.5 rounded-lg bg-black/60 text-white/50
            hover:text-white hover:bg-black/80 transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center justify-center gap-1 py-2 bg-[#0a0a12] border-t border-white/5 relative">
        <button
          type="button"
          onClick={onSkipToStart}
          className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors"
          title="Skip to start (Home)"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onPlayPause}
          className="w-8 h-8 rounded-full bg-white/10 hover:bg-[#00e5c8]/20 text-white/80 hover:text-[#00e5c8]
            flex items-center justify-center transition-all"
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying
            ? <Pause className="w-3.5 h-3.5" fill="currentColor" />
            : <Play className="w-3.5 h-3.5 ml-0.5" fill="currentColor" />}
        </button>

        <button
          type="button"
          onClick={onSkipToEnd}
          className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors"
          title="Skip to end (End)"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </button>

        <span className="absolute right-4 font-mono text-[10px] text-white/30">
          {formatTimecode(duration)}
        </span>
      </div>
      <Scopes videoRef={videoRef} />
      {currentClip && <ClipControlBar clip={currentClip} />}
    </div>
  )
}

function previewGrade(clip: Clip | null | undefined): { filter?: string; opacity?: number } {
  const saturation = clip?.colourGrade?.asc_cdl?.saturation
  const look = clip?.colourGrade?.filmEmulation
  const deep = deepGradeCss(clip?.colourGrade?.deep)
  const grain = clip?.effects?.some((effect) => effect.type === 'film_grain')
  const vignette = clip?.effects?.some((effect) => effect.type === 'vignette')
  const bloom = clip?.effects?.some((effect) => effect.type === 'bloom')
  const filter = [
    look === 'bw_contrast' ? 'grayscale(1) contrast(1.25)' : '',
    look === 'kodak_5219' ? 'contrast(1.08) saturate(1.15) sepia(0.18)' : '',
    look === 'kodak_2383' ? 'contrast(1.12) saturate(1.05) sepia(0.28)' : '',
    look === 'fuji_3510' ? 'contrast(1.05) saturate(0.9) hue-rotate(-8deg)' : '',
    saturation != null && saturation !== 1 ? `saturate(${saturation})` : '',
    grain ? 'contrast(1.05)' : '',
    vignette ? 'brightness(0.92)' : '',
    bloom ? 'brightness(1.06)' : '',
    deep,
  ].filter(Boolean).join(' ')
  const opacity = clip?.transform?.opacity
  return {
    ...(filter ? { filter } : {}),
    ...(opacity != null && opacity !== 1 ? { opacity } : {}),
  }
}
