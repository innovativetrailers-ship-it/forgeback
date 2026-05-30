'use client'

import { useState } from 'react'
import { useStudioStore } from '@/store/editor'
import { cn } from '@/lib/utils'

type RightTab = 'properties' | 'lighting' | 'colour' | 'effects' | 'audio' | 'transform'

const TABS: Array<{ id: RightTab; label: string }> = [
  { id: 'properties', label: 'Props' },
  { id: 'lighting',   label: 'Light' },
  { id: 'colour',     label: 'Colour' },
  { id: 'effects',    label: 'FX' },
  { id: 'audio',      label: 'Audio' },
  { id: 'transform',  label: 'Xform' },
]

export function RightPanel() {
  const [activeTab, setActiveTab] = useState<RightTab>('properties')
  const { selectedClipId } = useStudioStore()

  return (
    <aside className="w-[220px] shrink-0 flex flex-col bg-[var(--bg-elevated)] border-l border-[var(--border)]">
      {/* Tab bar */}
      <div className="flex border-b border-[var(--border)] shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'flex-1 py-1.5 text-[9px] font-semibold uppercase tracking-wide transition-all',
              activeTab === t.id
                ? 'text-[var(--teal-bright)] border-b-2 border-[var(--teal-bright)] bg-[var(--teal-glow)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!selectedClipId ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <p className="text-[11px] text-[var(--text-tertiary)]">Select a clip to edit its properties</p>
          </div>
        ) : (
          <>
            {activeTab === 'properties' && <PropertiesTab />}
            {activeTab === 'lighting'   && <LightingTab />}
            {activeTab === 'colour'     && <ColourTab />}
            {activeTab === 'effects'    && <EffectsTab />}
            {activeTab === 'audio'      && <AudioTab />}
            {activeTab === 'transform'  && <TransformTab />}
          </>
        )}
      </div>
    </aside>
  )
}

// ── Properties tab ──────────────────────────────────────────────────
function PropertiesTab() {
  const { selectedClipId } = useStudioStore()
  return (
    <div className="space-y-0 divide-y divide-[var(--border)]">
      <Section label="Clip Info">
        <Row label="ID" value={selectedClipId?.slice(0, 8) ?? '—'} />
        <Row label="Duration" value="4.0 s" />
        <Row label="FPS" value="24" />
        <Row label="Resolution" value="1920 × 1080" />
      </Section>
      <Section label="Generation">
        <Row label="Model" value="Seedance 2.0" />
        <Row label="Tier" value="Studio" />
        <Row label="Seed" value="483920" />
        <Row label="Steps" value="40" />
      </Section>
      <Section label="Prompt">
        <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
          Medium shot, detective walks through rain-soaked alley, noir lighting, cinematic grain
        </p>
      </Section>
    </div>
  )
}

// ── Lighting tab ──────────────────────────────────────────────────
interface ICLightConfig {
  temperature: number
  intensity:   number
  direction?:  string
  fill:        number
  colorCast?:  string
  flicker?:    boolean
  wrap?:       number
  scatter?:    number
}

const LIGHTING_PRESETS: Record<string, ICLightConfig> = {
  'Natural day':  { temperature: 5600, intensity: 100, direction: 'top-front', fill: 0.6 },
  'Golden hour':  { temperature: 3200, intensity: 120, direction: 'side',      fill: 0.3 },
  'Night / neon': { temperature: 4000, intensity: 80,  colorCast: '#00e5ff',   fill: 0.1 },
  'Overcast':     { temperature: 6500, intensity: 60,  wrap: 0.9,              fill: 0.8 },
  'Studio':       { temperature: 5400, intensity: 100, direction: 'front',     fill: 0.7 },
  'Candlelight':  { temperature: 1900, intensity: 70,  flicker: true,          fill: 0.05 },
  'Underwater':   { temperature: 6000, intensity: 70, colorCast: '#0040ff', scatter: 0.8, fill: 0.5 },
}

