'use client'


import { logCaught } from '@/lib/diagnostics/caught'
import { useState, useCallback, useEffect } from 'react'
import { subscribeJobStream } from '@/lib/jobs/subscribeJobStream'
import { Music, Mic, Volume2, VolumeX, Sliders, Zap, Loader2 } from 'lucide-react'

interface Channel {
  id: string
  label: string
  type: 'music' | 'voice' | 'sfx' | 'ambience' | 'foley' | 'master'
  volume: number         // 0–1
  pan: number            // -1 to 1
  muted: boolean
  soloed: boolean
  eq: { low: number; mid: number; high: number }
  reverb: number         // 0–1
  delay: number          // 0–1
  compression: number    // 0–1
  colour: string
}

interface GeneratedTrack {
  channelId: string
  prompt: string
  url: string
  duration: number
}

interface DbAudioTrack {
  id: string
  type: string
  status: string
  prompt?: string | null
  url?: string | null
  volumeDb: number
  muted: boolean
  locked: boolean
  duckUnderDialogue: boolean
  durationMs?: number | null
}

interface Props {
  projectId?: string
  projectDuration: number
  onTracksApplied: (tracks: GeneratedTrack[]) => void
}

const DEFAULT_CHANNELS: Channel[] = [
  { id: 'master', label: 'Master', type: 'master', volume: 0.85, pan: 0, muted: false, soloed: false, eq: { low: 0, mid: 0, high: 0 }, reverb: 0, delay: 0, compression: 0.3, colour: '#00e5c8' },
  { id: 'music', label: 'Music', type: 'music', volume: 0.7, pan: 0, muted: false, soloed: false, eq: { low: 0.1, mid: -0.1, high: 0.05 }, reverb: 0.1, delay: 0, compression: 0.2, colour: '#ec4899' },
  { id: 'voice', label: 'Voice', type: 'voice', volume: 1.0, pan: 0, muted: false, soloed: false, eq: { low: -0.3, mid: 0.2, high: 0.1 }, reverb: 0.05, delay: 0, compression: 0.5, colour: '#06b6d4' },
  { id: 'sfx', label: 'SFX', type: 'sfx', volume: 0.6, pan: 0, muted: false, soloed: false, eq: { low: 0, mid: 0, high: 0.2 }, reverb: 0.15, delay: 0.05, compression: 0.1, colour: '#84cc16' },
  { id: 'ambience', label: 'Ambience', type: 'ambience', volume: 0.4, pan: 0, muted: false, soloed: false, eq: { low: 0.2, mid: 0, high: -0.1 }, reverb: 0.4, delay: 0, compression: 0, colour: '#8b5cf6' },
  { id: 'foley', label: 'Foley', type: 'foley', volume: 0.5, pan: 0, muted: false, soloed: false, eq: { low: -0.1, mid: 0.1, high: 0.3 }, reverb: 0.05, delay: 0, compression: 0.2, colour: '#10b981' },
]

const MUSIC_MOODS = [
  { id: 'dramatic', label: 'Dramatic', emoji: '🎭' },
  { id: 'uplifting', label: 'Uplifting', emoji: '✨' },
  { id: 'tension', label: 'Tension', emoji: '⚡' },
  { id: 'melancholy', label: 'Melancholy', emoji: '🌧' },
  { id: 'action', label: 'Action', emoji: '🔥' },
  { id: 'ambient', label: 'Ambient', emoji: '🌊' },
]

function VerticalFader({ value, onChange, colour }: { value: number; onChange: (v: number) => void; colour: string }) {
  return (
    <div className="flex flex-col items-center h-24 justify-end relative">
      <input
        type="range"
        min={0} max={1} step={0.01} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
            className="h-full accent-[#00e5c8]"
        style={{
          writingMode: 'vertical-lr' as const,
          appearance: 'none' as const,
          direction: 'rtl',
          width: 24,
        }}
      />
      {/* Level meter simulation */}
      <div className="absolute right-0 top-0 bottom-0 w-2 bg-white/5 rounded-full overflow-hidden pointer-events-none">
        <div
          className="absolute bottom-0 w-full rounded-full transition-all duration-100"
          style={{ height: `${value * 100}%`, backgroundColor: value > 0.85 ? '#ef4444' : value > 0.7 ? '#00e5c8' : colour }}
        />
      </div>
    </div>
  )
}

