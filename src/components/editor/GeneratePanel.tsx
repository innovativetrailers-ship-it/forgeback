'use client'

import { useState, useCallback } from 'react'
import { Sparkles, Camera, Sun, Sliders } from 'lucide-react'
import { QUALITY_PILLS } from '@/components/simple/types'

interface Character { id: string; name: string; loraStatus?: string }
interface Location { id: string; name: string }

interface Props {
  projectId: string
  characters: Character[]
  locations: Location[]
  onJobCreated: (jobId: string, clipData: Record<string, unknown>) => void
  creditBalance: number
}

const MODELS = [
  { value: 'kling_standard', label: 'Kling Standard' },
  { value: 'kling_pro',      label: 'Kling Pro' },
  { value: 'veo3',           label: 'Veo 3' },
  { value: 'seedance',       label: 'Seedance' },
  { value: 'runway',         label: 'Runway Gen-4' },
  { value: 'luma',           label: 'Luma Dream Machine' },
  { value: 'pika',           label: 'Pika v2' },
  { value: 'minimax',        label: 'Minimax' },
  { value: 'hunyuan',        label: 'HunyuanVideo' },
]

const CAMERA_PRESETS = [
  { id: 'static',       label: 'Static',        prompt: 'static locked-off shot, no camera movement' },
  { id: 'dolly_in',     label: 'Dolly In',      prompt: 'slow dolly push in towards subject' },
  { id: 'dolly_out',    label: 'Dolly Out',      prompt: 'slow dolly pull back from subject' },
  { id: 'pan_left',     label: 'Pan Left',       prompt: 'smooth pan left' },
  { id: 'pan_right',    label: 'Pan Right',      prompt: 'smooth pan right' },
  { id: 'tilt_up',      label: 'Tilt Up',        prompt: 'camera tilts upward' },
  { id: 'tilt_down',    label: 'Tilt Down',      prompt: 'camera tilts downward' },
  { id: 'orbit',        label: 'Orbit',          prompt: '360 degree orbit around subject' },
  { id: 'handheld',     label: 'Handheld',       prompt: 'handheld documentary-style camera movement' },
  { id: 'dutch_angle',  label: 'Dutch Angle',    prompt: 'canted dutch angle, tilted frame' },
  { id: 'aerial',       label: 'Aerial',         prompt: 'aerial drone shot, bird\'s eye view' },
  { id: 'tracking',     label: 'Tracking',       prompt: 'tracking shot following subject movement' },
]

const FOCAL_LENGTHS = [
  { value: '16mm',  label: '16mm — Ultra Wide' },
  { value: '24mm',  label: '24mm — Wide' },
  { value: '35mm',  label: '35mm — Normal' },
  { value: '50mm',  label: '50mm — Standard' },
  { value: '85mm',  label: '85mm — Portrait' },
  { value: '135mm', label: '135mm — Telephoto' },
  { value: '200mm', label: '200mm — Super Tele' },
]

const LIGHTING_PRESETS = [
  { id: 'golden_hour',  label: 'Golden Hour',   prompt: 'warm golden hour lighting, soft directional sun' },
  { id: 'blue_hour',    label: 'Blue Hour',     prompt: 'blue hour twilight, cool atmospheric lighting' },
  { id: 'hard_noon',    label: 'Noon Sun',      prompt: 'harsh midday direct sunlight, strong shadows' },
  { id: 'overcast',     label: 'Overcast',      prompt: 'soft diffused overcast lighting, no harsh shadows' },
  { id: 'neon_night',   label: 'Neon Night',    prompt: 'nighttime neon city lighting, cyberpunk atmosphere' },
  { id: 'studio_3pt',   label: 'Studio 3-Pt',  prompt: 'professional three-point studio lighting' },
  { id: 'candle',       label: 'Candlelight',   prompt: 'warm flickering candlelight, intimate low light' },
]

const EFFECT_PARAMS = [
  { id: 'fog',        label: 'Fog',            prompt: 'volumetric fog, misty atmosphere' },
  { id: 'rain',       label: 'Rain',           prompt: 'heavy rain, wet surfaces' },
  { id: 'snow',       label: 'Snow',           prompt: 'falling snow, winter atmosphere' },
  { id: 'smoke',      label: 'Smoke',          prompt: 'drifting smoke, hazy air' },
  { id: 'dust',       label: 'Dust',           prompt: 'dust particles floating in air' },
  { id: 'bokeh',      label: 'Bokeh',          prompt: 'heavy bokeh, shallow depth of field' },
  { id: 'vignette',   label: 'Vignette',       prompt: 'strong vignette, dark edges' },
  { id: 'film_grain', label: 'Film Grain',     prompt: 'heavy film grain, analog texture' },
  { id: 'glitch',     label: 'Glitch',         prompt: 'digital glitch effect, RGB split' },
  { id: 'slowmo',     label: 'Slow Motion',    prompt: 'extreme slow motion, 120fps look' },
  { id: 'timelapse',  label: 'Time-lapse',     prompt: 'time-lapse speed ramp effect' },
  { id: 'double_exp', label: 'Double Exp.',    prompt: 'double exposure overlay effect' },
  { id: 'heat_haze',  label: 'Heat Haze',      prompt: 'shimmering heat haze distortion' },
  { id: 'anamorphic', label: 'Anamorphic',     prompt: 'anamorphic widescreen 2.39:1 with oval bokeh' },
]