function LightingTab() {
  const { selectedClipId } = useStudioStore()
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)

  const applyPreset = async (name: string) => {
    if (!selectedClipId) return
    setActivePreset(name)
    setApplying(true)
    await fetch('/api/vfx/relight', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ clipId: selectedClipId, config: LIGHTING_PRESETS[name] }),
    }).finally(() => setApplying(false))
  }

  return (
    <div className="divide-y divide-[var(--border)]">
      <Section label="Presets">
        <div className="grid grid-cols-2 gap-1.5">
          {Object.keys(LIGHTING_PRESETS).map(name => (
            <button
              key={name}
              onClick={() => void applyPreset(name)}
              disabled={applying}
              className={cn(
                'pill text-[9px] truncate transition',
                activePreset === name ? 'bg-[var(--teal-bright)] text-black' : ''
              )}
            >
              {name}
            </button>
          ))}
        </div>
      </Section>
      <Section label="IC-Light">
        <SliderRow label="Intensity" default={65} />
        <SliderRow label="Angle" default={45} max={360} />
        <SliderRow label="Spread" default={80} />
      </Section>
      <Section label="Tone">
        <SliderRow label="Exposure" default={50} />
        <SliderRow label="Contrast" default={50} />
        <SliderRow label="Shadows" default={50} />
        <SliderRow label="Highlights" default={50} />
      </Section>
      <Section label="Colour Temp">
        <SliderRow label="Temperature" default={50} />
        <SliderRow label="Tint" default={50} />
      </Section>
    </div>
  )
}

