'use client'


import { logCaught } from '@/lib/diagnostics/caught'
import { useState, useRef, useEffect, useMemo } from 'react'
import { buildPanelPreloads, exposedControls, gateModelControl, GENRE_FAMILIES, GENRE_PRESETS, IDENTITY_REFERENCE_MODEL, linkedVoices, resolveModel } from '@cinema/core'
import type { ShotPlanCard } from '@/lib/studio/shotPlan'
import type { DirectShotArgs } from '@/lib/types/shot'

interface Props {
  shot: ShotPlanCard
  projectId: string
  selectedModels: string[]
  onDirect: (args: DirectShotArgs) => Promise<void>
  onAnchorChange: (shotId: string, url: string | undefined, source: ShotPlanCard['anchorSource']) => void
}

function anchorLabel(source: ShotPlanCard['anchorSource']): string {
  if (source === 'manual') return 'Custom anchor'
  if (source === 'keyframe') return 'Storyboard keyframe'
  if (source === 'auto') return 'End frame from previous shot'
  return 'No anchor (T2V)'
}

export function AwaitingDirectionCard({
  shot,
  projectId,
  selectedModels,
  onDirect,
  onAnchorChange,
}: Props) {
  const [prompt, setPrompt] = useState(shot.prompt)
  const [anchor, setAnchor] = useState<string | null>(shot.anchorFrameUrl ?? null)
  const [anchorSource, setAnchorSource] = useState<ShotPlanCard['anchorSource']>(shot.anchorSource ?? 'none')
  const [model, setModel] = useState(shot.modelOverride ?? '__auto__')
  const [dialogueText, setDialogueText] = useState(shot.dialogueText ?? '')
  const [lipSyncEnabled, setLipSyncEnabled] = useState(shot.lipSyncEnabled)
  const [directing, setDirecting] = useState(false)
  const [generatingAnchor, setGeneratingAnchor] = useState(false)
  const [characterIds, setCharacterIds] = useState<string[]>(shot.characterIds ?? [])
  const [locationId, setLocationId] = useState<string>(shot.locationId ?? '')
  const [shotSize, setShotSize] = useState(shot.shotSize ?? '')
  const [cameraAngle, setCameraAngle] = useState(shot.cameraAngle ?? '')
  const [cameraMove, setCameraMove] = useState(shot.cameraMove ?? '')
  const [lensFeel, setLensFeel] = useState(shot.lensFeel ?? '')
  const [cameraSpeed, setCameraSpeed] = useState(shot.cameraSpeed ?? '')
  const [cameraPrecision, setCameraPrecision] = useState(Boolean(shot.cameraPrecision))
  const [moneyShot, setMoneyShot] = useState(Boolean(shot.moneyShot))
  const [endFrameUrl, setEndFrameUrl] = useState(shot.endFrameUrl ?? '')
  const [characterLoraId, setCharacterLoraId] = useState(shot.characterLoraId ?? '')
  const [styleLoraId, setStyleLoraId] = useState(shot.styleLoraId ?? '')
  const [genrePresetId, setGenrePresetId] = useState(shot.genrePresetId ?? '')
  const [identityError, setIdentityError] = useState<string | null>(null)
  const [cast, setCast] = useState<Array<{ id: string; name: string; referenceUrls: string[]; voiceId?: string | null }>>([])
  const [styleAssets, setStyleAssets] = useState<Array<{ id: string; name: string }>>([])
  const [characterAssets, setCharacterAssets] = useState<Array<{ id: string; name: string }>>([])
  const [plates, setPlates] = useState<Array<{ id: string; displayName: string | null; imageUrl: string; city: string | null }>>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const caps = useMemo(() => {
    if (model === '__auto__') return null
    try {
      const def = resolveModel(model)
      return exposedControls(def.canonicalId, def.fields, def.control)
    } catch (err) {
      console.warn("[caught] src/components/ultimate/AwaitingDirectionCard.tsx:64", err instanceof Error ? { name: err.name, message: err.message } : err)

      return null
    }
  }, [model])
  const tool = useMemo(() => {
    if (model === '__auto__' || !caps) return null
    try {
      const def = resolveModel(model)
      const plate = plates.find((row) => row.id === locationId)
      return buildPanelPreloads(def.control, def.silentOnly, {
        characters: cast.filter((row) => characterIds.includes(row.id)),
        location: plate
          ? { label: plate.displayName || plate.city || 'Location', imageUrl: plate.imageUrl }
          : null,
        anchorFrameUrl: anchor,
        endFrameUrl,
        referenceCapable: caps.reference,
      })
    } catch (err) {
      console.warn("[caught] src/components/ultimate/AwaitingDirectionCard.tsx:82", err instanceof Error ? { name: err.name, message: err.message } : err)

      return null
    }
  }, [model, caps, plates, locationId, cast, characterIds, anchor, endFrameUrl])
  const voices = linkedVoices(cast.filter((row) => characterIds.includes(row.id)))
  const lastFrameGate = caps
    ? gateModelControl(caps, 'lastFrame')
    : { visible: false, reason: 'Last frame is used when the selected model has a last-frame field.' }
  const voiceGate = caps ? gateModelControl(caps, 'voice') : { visible: false }
  const modelSilent = model === '__auto__'
    ? true
    : (() => {
        try { return resolveModel(model).silentOnly } catch (err) {
          console.warn("[caught] src/components/ultimate/AwaitingDirectionCard.tsx:94", err instanceof Error ? { name: err.name, message: err.message } : err)
 return true }
      })()
  const hasNativeAudio = model !== '__auto__' && !modelSilent
  const hasDialogue = Boolean(shot.dialogueTrackId)

  useEffect(() => {
    setPrompt(shot.prompt)
    setAnchor(shot.anchorFrameUrl ?? null)
    setAnchorSource(shot.anchorSource ?? 'none')
    setModel(shot.modelOverride ?? '__auto__')
    setDialogueText(shot.dialogueText ?? '')
    setLipSyncEnabled(shot.lipSyncEnabled)
    setCharacterIds(shot.characterIds ?? [])
    setLocationId(shot.locationId ?? '')
    setShotSize(shot.shotSize ?? '')
    setCameraAngle(shot.cameraAngle ?? '')
    setCameraMove(shot.cameraMove ?? '')
    setLensFeel(shot.lensFeel ?? '')
    setCameraSpeed(shot.cameraSpeed ?? '')
    setCameraPrecision(Boolean(shot.cameraPrecision))
    setMoneyShot(Boolean(shot.moneyShot))
    setEndFrameUrl(shot.endFrameUrl ?? '')
    setCharacterLoraId(shot.characterLoraId ?? '')
    setStyleLoraId(shot.styleLoraId ?? '')
    setGenrePresetId(shot.genrePresetId ?? '')
    setDirecting(false)
  }, [shot.id, shot.prompt, shot.anchorFrameUrl, shot.anchorSource, shot.assignedModel, shot.modelOverride, shot.dialogueText, shot.lipSyncEnabled, shot.characterIds, shot.locationId, shot.shotSize, shot.cameraAngle, shot.cameraMove, shot.lensFeel, shot.cameraSpeed, shot.cameraPrecision, shot.endFrameUrl, shot.moneyShot, shot.characterLoraId, shot.styleLoraId, shot.genrePresetId, shot.delegationReason])

  useEffect(() => {
    let cancelled = false
    void fetch(`/api/vault/character/list?projectId=${encodeURIComponent(projectId)}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data: unknown) => {
        const rows = Array.isArray(data)
          ? data
          : (data && typeof data === 'object' && Array.isArray((data as { characters?: unknown }).characters)
            ? (data as { characters: unknown[] }).characters
            : [])
        if (cancelled) return
        setCast(rows.flatMap((row) => {
          if (!row || typeof row !== 'object') return []
          const rec = row as { id?: string; name?: string; referenceUrls?: string[]; voiceId?: string | null }
          if (!rec.id || !rec.name) return []
          return [{ id: rec.id, name: rec.name, referenceUrls: rec.referenceUrls ?? [], voiceId: rec.voiceId }]
        }))
      })
      .catch((err) => logCaught('components/ultimate/AwaitingDirectionCard', err))
    void fetch('/api/vault/location/list', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { plates?: Array<{ id: string; displayName: string | null; imageUrl: string; city: string | null }> }) => {
        if (!cancelled) setPlates(data.plates ?? [])
      })
      .catch((err) => logCaught('components/ultimate/AwaitingDirectionCard', err))
    void fetch('/api/studio/assets', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { assets?: Array<{ id: string; name: string; type: string }> }) => {
        if (cancelled) return
        const rows = data.assets ?? []
        setCharacterAssets(rows.filter((row) => row.type === 'character').map((row) => ({ id: row.id, name: row.name })))
        setStyleAssets(rows.filter((row) => row.type === 'style').map((row) => ({ id: row.id, name: row.name })))
      })
      .catch((err) => logCaught('components/ultimate/AwaitingDirectionCard', err))
    return () => { cancelled = true }
  }, [projectId])

  async function saveIdentity(nextCharacters: string[], nextLocation: string): Promise<boolean> {
    setCharacterIds(nextCharacters)
    setLocationId(nextLocation)
    setIdentityError(null)
    const res = await fetch(`/api/studio/shot/${shot.id}/settings`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        characterIds: nextCharacters,
        locationId: nextLocation || null,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch((err) => {
        console.warn("[caught] src/components/ultimate/AwaitingDirectionCard.tsx:179", err instanceof Error ? { name: err.name, message: err.message } : err)
        return (({}))
      }) as { error?: string }
      setIdentityError(typeof data.error === 'string' ? data.error : 'Could not save cast or location')
      return false
    }
    return true
  }

  async function saveLoras(nextCharacterLora: string, nextStyleLora: string): Promise<boolean> {
    setCharacterLoraId(nextCharacterLora)
    setStyleLoraId(nextStyleLora)
    const res = await fetch(`/api/studio/shot/${shot.id}/settings`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        characterLoraId: nextCharacterLora || null,
        styleLoraId: nextStyleLora || null,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch((err) => {
        console.warn("[caught] src/components/ultimate/AwaitingDirectionCard.tsx:199", err instanceof Error ? { name: err.name, message: err.message } : err)
        return (({}))
      }) as { error?: string }
      setIdentityError(typeof data.error === 'string' ? data.error : 'Could not save LoRA')
      return false
    }
    return true
  }

  async function saveGenrePreset(next: string): Promise<boolean> {
    setGenrePresetId(next)
    const res = await fetch(`/api/studio/shot/${shot.id}/settings`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genrePresetId: next || null }),
    })
    if (!res.ok) {
      const data = await res.json().catch((err) => {
        console.warn("[caught] src/components/ultimate/AwaitingDirectionCard.tsx:215", err instanceof Error ? { name: err.name, message: err.message } : err)
        return (({}))
      }) as { error?: string }
      setIdentityError(typeof data.error === 'string' ? data.error : 'Could not save genre preset')
      return false
    }
    return true
  }

  async function saveCamera(next: {
    shotSize: string
    cameraAngle: string
    cameraMove: string
    lensFeel: string
    cameraSpeed: string
    cameraPrecision: boolean
    endFrameUrl: string
  }): Promise<boolean> {
    setShotSize(next.shotSize)
    setCameraAngle(next.cameraAngle)
    setCameraMove(next.cameraMove)
    setLensFeel(next.lensFeel)
    setCameraSpeed(next.cameraSpeed)
    setCameraPrecision(next.cameraPrecision)
    setEndFrameUrl(next.endFrameUrl)
    setIdentityError(null)
    const res = await fetch(`/api/studio/shot/${shot.id}/settings`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shotSize: next.shotSize || null,
        cameraAngle: next.cameraAngle || null,
        cameraMove: next.cameraMove || null,
        lensFeel: next.lensFeel || null,
        cameraSpeed: next.cameraSpeed || null,
        cameraPrecision: next.cameraPrecision,
        endFrameUrl: next.endFrameUrl.trim() || null,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch((err) => {
        console.warn("[caught] src/components/ultimate/AwaitingDirectionCard.tsx:254", err instanceof Error ? { name: err.name, message: err.message } : err)
        return (({}))
      }) as { error?: string }
      setIdentityError(typeof data.error === 'string' ? data.error : 'Could not save camera')
      return false
    }
    return true
  }

  async function saveMoneyShot(next: boolean): Promise<boolean> {
    setMoneyShot(next)
    setIdentityError(null)
    const res = await fetch(`/api/studio/shot/${shot.id}/settings`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moneyShot: next }),
    })
    if (!res.ok) {
      const data = await res.json().catch((err) => {
        console.warn("[caught] src/components/ultimate/AwaitingDirectionCard.tsx:271", err instanceof Error ? { name: err.name, message: err.message } : err)
        return (({}))
      }) as { error?: string }
      setIdentityError(typeof data.error === 'string' ? data.error : 'Could not save money shot')
      return false
    }
    return true
  }

  function currentCamera() {
    return { shotSize, cameraAngle, cameraMove, lensFeel, cameraSpeed, cameraPrecision, endFrameUrl }
  }

  async function saveDialogueText() {
    if (!shot.dialogueTrackId) return
    await fetch(`/api/audio/track/${shot.dialogueTrackId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: dialogueText }),
    })
  }

  async function regenerateVoice() {
    if (!shot.dialogueTrackId) return
    await saveDialogueText()
    await fetch(`/api/audio/track/${shot.dialogueTrackId}/generate`, {
      method: 'POST',
      credentials: 'include',
    })
  }

  async function toggleLipSync(enabled: boolean) {
    setLipSyncEnabled(enabled)
    await fetch(`/api/studio/shot/${shot.id}/settings`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lipSyncEnabled: enabled }),
    })
  }

  async function handleAnchorUpload(file: File) {
    const form = new FormData()
    form.append('file', file)
    form.append('shotId', shot.id)
    form.append('projectId', projectId)
    const res = await fetch('/api/studio/shot/anchor', { method: 'POST', credentials: 'include', body: form })
    if (!res.ok) return
    const data = await res.json() as { anchorUrl?: string }
    if (data.anchorUrl) {
      setAnchor(data.anchorUrl)
      setAnchorSource('manual')
      onAnchorChange(shot.id, data.anchorUrl, 'manual')
    }
  }

  async function handleRemoveAnchor() {
    const res = await fetch('/api/studio/shot/anchor', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shotId: shot.id }),
    })
    if (!res.ok) return
    setAnchor(null)
    setAnchorSource('none')
    onAnchorChange(shot.id, undefined, 'none')
  }

  async function handleGenerateAnchor() {
    if (!prompt.trim()) return
    setGeneratingAnchor(true)
    try {
      const res = await fetch('/api/studio/shot/anchor/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shotId: shot.id, projectId, prompt }),
      })
      if (!res.ok) return
      const data = await res.json() as { anchorUrl?: string }
      if (data.anchorUrl) {
        setAnchor(data.anchorUrl)
        setAnchorSource('keyframe')
        onAnchorChange(shot.id, data.anchorUrl, 'keyframe')
      }
    } finally {
      setGeneratingAnchor(false)
    }
  }

  async function handleDirect() {
    if (!prompt.trim()) return
    setDirecting(true)
    try {
      const saved = await saveIdentity(characterIds, locationId)
      if (!saved) return
      const cameraSaved = await saveCamera(currentCamera())
      if (!cameraSaved) return
      await onDirect({
        shotId: shot.id,
        prompt,
        anchorSource,
        anchorFrameUrl: anchorSource === 'none' ? undefined : anchor ?? undefined,
        modelOverride: model === '__auto__' ? null : model,
      })
    } finally {
      setDirecting(false)
    }
  }

  return (
    <div className="rounded-lg border-2 border-teal-700 bg-zinc-900 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-teal-900/30">
        <span className="text-sm font-semibold text-teal-300">
          Shot {shot.shotNumber} — Controls
        </span>
        <span
          className="text-xs text-zinc-400 max-w-[14rem] truncate"
          title={shot.delegationReason ?? 'Auto routes a model by this shot’s purpose and the project quality tier.'}
        >
          {model === '__auto__' ? (shot.assignedModel ?? 'Auto') : model} · {shot.duration}s · {shot.estimatedCost}cr
        </span>
      </div>

      {shot.directionNotes?.trim() && !shot.chainBlock && (
        <p className="px-3 py-2 text-[11px] text-teal-100/80 border-b border-white/10">{shot.directionNotes}</p>
      )}

      {shot.chainBlock && (
        <div className="px-3 py-2 border-b border-amber-700/50 bg-amber-950/40 space-y-2">
          <p className="text-[11px] text-amber-100">
            {shot.directionNotes?.trim() || shot.lastError?.userMessage || `continuity drift on shot ${shot.shotNumber}`}
          </p>
          {(shot.anchorFrameUrl || shot.lastFrame) && (
            <div className="flex gap-2">
              {shot.anchorFrameUrl && <img src={shot.anchorFrameUrl} alt="Previous shot end" className="h-16 w-28 object-cover rounded" />}
              {shot.lastFrame && <img src={shot.lastFrame} alt="This shot" className="h-16 w-28 object-cover rounded" />}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="text-[10px] text-teal-300" onClick={() => void fetch(`/api/studio/shot/${shot.id}/chain`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', projectId }) }).catch((err) => console.warn('[chain]', err))}>Accept</button>
            <button type="button" className="text-[10px] text-teal-300" onClick={() => void fetch(`/api/studio/shot/${shot.id}/chain`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'retry', projectId }) }).then(() => fetch('/api/studio/shot/generate', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shotPlanId: shot.id, projectId }) })).catch((err) => console.warn('[chain]', err))}>Retry</button>
            <button type="button" className="text-[10px] text-teal-300" onClick={() => void onDirect({ shotId: shot.id, prompt, anchorSource, anchorFrameUrl: anchor ?? undefined, modelOverride: model === '__auto__' ? null : model })}>Adjust</button>
          </div>
        </div>
      )}

      <div className="p-3 space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-zinc-300">Start Frame (Anchor)</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-xs px-2 py-0.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded"
              >
                Change
              </button>
              {anchor && (
                <button
                  type="button"
                  onClick={() => void handleRemoveAnchor()}
                  className="text-xs px-2 py-0.5 bg-zinc-700 hover:bg-red-800 text-zinc-400 rounded"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          {anchor ? (
            <div className="relative rounded overflow-hidden">
              <img src={anchor} className="w-full h-28 object-cover" alt="Anchor frame" />
              <div className="absolute bottom-1 left-1 bg-black/60 text-xs text-zinc-300 px-1 rounded">
                {anchorLabel(anchorSource)}
              </div>
            </div>
          ) : (
            <div className="w-full border border-dashed border-zinc-700 rounded p-3 space-y-2">
              <p className="text-xs text-zinc-500 text-center">
                No start frame — this shot will generate from text unless you add one.
              </p>
              <div className="flex flex-wrap gap-1.5 justify-center">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded"
                >
                  Upload
                </button>
                <button
                  type="button"
                  onClick={() => void handleGenerateAnchor()}
                  disabled={generatingAnchor || !prompt.trim()}
                  className="text-xs px-2 py-1 bg-teal-800 hover:bg-teal-700 text-teal-100 rounded disabled:opacity-40"
                >
                  {generatingAnchor ? 'Generating…' : 'Generate start frame'}
                </button>
              </div>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleAnchorUpload(f)
            }}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-zinc-300">Direction / Prompt</span>
            {prompt !== shot.originalPrompt && (
              <button
                type="button"
                onClick={() => setPrompt(shot.originalPrompt)}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                ↩ Reset
              </button>
            )}
          </div>
          <textarea
            className="w-full bg-zinc-800 border border-zinc-700 focus:border-teal-600 rounded p-2 text-sm text-zinc-200 resize-none outline-none"
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe this shot…"
          />
        </div>

        {hasDialogue && (
          <div className="space-y-2 border-t border-zinc-800 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-300">Dialogue</span>
              <button
                type="button"
                onClick={() => void regenerateVoice()}
                className="text-xs text-teal-400 hover:text-teal-300"
              >
                ↺ Regenerate voice
              </button>
            </div>
            <textarea
              className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 resize-none outline-none"
              rows={2}
              value={dialogueText}
              onChange={(e) => setDialogueText(e.target.value)}
              onBlur={() => void saveDialogueText()}
            />
            {voices.length > 0 && (
              <p className="text-[10px] text-zinc-400">
                {voices.map((voice) => `${voice.name}'s voice`).join(', ')}
              </p>
            )}
            {shot.durationWarning && (
              <p className="text-[10px] text-amber-400">
                Line may be longer than the clip — lip sync will cut or loop.
              </p>
            )}
            {voiceGate.visible ? (
              <p className="text-[10px] text-zinc-400">Dialogue audio is sent as @Audio on the Seedance reference.</p>
            ) : hasNativeAudio ? (
              <p className="text-[10px] text-zinc-400">This picture already has sound. Lip-sync is skipped.</p>
            ) : (
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={lipSyncEnabled}
                  onChange={(e) => void toggleLipSync(e.target.checked)}
                />
                Auto lip-sync after generation
              </label>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 flex-shrink-0">Cast</span>
          <select
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-xs text-zinc-200 outline-none"
            value=""
            onChange={(e) => {
              const id = e.target.value
              if (!id || characterIds.includes(id)) return
              void saveIdentity([...characterIds, id], locationId)
            }}
          >
            <option value="">Add character</option>
            {cast.map((character) => (
              <option key={character.id} value={character.id}>{character.name}</option>
            ))}
          </select>
        </div>
        {characterIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {characterIds.map((id) => {
              const character = cast.find((row) => row.id === id)
              const thumb = character?.referenceUrls[0]
              return (
                <button
                  key={id}
                  type="button"
                  title="Remove from shot"
                  onClick={() => void saveIdentity(characterIds.filter((row) => row !== id), locationId)}
                  className="flex items-center gap-1 rounded bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-200"
                >
                  {thumb ? <img src={thumb} alt="" className="w-4 h-4 rounded object-cover" /> : null}
                  {character?.name ?? id}
                </button>
              )
            })}
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 flex-shrink-0">Location</span>
          <select
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-xs text-zinc-200 outline-none"
            value={locationId}
            onChange={(e) => void saveIdentity(characterIds, e.target.value)}
          >
            <option value="">No location</option>
            {plates.map((plate) => (
              <option key={plate.id} value={plate.id}>
                {plate.displayName || plate.city || 'Saved plate'}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 flex-shrink-0">Cast LoRA</span>
          <select
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-xs text-zinc-200 outline-none"
            value={characterLoraId}
            onChange={(e) => void saveLoras(e.target.value, styleLoraId)}
          >
            <option value="">None</option>
            {characterAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>{asset.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 flex-shrink-0">Style LoRA</span>
          <select
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-xs text-zinc-200 outline-none"
            value={styleLoraId}
            onChange={(e) => void saveLoras(characterLoraId, e.target.value)}
          >
            <option value="">None</option>
            {styleAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>{asset.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 flex-shrink-0">Genre</span>
          <select
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-xs text-zinc-200 outline-none"
            value={genrePresetId}
            onChange={(e) => void saveGenrePreset(e.target.value)}
          >
            <option value="">None (free preset)</option>
            {GENRE_FAMILIES.map((family) => (
              <optgroup key={family} label={family}>
                {GENRE_PRESETS.filter((row) => row.family === family).map((row) => (
                  <option key={row.id} value={row.id}>{row.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <select aria-label="Shot size" className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-xs text-zinc-200 outline-none" value={shotSize} onChange={(e) => void saveCamera({ ...currentCamera(), shotSize: e.target.value })}>
            <option value="">Shot size</option>
            {['ECU', 'CU', 'MCU', 'MS', 'MLS', 'WS', 'EWS'].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select aria-label="Camera angle" className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-xs text-zinc-200 outline-none" value={cameraAngle} onChange={(e) => void saveCamera({ ...currentCamera(), cameraAngle: e.target.value })}>
            <option value="">Angle</option>
            {['eye level', 'low angle', 'high angle', 'dutch', 'overhead', 'pov'].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select aria-label="Camera move" className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-xs text-zinc-200 outline-none" value={cameraMove} onChange={(e) => void saveCamera({ ...currentCamera(), cameraMove: e.target.value })}>
            <option value="">Move</option>
            {['static', 'push in', 'pull out', 'pan left', 'pan right', 'tilt up', 'tilt down', 'dolly in', 'dolly out', 'truck left', 'truck right', 'crane up', 'crane down', 'orbit', 'handheld'].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select aria-label="Lens" className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-xs text-zinc-200 outline-none" value={lensFeel} onChange={(e) => void saveCamera({ ...currentCamera(), lensFeel: e.target.value })}>
            <option value="">Lens</option>
            {['wide', 'normal', 'telephoto', '24mm wide', '35mm', '50mm', '85mm portrait', 'anamorphic'].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select aria-label="Camera speed" className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-xs text-zinc-200 outline-none" value={cameraSpeed} onChange={(e) => void saveCamera({ ...currentCamera(), cameraSpeed: e.target.value })}>
            <option value="">Speed</option>
            {['slow', 'medium', 'fast', 'normal', 'slow motion', 'speed ramp'].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          {lastFrameGate.visible ? (
            <input
              aria-label="End frame URL"
              className="col-span-2 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-xs text-zinc-200 outline-none"
              placeholder="End frame URL"
              value={endFrameUrl}
              onChange={(e) => setEndFrameUrl(e.target.value)}
              onBlur={() => void saveCamera(currentCamera())}
            />
          ) : endFrameUrl.trim() ? (
            <>
              <input
                aria-label="End frame URL"
                disabled
                className="col-span-2 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-zinc-500 outline-none"
                value={endFrameUrl}
              />
              <p className="col-span-2 text-[10px] text-zinc-500">
                {lastFrameGate.reason ?? 'This model has no last-frame field. The URL is kept and not sent.'}
              </p>
            </>
          ) : null}
          <label className="flex items-center gap-1.5 text-[10px] text-zinc-400">
            <input type="checkbox" checked={cameraPrecision} onChange={(e) => void saveCamera({ ...currentCamera(), cameraPrecision: e.target.checked })} />
            Camera-precise model
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-zinc-400 col-span-2">
            <input
              type="checkbox"
              checked={moneyShot}
              onChange={(e) => void saveMoneyShot(e.target.checked)}
            />
            Money shot — raise this shot’s quality tier
          </label>
        </div>
        {shot.cameraSource === 'ai' && <p className="text-[10px] text-zinc-500">Camera proposed by the director. A change here is kept.</p>}
        {identityError && <p className="text-[10px] text-red-400">{identityError}</p>}

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 flex-shrink-0">Model</span>
          <select
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-xs text-zinc-200 outline-none"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="__auto__">Auto</option>
            {selectedModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
            {model !== '__auto__' && !selectedModels.includes(model) && <option value={model}>{model}</option>}
          </select>
        </div>
        {model === '__auto__' && (
          <p
            className="text-[10px] text-zinc-500"
            title={shot.delegationReason ?? undefined}
          >
            {shot.delegationReason
              ? `Why this model: ${shot.delegationReason}`
              : 'Auto routes a model by purpose and quality tier. Native audio only if that model is Grok; every other model is silent.'}
          </p>
        )}
        {tool && (
          <div className="space-y-1.5">
            <p className="text-[10px] text-zinc-500">{tool.panels.join(' · ')}</p>
            {tool.referenceSlots.length > 0 && (
              <div className="flex gap-1 overflow-x-auto">
                {tool.referenceSlots.map((slot) => (
                  <img key={slot.url} src={slot.url} alt={slot.label} title={slot.label} className="w-8 h-8 rounded object-cover flex-shrink-0" />
                ))}
              </div>
            )}
            {tool.identityNeedsTrueReference && (
              <button
                type="button"
                onClick={() => setModel(IDENTITY_REFERENCE_MODEL)}
                className="text-[10px] text-amber-300 text-left"
              >
                Identity needs a reference model. Use Seedance.
              </button>
            )}
            {tool.panels.includes('first_last_frame') && tool.referenceSlots.length > 0 && (
              <p className="text-[10px] text-zinc-500">Last frame is held while character references are attached.</p>
            )}
            {modelSilent ? (
              <p className="text-[10px] text-zinc-500">This model generates silent video — audio added in the Audio stage</p>
            ) : (
              <p className="text-[10px] text-zinc-400">This model: native synchronized audio (Grok)</p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleDirect()}
          disabled={directing || !prompt.trim()}
          className="w-full bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 rounded-lg flex items-center justify-center gap-2"
        >
          {directing ? (
            <>
              <span className="animate-spin">⟳</span>
              Generating…
            </>
          ) : (
            <>▶ Direct Shot {shot.shotNumber}</>
          )}
        </button>
      </div>
    </div>
  )
}
