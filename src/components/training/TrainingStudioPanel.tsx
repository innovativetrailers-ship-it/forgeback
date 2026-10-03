'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  STUDIO_SUBCATEGORIES,
  STUDIO_TABS,
  TRAINER_REGISTRY,
  assetTypeForTab,
  defaultSubcategory,
  presetsForFamily,
  isGenreFamily,
  type StudioTab,
} from '@cinema/core'
import { toast } from '@/lib/toast'
import { usePlaybackStore } from '@/store/playbackStore'
import { useStudioStore } from '@/store/editor'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { AssetPrompt } from '@/components/training/AssetPrompt'

type Recommend = {
  trainerKey: string
  trainerId: string
  costPerStep: number
  minItems: number
  types: Array<'image' | 'video' | 'audio'>
  captions: boolean
  triggerPhrase: boolean
  steps: number
  costUsd: number
  creditCost?: number
  captionGuidance?: string | null
  isolateSubject?: boolean
  requiresOwnedOrLicensed?: boolean
  requiresSubjectConsent?: boolean
  rightsNotice?: string | null
  presets?: Array<{ id: string; label: string; family: string }>
}

type AssetRow = {
  id: string
  name: string
  type: string
  subcategory: string
  loraUrl: string
  triggerPhrase: string | null
  status?: string
}

type RunRow = {
  id: string
  name: string
  status: string
  progressPct: number
  errorMessage: string | null
  assetType: string
  subcategory: string
  costUsd: number
}

type VoiceRow = {
  id: string
  name: string
  voiceId: string
  source: string
}

type CharacterRow = { id: string; name: string }

const TAB_LABEL: Record<StudioTab, string> = {
  cast: 'Cast',
  styles: 'Styles',
  assets: 'Assets',
  voices: 'Voices',
  music: 'Music',
}

function kindForFile(file: File): 'image' | 'video' | 'audio' | null {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  return null
}

