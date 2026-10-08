'use client'

import { useState } from 'react'
import { useStudioStore } from '@/store/editor'
import { usePlaybackStore } from '@/store/playbackStore'
import { cn } from '@/lib/utils'
import { FILM_EMULATION_LUTS } from '@/lib/studio/filmLuts'
import { patchTimelineClip } from '@/lib/timeline/syncToPlayback'
import type { ClipEffectType } from '@/lib/timeline/schema'
import { ParametricEQ } from '@/components/audio/ParametricEQ'
import { VoiceDialoguePanel } from '@/components/editor/VoiceDialoguePanel'

export type RightTab = 'properties' | 'lighting' | 'colour' | 'effects' | 'audio' | 'voice' | 'transform'

const TABS: Array<{ id: RightTab; label: string }> = [
  { id: 'properties', label: 'Props' },
  { id: 'lighting',   label: 'Light' },
  { id: 'colour',     label: 'Colour' },
  { id: 'effects',    label: 'FX' },
  { id: 'audio',      label: 'Audio' },
  { id: 'voice',      label: 'Voice' },
  { id: 'transform',  label: 'Xform' },
]

export function RightPanel({ initialTab, fill = false }: { initialTab?: RightTab; fill?: boolean }) {
  const [activeTab, setActiveTab] = useState<RightTab>(initialTab ?? 'properties')
  const { selectedClipId } = useStudioStore()

  return (
    <aside className={fill ? 'flex h-full min-h-0 w-full flex-col bg-[var(--bg-elevated)]' : 'w-[220px] shrink-0 flex flex-col bg-[var(--bg-elevated)] border-l border-[var(--border)]'}>
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
            {activeTab === 'voice'      && <VoiceTab />}
            {activeTab === 'transform'  && <TransformTab />}
          </>
        )}
      </div>
    </aside>
  )
}

// ── Properties tab ──────────────────────────────────────────────────
function PropertiesTab() {
  const selectedClipId = useStudioStore((s) => s.selectedClipId)
  const recipe = usePlaybackStore((s) => s.recipe)
  const clip = recipe?.tracks.flatMap((track) => track.clips).find((row) => row.id === selectedClipId)
  const duration = clip ? Math.max(0, clip.endTime - clip.startTime) : 0
  return (
    <div className="space-y-0 divide-y divide-[var(--border)]">
      <Section label="Clip Info">
        <Row label="ID" value={selectedClipId?.slice(0, 8) ?? '—'} />
        <Row label="Duration" value={`${duration.toFixed(1)} s`} />
        <Row label="Look" value={clip?.colourGrade?.filmEmulation?.replaceAll('_', ' ') ?? 'none'} />
      </Section>
      <Section label="Prompt">
        <p className="text-[10px] leading-relaxed text-[var(--text-secondary)]">
          {clip?.prompt || 'No prompt on this clip.'}
        </p>
      </Section>
    </div>
  )
}

// ── Lighting tab ──────────────────────────────────────────────────
function LightingTab() {
  const selectedClipId = useStudioStore((s) => s.selectedClipId)
  const recipe = usePlaybackStore((s) => s.recipe)
  const clip = recipe?.tracks.flatMap((track) => track.clips).find((row) => row.id === selectedClipId)

  function write(patch: { shadows?: number; highlights?: number; temperature?: number; tint?: number }) {
    if (!selectedClipId) return
    patchTimelineClip(selectedClipId, {
      colourGrade: {
        ...clip?.colourGrade,
        ...patch,
        asc_cdl: clip?.colourGrade?.asc_cdl ?? { lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], saturation: 1 },
      },
    })
  }

  return (
    <div className="divide-y divide-[var(--border)]">
      <Section label="Tone">
        <GradeSlider label="Shadows" value={clip?.colourGrade?.shadows ?? 0} min={-100} max={100} onChange={(shadows) => write({ shadows })} />
        <GradeSlider label="Highlights" value={clip?.colourGrade?.highlights ?? 0} min={-100} max={100} onChange={(highlights) => write({ highlights })} />
      </Section>
      <Section label="Colour Temp">
        <GradeSlider label="Temperature" value={clip?.colourGrade?.temperature ?? 6500} min={2000} max={10000} onChange={(temperature) => write({ temperature })} />
        <GradeSlider label="Tint" value={clip?.colourGrade?.tint ?? 0} min={-50} max={50} onChange={(tint) => write({ tint })} />
      </Section>
    </div>
  )
}