type Tab = 'generate' | 'camera' | 'lighting' | 'effects'

export function GeneratePanel({ projectId, characters, locations, onJobCreated, creditBalance }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('generate')
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('kling_standard')
  const [quality, setQuality] = useState('standard')
  const [duration, setDuration] = useState(5)
  const [characterId, setCharacterId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Camera state
  const [cameraPreset, setCameraPreset] = useState('')
  const [focalLength, setFocalLength] = useState('35mm')

  // Lighting state
  const [lightingPreset, setLightingPreset] = useState('')

  // Effects state
  const [activeEffects, setActiveEffects] = useState<Set<string>>(new Set())

  const toggleEffect = useCallback((effectId: string) => {
    setActiveEffects((prev) => {
      const next = new Set(prev)
      if (next.has(effectId)) next.delete(effectId)
      else next.add(effectId)
      return next
    })
  }, [])

  const selectedPill = QUALITY_PILLS.find((p) => p.id === quality) ?? QUALITY_PILLS[1]

  const buildFullPrompt = useCallback(() => {
    const parts = [prompt.trim()]
    if (cameraPreset) {
      const cam = CAMERA_PRESETS.find((c) => c.id === cameraPreset)
      if (cam) parts.push(cam.prompt)
    }
    if (focalLength !== '35mm') parts.push(`shot on ${focalLength} lens`)
    if (lightingPreset) {
      const light = LIGHTING_PRESETS.find((l) => l.id === lightingPreset)
      if (light) parts.push(light.prompt)
    }
    activeEffects.forEach((eid) => {
      const eff = EFFECT_PARAMS.find((e) => e.id === eid)
      if (eff) parts.push(eff.prompt)
    })
    return parts.filter(Boolean).join(', ')
  }, [prompt, cameraPreset, focalLength, lightingPreset, activeEffects])

  const handleGenerate = useCallback(async () => {
    const fullPrompt = buildFullPrompt()
    if (!fullPrompt || isLoading) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/jobs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'GENERATE',
          projectId,
          payload: {
            prompt: fullPrompt,
            model,
            duration,
            characterId: characterId || undefined,
            locationId: locationId || undefined,
          },
        }),
      })
      const { jobId } = (await res.json()) as { jobId: string }
      onJobCreated(jobId, { prompt: fullPrompt, model, duration, characterId, locationId, quality })
      setPrompt('')
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [buildFullPrompt, isLoading, model, duration, characterId, locationId, quality, onJobCreated])

  const TABS: Array<{ id: Tab; icon: React.ReactNode; label: string }> = [
    { id: 'generate', icon: <Sparkles className="w-3 h-3" />, label: 'Generate' },
    { id: 'camera',   icon: <Camera className="w-3 h-3" />,   label: 'Camera' },
    { id: 'lighting', icon: <Sun className="w-3 h-3" />,      label: 'Lighting' },
    { id: 'effects',  icon: <Sliders className="w-3 h-3" />,  label: 'Effects' },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Tab strip */}
      <div className="flex border-b border-white/8">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-[9px] font-medium transition ${
              activeTab === t.id
                ? 'text-[#00e5c8] border-b-2 border-[#00e5c8]'
                : 'text-white/30 hover:text-white/60'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        {/* ── GENERATE TAB ── */}
        {activeTab === 'generate' && (
          <>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your shot…"
              className="w-full h-20 bg-[#12121a] border border-white/10 rounded-lg px-2.5 py-2
                text-white/80 placeholder:text-white/25 text-xs resize-none
                focus:outline-none focus:border-[#00e5c8]/40"
              onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) void handleGenerate() }}
            />

            <div>
              <p className="text-[10px] text-white/35 mb-1.5 uppercase tracking-wider">Model</p>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-[#12121a] border border-white/10 rounded-lg px-2.5 py-1.5
                  text-xs text-white/70 focus:outline-none focus:border-[#00e5c8]/40"
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-[10px] text-white/35 mb-1.5 uppercase tracking-wider">Quality</p>
              <div className="grid grid-cols-2 gap-1">
                {QUALITY_PILLS.map((pill) => (
                  <button
                    key={pill.id}
                    onClick={() => setQuality(pill.id)}
                    className={`py-1.5 px-2 rounded-lg border text-[10px] text-left transition-all ${
                      quality === pill.id
                        ? 'border-[#00e5c8] bg-[#00e5c8]/15 text-[#00e5c8]'
                        : 'border-white/8 bg-white/3 text-white/40 hover:border-white/20'
                    }`}
                  >
                    <div className="font-medium">{pill.label}</div>
                    <div className="text-[#00e5c8]/60">⬡ {pill.credits}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] text-white/35 uppercase tracking-wider">Duration</p>
                <span className="text-[10px] text-[#00e5c8]">{duration}s</span>
              </div>
              <input
                type="range" min={3} max={60} value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full accent-[#00e5c8]"
              />
            </div>

            {characters.length > 0 && (
              <div>
                <p className="text-[10px] text-white/35 mb-1.5 uppercase tracking-wider">Character</p>
                <select value={characterId} onChange={(e) => setCharacterId(e.target.value)}
                  className="w-full bg-[#12121a] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/70 focus:outline-none focus:border-[#00e5c8]/40">
                  <option value="">None</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.loraStatus === 'READY' ? ' ★' : ''}</option>
                  ))}
                </select>
              </div>
            )}

            {locations.length > 0 && (
              <div>
                <p className="text-[10px] text-white/35 mb-1.5 uppercase tracking-wider">Location</p>
                <select value={locationId} onChange={(e) => setLocationId(e.target.value)}
                  className="w-full bg-[#12121a] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/70 focus:outline-none focus:border-[#00e5c8]/40">
                  <option value="">None</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        {/* ── CAMERA TAB ── */}
        {activeTab === 'camera' && (
          <>
            <div>
              <p className="text-[10px] text-white/35 mb-2 uppercase tracking-wider">Camera Movement</p>
              <div className="grid grid-cols-3 gap-1">
                {CAMERA_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setCameraPreset(cameraPreset === preset.id ? '' : preset.id)}
                    className={`py-1.5 px-1 rounded-lg border text-[9px] text-center transition ${
                      cameraPreset === preset.id
                        ? 'border-[#00e5c8] bg-[#00e5c8]/15 text-[#00e5c8]'
                        : 'border-white/8 text-white/40 hover:border-white/20 hover:text-white/60'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] text-white/35 mb-1.5 uppercase tracking-wider">Focal Length</p>
              <div className="grid grid-cols-2 gap-1">
                {FOCAL_LENGTHS.map((fl) => (
                  <button
                    key={fl.value}
                    onClick={() => setFocalLength(fl.value)}
                    className={`py-1 px-2 rounded-lg border text-[9px] text-left transition ${
                      focalLength === fl.value
                        ? 'border-[#00e5c8] bg-[#00e5c8]/15 text-[#00e5c8]'
                        : 'border-white/8 text-white/40 hover:border-white/20'
                    }`}
                  >
                    {fl.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── LIGHTING TAB ── */}
        {activeTab === 'lighting' && (
          <div>
            <p className="text-[10px] text-white/35 mb-2 uppercase tracking-wider">Lighting Preset</p>
            <div className="space-y-1">
              {LIGHTING_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setLightingPreset(lightingPreset === preset.id ? '' : preset.id)}
                  className={`w-full py-2 px-3 rounded-lg border text-xs text-left transition ${
                    lightingPreset === preset.id
                      ? 'border-[#00e5c8] bg-[#00e5c8]/10 text-[#00e5c8]'
                      : 'border-white/8 text-white/50 hover:border-white/20 hover:text-white/70'
                  }`}
                >
                  <span className="font-medium">{preset.label}</span>
                  <span className="block text-[9px] mt-0.5 opacity-60">{preset.prompt}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── EFFECTS TAB ── */}
        {activeTab === 'effects' && (
          <div>
            <p className="text-[10px] text-white/35 mb-2 uppercase tracking-wider">Visual Effects</p>
            <div className="grid grid-cols-3 gap-1">
              {EFFECT_PARAMS.map((eff) => (
                <button
                  key={eff.id}
                  onClick={() => toggleEffect(eff.id)}
                  className={`py-1.5 px-1 rounded-lg border text-[9px] text-center transition ${
                    activeEffects.has(eff.id)
                      ? 'border-[#00e5c8] bg-[#00e5c8]/15 text-[#00e5c8]'
                      : 'border-white/8 text-white/40 hover:border-white/20 hover:text-white/60'
                  }`}
                >
                  {eff.label}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Generate button — always visible */}
      <div className="p-3 border-t border-white/6">
        {(cameraPreset || lightingPreset || activeEffects.size > 0) && (
          <p className="text-[8px] text-white/20 mb-2 truncate">
            + {[cameraPreset, lightingPreset, ...[...activeEffects]].filter(Boolean).length} modifiers active
          </p>
        )}
        <button
          onClick={() => void handleGenerate()}
          disabled={!prompt.trim() || isLoading || selectedPill.credits > creditBalance}
          className="w-full py-2.5 rounded-lg font-semibold text-xs bg-[#00e5c8] text-black
            hover:bg-[#00f0d5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors
            flex items-center justify-center gap-1.5"
        >
          {isLoading ? (
            <><div className="w-3 h-3 border border-black/40 border-t-black rounded-full animate-spin" />Queuing…</>
          ) : (
            <><Sparkles className="w-3.5 h-3.5" />Generate · ⬡ {selectedPill.credits}</>
          )}
        </button>
      </div>
    </div>
  )
}
