'use client'
import { useRef, useState, useEffect, useCallback } from 'react'
import {
  Play, Pause, Volume2, VolumeX, Maximize2, Minimize2,
  SkipBack, SkipForward, RefreshCw, PictureInPicture2,
  ChevronLeft, ChevronRight, Settings, Crosshair,
} from 'lucide-react'
import { useEditorStore } from '@/store/editor'
import { useEditorRecipeView } from '@/lib/timeline/to-editor-recipe'
import { canPlaySrc, pauseAfterPlay, playMedia } from '@/lib/timeline/playback'

type PreviewQuality = 'proxy' | 'full'
type AspectMode = 'fit' | 'fill' | 'native'
type SafeAreaMode = 'none' | 'action' | 'title' | 'broadcast'

export function Preview() {
  const {
    playheadTime, setPlayheadTime,
    isPlaying, setIsPlaying,
    selectedClipId,
  } = useEditorStore()
  const recipe = useEditorRecipeView()

  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [quality, setQuality] = useState<PreviewQuality>('proxy')
  const [aspectMode, setAspectMode] = useState<AspectMode>('fit')
  const [safeArea, setSafeArea] = useState<SafeAreaMode>('none')
  const [showTimecode, setShowTimecode] = useState(true)
  const [isLooping, setIsLooping] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [noMedia, setNoMedia] = useState(false)

  const totalDuration = recipe?.totalDuration ?? 0
  const fps = recipe?.fps ?? 24

  const activeClip = recipe?.tracks
    .flatMap((t) => t.clips)
    .find((c) => c.id === selectedClipId) ?? recipe?.tracks.flatMap((t) => t.clips)[0]

  const activeVideoUrl =
    quality === 'proxy'
      ? (activeClip?.proxyUrl ?? activeClip?.videoUrl ?? '')
      : (activeClip?.videoUrl ?? '')

  // Sync store playhead → video element
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (Math.abs(v.currentTime - playheadTime) > 0.05) {
      v.currentTime = playheadTime
    }
  }, [playheadTime])

  // Sync play state
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (isPlaying) {
      if (!canPlaySrc(activeVideoUrl)) {
        console.warn('play_not_supported', { src: activeVideoUrl })
        setNoMedia(true)
        return
      }
      setNoMedia(false)
      if (playMedia(v, activeVideoUrl) === 'unsupported') setNoMedia(true)
    } else {
      void pauseAfterPlay(v)
    }
  }, [isPlaying, activeVideoUrl])

  // Volume / mute
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : volume
    }
  }, [volume, isMuted])

  // Loop
  useEffect(() => {
    if (videoRef.current) videoRef.current.loop = isLooping
  }, [isLooping])

  // Listen for mute toggle event from KeyboardHandler
  useEffect(() => {
    const handler = () => setIsMuted((m) => !m)
    document.addEventListener('preview:toggleMute', handler)
    return () => document.removeEventListener('preview:toggleMute', handler)
  }, [])

  const handleTimeUpdate = () => {
    if (videoRef.current) setPlayheadTime(videoRef.current.currentTime)
  }

  const handleEnded = () => {
    if (!isLooping) setIsPlaying(false)
  }

  const stepFrame = useCallback(
    (direction: 1 | -1) => {
      const frameDuration = 1 / fps
      setIsPlaying(false)
      setPlayheadTime(Math.max(0, Math.min(totalDuration, playheadTime + frameDuration * direction)))
    },
    [playheadTime, fps, totalDuration, setIsPlaying, setPlayheadTime]
  )

  const goToStart = () => { setIsPlaying(false); setPlayheadTime(0) }
  const goToEnd = () => { setIsPlaying(false); setPlayheadTime(totalDuration) }

  const toggleFullscreen = async () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen()
      setIsFullscreen(true)
    } else {
      await document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const togglePiP = async () => {
    if (!videoRef.current) return
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture()
    } else {
      await videoRef.current.requestPictureInPicture()
    }
  }

  const resetHideTimer = () => {
    setShowControls(true)
    clearTimeout(hideControlsTimer.current)
    if (isPlaying) {
      hideControlsTimer.current = setTimeout(() => setShowControls(false), 3000)
    }
  }

  useEffect(() => {
    return () => clearTimeout(hideControlsTimer.current)
  }, [])

  // SMPTE timecode HH:MM:SS:FF
  const toTimecode = (seconds: number): string => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    const f = Math.floor((seconds % 1) * fps)
    return [h, m, s, f].map((v) => v.toString().padStart(2, '0')).join(':')
  }

  const formatTime = (s: number): string => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const SAFE_AREAS: Record<SafeAreaMode, { action?: string; title?: string }> = {
    none:      {},
    action:    { action: '90%' },
    title:     { action: '90%', title: '80%' },
    broadcast: { action: '93%', title: '90%' },
  }

  const videoClass = {
    fit:    'max-w-full max-h-full object-contain',
    fill:   'w-full h-full object-cover',
    native: 'object-none',
  }[aspectMode]

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black flex flex-col select-none"
      onMouseMove={resetHideTimer}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {/* VIDEO AREA */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {noMedia || !canPlaySrc(activeVideoUrl) ? (
          <div className="text-red-400/80 text-sm">No media</div>
        ) : (
        <video
          ref={videoRef}
          src={activeVideoUrl}
          className={`${videoClass} transition-all`}
          crossOrigin="anonymous"
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onLoadedMetadata={() => {
            if (videoRef.current) videoRef.current.currentTime = playheadTime
          }}
          onClick={() => setIsPlaying(!isPlaying)}
        />
        )}

        {/* Safe area overlays */}
        {safeArea !== 'none' && (
          <div className="absolute inset-0 pointer-events-none">
            {SAFE_AREAS[safeArea].action && (
              <div
                className="absolute border border-white/20"
                style={{
                  top:    `${(100 - parseFloat(SAFE_AREAS[safeArea].action!)) / 2}%`,
                  left:   `${(100 - parseFloat(SAFE_AREAS[safeArea].action!)) / 2}%`,
                  right:  `${(100 - parseFloat(SAFE_AREAS[safeArea].action!)) / 2}%`,
                  bottom: `${(100 - parseFloat(SAFE_AREAS[safeArea].action!)) / 2}%`,
                }}
              />
            )}
            {SAFE_AREAS[safeArea].title && (
              <div
                className="absolute border border-[#00e5c8]/30"
                style={{
                  top:    `${(100 - parseFloat(SAFE_AREAS[safeArea].title!)) / 2}%`,
                  left:   `${(100 - parseFloat(SAFE_AREAS[safeArea].title!)) / 2}%`,
                  right:  `${(100 - parseFloat(SAFE_AREAS[safeArea].title!)) / 2}%`,
                  bottom: `${(100 - parseFloat(SAFE_AREAS[safeArea].title!)) / 2}%`,
                }}
              />
            )}
          </div>
        )}

        {/* SMPTE timecode overlay */}
        {showTimecode && (
          <div className="absolute bottom-2 left-2 font-mono text-xs text-white/60 bg-black/40 px-1.5 py-0.5 rounded pointer-events-none">
            {toTimecode(playheadTime)}
          </div>
        )}

        {/* Quality badge */}
        <div
          className={`absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded font-mono pointer-events-none ${
            quality === 'proxy'
              ? 'bg-[#1a1f2e] text-gray-400'
              : 'bg-[#00e5c8]/20 text-[#00e5c8]'
          }`}
        >
          {quality === 'proxy' ? 'PROXY' : 'FULL'}
        </div>

        {/* Generating placeholder */}
        {(activeClip as { isGenerating?: boolean; generationProgress?: number } | undefined)?.isGenerating && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-[#00e5c8] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <div className="text-xs text-gray-400">
                {(activeClip as { generationProgress?: number }).generationProgress ?? 0}%
              </div>
            </div>
          </div>
        )}

        {/* Settings panel overlay */}
        {showSettings && (
          <div
            className="absolute top-8 right-2 bg-[#151b24] border border-[#1a2030] rounded-xl p-3 z-10 w-48 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-gray-400 font-medium mb-2">Preview Quality</div>
            {(['proxy', 'full'] as PreviewQuality[]).map((q) => (
              <button
                key={q}
                onClick={() => setQuality(q)}
                className={`w-full text-left px-2 py-1.5 rounded mb-0.5 ${
                  quality === q
                    ? 'bg-[#00e5c8]/15 text-[#00e5c8]'
                    : 'text-gray-400 hover:bg-white/5'
                }`}
              >
                {q === 'proxy' ? 'Proxy (fast)' : 'Full quality'}
              </button>
            ))}

            <div className="text-gray-400 font-medium mt-3 mb-2">Fit Mode</div>
            {(['fit', 'fill', 'native'] as AspectMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setAspectMode(m)}
                className={`w-full text-left px-2 py-1.5 rounded mb-0.5 capitalize ${
                  aspectMode === m
                    ? 'bg-[#00e5c8]/15 text-[#00e5c8]'
                    : 'text-gray-400 hover:bg-white/5'
                }`}
              >
                {m}
              </button>
            ))}

            <div className="text-gray-400 font-medium mt-3 mb-2">Safe Area</div>
            {(['none', 'action', 'title', 'broadcast'] as SafeAreaMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setSafeArea(m)}
                className={`w-full text-left px-2 py-1.5 rounded mb-0.5 capitalize ${
                  safeArea === m
                    ? 'bg-[#00e5c8]/15 text-[#00e5c8]'
                    : 'text-gray-400 hover:bg-white/5'
                }`}
              >
                {m === 'none' ? 'None' : `${m} safe`}
              </button>
            ))}

            <div className="flex items-center justify-between mt-3">
              <span className="text-gray-400">Timecode</span>
              <button
                onClick={() => setShowTimecode(!showTimecode)}
                className={`w-8 h-4 rounded-full transition ${showTimecode ? 'bg-[#00e5c8]' : 'bg-gray-600'}`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-white m-0.5 transition-all ${
                    showTimecode ? 'translate-x-4' : ''
                  }`}
                />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CONTROLS BAR */}
      <div
        className={`flex flex-col gap-1 px-3 py-2 bg-black/80 transition-opacity duration-300 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Seek bar */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-mono w-10 text-right">
            {formatTime(playheadTime)}
          </span>
          <input
            type="range"
            min={0}
            max={totalDuration || 1}
            step={1 / fps}
            value={playheadTime}
            onChange={(e) => {
              setIsPlaying(false)
              setPlayheadTime(Number(e.target.value))
            }}
            className="flex-1 h-1 accent-[#00e5c8] cursor-pointer"
          />
          <span className="text-xs text-gray-500 font-mono w-10">
            {formatTime(totalDuration)}
          </span>
        </div>

        {/* Button row */}
        <div className="flex items-center justify-between">
          {/* Transport */}
          <div className="flex items-center gap-1">
            <ControlButton onClick={goToStart} title="Go to start (Home)">
              <SkipBack size={14} />
            </ControlButton>
            <ControlButton onClick={() => stepFrame(-1)} title="Step back 1 frame (J)">
              <ChevronLeft size={14} />
            </ControlButton>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              title="Play/Pause (Space)"
              className="w-8 h-8 rounded-full bg-[#00e5c8] text-black flex items-center justify-center hover:bg-[#00e5c8]/90 transition"
            >
              {isPlaying ? <Pause size={13} fill="black" /> : <Play size={13} fill="black" />}
            </button>
            <ControlButton onClick={() => stepFrame(1)} title="Step forward 1 frame (L)">
              <ChevronRight size={14} />
            </ControlButton>
            <ControlButton onClick={goToEnd} title="Go to end (End)">
              <SkipForward size={14} />
            </ControlButton>
            <ControlButton onClick={() => setIsLooping(!isLooping)} title="Toggle loop" active={isLooping}>
              <RefreshCw size={13} />
            </ControlButton>
          </div>

          {/* SMPTE timecode center */}
          <div className="text-xs font-mono text-gray-300 tracking-wider">
            {toTimecode(playheadTime)}
          </div>

          {/* Display controls */}
          <div className="flex items-center gap-1">
            <ControlButton onClick={() => setIsMuted(!isMuted)} title="Mute (M)">
              {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            </ControlButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                setIsMuted(false)
                setVolume(Number(e.target.value))
              }}
              className="w-16 h-1 accent-[#00e5c8] cursor-pointer"
            />
            <ControlButton
              onClick={() => setShowSettings(!showSettings)}
              title="Preview settings"
              active={showSettings}
            >
              <Settings size={13} />
            </ControlButton>
            <ControlButton
              onClick={() => setSafeArea(safeArea === 'none' ? 'title' : 'none')}
              title="Toggle safe area"
              active={safeArea !== 'none'}
            >
              <Crosshair size={13} />
            </ControlButton>
            <ControlButton onClick={togglePiP} title="Picture in Picture">
              <PictureInPicture2 size={13} />
            </ControlButton>
            <ControlButton onClick={toggleFullscreen} title="Fullscreen (F)">
              {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </ControlButton>
          </div>
        </div>
      </div>
    </div>
  )
}

function ControlButton({
  onClick,
  title,
  active = false,
  children,
}: {
  onClick: () => void
  title: string
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-7 rounded flex items-center justify-center transition ${
        active
          ? 'text-[#00e5c8] bg-[#00e5c8]/15'
          : 'text-gray-400 hover:text-white hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  )
}
