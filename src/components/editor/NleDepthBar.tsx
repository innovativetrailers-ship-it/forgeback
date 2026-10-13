'use client'

import { useEffect, useState } from 'react'
import type { TimelineRecipe } from '@/lib/timeline/schema'
import {
  addAdjustment,
  applyLookPreset,
  attachProxy,
  exportPresetJson,
  favouritePreset,
  importPresetJson,
  nestSequence,
  removeTimelineClip,
  saveLookPreset,
  setEditWithProxies,
  type LookPreset,
} from '@/lib/timeline/nleDepth'
import { alignCutsToBeats, detectBeats, withBeatMarkers } from '@/lib/editor/gapFixes'
import { GENERATIVE_EDIT_CREDITS } from '@/lib/timeline/timeRemap'

const STORAGE_KEY = 'cinema-look-presets'

export function NleDepthBar({
  recipe,
  playhead,
  selectedClipId,
  onCommit,
}: {
  recipe: TimelineRecipe
  playhead: number
  selectedClipId: string | null
  onCommit: (recipe: TimelineRecipe) => void
}) {
  const clip = recipe.tracks.flatMap((track) => track.clips).find((row) => row.id === selectedClipId)
  const [presets, setPresets] = useState<LookPreset[]>([])
  const [note, setNote] = useState('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setPresets(JSON.parse(raw) as LookPreset[])
    } catch (err) {
      console.warn('[look-preset]', err instanceof Error ? err.message : err)
    }
  }, [])
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(presets)) }, [presets])

  return (
    <div className="basis-full flex flex-wrap gap-1 border-b border-white/10 pb-2">
      <button
        type="button"
        className="rounded bg-white/10 px-2 py-1"
        onClick={() => onCommit(setEditWithProxies(recipe, !recipe.editWithProxies))}
      >
        {recipe.editWithProxies ? 'Proxies on' : 'Edit with proxies'}
      </button>
      <button
        type="button"
        className="rounded bg-white/10 px-2 py-1"
        disabled={!clip?.sourceUrl}
        onClick={() => {
          if (!clip?.sourceUrl) return
          setNote('Transcoding a proxy. The full-res source stays.')
          void fetch('/api/timeline/offline-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceUrl: clip.sourceUrl }),
          }).then(async (res) => {
            const body = await res.json() as { proxyUrl?: string; error?: string }
            if (!res.ok || !body.proxyUrl) {
              setNote(body.error ?? 'Proxy transcode failed')
              return
            }
            onCommit(attachProxy(recipe, clip.id, body.proxyUrl))
            setNote('Proxy attached. Export still uses full resolution.')
          }).catch((err: unknown) => {
            console.warn('[proxy]', err instanceof Error ? err.message : err)
            setNote('Proxy transcode failed')
          })
        }}
      >
        Make proxy
      </button>
      <button
        type="button"
        className="rounded bg-white/10 px-2 py-1"
        onClick={() => {
          const energy = clip?.metadata?.energy
          if (!Array.isArray(energy)) {
            setNote('This clip has no energy samples to detect beats from.')
            return
          }
          const beats = detectBeats(energy.filter((value): value is number => typeof value === 'number'), 0.25)
          onCommit(withBeatMarkers(recipe, beats))
          setNote(`${beats.length} beat markers.`)
        }}
      >
        Detect beats
      </button>
      <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => onCommit(alignCutsToBeats(recipe, (recipe.markers ?? []).map((marker) => marker.time)))}>
        Snap cuts to beats
      </button>
      <button
        type="button"
        className="rounded bg-white/10 px-2 py-1"
        disabled={!clip}
        onClick={() => clip && onCommit(addAdjustment(recipe, clip.startTime, clip.endTime, { colourGrade: clip.colourGrade, effects: clip.effects }))}
      >
        Adjustment
      </button>
      <button
        type="button"
        className="rounded bg-white/10 px-2 py-1"
        onClick={() => {
          try {
            onCommit(nestSequence(recipe, { ...recipe, id: `nest-${recipe.id}` }, playhead, playhead + 4))
            setNote('Nested sequence added.')
          } catch (err) {
            console.warn('[nest]', err instanceof Error ? err.message : err)
            setNote(err instanceof Error ? err.message : 'Could not nest')
          }
        }}
      >
        Nest sequence
      </button>
      {clip?.adjustment && (
        <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => onCommit(removeTimelineClip(recipe, clip.id))}>
          Remove adjustment
        </button>
      )}
      <button
        type="button"
        className="rounded bg-white/10 px-2 py-1"
        disabled={!clip}
        onClick={() => {
          if (!clip) return
          const name = window.prompt('Preset name', 'Look') ?? ''
          if (!name.trim()) return
          setPresets((current) => [saveLookPreset(name, clip), ...current])
        }}
      >
        Save look
      </button>
      {presets.map((preset) => (
        <span key={preset.id} className="flex gap-1">
          <button
            type="button"
            className="rounded bg-white/10 px-2 py-1"
            disabled={!clip}
            onClick={() => {
              if (!clip) return
              const applied = applyLookPreset(clip, preset)
              if (applied.metered) {
                setNote(`This preset uses a model op. ${GENERATIVE_EDIT_CREDITS} credits. It is not applied for free.`)
                return
              }
              onCommit({
                ...recipe,
                tracks: recipe.tracks.map((track) => ({
                  ...track,
                  clips: track.clips.map((row) => row.id === clip.id ? applied.clip : row),
                })),
              })
            }}
          >
            {preset.favourite ? '★ ' : ''}{preset.name}
          </button>
          <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => setPresets((current) => favouritePreset(current, preset.id))}>Fav</button>
          <button
            type="button"
            className="rounded bg-white/10 px-2 py-1"
            onClick={() => void navigator.clipboard.writeText(exportPresetJson(preset))}
          >
            Export
          </button>
        </span>
      ))}
      <label className="rounded bg-white/10 px-2 py-1">
        Import look
        <input
          className="hidden"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            void file.text().then((text) => {
              const preset = importPresetJson(text)
              if (!preset) {
                setNote('That file is not a look preset.')
                return
              }
              setPresets((current) => [preset, ...current.filter((row) => row.id !== preset.id)])
            }).catch((err: unknown) => {
              console.warn('[look-preset]', err instanceof Error ? err.message : err)
            })
          }}
        />
      </label>
      {note && <p className="basis-full text-white/50">{note}</p>}
    </div>
  )
}