// ── Colour tab ──────────────────────────────────────────────────
function ColourTab() {
  const selectedClipId = useStudioStore((s) => s.selectedClipId)
  return (
    <div className="divide-y divide-[var(--border)]">
      <Section label="Film LUT">
        <div className="grid grid-cols-2 gap-1.5">
          {Object.keys(FILM_EMULATION_LUTS).map((lut) => (
            <button
              key={lut}
              type="button"
              className="pill text-[9px]"
              onClick={() => {
                if (!selectedClipId) return
                patchTimelineClip(selectedClipId, {
                  colourGrade: {
                    filmEmulation: lut as 'kodak_5219',
                    lutUrl: FILM_EMULATION_LUTS[lut],
                    lutIntensity: 1,
                    asc_cdl: { lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], saturation: lut === 'bw_contrast' ? 0 : 1.1 },
                  },
                })
              }}
            >
              {lut.replaceAll('_', ' ')}
            </button>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ── Effects tab ──────────────────────────────────────────────────
interface EffectParam { name: string; min: number; max: number }

const EFFECT_PARAMS: Record<string, EffectParam[]> = {
  film_grain:           [{ name: 'Intensity', min: 0, max: 1 }],
  vignette:             [{ name: 'Intensity', min: 0, max: 1 }],
  chromatic_aberration: [{ name: 'Intensity', min: 0, max: 1 }],
  bloom:                [{ name: 'Intensity', min: 0, max: 1 }],
  motion_blur:          [{ name: 'Intensity', min: 0, max: 1 }],
  halation:             [{ name: 'Intensity', min: 0, max: 1 }],
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
    patchTimelineClip(selectedClipId, {
      effects: [{ type: effectKey as ClipEffectType, intensity: nextValues[0] ?? 0.5 }],
    })
    void paramObj
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

function VoiceTab() {
  const selectedClipId = useStudioStore((s) => s.selectedClipId)
  const clip = usePlaybackStore((s) => {
    const tracks = s.recipe?.tracks ?? []
    for (const track of tracks) {
      const found = track.clips.find((row) => row.id === selectedClipId)
      if (found) return found
    }
    return null
  })
  return <VoiceDialoguePanel clip={clip} />
}

// ── Audio tab ──────────────────────────────────────────────────
function AudioTab() {
  const selectedClipId = useStudioStore((s) => s.selectedClipId)
  return (
    <div className="divide-y divide-[var(--border)]">
      <Section label="Volume">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          defaultValue={1}
          onChange={(event) => {
            if (!selectedClipId) return
            patchTimelineClip(selectedClipId, {
              audioSettings: { volume: Number(event.target.value), pan: 0 },
            })
          }}
        />
      </Section>
      <Section label="EQ">
        <ParametricEQ
          trackId={selectedClipId ?? 'none'}
          onFilterChange={(bands) => {
            if (!selectedClipId) return
            const low = bands.find((band) => band.type === 'lowshelf')?.gain ?? 0
            const high = bands.find((band) => band.type === 'highshelf')?.gain ?? 0
            const mid = bands.find((band) => band.type === 'peak')?.gain ?? 0
            patchTimelineClip(selectedClipId, {
              audioSettings: { volume: 1, pan: 0, eq: { low, mid, high } },
            })
          }}
        />
      </Section>
    </div>
  )
}

// ── Transform tab ──────────────────────────────────────────────────
function TransformTab() {
  const selectedClipId = useStudioStore((s) => s.selectedClipId)
  const recipe = usePlaybackStore((s) => s.recipe)
  const clip = recipe?.tracks.flatMap((track) => track.clips).find((row) => row.id === selectedClipId)
  const current = clip?.transform ?? { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }
  function write(patch: Partial<typeof current>) {
    if (!selectedClipId) return
    patchTimelineClip(selectedClipId, { transform: { ...current, ...patch } })
  }
  return (
    <div className="divide-y divide-[var(--border)]">
      <Section label="Position & Scale">
        <GradeSlider label="X" value={current.x} min={-200} max={200} onChange={(x) => write({ x })} />
        <GradeSlider label="Y" value={current.y} min={-200} max={200} onChange={(y) => write({ y })} />
        <GradeSlider label="Scale" value={current.scale} min={0.5} max={2} onChange={(scale) => write({ scale })} />
        <GradeSlider label="Rotate" value={current.rotation} min={-180} max={180} onChange={(rotation) => write({ rotation })} />
      </Section>
    </div>
  )
}

function GradeSlider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[10px] text-[var(--text-tertiary)]">{label}</span>
      <input type="range" min={min} max={max} step={max > 20 ? 1 : 0.01} value={value} onChange={(event) => onChange(Number(event.target.value))} className="cinema-slider flex-1" />
      <span className="w-10 text-right text-[9px] tabular-nums text-[var(--text-tertiary)]">{Math.round(value * 100) / 100}</span>
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