async function uploadMedia(file: File): Promise<{ name: string; kind: 'image' | 'video' | 'audio'; url: string }> {
  const kind = kindForFile(file)
  if (!kind) throw new Error(`Unsupported file: ${file.name}`)
  const field = kind === 'image' ? 'image' : kind === 'video' ? 'video' : 'audio'
  const body = new FormData()
  body.append(field, file)
  const res = await fetch(`/api/upload/${kind}`, { method: 'POST', body, credentials: 'include' })
  const data = await res.json().catch((err) => {
    console.warn("[caught] src/components/training/TrainingStudioPanel.tsx:90", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (({}))
  }) as { url?: string; error?: string }
  if (!res.ok || !data.url) throw new Error(data.error ?? `Upload failed for ${file.name}`)
  return { name: file.name, kind, url: data.url }
}

export function TrainingStudioPanel() {
  const queryClient = useQueryClient()
  const projectId = usePlaybackStore((s) => s.projectId)
  const selectedClipId = useStudioStore((s) => s.selectedClipId)
  const [tab, setTab] = useState<StudioTab>('cast')
  const [subcategory, setSubcategory] = useState(defaultSubcategory('cast'))
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [trigger, setTrigger] = useState('')
  const [caption, setCaption] = useState('')
  const [steps, setSteps] = useState(1000)
  const [trainerOverride, setTrainerOverride] = useState('')
  const [isolateSubject, setIsolateSubject] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [linkedCharacterId, setLinkedCharacterId] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [voiceSeconds, setVoiceSeconds] = useState(0)
  const [ownedOrLicensed, setOwnedOrLicensed] = useState(false)
  const [subjectConsent, setSubjectConsent] = useState(false)
  const [footageCopyrighted, setFootageCopyrighted] = useState(false)
  const [presetId, setPresetId] = useState('')

  useEffect(() => {
    setSubcategory(defaultSubcategory(tab))
    setConfirming(false)
    setFiles([])
    setOwnedOrLicensed(false)
    setSubjectConsent(false)
    setFootageCopyrighted(false)
    setPresetId('')
  }, [tab])

  const kinds = useMemo(
    () => [...new Set(files.map(kindForFile).filter((value): value is 'image' | 'video' | 'audio' => Boolean(value)))],
    [files],
  )

  const recommendQuery = useQuery<Recommend | { error: string }>({
    queryKey: ['training-recommend', tab, subcategory, steps, kinds.join(',')],
    enabled: tab !== 'voices',
    queryFn: async () => {
      const params = new URLSearchParams({
        tab,
        subcategory,
        steps: String(steps),
        kinds: kinds.join(','),
      })
      const res = await fetch(`/api/studio/training/recommend?${params}`, { credentials: 'include' })
      return res.json() as Promise<Recommend | { error: string }>
    },
  })
  const recommend = recommendQuery.data && !('error' in recommendQuery.data) ? recommendQuery.data : null

  useEffect(() => {
    if (recommend?.captionGuidance) setCaption(recommend.captionGuidance)
    if (recommend?.isolateSubject != null) setIsolateSubject(recommend.isolateSubject)
  }, [recommend?.captionGuidance, recommend?.isolateSubject])

  const { data: assets = [] } = useQuery<AssetRow[]>({
    queryKey: ['trained-assets', tab],
    enabled: tab !== 'voices',
    queryFn: async () => {
      const type = assetTypeForTab(tab)
      const res = await fetch(`/api/studio/assets?type=${type}`, { credentials: 'include' })
      const body = await res.json() as { assets?: AssetRow[] }
      const rows = body.assets ?? []
      if (tab === 'assets') return rows.filter((row) => ['vehicle', 'prop', 'product', 'set-piece'].includes(row.subcategory))
      if (tab === 'cast') return rows.filter((row) => !['vehicle', 'prop', 'product', 'set-piece'].includes(row.subcategory))
      return rows
    },
  })

  const { data: runs = [] } = useQuery<RunRow[]>({
    queryKey: ['training-runs'],
    refetchInterval: (query) => {
      const rows = query.state.data ?? []
      return rows.some((row) => row.status === 'training' || row.status === 'assembling' || row.status === 'queued')
        ? 4000
        : false
    },
    queryFn: async () => {
      const res = await fetch('/api/studio/training', { credentials: 'include' })
      const body = await res.json() as { runs?: RunRow[] }
      return body.runs ?? []
    },
  })

  const { data: voices = [] } = useQuery<VoiceRow[]>({
    queryKey: ['studio-voices'],
    queryFn: async () => {
      const res = await fetch('/api/studio/voices', { credentials: 'include' })
      const body = await res.json() as { voices?: VoiceRow[] }
      return body.voices ?? []
    },
  })

  const { data: characters = [] } = useQuery<CharacterRow[]>({
    queryKey: ['vault-characters', 'user'],
    queryFn: async () => {
      const res = await fetch('/api/vault/character/list', { credentials: 'include' })
      if (!res.ok) return []
      return res.json() as Promise<CharacterRow[]>
    },
  })

  const prevActiveIds = useRef<string[]>([])
  useEffect(() => {
    const activeIds = runs
      .filter((row) => row.status !== 'complete' && row.status !== 'failed')
      .map((row) => row.id)
    const finished = prevActiveIds.current.filter((id) => !activeIds.includes(id))
    prevActiveIds.current = activeIds
    if (finished.length) {
      void queryClient.invalidateQueries({ queryKey: ['trained-assets'] })
    }
  }, [runs, queryClient])

  const activeRuns = runs.filter((row) => {
    if (row.status === 'complete' || row.status === 'failed') return false
    if (tab === 'voices') return false
    return row.assetType === assetTypeForTab(tab)
  })

  async function train() {
    if (!recommend) return
    if (files.length < recommend.minItems) {
      toast.error(`Need at least ${recommend.minItems} ${recommend.types.join('/')} files`)
      return
    }
    if (recommend.triggerPhrase && !trigger.trim()) {
      toast.error('Trigger phrase is required')
      return
    }
    const needsCopyright = Boolean(recommend.requiresOwnedOrLicensed || footageCopyrighted)
    if (needsCopyright && !ownedOrLicensed) {
      toast.error('Confirm you own or are licensed for this material')
      return
    }
    if (tab === 'cast' && !subjectConsent) {
      toast.error('Confirm the subject consents to a face LoRA')
      return
    }
    if (!confirming) {
      setConfirming(true)
      return
    }
    setBusy(true)
    try {
      const uploaded = []
      for (const file of files) uploaded.push(await uploadMedia(file))
      const res = await fetch('/api/studio/training', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trainerKey: trainerOverride || recommend.trainerKey,
          tab,
          subcategory,
          name: name.trim() || 'Untitled asset',
          description: description.trim() || undefined,
          triggerPhrase: trigger.trim() || undefined,
          steps,
          confirmedCostUsd: recommend.costUsd,
          isolateSubject: tab === 'cast' || tab === 'assets' ? isolateSubject : false,
          linkedCharacterId: tab === 'cast' && linkedCharacterId ? linkedCharacterId : undefined,
          importDomain: tab === 'styles' ? subcategory : undefined,
          ownedOrLicensed: ownedOrLicensed || undefined,
          subjectConsent: subjectConsent || undefined,
          footageIncludesCopyrightedTitles: footageCopyrighted || undefined,
          files: uploaded.map((file) => ({
            ...file,
            caption: caption.trim() || undefined,
          })),
        }),
      })
      const body = await res.json().catch((err) => {
        console.warn("[caught] src/components/training/TrainingStudioPanel.tsx:270", err instanceof Error ? { name: err.name, message: err.message } : err)
        return (({}))
      }) as { error?: string; expectedCostUsd?: number }
      if (!res.ok) throw new Error(body.error ?? 'Training failed to start')
      toast.success('Training queued — keep working')
      setConfirming(false)
      setFiles([])
      await queryClient.invalidateQueries({ queryKey: ['training-runs'] })
    } catch (err) {
      console.warn("[caught] src/components/training/TrainingStudioPanel.tsx:276", err instanceof Error ? { name: err.name, message: err.message } : err)

      toast.error(err instanceof Error ? err.message : 'Training failed')
    } finally {
      setBusy(false)
    }
  }

  async function cloneVoice() {
    if (files.length < 1) {
      toast.error('Upload a voice sample')
      return
    }
    if (voiceSeconds < 10) {
      toast.error(voiceSeconds === 0
        ? 'Wait for the sample duration to load, then clone'
        : 'Clone needs at least 10 seconds of audio')
      return
    }
    if (!subjectConsent) {
      toast.error('Confirm the subject consents to a voice clone')
      return
    }
    if (!confirming) {
      setConfirming(true)
      return
    }
    setBusy(true)
    try {
      const uploaded = []
      for (const file of files) uploaded.push(await uploadMedia(file))
      const res = await fetch('/api/audio/clone-voice', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || 'Untitled voice',
          description: description.trim() || subcategory,
          audioUrls: uploaded.map((file) => file.url),
          subjectConsent: true,
        }),
      })
      const body = await res.json().catch((err) => {
        console.warn("[caught] src/components/training/TrainingStudioPanel.tsx:319", err instanceof Error ? { name: err.name, message: err.message } : err)
        return (({}))
      }) as { error?: string; voiceId?: string }
      if (!res.ok) throw new Error(body.error ?? 'Clone failed')
      if (linkedCharacterId && body.voiceId) {
        await fetch(`/api/vault/character/${linkedCharacterId}/voice`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voiceId: body.voiceId }),
        })
      }
      toast.success('Voice cloned')
      setFiles([])
      await queryClient.invalidateQueries({ queryKey: ['studio-voices'] })
    } catch (err) {
      console.warn("[caught] src/components/training/TrainingStudioPanel.tsx:330", err instanceof Error ? { name: err.name, message: err.message } : err)

      toast.error(err instanceof Error ? err.message : 'Clone failed')
    } finally {
      setBusy(false)
    }
  }

  async function useAsset(asset: AssetRow, target: 'shot-character' | 'shot-style' | 'project-style' | 'character') {
    const payload: Record<string, string> = { target }
    if (target === 'project-style') {
      if (!projectId) { toast.error('Open a project first'); return }
      payload.projectId = projectId
    }
    if (target.startsWith('shot-')) {
      if (!selectedClipId) { toast.error('Select a shot first'); return }
      payload.shotId = selectedClipId
    }
    if (target === 'character') {
      if (!linkedCharacterId) { toast.error('Pick a character to attach'); return }
      payload.characterId = linkedCharacterId
    }
    const res = await fetch(`/api/studio/assets/${asset.id}/use`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const body = await res.json().catch((err) => {
        console.warn("[caught] src/components/training/TrainingStudioPanel.tsx:362", err instanceof Error ? { name: err.name, message: err.message } : err)
        return (({}))
      }) as { error?: string }
      toast.error(body.error ?? 'Could not apply asset')
      return
    }
    toast.success(`Applied ${asset.name}`)
  }

  async function renameAsset(asset: AssetRow) {
    const next = window.prompt('Rename asset', asset.name)
    if (!next?.trim()) return
    const res = await fetch(`/api/studio/assets/${asset.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: next.trim() }),
    })
    if (!res.ok) toast.error('Rename failed')
    else await queryClient.invalidateQueries({ queryKey: ['trained-assets'] })
  }

  async function deleteAsset(asset: AssetRow) {
    if (!window.confirm(`Delete ${asset.name}? This removes the trained asset from your library.`)) return
    const res = await fetch(`/api/studio/assets/${asset.id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) toast.error('Delete failed')
    else {
      toast.success('Asset deleted')
      await queryClient.invalidateQueries({ queryKey: ['trained-assets'] })
    }
  }

  const accept = tab === 'music' || tab === 'voices'
    ? 'audio/*'
    : 'image/*,video/*'

  return (
    <div className="h-full flex flex-col text-[11px] text-[var(--text-secondary)]">
      <div className="flex border-b border-[var(--border)] shrink-0 overflow-x-auto">
        {STUDIO_TABS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 min-w-[52px] py-1.5 text-[9px] font-semibold uppercase tracking-wide ${
              tab === id
                ? 'text-[var(--teal-bright)] border-b-2 border-[var(--teal-bright)]'
                : 'text-[var(--text-tertiary)]'
            }`}
          >
            {TAB_LABEL[id]}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {(tab === 'cast' || tab === 'styles' || tab === 'assets') && (
          <AssetPrompt kind={tab === 'styles' ? 'style' : tab === 'assets' ? 'asset' : 'character'} />
        )}
        <div className="flex flex-wrap gap-1">
          {STUDIO_SUBCATEGORIES[tab].map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setSubcategory(row.id)}
              className={`px-1.5 py-0.5 rounded border text-[10px] ${
                subcategory === row.id
                  ? 'border-[var(--teal-bright)] text-[var(--teal-bright)]'
                  : 'border-[var(--border)] text-[var(--text-tertiary)]'
              }`}
            >
              {row.label}
            </button>
          ))}
        </div>

        {tab === 'styles' && isGenreFamily(subcategory) && (
          <div className="space-y-1">
            <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
              Instant presets are free style descriptors (prompt + grade + camera). They are not studio replicas and do not train.
            </p>
            <div className="flex flex-wrap gap-1">
              {presetsForFamily(subcategory).map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setPresetId(row.id)}
                  className={`px-1.5 py-0.5 rounded border text-[10px] ${
                    presetId === row.id
                      ? 'border-[var(--teal-bright)] text-[var(--teal-bright)]'
                      : 'border-[var(--border)] text-[var(--text-tertiary)]'
                  }`}
                >
                  {row.label}
                </button>
              ))}
            </div>
            {presetId && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="text-[10px] text-[var(--teal-bright)]"
                  onClick={() => {
                    if (!selectedClipId) { toast.error('Select a shot first'); return }
                    void fetch(`/api/studio/shot/${selectedClipId}/settings`, {
                      method: 'PATCH',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ genrePresetId: presetId }),
                    }).then((res) => { if (res.ok) toast.success('Preset on shot'); else toast.error('Could not apply preset') })
                  }}
                >
                  Apply on shot (free)
                </button>
                <button
                  type="button"
                  className="text-[10px] text-[var(--teal-bright)]"
                  onClick={() => {
                    if (!projectId) { toast.error('Open a project first'); return }
                    void fetch(`/api/projects/${projectId}`, {
                      method: 'PATCH',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ genrePresetId: presetId }),
                    }).then((res) => { if (res.ok) toast.success('Preset on project'); else toast.error('Could not apply preset') })
                  }}
                >
                  Apply on project (free)
                </button>
              </div>
            )}
          </div>
        )}
        {tab === 'voices' && (
          <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
            Voice design is not on FAL (verified 404). Clone from a sample of at least 10 seconds, then link it to a character.
          </p>
        )}

        <label className="block">
          <span className="text-[10px] uppercase text-[var(--text-tertiary)]">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-0.5 w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded px-1.5 py-1 text-[11px] text-[var(--text-primary)]"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase text-[var(--text-tertiary)]">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-0.5 w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded px-1.5 py-1 text-[11px] text-[var(--text-primary)]"
          />
        </label>
        {tab !== 'voices' && recommend?.triggerPhrase !== false && (
          <label className="block">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">Trigger phrase</span>
            <input
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              className="mt-0.5 w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded px-1.5 py-1 text-[11px] text-[var(--text-primary)]"
            />
          </label>
        )}
        {recommend?.captions && (
          <label className="block">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">Captions</span>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={2}
              placeholder="Domain-aware captioning guidance ships in TR-05"
              className="mt-0.5 w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded px-1.5 py-1 text-[11px] text-[var(--text-primary)]"
            />
          </label>
        )}
        {(tab === 'cast' || tab === 'voices') && (
          <label className="block">
            <span className="text-[10px] uppercase text-[var(--text-tertiary)]">Link character</span>
            <select
              value={linkedCharacterId}
              onChange={(e) => setLinkedCharacterId(e.target.value)}
              className="mt-0.5 w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded px-1.5 py-1 text-[11px]"
            >
              <option value="">None</option>
              {characters.map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="text-[10px] uppercase text-[var(--text-tertiary)]">Media</span>
          <input
            type="file"
            accept={accept}
            multiple
            className="mt-0.5 w-full text-[10px]"
            onChange={(e) => {
              const next = Array.from(e.target.files ?? [])
              setFiles(next)
              setConfirming(false)
              const audio = next.find((file) => file.type.startsWith('audio/'))
              if (audio) {
                const el = document.createElement('audio')
                el.preload = 'metadata'
                el.src = URL.createObjectURL(audio)
                el.onloadedmetadata = () => {
                  setVoiceSeconds(el.duration || 0)
                  URL.revokeObjectURL(el.src)
                }
              }
            }}
          />
          <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">
            {files.length} file{files.length === 1 ? '' : 's'}
            {recommend ? ` · need ${recommend.minItems} ${recommend.types.join('/')}` : ''}
            {tab === 'voices' && voiceSeconds ? ` · ${voiceSeconds.toFixed(1)}s` : ''}
          </p>
        </label>

        {recommend?.rightsNotice && (
          <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">{recommend.rightsNotice}</p>
        )}
        {(recommend?.requiresOwnedOrLicensed || tab === 'cast' || tab === 'assets') && (
          <label className="flex items-start gap-1.5 text-[10px] leading-relaxed">
            <input type="checkbox" className="mt-0.5" checked={footageCopyrighted} onChange={(e) => { setFootageCopyrighted(e.target.checked); setConfirming(false) }} />
            These files include movie, TV, or anime footage
          </label>
        )}
        {(recommend?.requiresOwnedOrLicensed || footageCopyrighted) && (
          <label className="flex items-start gap-1.5 text-[10px] leading-relaxed">
            <input type="checkbox" className="mt-0.5" checked={ownedOrLicensed} onChange={(e) => { setOwnedOrLicensed(e.target.checked); setConfirming(false) }} />
            I own or am licensed for this material. Do not train without this.
          </label>
        )}
        {(tab === 'cast' || tab === 'voices') && (
          <label className="flex items-start gap-1.5 text-[10px] leading-relaxed">
            <input type="checkbox" className="mt-0.5" checked={subjectConsent} onChange={(e) => setSubjectConsent(e.target.checked)} />
            The subject consents to this face LoRA / voice clone
          </label>
        )}

        {(tab === 'cast' || tab === 'assets') && (
          <label className="flex items-center gap-1.5 text-[10px]">
            <input type="checkbox" checked={isolateSubject} onChange={(e) => setIsolateSubject(e.target.checked)} />
            SAM-3 subject isolation (optional)
          </label>
        )}

        {tab === 'music' && (
          <p className="text-[10px] leading-relaxed text-[var(--text-tertiary)]">
            Music LoRA training is not offered. Film scores use Suno, which cannot apply a Stable Audio LoRA.
          </p>
        )}

        {tab !== 'voices' && tab !== 'music' && (
          <>
            <label className="block">
              <span className="text-[10px] uppercase text-[var(--text-tertiary)]">Steps {steps}</span>
              <input
                type="range"
                min={100}
                max={4000}
                step={100}
                value={steps}
                onChange={(e) => { setSteps(Number(e.target.value)); setConfirming(false) }}
                className="w-full"
              />
            </label>
            {recommend && (
              <p className="text-[10px] leading-relaxed">
                Trainer {trainerOverride || recommend.trainerKey} · ${recommend.costPerStep}/step ·
                {' '}<strong className="text-[var(--text-primary)]">${recommend.costUsd.toFixed(2)}</strong>
                {' '}and {recommend.creditCost ?? 50} credits, charged on submit and refunded if training fails.
              </p>
            )}
            <label className="block text-[10px]">
              <span className="uppercase text-[var(--text-tertiary)]">Trainer</span>
              <select
                className="mt-1 w-full rounded bg-black/30 px-1 py-1"
                value={trainerOverride}
                onChange={(event) => setTrainerOverride(event.target.value)}
              >
                <option value="">Recommended</option>
                {Object.keys(TRAINER_REGISTRY).filter((key) => key !== 'stable-audio-3').map((key) => (
                  <option key={key} value={key}>{key}</option>
                ))}
              </select>
              <span className="mt-1 block text-[var(--text-tertiary)]">Stable Audio stays registry-only. Film scores use Suno, which cannot apply that LoRA.</span>
            </label>
            <button
              type="button"
              disabled={busy || !recommend}
              onClick={() => void train()}
              className="w-full py-1.5 rounded bg-[var(--teal-bright)] text-[var(--bg-primary)] font-semibold text-[11px] disabled:opacity-50"
            >
              {busy ? <Loader2 className="inline w-3 h-3 animate-spin" /> : null}
              {' '}
              {confirming ? `Confirm & Train $${recommend?.costUsd.toFixed(2) ?? ''} · ${recommend?.creditCost ?? 50} cr` : 'Train (show cost)'}
            </button>
          </>
        )}

        {tab === 'voices' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void cloneVoice()}
            className="w-full py-1.5 rounded bg-[var(--teal-bright)] text-[var(--bg-primary)] font-semibold text-[11px] disabled:opacity-50"
          >
            {busy ? <Loader2 className="inline w-3 h-3 animate-spin" /> : <Plus className="inline w-3 h-3" />}
            {confirming ? ' Confirm clone · 20 credits' : ' Clone voice (20 credits)'}
          </button>
        )}

        {activeRuns.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] uppercase text-[var(--text-tertiary)]">In progress</p>
            {activeRuns.map((run) => (
              <div key={run.id} className="border border-[var(--border)] rounded px-1.5 py-1">
                <div className="flex justify-between gap-2">
                  <span className="truncate text-[var(--text-primary)]">{run.name}</span>
                  <span>{run.progressPct}%</span>
                </div>
                <div className="h-1 bg-[var(--bg-primary)] rounded overflow-hidden mt-1">
                  <div className="h-full bg-[var(--teal-bright)]" style={{ width: `${run.progressPct}%` }} />
                </div>
                {run.errorMessage && <p className="text-[10px] text-red-400 mt-0.5">{run.errorMessage}</p>}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1">
          <p className="text-[10px] uppercase text-[var(--text-tertiary)]">Library</p>
          {tab === 'voices' ? (
            voices.length === 0
              ? <p className="text-[10px] text-[var(--text-tertiary)]">No cloned voices yet</p>
              : voices.map((voice) => (
                <div key={voice.id} className="border border-[var(--border)] rounded px-1.5 py-1">
                  <p className="text-[var(--text-primary)] truncate">{voice.name}</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">{voice.source} · ready</p>
                  {linkedCharacterId && (
                    <button
                      type="button"
                      className="text-[10px] text-[var(--teal-bright)]"
                      onClick={() => {
                        void fetch(`/api/vault/character/${linkedCharacterId}/voice`, {
                          method: 'PATCH',
                          credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ voiceId: voice.voiceId }),
                        }).then((res) => {
                          if (res.ok) toast.success('Voice linked')
                          else toast.error('Could not link voice')
                        })
                      }}
                    >
                      Link to character
                    </button>
                  )}
                </div>
              ))
          ) : assets.length === 0 ? (
            <p className="text-[10px] text-[var(--text-tertiary)]">No trained assets yet</p>
          ) : (
            assets.map((asset) => (
              <div key={asset.id} className="border border-[var(--border)] rounded px-1.5 py-1 space-y-0.5">
                <div className="flex justify-between gap-2">
                  <span className="truncate text-[var(--text-primary)]">{asset.name}</span>
                  <span className="text-[10px] text-emerald-400">ready</span>
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)]">{asset.subcategory || asset.type}</p>
                <div className="flex flex-wrap gap-1.5">
                  {tab === 'cast' || tab === 'assets' ? (
                    <button type="button" className="text-[10px] text-[var(--teal-bright)]" onClick={() => void useAsset(asset, 'shot-character')}>Use on shot</button>
                  ) : tab === 'styles' ? (
                    <>
                      <button type="button" className="text-[10px] text-[var(--teal-bright)]" onClick={() => void useAsset(asset, 'shot-style')}>Use on shot</button>
                      <button type="button" className="text-[10px] text-[var(--teal-bright)]" onClick={() => void useAsset(asset, 'project-style')}>Use on project</button>
                    </>
                  ) : null}
                  {(tab === 'cast') && (
                    <button type="button" className="text-[10px] text-[var(--teal-bright)]" onClick={() => void useAsset(asset, 'character')}>Attach</button>
                  )}
                  <button type="button" className="text-[10px]" onClick={() => void renameAsset(asset)}>Rename</button>
                  <button type="button" className="text-[10px] text-red-400" onClick={() => void deleteAsset(asset)}>
                    <Trash2 className="inline w-3 h-3" /> Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