// ── Colour tab ──────────────────────────────────────────────────
function ColourTab() {
  return (
    <div className="divide-y divide-[var(--border)]">
      <Section label="Grading">
        <SliderRow label="Saturation" default={50} />
        <SliderRow label="Vibrance" default={50} />
        <SliderRow label="Hue Shift" default={50} max={360} />
      </Section>
      <Section label="Film Look">
        <div className="grid grid-cols-2 gap-1.5">
          {['Bleach Bypass', 'Cross-Process', 'Kodak 5219', 'Fuji Eterna', 'Teal & Orange', 'Vintage 70s'].map((lut) => (
            <button key={lut} className="pill text-[9px]">{lut}</button>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ── Effects tab ──────────────────────────────────────────────────
interface EffectParam { name: string; min: number; max: number }

const EFFECT_PARAMS: Record<string, EffectParam[]> = {
  rain:                 [{ name: 'Intensity', min: 0, max: 1 }, { name: 'Angle', min: -30, max: 30 }],
  snow:                 [{ name: 'Intensity', min: 0, max: 1 }, { name: 'Size', min: 0, max: 1 }],
  fog:                  [{ name: 'Intensity', min: 0, max: 1 }, { name: 'Height', min: 0, max: 1 }],
  film_grain:           [{ name: 'Intensity', min: 0, max: 1 }, { name: 'Size', min: 0, max: 1 }],
  halation:             [{ name: 'Intensity', min: 0, max: 1 }, { name: 'Radius', min: 10, max: 100 }],
  vignette:             [{ name: 'Intensity', min: 0, max: 1 }, { name: 'Feather', min: 0, max: 1 }],
  lens_flare:           [{ name: 'Intensity', min: 0, max: 1 }, { name: 'Pos X', min: 0, max: 1 }, { name: 'Pos Y', min: 0, max: 1 }],
  bloom:                [{ name: 'Intensity', min: 0, max: 1 }, { name: 'Radius', min: 1, max: 50 }],
  chromatic_aberration: [{ name: 'Intensity', min: 0, max: 1 }],
  motion_blur:          [{ name: 'Intensity', min: 0, max: 1 }, { name: 'Angle', min: 0, max: 360 }],
  glow:                 [{ name: 'Intensity', min: 0, max: 1 }, { name: 'Threshold', min: 0, max: 1 }],
  dust_particles:       [{ name: 'Intensity', min: 0, max: 1 }, { name: 'Size', min: 0, max: 1 }],
  lightning:            [{ name: 'Intensity', min: 0, max: 1 }, { name: 'Branches', min: 1, max: 5 }],
  fire:                 [{ name: 'Intensity', min: 0, max: 1 }, { name: 'Height', min: 0, max: 1 }],
  smoke:                [{ name: 'Intensity', min: 0, max: 1 }, { name: 'Density', min: 0, max: 1 }],
}

function EffectRow({ effectKey, params }: { effectKey: string; params: EffectParam[] }) {
  const { selectedClipId } = useStudioStore()
  const [enabled, setEnabled] = useState(false)
  const [values,  setValues]  = useState<number[]>(params.map(() => 0.5))
  const [open,    setOpen]    = useState(false)

  const applyEffect = async (nextValues: number[]) => {
    if (!selectedClipId) return
    const paramObj: Record<string, number> = {}
    params.forEach((p, i) => { paramObj[p.name.toLowerCase().replace(/\s+/g, '_')] = nextValues[i] })
    await fetch('/api/vfx/effect', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ clipId: selectedClipId, effect: effectKey, params: paramObj }),
    })
  }

  const label = effectKey.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')

  return (
    <div className="border-b border-[var(--border)] last:border-0">
      <div className="flex items-center gap-2 py-1">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex-1 text-left text-[10px] text-[var(--text-secondary)] truncate"
        >
          {label}
        </button>
        <button
          onClick={() => { const next = !enabled; setEnabled(next); if (next) void applyEffect(values) }}
          className={cn('w-7 h-3.5 rounded-full transition-colors relative shrink-0',
            enabled ? 'bg-[var(--teal-bright)]' : 'bg-[var(--bg-active)]')}
        >
          <span className={cn('absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all',
            enabled ? 'left-[14px]' : 'left-0.5')} />
        </button>
      </div>
      {open && enabled && (
        <div className="pb-2 space-y-1">
          {params.map((p, i) => (
            <div key={p.name} className="flex items-center gap-2">
              <span className="text-[9px] text-[var(--text-tertiary)] w-14 shrink-0">{p.name}</span>
              <input
                type="range" min={p.min} max={p.max} step={(p.max - p.min) / 100} value={values[i]}
                onChange={e => {
                  const next = values.map((v, j) => j === i ? Number(e.target.value) : v)
                  setValues(next)
                  void applyEffect(next)
                }}
                className="flex-1 accent-[#00e5c8] h-1"
              />
              <span className="text-[9px] text-[var(--text-tertiary)] w-6 text-right">{values[i].toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EffectsTab() {
  return (
    <div className="px-3 py-2">
      <p className="panel-section-label mb-2">Effects</p>
      {Object.entries(EFFECT_PARAMS).map(([key, params]) => (
        <EffectRow key={key} effectKey={key} params={params} />
      ))}
    </div>
  )
}

// ── Audio tab ──────────────────────────────────────────────────
function AudioTab() {
  return (
    <div className="divide-y divide-[var(--border)]">
      <Section label="Volume">
        <SliderRow label="Volume" default={80} />
        <SliderRow label="Pan" default={50} />
        <Toggle label="Mute" />
      </Section>
      <Section label="EQ">
        <SliderRow label="Bass" default={50} />
        <SliderRow label="Mid" default={50} />
        <SliderRow label="Treble" default={50} />
      </Section>
    </div>
  )
}

// ── Transform tab ──────────────────────────────────────────────────
function TransformTab() {
  return (
    <div className="divide-y divide-[var(--border)]">
      <Section label="Position & Scale">
        <SliderRow label="X Position" default={50} />
        <SliderRow label="Y Position" default={50} />
        <SliderRow label="Scale" default={100} max={200} />
        <SliderRow label="Rotation" default={0} max={360} />
      </Section>
      <Section label="Crop">
        <SliderRow label="Top" default={0} />
        <SliderRow label="Bottom" default={0} />
        <SliderRow label="Left" default={0} />
        <SliderRow label="Right" default={0} />
      </Section>
    </div>
  )
}

// ── Shared sub-components ──────────────────────────────────────────
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2">
      <p className="panel-section-label">{label}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-[10px] text-[var(--text-tertiary)]">{label}</span>
      <span className="text-[10px] text-[var(--text-secondary)] tabular-nums">{value}</span>
    </div>
  )
}

function SliderRow({ label, default: def = 50, max = 100 }: { label: string; default?: number; max?: number }) {
  const [v, setV] = useState(def)
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[var(--text-tertiary)] w-20 shrink-0">{label}</span>
      <input type="range" min={0} max={max} value={v}
        onChange={(e) => setV(Number(e.target.value))}
        className="cinema-slider flex-1"
      />
      <span className="text-[9px] text-[var(--text-tertiary)] w-6 text-right tabular-nums">{v}</span>
    </div>
  )
}

function Toggle({ label }: { label: string }) {
  const [on, setOn] = useState(false)
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-[10px] text-[var(--text-secondary)]">{label}</span>
      <button
        onClick={() => setOn(!on)}
        className={cn(
          'w-7 h-3.5 rounded-full transition-colors relative',
          on ? 'bg-[var(--teal-bright)]' : 'bg-[var(--bg-active)]'
        )}
      >
        <span className={cn(
          'absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all',
          on ? 'left-[14px]' : 'left-0.5'
        )} />
      </button>
    </div>
  )
}
