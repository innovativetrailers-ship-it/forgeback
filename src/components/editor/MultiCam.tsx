'use client'

import { useState, useRef, useCallback } from 'react'
import { Play, Pause, Grid2X2, Scissors } from 'lucide-react'
import type { AngleSwitch, CameraClip } from '@/lib/timeline/MultiCamSync'

interface Props {
  clips:     CameraClip[]
  onExport?: (switches: AngleSwitch[]) => void
}

export function MultiCam({ clips, onExport }: Props) {
  const [playing,     setPlaying]     = useState(false)
  const [currentSec,  setCurrentSec]  = useState(0)
  const [activeClipId, setActiveClipId] = useState<string>(clips[0]?.id ?? '')
  const [switches,    setSwitches]    = useState<AngleSwitch[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const videoRefs   = useRef<Record<string, HTMLVideoElement | null>>({})

  const duration = Math.max(...clips.map(c => c.duration), 60)

  const togglePlay = () => {
    if (playing) {
      clearInterval(intervalRef.current ?? undefined)
      Object.values(videoRefs.current).forEach(v => v?.pause())
      setPlaying(false)
    } else {
      Object.values(videoRefs.current).forEach(v => { if (v) { v.currentTime = currentSec; void v.play() } })
      intervalRef.current = setInterval(() => {
        setCurrentSec(s => {
          if (s >= duration) {
            clearInterval(intervalRef.current ?? undefined)
            setPlaying(false)
            return 0
          }
          return s + 0.1
        })
      }, 100)
      setPlaying(true)
    }
  }

  const switchToCamera = useCallback((clipId: string) => {
    setActiveClipId(clipId)
    setSwitches(prev => [...prev, { timeSec: currentSec, clipId }])
  }, [currentSec])

  const handleExport = () => {
    onExport?.(switches)
  }

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1a1f2e]">
        <div className="flex items-center gap-2">
          <Grid2X2 size={14} className="text-[#00e5c8]" />
          <span className="text-sm font-medium text-white">Multi-Camera Editor</span>
          <span className="text-xs text-gray-500">({clips.length} cameras)</span>
        </div>
        <button
          onClick={handleExport}
          disabled={switches.length === 0}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#00e5c8] text-black font-semibold rounded-lg disabled:opacity-40"
        >
          <Scissors size={12} />
          Export Edit ({switches.length} cuts)
        </button>
      </div>

      {/* Camera grid */}
      <div className={`grid flex-1 gap-1 p-2 ${clips.length <= 2 ? 'grid-cols-2' : clips.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {clips.map(clip => {
          const isActive = clip.id === activeClipId
          return (
            <button
              key={clip.id}
              onClick={() => switchToCamera(clip.id)}
              className={`relative rounded-lg overflow-hidden border-2 transition ${
                isActive ? 'border-[#00e5c8]' : 'border-[#2a3040] hover:border-[#3a4050]'
              }`}
            >
              <video
                ref={el => { videoRefs.current[clip.id] = el }}
                src={clip.url}
                muted
                loop={false}
                playsInline
                className="w-full aspect-video object-cover"
              />
              {/* Camera label */}
              <div className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                isActive ? 'bg-[#00e5c8] text-black' : 'bg-black/60 text-white'
              }`}>
                {clip.label}
              </div>
              {isActive && (
                <div className="absolute inset-0 ring-2 ring-inset ring-[#00e5c8] pointer-events-none" />
              )}
            </button>
          )
        })}
      </div>

      {/* Playback controls */}
      <div className="px-4 py-3 border-t border-[#1a1f2e]">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={togglePlay} className="text-white hover:text-[#00e5c8]">
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <div className="text-xs text-gray-500 font-mono">
            {formatTime(currentSec)} / {formatTime(duration)}
          </div>
        </div>

        {/* Scrubber */}
        <div className="relative h-1.5 bg-[#1a1f2e] rounded-full cursor-pointer" onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect()
          const pct  = (e.clientX - rect.left) / rect.width
          const sec  = pct * duration
          setCurrentSec(sec)
          Object.values(videoRefs.current).forEach(v => { if (v) v.currentTime = sec })
        }}>
          <div className="absolute inset-y-0 left-0 bg-[#00e5c8] rounded-full" style={{ width: `${(currentSec / duration) * 100}%` }} />

          {/* Cut markers */}
          {switches.map((sw, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-0.5 bg-yellow-400"
              style={{ left: `${(sw.timeSec / duration) * 100}%` }}
              title={`Cut to ${clips.find(c => c.id === sw.clipId)?.label}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