function PanKnob({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <input
        type="range" min={-1} max={1} step={0.05} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 accent-[#00e5c8] h-1"
      />
      <span className="text-[8px] text-white/25 font-mono">
        {value === 0 ? 'C' : value < 0 ? `L${Math.round(-value * 100)}` : `R${Math.round(value * 100)}`}
      </span>
    </div>
  )
}

export function AudioMixingBoard({ projectId, projectDuration, onTracksApplied }: Props) {
  const [channels, setChannels] = useState<Channel[]>(DEFAULT_CHANNELS)
  const [generatedTracks, setGeneratedTracks] = useState<GeneratedTrack[]>([])
  const [dbTracks, setDbTracks] = useState<DbAudioTrack[]>([])
  const [musicMood, setMusicMood] = useState('dramatic')
  const [musicPrompt, setMusicPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState<string | null>(null)
  const [showEQ, setShowEQ] = useState(false)
  const [activePreset, setActivePreset] = useState<string | null>(null)

  const reloadTracks = useCallback(() => {
    if (!projectId) return
    fetch(`/api/audio/track?projectId=${projectId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { tracks?: DbAudioTrack[] }) => setDbTracks(d.tracks ?? []))
      .catch((err) => logCaught('components/ultimate/AudioMixingBoard', err))
  }, [projectId])

  useEffect(() => { reloadTracks() }, [reloadTracks])

  const updateChannel = useCallback((id: string, updates: Partial<Channel>) => {
    setChannels((prev) => prev.map((c) => c.id === id ? { ...c, ...updates } : c))
  }, [])

  const patchTrack = useCallback(async (trackId: string, data: Record<string, unknown>) => {
    await fetch(`/api/audio/track/${trackId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    reloadTracks()
  }, [reloadTracks])

  const handleGenerateMusic = async () => {
    if (!projectId) return
    setIsGenerating('music')
    try {
      const createRes = await fetch('/api/audio/track', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          type: 'music',
          provider: 'suno',
          prompt: musicPrompt || `${musicMood} orchestral film score`,
          sunoStyle: musicMood,
          instrumental: true,
          duckUnderDialogue: true,
        }),
      })
      const created = await createRes.json() as { track?: { id: string } }
      if (!created.track?.id) return

      const res = await fetch(`/api/audio/track/${created.track.id}/generate`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) return
      const trackId = created.track.id
      const poll = setInterval(() => {
        void fetch(`/api/audio/track?projectId=${projectId}`, { credentials: 'include' })
          .then((r) => r.json())
          .then((d: { tracks?: DbAudioTrack[] }) => {
            const t = d.tracks?.find((x) => x.id === trackId)
            if (t?.status === 'READY' && t.url) {
              clearInterval(poll)
              setIsGenerating(null)
              setDbTracks(d.tracks ?? [])
              onTracksApplied([{
                channelId: 'music',
                prompt: musicPrompt || musicMood,
                url: t.url,
                duration: (t.durationMs ?? projectDuration * 1000) / 1000,
              }])
            }
            if (t?.status === 'FAILED') {
              clearInterval(poll)
              setIsGenerating(null)
            }
          })
      }, 3000)
      setTimeout(() => { clearInterval(poll); setIsGenerating(null) }, 300_000)
    } catch (err) {
      console.warn("[caught] src/components/ultimate/AudioMixingBoard.tsx:193", err instanceof Error ? { name: err.name, message: err.message } : err)

      setIsGenerating(null)
    }
  }

  const handleGenerateAmbience = async () => {
    setIsGenerating('ambience')
    try {
      const res = await fetch('/api/audio/foley', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: `${musicMood} ambient atmosphere, cinematic`,
          durationSeconds: Math.min(projectDuration, 120),
        }),
      })
      const data = await res.json() as { url?: string; audioUrl?: string }
      const audioUrl = data.url ?? data.audioUrl
      if (audioUrl) {
        setGeneratedTracks((prev) => [...prev, {
          channelId: 'ambience',
          prompt: 'ambience',
          url: audioUrl,
          duration: projectDuration,
        }])
      }
    } finally {
      setIsGenerating(null)
    }
  }

  const PRESETS = [
    { id: 'film', label: 'Film Mix', settings: { music: 0.55, voice: 1, sfx: 0.65, ambience: 0.3, foley: 0.45 } },
    { id: 'social', label: 'Social', settings: { music: 0.85, voice: 0.8, sfx: 0.5, ambience: 0.15, foley: 0.3 } },
    { id: 'dialogue', label: 'Dialogue', settings: { music: 0.3, voice: 1, sfx: 0.3, ambience: 0.2, foley: 0.2 } },
    { id: 'action', label: 'Action', settings: { music: 0.8, voice: 0.7, sfx: 1, ambience: 0.4, foley: 0.7 } },
  ]

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setActivePreset(preset.id)
    setChannels((prev) => prev.map((c) => {
      const vol = preset.settings[c.type as keyof typeof preset.settings]
      return vol !== undefined ? { ...c, volume: vol } : c
    }))
  }

  const masterChannel = channels.find((c) => c.id === 'master')!
  const trackChannels = channels.filter((c) => c.id !== 'master')

  return (
    <div className="flex flex-col h-full bg-[#0a0a12]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8 flex-shrink-0">
        <Sliders className="w-3.5 h-3.5 text-pink-400" />
        <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">Audio Mix</span>
        <div className="flex-1" />
        <button
          onClick={() => setShowEQ((v) => !v)}
          className={`text-[10px] px-2 py-1 rounded-lg border transition-colors
            ${showEQ ? 'border-pink-500/40 bg-pink-500/15 text-pink-400' : 'border-white/10 text-white/35 hover:border-white/20'}`}
        >
          EQ
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Mix presets */}
        <div className="flex gap-1.5 px-4 py-2 border-b border-white/6">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset)}
              className={`px-2.5 py-1 rounded-lg border text-[10px] transition-colors
                ${activePreset === preset.id ? 'border-[#00e5c8]/40 bg-[#00e5c8]/15 text-[#00e5c8]' : 'border-white/8 text-white/35 hover:border-white/20'}`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Fader board */}
        <div className="flex overflow-x-auto p-4 gap-1 min-h-0">
          {trackChannels.map((ch) => (
            <div
              key={ch.id}
              className={`flex flex-col items-center gap-2 p-2 rounded-xl border min-w-[70px] transition-all
                ${ch.soloed ? 'border-[#00e5c8]/30 bg-[#00e5c8]/8' : ch.muted ? 'border-white/5 opacity-50' : 'border-white/8 bg-white/2'}`}
            >
              {/* Channel name */}
              <div className="w-2 h-5 rounded-sm" style={{ backgroundColor: ch.colour }} />
              <span className="text-[9px] text-white/40 font-medium">{ch.label}</span>

              {/* EQ sliders (collapsed by default) */}
              {showEQ && (
                <div className="w-full space-y-1">
                  {(['low', 'mid', 'high'] as const).map((band) => (
                    <div key={band} className="flex items-center gap-1">
                      <span className="text-[7px] text-white/20 w-4">{band[0].toUpperCase()}</span>
                      <input
                        type="range" min={-1} max={1} step={0.05} value={ch.eq[band]}
                        onChange={(e) => updateChannel(ch.id, { eq: { ...ch.eq, [band]: Number(e.target.value) } })}
                        className="flex-1 accent-pink-500 h-0.5"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Volume fader */}
              <VerticalFader value={ch.volume} onChange={(v) => updateChannel(ch.id, { volume: v })} colour={ch.colour} />
              <span className="text-[9px] font-mono text-white/40">{Math.round(ch.volume * 100)}</span>

              {/* Pan */}
              <PanKnob value={ch.pan} onChange={(v) => updateChannel(ch.id, { pan: v })} />

              {/* FX mini row */}
              <div className="flex gap-1 text-[8px] text-white/25">
                <span title="Reverb">R{Math.round(ch.reverb * 10)}</span>
                <span>·</span>
                <span title="Compression">C{Math.round(ch.compression * 10)}</span>
              </div>

              {/* Mute / Solo */}
              <div className="flex gap-1">
                <button
                  onClick={() => updateChannel(ch.id, { muted: !ch.muted })}
                  className={`w-6 h-5 rounded text-[8px] font-bold transition-colors
                    ${ch.muted ? 'bg-red-500/30 text-red-400' : 'bg-white/8 text-white/30 hover:bg-white/15'}`}
                >
                  M
                </button>
                <button
                  onClick={() => updateChannel(ch.id, { soloed: !ch.soloed })}
                  className={`w-6 h-5 rounded text-[8px] font-bold transition-colors
                    ${ch.soloed ? 'bg-[#00e5c8]/30 text-[#00e5c8]' : 'bg-white/8 text-white/30 hover:bg-white/15'}`}
                >
                  S
                </button>
              </div>
            </div>
          ))}

          {/* Master bus */}
          <div className="flex flex-col items-center gap-2 p-2 rounded-xl border border-[#00e5c8]/20 bg-[#00e5c8]/5 min-w-[70px] ml-2">
            <span className="text-[9px] text-[#00e5c8]/70 font-bold">MASTER</span>
            <VerticalFader value={masterChannel.volume} onChange={(v) => updateChannel('master', { volume: v })} colour="#00e5c8" />
            <span className="text-[9px] font-mono text-[#00e5c8]/60">{Math.round(masterChannel.volume * 100)}</span>
          </div>
        </div>

        {dbTracks.length > 0 && (
          <div className="p-3 border-t border-white/8 space-y-2 max-h-40 overflow-y-auto">
            <p className="text-[10px] text-white/35 font-semibold uppercase tracking-wider">Project Audio Tracks</p>
            {dbTracks.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-[10px] py-1 border-b border-white/5">
                <span className="text-white/50 w-16 uppercase">{t.type.toLowerCase()}</span>
                <span className="flex-1 truncate text-white/35">{t.prompt ?? '—'}</span>
                <span className={`px-1 rounded ${t.status === 'READY' ? 'text-teal-400' : t.status === 'FAILED' ? 'text-red-400' : 'text-white/30'}`}>
                  {t.status.toLowerCase()}
                </span>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={t.volumeDb}
                  onChange={(e) => void patchTrack(t.id, { volumeDb: Number(e.target.value) })}
                  className="w-16 accent-teal-500"
                  title="Gain (dB)"
                />
                <button
                  type="button"
                  onClick={() => void patchTrack(t.id, { muted: !t.muted })}
                  className="text-white/40 hover:text-white/70"
                >
                  {t.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                </button>
                {!t.locked && t.status !== 'GENERATING' && (
                  <button
                    type="button"
                    onClick={() => void fetch(`/api/audio/track/${t.id}/generate`, { method: 'POST', credentials: 'include' }).then(() => reloadTracks())}
                    className="text-teal-400/70 hover:text-teal-300"
                  >
                    ↺
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* AI Music Generation */}
        <div className="p-4 border-t border-white/8 space-y-3">
          <p className="text-[10px] text-white/35 font-semibold uppercase tracking-wider">Forge Intelligence Audio</p>

          {/* Mood selector */}
          <div className="flex flex-wrap gap-1.5">
            {MUSIC_MOODS.map((mood) => (
              <button
                key={mood.id}
                onClick={() => setMusicMood(mood.id)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] transition-colors
                  ${musicMood === mood.id ? 'border-pink-500/40 bg-pink-500/15 text-pink-300' : 'border-white/8 text-white/35 hover:border-white/20'}`}
              >
                <span>{mood.emoji}</span>
                {mood.label}
              </button>
            ))}
          </div>

          <input
            value={musicPrompt}
            onChange={(e) => setMusicPrompt(e.target.value)}
            placeholder={`${musicMood} orchestral film score, no vocals…`}
            className="w-full bg-[#12121a] border border-white/10 rounded-lg px-2.5 py-1.5
              text-[11px] text-white/70 placeholder:text-white/20 focus:outline-none focus:border-pink-500/30"
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleGenerateMusic}
              disabled={!!isGenerating}
              className="py-2 rounded-lg bg-pink-500/20 border border-pink-500/30 text-pink-400
                text-[10px] font-semibold hover:bg-pink-500/30 disabled:opacity-40 transition-colors
                flex items-center justify-center gap-1.5"
            >
              {isGenerating === 'music' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Music className="w-3 h-3" />}
              Generate Music · ⬡ 30
            </button>
            <button
              onClick={handleGenerateAmbience}
              disabled={!!isGenerating}
              className="py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-400
                text-[10px] font-semibold hover:bg-purple-500/30 disabled:opacity-40 transition-colors
                flex items-center justify-center gap-1.5"
            >
              {isGenerating === 'ambience' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              Ambience · ⬡ 10
            </button>
          </div>

          {/* Generated tracks */}
          {generatedTracks.length > 0 && (
            <div className="space-y-2">
              {generatedTracks.map((track, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-white/3 rounded-lg border border-white/8">
                  <div className="w-1.5 h-6 rounded-sm bg-pink-500/60" />
                  <audio src={track.url} controls className="flex-1 h-6" style={{ filter: 'invert(0.8) hue-rotate(180deg)' }} />
                  <button
                    onClick={() => onTracksApplied([track])}
                    className="text-[9px] text-[#00e5c8] hover:text-[#00b8a0] whitespace-nowrap transition-colors"
                  >
                    + Timeline
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
