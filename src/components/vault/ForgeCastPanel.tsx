'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  APPEARANCE_SLIDERS,
  WARDROBE_REGIONS,
  type CharacterAppearance,
  type FCCCharacterView,
  type WardrobeRegion,
} from '@/lib/character/fccSchema'
import {
  ANIME_STYLES,
  MOCAP_DRAW_MODES,
  MOCAP_RESOLUTIONS,
  type AnimeStyle,
  type ChoreographyPlan,
  type FccRotoMode,
  type MocapDrawMode,
  type MocapResolution,
} from '@/lib/character/characterMotion'
import { toast } from '@/lib/toast'
import { Loader2, X } from 'lucide-react'

type Tab = 'dna' | 'appearance' | 'wardrobe' | 'persona' | 'motion'

export const ForgeCastPanel = ({
  characterId,
  onClose,
}: {
  characterId: string
  onClose: () => void
}) => {
  const [character, setCharacter] = useState<FCCCharacterView | null>(null)
  const [tab, setTab] = useState<Tab>('dna')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [behavioral, setBehavioral] = useState('')
  const [wardrobeRegion, setWardrobeRegion] = useState<WardrobeRegion>('torso')
  const [wardrobePrompt, setWardrobePrompt] = useState('')
  const [actionPrompt, setActionPrompt] = useState('Walk forward confidently, then turn to camera')
  const [duration, setDuration] = useState(6)
  const [plan, setPlan] = useState<ChoreographyPlan | null>(null)
  const [motionVideoUrl, setMotionVideoUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [drawMode, setDrawMode] = useState<MocapDrawMode>('body-pose')
  const [resolution, setResolution] = useState<MocapResolution>('720p')
  const [animeStyle, setAnimeStyle] = useState<AnimeStyle>('shonen')
  const [rotoMode, setRotoMode] = useState<FccRotoMode>('character')
  const [outputUrl, setOutputUrl] = useState<string | null>(null)
  const [ingestVideoUrl, setIngestVideoUrl] = useState('')
  const [sketchDataUrl, setSketchDataUrl] = useState('')
  const [sketchPrompts, setSketchPrompts] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/vault/character/${characterId}`)
      if (!res.ok) throw new Error('Failed to load character')
      const data = (await res.json()) as FCCCharacterView
      setCharacter(data)
      setBehavioral(data.behavioralPrompt ?? '')
    } catch (err) {
      console.warn("[caught] src/components/vault/ForgeCastPanel.tsx:62", err instanceof Error ? { name: err.name, message: err.message } : err)

      toast.error('Could not load character DNA')
    } finally {
      setLoading(false)
    }
  }, [characterId])

  useEffect(() => {
    void load()
  }, [load])

  const patchAppearance = async (patch: Partial<CharacterAppearance>) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/vault/character/${characterId}/appearance`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = (await res.json()) as FCCCharacterView & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Update failed')
      setCharacter(data)
    } catch (e) {
      console.warn("[caught] src/components/vault/ForgeCastPanel.tsx:84", e instanceof Error ? { name: e.name, message: e.message } : e)

      toast.error(e instanceof Error ? e.message : 'Appearance update failed')
    } finally {
      setBusy(false)
    }
  }

  const runIngest = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/vault/character/${characterId}/ingest`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Ingest failed')
      setCharacter((await res.json()) as FCCCharacterView)
      toast.success('Character DNA ingested')
    } catch (e) {
      console.warn("[caught] src/components/vault/ForgeCastPanel.tsx:98", e instanceof Error ? { name: e.name, message: e.message } : e)

      toast.error(e instanceof Error ? e.message : 'Ingest failed')
    } finally {
      setBusy(false)
    }
  }

  const runBake = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/vault/character/${characterId}/bake`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Bake failed')
      setCharacter((await res.json()) as FCCCharacterView)
      toast.success('Appearance baked to reference')
    } catch (e) {
      console.warn("[caught] src/components/vault/ForgeCastPanel.tsx:112", e instanceof Error ? { name: e.name, message: e.message } : e)

      toast.error(e instanceof Error ? e.message : 'Bake failed')
    } finally {
      setBusy(false)
    }
  }

  const savePersona = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/vault/character/${characterId}/behavioral`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: behavioral }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Save failed')
      setCharacter((await res.json()) as FCCCharacterView)
      toast.success('Persona saved')
    } catch (e) {
      console.warn("[caught] src/components/vault/ForgeCastPanel.tsx:130", e instanceof Error ? { name: e.name, message: e.message } : e)

      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const planChoreography = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/vault/character/${characterId}/choreography`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actionPrompt, durationSec: duration }),
      })
      const data = (await res.json()) as ChoreographyPlan & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Plan failed')
      setPlan(data)
    } catch (e) {
      console.warn("[caught] src/components/vault/ForgeCastPanel.tsx:148", e instanceof Error ? { name: e.name, message: e.message } : e)

      toast.error(e instanceof Error ? e.message : 'Choreography failed')
    } finally {
      setBusy(false)
    }
  }

  const runMocap = async () => {
    if (!motionVideoUrl.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`/api/vault/character/${characterId}/mocap`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ motionVideoUrl, drawMode, resolution, prompt: actionPrompt }),
      })
      const data = (await res.json()) as { videoUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Mocap failed')
      setOutputUrl(data.videoUrl ?? null)
      toast.success('Mocap complete')
    } catch (e) {
      console.warn("[caught] src/components/vault/ForgeCastPanel.tsx:168", e instanceof Error ? { name: e.name, message: e.message } : e)

      toast.error(e instanceof Error ? e.message : 'Mocap failed')
    } finally {
      setBusy(false)
    }
  }

  const runAnime = async () => {
    if (!videoUrl.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`/api/vault/character/${characterId}/anime`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ videoUrl, style: animeStyle }),
      })
      const data = (await res.json()) as { videoUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Anime failed')
      setOutputUrl(data.videoUrl ?? null)
      toast.success('Anime transform complete')
    } catch (e) {
      console.warn("[caught] src/components/vault/ForgeCastPanel.tsx:188", e instanceof Error ? { name: e.name, message: e.message } : e)

      toast.error(e instanceof Error ? e.message : 'Anime failed')
    } finally {
      setBusy(false)
    }
  }

  const runRoto = async () => {
    if (!videoUrl.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`/api/vault/character/${characterId}/roto`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ videoUrl, mode: rotoMode }),
      })
      const data = (await res.json()) as { videoUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Roto failed')
      setOutputUrl(data.videoUrl ?? null)
      toast.success('Roto composite complete')
    } catch (e) {
      console.warn("[caught] src/components/vault/ForgeCastPanel.tsx:208", e instanceof Error ? { name: e.name, message: e.message } : e)

      toast.error(e instanceof Error ? e.message : 'Roto failed')
    } finally {
      setBusy(false)
    }
  }

  const applyWardrobe = async () => {
    if (!wardrobePrompt.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`/api/vault/character/${characterId}/wardrobe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ region: wardrobeRegion, prompt: wardrobePrompt }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Wardrobe failed')
      setCharacter((await res.json()) as FCCCharacterView)
      setWardrobePrompt('')
      toast.success('Wardrobe applied')
    } catch (e) {
      console.warn("[caught] src/components/vault/ForgeCastPanel.tsx:228", e instanceof Error ? { name: e.name, message: e.message } : e)

      toast.error(e instanceof Error ? e.message : 'Wardrobe failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">ForgeCast</p>
          <p className="text-sm font-medium text-[var(--text-primary)]">{character?.name ?? '…'}</p>
        </div>
        <button onClick={onClose} className="rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
          <X size={16} />
        </button>
      </div>

      <div className="flex border-b border-[var(--border-subtle)]">
        {(['dna', 'appearance', 'wardrobe', 'persona', 'motion'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-[10px] capitalize ${
              tab === t ? 'text-[var(--teal-bright)] border-b-2 border-[var(--teal-bright)]' : 'text-[var(--text-tertiary)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-[var(--text-tertiary)]" size={20} />
          </div>
        )}

        {!loading && character && (
          <>
            {character.refFrontUrl && (
              <img
                src={character.refFrontUrl}
                alt={character.name}
                className="mb-4 aspect-[3/4] w-full rounded-lg object-cover"
              />
            )}

            {tab === 'dna' && (
              <div className="space-y-3">
                <p className="text-[11px] text-[var(--text-secondary)]">
                  {character.hasFcc
                    ? 'DNA locked — face embedding + appearance sliders active.'
                    : 'Run ingest to extract face embedding and appearance from references.'}
                </p>
                <button
                  onClick={() => void runIngest()}
                  disabled={busy}
                  className="w-full rounded-lg bg-[var(--teal-glow)] py-2 text-[11px] text-[var(--teal-bright)] disabled:opacity-40"
                >
                  {busy ? 'Working…' : 'Ingest references → DNA'}
                </button>
                <input
                  value={ingestVideoUrl}
                  onChange={(e) => setIngestVideoUrl(e.target.value)}
                  placeholder="Video URL for profile ingest…"
                  className="w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1.5 text-[11px]"
                />
                <button
                  disabled={busy || !ingestVideoUrl.trim()}
                  onClick={() => {
                    setBusy(true)
                    void fetch(`/api/vault/character/${characterId}/ingest-video`, {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ videoUrl: ingestVideoUrl }),
                    })
                      .then(async (res) => {
                        const data = (await res.json()) as FCCCharacterView & { error?: string }
                        if (!res.ok) throw new Error(data.error ?? 'Video ingest failed')
                        setCharacter(data)
                        toast.success('Video ingested')
                      })
                      .catch((e) => {
                        console.warn("[caught] src/components/vault/ForgeCastPanel.tsx:333", e instanceof Error ? { name: e.name, message: e.message } : e)
                        return (toast.error(e instanceof Error ? e.message : 'Video ingest failed'))
                      })
                      .finally(() => setBusy(false))
                  }}
                  className="w-full rounded border border-[var(--border-subtle)] py-1.5 text-[11px] disabled:opacity-40"
                >
                  Ingest from video
                </button>
                <textarea
                  value={sketchDataUrl}
                  onChange={(e) => setSketchDataUrl(e.target.value)}
                  placeholder="Sketch data URL"
                  rows={2}
                  className="w-full resize-none rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2 text-[11px]"
                />
                <input
                  value={sketchPrompts}
                  onChange={(e) => setSketchPrompts(e.target.value)}
                  placeholder="Sketch prompts (comma-separated)"
                  className="w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1.5 text-[11px]"
                />
                <button
                  disabled={busy || !sketchDataUrl.trim()}
                  onClick={() => {
                    setBusy(true)
                    const prompts = sketchPrompts.split(',').map((p) => p.trim()).filter(Boolean)
                    void fetch(`/api/vault/character/${characterId}/ingest-sketch`, {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ sketchDataUrl, prompts }),
                    })
                      .then(async (res) => {
                        const data = (await res.json()) as FCCCharacterView & { error?: string }
                        if (!res.ok) throw new Error(data.error ?? 'Sketch ingest failed')
                        setCharacter(data)
                        toast.success('Sketch ingested')
                      })
                      .catch((e) => {
                        console.warn("[caught] src/components/vault/ForgeCastPanel.tsx:369", e instanceof Error ? { name: e.name, message: e.message } : e)
                        return (toast.error(e instanceof Error ? e.message : 'Sketch ingest failed'))
                      })
                      .finally(() => setBusy(false))
                  }}
                  className="w-full rounded border border-[var(--border-subtle)] py-1.5 text-[11px] disabled:opacity-40"
                >
                  Ingest from sketch
                </button>
                <div className="flex gap-2">
                  <a
                    href={`/api/vault/character/${characterId}/export`}
                    className="flex-1 rounded border border-[var(--border-subtle)] py-1.5 text-center text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    Export .fcc
                  </a>
                  <button
                    onClick={() => {
                      const input = document.createElement('input')
                      input.type = 'file'
                      input.accept = '.fcc,.json'
                      input.onchange = () => {
                        const file = input.files?.[0]
                        if (!file) return
                        void file.text().then(async (json) => {
                          const res = await fetch('/api/vault/character/import', {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ json, projectId: character.projectId }),
                          })
                          if (!res.ok) {
                            toast.error('Import failed')
                            return
                          }
                          toast.success('Character imported')
                          void load()
                        })
                      }
                      input.click()
                    }}
                    className="flex-1 rounded border border-[var(--border-subtle)] py-1.5 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    Import .fcc
                  </button>
                </div>
              </div>
            )}

            {tab === 'appearance' && (
              <div className="space-y-3">
                {APPEARANCE_SLIDERS.map(({ key, label, min, max }) => (
                  <label key={key} className="block text-[10px] text-[var(--text-tertiary)]">
                    {label}: {Math.round(character.appearance[key] as number)}
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={key === 'melanin' || key === 'scarDepth' || key === 'wrinkleFreq' ? 0.05 : 1}
                      value={character.appearance[key] as number}
                      disabled={busy}
                      onChange={(e) => {
                        const value = Number(e.target.value)
                        setCharacter((c) =>
                          c ? { ...c, appearance: { ...c.appearance, [key]: value } } : c,
                        )
                      }}
                      onMouseUp={(e) => {
                        void patchAppearance({ [key]: Number((e.target as HTMLInputElement).value) })
                      }}
                      onTouchEnd={(e) => {
                        void patchAppearance({ [key]: Number((e.target as HTMLInputElement).value) })
                      }}
                      className="mt-1 w-full"
                    />
                  </label>
                ))}
                <button
                  onClick={() => void runBake()}
                  disabled={busy || !character.refFront}
                  className="w-full rounded-lg border border-[var(--teal-bright)]/40 py-2 text-[11px] text-[var(--teal-bright)] disabled:opacity-40"
                >
                  Bake preview (~8 credits)
                </button>
              </div>
            )}

            {tab === 'wardrobe' && (
              <div className="space-y-3">
                <select
                  value={wardrobeRegion}
                  onChange={(e) => setWardrobeRegion(e.target.value as WardrobeRegion)}
                  className="w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1.5 text-[11px]"
                >
                  {WARDROBE_REGIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <input
                  value={wardrobePrompt}
                  onChange={(e) => setWardrobePrompt(e.target.value)}
                  placeholder="Garment description…"
                  className="w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1.5 text-[11px]"
                />
                <button
                  onClick={() => void applyWardrobe()}
                  disabled={busy || !wardrobePrompt.trim()}
                  className="w-full rounded-lg bg-[var(--teal-glow)] py-2 text-[11px] text-[var(--teal-bright)] disabled:opacity-40"
                >
                  Apply wardrobe (~12 credits)
                </button>
                {character.wardrobe.length > 0 && (
                  <ul className="space-y-1 text-[10px] text-[var(--text-secondary)]">
                    {character.wardrobe.map((w) => (
                      <li key={w.id}>
                        {w.region}: {w.prompt}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === 'persona' && (
              <div className="space-y-3">
                <textarea
                  value={behavioral}
                  onChange={(e) => setBehavioral(e.target.value)}
                  rows={6}
                  placeholder="Personality, speech patterns, mannerisms…"
                  className="w-full resize-none rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2 text-[11px]"
                />
                <button
                  onClick={() => void savePersona()}
                  disabled={busy}
                  className="w-full rounded-lg bg-[var(--teal-glow)] py-2 text-[11px] text-[var(--teal-bright)] disabled:opacity-40"
                >
                  Save persona
                </button>
              </div>
            )}

            {tab === 'motion' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-[10px] text-[var(--text-tertiary)]">Choreography</p>
                  <textarea
                    value={actionPrompt}
                    onChange={(e) => setActionPrompt(e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2 text-[11px]"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={2}
                      max={30}
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      className="w-16 rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-[11px]"
                    />
                    <button
                      onClick={() => void planChoreography()}
                      disabled={busy}
                      className="rounded bg-[var(--teal-glow)] px-2 py-1 text-[10px] text-[var(--teal-bright)] disabled:opacity-40"
                    >
                      Plan
                    </button>
                  </div>
                  {plan && (
                    <ul className="max-h-20 space-y-1 overflow-y-auto text-[10px] text-[var(--text-secondary)]">
                      {plan.segments.map((s, i) => (
                        <li key={i}>
                          {s.startSec.toFixed(1)}–{s.endSec.toFixed(1)}s: {s.motion}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] text-[var(--text-tertiary)]">Motion capture</p>
                  <input
                    value={motionVideoUrl}
                    onChange={(e) => setMotionVideoUrl(e.target.value)}
                    placeholder="Motion reference video URL…"
                    className="w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1.5 text-[11px]"
                  />
                  <div className="flex gap-2">
                    <select
                      value={drawMode}
                      onChange={(e) => setDrawMode(e.target.value as MocapDrawMode)}
                      className="flex-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-[10px]"
                    >
                      {MOCAP_DRAW_MODES.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <select
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value as MocapResolution)}
                      className="flex-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-[10px]"
                    >
                      {MOCAP_RESOLUTIONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => void runMocap()}
                    disabled={busy || !character.refFront || !motionVideoUrl}
                    className="w-full rounded-lg bg-[var(--teal-glow)] py-2 text-[11px] text-[var(--teal-bright)] disabled:opacity-40"
                  >
                    Run mocap (~18 credits)
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] text-[var(--text-tertiary)]">Anime / roto</p>
                  <input
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="Source video URL…"
                    className="w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1.5 text-[11px]"
                  />
                  <select
                    value={animeStyle}
                    onChange={(e) => setAnimeStyle(e.target.value as AnimeStyle)}
                    className="w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-[10px]"
                  >
                    {ANIME_STYLES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => void runAnime()}
                    disabled={busy || !videoUrl}
                    className="w-full rounded border border-[var(--border-subtle)] py-2 text-[11px] disabled:opacity-40"
                  >
                    Anime transform (~15 credits)
                  </button>
                  <select
                    value={rotoMode}
                    onChange={(e) => setRotoMode(e.target.value as FccRotoMode)}
                    className="w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-[10px]"
                  >
                    <option value="character">Replace with character</option>
                    <option value="vfx_only">VFX overlay</option>
                    <option value="aura">Energy aura</option>
                  </select>
                  <button
                    onClick={() => void runRoto()}
                    disabled={busy || !videoUrl}
                    className="w-full rounded border border-[var(--border-subtle)] py-2 text-[11px] disabled:opacity-40"
                  >
                    Roto composite (~20 credits)
                  </button>
                </div>

                {outputUrl && (
                  <video src={outputUrl} controls className="w-full rounded-lg" />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
