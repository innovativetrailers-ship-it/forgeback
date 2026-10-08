'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { KEYMAP_PRESET_IDS, KEYMAP_PRESET_LABELS, migrateKeymapPreset, type KeymapPresetId } from '@cinema/core'
import { WorkspaceTool } from '@/components/editor/WorkspaceTool'
import { useUIStore } from '@/store/ui'
import { TimelineDockProvider, type TimelineDockMode } from '@/components/editor/timelineDock'
import { DockviewReact, type DockviewApi, type DockviewReadyEvent, type IDockviewPanelProps } from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'
import {
  KEYMAP_PRESETS,
  LOCAL_TRANSITIONS,
  WORKSPACES,
  addTitle,
  applyLocalTransition,
  chordFromEvent,
  commandFor,
  duplicateClip,
  exportKeymap,
  importKeymap,
  ensureOverlayTrack,
  rippleDelete,
  setClipSpeed,
  setClipVolume,
  threePointEdit,
  type KeyCommand,
  type Keymap,
  type WorkspaceName,
} from '@/lib/editor/foundation'
import type { TimelineRecipe } from '@/lib/timeline/schema'
import { TemplateGallery } from '@/components/editor/TemplateGallery'
import { TranscriptPanel } from '@/components/editor/TranscriptPanel'
import { ExtensionManager } from '@/components/editor/ExtensionManager'
import { NleDepthBar } from '@/components/editor/NleDepthBar'
import { gradeHasDesktopDepth } from '@cinema/core'
import { FILM_EMULATION_LUTS } from '@/lib/studio/filmLuts'
import { placeSoundscape, placeSpeakerRanges } from '@/lib/editor/gapFixes'
import { GENERATIVE_EDIT_CREDITS, SNAP_TO_CUT } from '@/lib/timeline/timeRemap'
import { KEY_COMMANDS } from '@/lib/editor/keymap'

interface Frame {
  program: ReactNode
  timeline: ReactNode
  inspector: ReactNode
  recipe: TimelineRecipe
  playhead: number
  selectedClipId: string | null
  onCommit: (recipe: TimelineRecipe) => void
  onSeek: (time: number) => void
  onPlayPause: () => void
  onSplit: (clipId: string, at: number) => void
  onUndo: () => void
  onRedo: () => void
  sourceId: string | null
  setSourceId: (id: string | null) => void
  marks: { inn: number; out: number }
  setMarks: (marks: { inn: number; out: number }) => void
}

const EditorFrameContext = createContext<Frame | null>(null)

function useFrame(): Frame {
  const frame = useContext(EditorFrameContext)
  if (!frame) throw new Error('Editor panel is outside the dock')
  return frame
}

function ProgramPanel(_props: IDockviewPanelProps) {
  return <div className="h-full overflow-hidden">{useFrame().program}</div>
}
function TimelinePanel(_props: IDockviewPanelProps) {
  return <div className="flex h-full min-h-0 flex-col overflow-hidden">{useFrame().timeline}</div>
}
function InspectorPanel(_props: IDockviewPanelProps) {
  return <div className="h-full overflow-auto">{useFrame().inspector}</div>
}

function SourcePanel(_props: IDockviewPanelProps) {
  const frame = useFrame()
  const clips = frame.recipe.tracks.flatMap((track) => track.clips).filter((clip) => clip.sourceUrl)
  const source = clips.find((clip) => clip.id === frame.sourceId) ?? null
  return (
    <div className="flex h-full flex-col gap-2 overflow-auto p-2 text-[11px] text-white/70">
      <p className="text-[10px] uppercase tracking-wide text-white/40">Source</p>
      <select
        className="rounded border border-white/10 bg-black/40 px-1 py-1"
        value={frame.sourceId ?? ''}
        onChange={(event) => frame.setSourceId(event.target.value || null)}
      >
        <option value="">Load a clip</option>
        {clips.map((clip) => (
          <option key={clip.id} value={clip.id}>{clip.prompt || clip.id}</option>
        ))}
      </select>
      <div className="flex gap-1">
        <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => frame.setMarks({ ...frame.marks, inn: frame.playhead })}>Mark in</button>
        <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => frame.setMarks({ ...frame.marks, out: frame.playhead })}>Mark out</button>
      </div>
      <p>In {frame.marks.inn.toFixed(1)}s · Out {frame.marks.out.toFixed(1)}s</p>
      {source && (
        <div className="flex flex-wrap gap-1">
          {(['insert', 'overwrite', 'replace', 'append'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className="rounded bg-white/10 px-2 py-1 capitalize"
              onClick={() => {
                const track = frame.recipe.tracks.find((row) => row.type === 'video' && !row.locked)
                if (!track) return
                frame.onCommit(threePointEdit(frame.recipe, {
                  source,
                  trackId: track.id,
                  srcIn: frame.marks.inn,
                  srcOut: Math.max(frame.marks.out, frame.marks.inn + 0.5),
                  tlIn: frame.playhead,
                  tlOut: null,
                  mode,
                }))
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TransitionPanel(_props: IDockviewPanelProps) {
  const frame = useFrame()
  return (
    <div className="flex h-full flex-col gap-1 overflow-auto p-2 text-[11px] text-white/70">
      <p className="text-[10px] uppercase tracking-wide text-white/40">Transitions</p>
      <p>Applies on the selected clip. These are local. A generative bridge is a separate take.</p>
      <div className="flex flex-wrap gap-1">
        {LOCAL_TRANSITIONS.map((type) => (
          <button
            key={type}
            type="button"
            className="rounded bg-white/10 px-2 py-1"
            disabled={!frame.selectedClipId}
            onClick={() => {
              if (!frame.selectedClipId) return
              frame.onCommit(applyLocalTransition(frame.recipe, frame.selectedClipId, type))
            }}
          >
            {type}
          </button>
        ))}
      </div>
    </div>
  )
}

function TitlePanel(_props: IDockviewPanelProps) {
  const frame = useFrame()
  const [text, setText] = useState('Title')
  return (
    <div className="flex h-full flex-col gap-2 p-2 text-[11px] text-white/70">
      <p className="text-[10px] uppercase tracking-wide text-white/40">Titles</p>
      <input className="rounded border border-white/10 bg-black/40 px-2 py-1" value={text} onChange={(event) => setText(event.target.value)} />
      <button
        type="button"
        className="w-fit rounded bg-white/10 px-2 py-1"
        onClick={() => frame.onCommit(addTitle(frame.recipe, text, frame.playhead, 3))}
      >
        Add title at playhead
      </button>
      <div className="flex gap-1">
        <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => frame.onCommit(ensureOverlayTrack(frame.recipe, 'Overlay'))}>Overlay track</button>
        <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => frame.onCommit(ensureOverlayTrack(frame.recipe, 'Stickers'))}>Sticker track</button>
      </div>
    </div>
  )
}

function ToolsPanel(_props: IDockviewPanelProps) {
  const frame = useFrame()
  const id = frame.selectedClipId
  const clip = frame.recipe.tracks.flatMap((track) => track.clips).find((row) => row.id === id)
  function grade(name: string) {
    if (!id) return
    frame.onCommit({
      ...frame.recipe,
      tracks: frame.recipe.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((row) => row.id === id ? {
          ...row,
          colourGrade: {
            filmEmulation: name as 'kodak_5219',
            lutUrl: FILM_EMULATION_LUTS[name],
            lutIntensity: 1,
            asc_cdl: { lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], saturation: name === 'bw_contrast' ? 0 : 1.1 },
          },
        } : row),
      })),
    })
  }
  function effect(type: 'film_grain' | 'vignette' | 'bloom') {
    if (!id || !clip) return
    const effects = [...(clip.effects ?? []).filter((row) => row.type !== type), { type, intensity: 0.6 }]
    frame.onCommit({
      ...frame.recipe,
      tracks: frame.recipe.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((row) => row.id === id ? { ...row, effects } : row),
      })),
    })
  }
  const [editPrompt, setEditPrompt] = useState('Continue the action')
  const [takeUrl, setTakeUrl] = useState<string | null>(null)
  const [editNote, setEditNote] = useState('')
  const [lastOp, setLastOp] = useState<'fx-inpaint' | 'bridge' | 'extend'>('fx-inpaint')
  const [fast, setFast] = useState(false)
  const [extendSeconds, setExtendSeconds] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [found, setFound] = useState<Array<{ id: string; label: string | null }>>([])
  const [gapArm, setGapArm] = useState<'crosstalk' | 'soundscape' | null>(null)
  async function runGap(op: 'crosstalk' | 'soundscape') {
    try {
    if (op === 'crosstalk' && !clip?.sourceUrl?.startsWith('http')) {
      setEditNote('Crosstalk needs a stored address on the selected clip.')
      return
    }
    if (op === 'soundscape' && !editPrompt.trim()) {
      setEditNote('Describe the soundscape in the prompt field.')
      return
    }
    if (gapArm !== op) {
      const quote = await fetch('/api/studio/audio/gap', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op, confirm: false }),
      })
      const priced = await quote.json() as { estimateCredits?: number; error?: string }
      if (!quote.ok) {
        setEditNote(priced.error || 'Could not price this')
        return
      }
      setGapArm(op)
      setEditNote(`${priced.estimateCredits ?? GENERATIVE_EDIT_CREDITS} credits. Confirm ${op}. The source clip stays.`)
      return
    }
    const res = await fetch('/api/studio/audio/gap', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        op,
        confirm: true,
        audioUrl: clip?.sourceUrl,
        text: editPrompt,
        duration: 8,
      }),
    })
    const body = await res.json() as {
      error?: string
      audioUrl?: string
      takes?: Array<{ speaker: string; start: number; end: number; sourceUrl: string }>
    }
    setGapArm(null)
    if (!res.ok) {
      setEditNote(body.error || 'The audio op did not run')
      return
    }
    if (op === 'soundscape' && body.audioUrl) {
      frame.onCommit(placeSoundscape(frame.recipe, body.audioUrl, clip?.startTime ?? frame.playhead, editPrompt))
      setEditNote('Soundscape added on its own audio track. The picture clip stays.')
      return
    }
    const takes = body.takes ?? []
    if (!takes.length || !clip?.sourceUrl) {
      setEditNote('No speaker ranges came back. The clip stays.')
      return
    }
    frame.onCommit(placeSpeakerRanges(frame.recipe, clip.sourceUrl, takes))
    setEditNote(takes.map((take) => `${take.speaker} ${take.start.toFixed(1)}–${take.end.toFixed(1)}s, same source`).join(' · '))
    } catch (err) {
      console.warn('[gap-audio]', err instanceof Error ? err.message : err)
      setGapArm(null)
      setEditNote('The audio op did not run')
    }
  }
  async function runEdit(op: 'inpaint' | 'bridge' | 'extend') {
    if (!id || !clip?.sourceUrl?.startsWith('http')) {
      setEditNote('The selected clip needs a stored video address.')
      return
    }
    const others = frame.recipe.tracks.flatMap((track) => track.clips).filter((row) => row.id !== id && row.sourceUrl.startsWith('http'))
    setEditNote(`${GENERATIVE_EDIT_CREDITS} credits. Generating a new take. The clip stays until you accept.`)
    setLastOp(op === 'inpaint' ? 'fx-inpaint' : op)
    const res = await fetch('/api/studio/timeline/edit', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        op,
        confirm: true,
        prompt: editPrompt,
        videoUrl: clip.sourceUrl,
        otherVideoUrl: others[0]?.sourceUrl,
        parentClipId: id,
        engine: op === 'inpaint' ? 'inpaint' : 'bridge',
        fast: op === 'bridge' && fast,
      }),
    })
    const body = await res.json() as { takeUrl?: string; error?: string }
    if (!res.ok || !body.takeUrl) {
      setEditNote(body.error || 'The edit did not run')
      return
    }
    setTakeUrl(body.takeUrl)
    setEditNote('Take is in the library. Accept to place it on this clip.')
  }
  useEffect(() => {
    function onOffer(event: Event) {
      const detail = (event as CustomEvent<{ clipId: string; seconds: number }>).detail
      if (!detail || detail.clipId !== id) return
      setExtendSeconds(detail.seconds)
      setEditNote(`Extend +${detail.seconds}s · ${GENERATIVE_EDIT_CREDITS} credits. Confirm to generate a continuation. The clip stays until you accept.`)
    }
    window.addEventListener('cinema:extend-offer', onOffer)
    return () => window.removeEventListener('cinema:extend-offer', onOffer)
  }, [id])
  async function runTool(tool: 'upscale' | 'denoise' | 'sharpen' | 'depth' | 'relight' | 'isolate', scale?: number) {
    if (!id || !clip?.sourceUrl?.startsWith('http')) {
      setEditNote('The selected clip needs a stored video address.')
      return
    }
    setEditNote(`${GENERATIVE_EDIT_CREDITS} credits. The result is a new library take.`)
    const res = await fetch('/api/studio/timeline/edit', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tool,
        confirm: true,
        prompt: editPrompt,
        mood: editPrompt,
        videoUrl: clip.sourceUrl,
        parentClipId: id,
        scale,
      }),
    })
    const body = await res.json() as { takeUrl?: string; error?: string }
    if (!res.ok || !body.takeUrl) {
      setEditNote(body.error || 'The tool did not run')
      return
    }
    setTakeUrl(body.takeUrl)
    setLastOp('fx-inpaint')
    setEditNote(`${tool} take is in the library. Accept places it on this clip.`)
  }
  return (
    <div className="flex h-full flex-wrap content-start gap-1 p-2 text-[11px] text-white/70">
      <NleDepthBar recipe={frame.recipe} playhead={frame.playhead} selectedClipId={id} onCommit={frame.onCommit} />
      {gradeHasDesktopDepth(clip?.colourGrade?.deep) && (
        <p className="basis-full text-white/45">Open on desktop for the full grade.</p>
      )}
      <button type="button" className="rounded bg-white/10 px-2 py-1" disabled={!id} onClick={() => id && frame.onSplit(id, frame.playhead)}>Split</button>
      <button type="button" className="rounded bg-white/10 px-2 py-1" disabled={!id} onClick={() => id && frame.onCommit(duplicateClip(frame.recipe, id))}>Duplicate</button>
      <button type="button" className="rounded bg-white/10 px-2 py-1" disabled={!id} onClick={() => id && frame.onCommit(rippleDelete(frame.recipe, id))}>Ripple delete</button>
      {([0.5, 1, 2] as const).map((speed) => (
        <button key={speed} type="button" className="rounded bg-white/10 px-2 py-1" disabled={!id} onClick={() => id && frame.onCommit(setClipSpeed(frame.recipe, id, speed))}>{speed}×</button>
      ))}
      <button type="button" className="rounded bg-white/10 px-2 py-1" disabled={!id} onClick={() => id && frame.onCommit(setClipVolume(frame.recipe, id, 0.5))}>Volume 50%</button>
      {Object.keys(FILM_EMULATION_LUTS).map((name) => (
        <button key={name} type="button" className="rounded bg-white/10 px-2 py-1" disabled={!id} onClick={() => grade(name)}>{name.replaceAll('_', ' ')}</button>
      ))}
      <button type="button" className="rounded bg-white/10 px-2 py-1" disabled={!id} onClick={() => effect('film_grain')}>Grain</button>
      <button type="button" className="rounded bg-white/10 px-2 py-1" disabled={!id} onClick={() => effect('vignette')}>Vignette</button>
      <button type="button" className="rounded bg-white/10 px-2 py-1" disabled={!id} onClick={() => effect('bloom')}>Bloom</button>
      <button
        type="button"
        className="rounded bg-white/10 px-2 py-1"
        disabled={!id}
        onClick={() => {
          if (!id) return
          frame.onCommit({
            ...frame.recipe,
            tracks: frame.recipe.tracks.map((track) => ({
              ...track,
              clips: track.clips.map((row) => row.id === id ? {
                ...row,
                timeRemap: { enabled: true, keyframes: SNAP_TO_CUT, motionBlur: { amountPct: 60, directionDeg: 0, peakOnly: true } },
              } : row),
            })),
          })
        }}
      >
        Speed ramp
      </button>
      <input className="min-w-32 flex-1 rounded border border-white/10 bg-black/40 px-1" value={editPrompt} onChange={(event) => setEditPrompt(event.target.value)} />
      <button type="button" className="rounded bg-white/10 px-2 py-1" disabled={!id} onClick={() => void runEdit('inpaint')}>Inpaint take · {GENERATIVE_EDIT_CREDITS} cr</button>
      <button type="button" className="rounded bg-white/10 px-2 py-1" disabled={!id} onClick={() => void runEdit('bridge')}>Generative bridge · {GENERATIVE_EDIT_CREDITS} cr</button>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={fast} onChange={(event) => setFast(event.target.checked)} />
        Fast bridge
      </label>
      {extendSeconds != null && (
        <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => void runEdit('extend')}>
          Confirm extend +{extendSeconds}s · {GENERATIVE_EDIT_CREDITS} cr
        </button>
      )}
      <button type="button" className="rounded bg-white/10 px-2 py-1" disabled={!id} onClick={() => void runEdit('extend')}>Extend · {GENERATIVE_EDIT_CREDITS} cr</button>
      <button type="button" className="rounded bg-white/10 px-2 py-1" disabled={!id} onClick={() => void runTool('upscale', 2)}>Upscale 2× · {GENERATIVE_EDIT_CREDITS} cr</button>
      <button type="button" className="rounded bg-white/10 px-2 py-1" disabled={!id} onClick={() => void runTool('denoise')}>Denoise · {GENERATIVE_EDIT_CREDITS} cr</button>
      <button type="button" className="rounded bg-white/10 px-2 py-1" disabled={!id} onClick={() => void runTool('sharpen')}>Sharpen · {GENERATIVE_EDIT_CREDITS} cr</button>
      <button type="button" className="rounded bg-white/10 px-2 py-1" disabled={!id} onClick={() => void runTool('depth')}>Depth · {GENERATIVE_EDIT_CREDITS} cr</button>
      <button type="button" className="rounded bg-white/10 px-2 py-1" disabled={!id} onClick={() => void runTool('relight')}>Relight · {GENERATIVE_EDIT_CREDITS} cr</button>
      <button type="button" className="rounded bg-white/10 px-2 py-1" disabled={!id} onClick={() => void runTool('isolate')}>Isolate voice · {GENERATIVE_EDIT_CREDITS} cr</button>
      <button type="button" className="rounded bg-white/10 px-2 py-1" disabled={!id} onClick={() => void runGap('crosstalk')}>
        {gapArm === 'crosstalk' ? `Confirm crosstalk · ${GENERATIVE_EDIT_CREDITS} cr` : `Separate crosstalk · ${GENERATIVE_EDIT_CREDITS} cr`}
      </button>
      <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => void runGap('soundscape')}>
        {gapArm === 'soundscape' ? `Confirm soundscape · ${GENERATIVE_EDIT_CREDITS} cr` : `Soundscape · ${GENERATIVE_EDIT_CREDITS} cr`}
      </button>
      {(['9:16', '1:1', '4:5', '16:9'] as const).map((aspect) => (
        <button
          key={aspect}
          type="button"
          className="rounded bg-white/10 px-2 py-1"
          disabled={!id}
          onClick={() => {
            if (!id) return
            frame.onCommit({
              ...frame.recipe,
              tracks: frame.recipe.tracks.map((track) => ({
                ...track,
                clips: track.clips.map((row) => row.id === id ? { ...row, reframe: aspect } : row),
              })),
            })
            setEditNote(`Center reframe to ${aspect}. The source file stays. Export crops to that frame.`)
          }}
        >
          {aspect}
        </button>
      ))}
      <button
        type="button"
        className="rounded bg-white/10 px-2 py-1"
        disabled={!id}
        onClick={() => {
          const other = frame.recipe.tracks.flatMap((track) => track.clips).find((row) => row.id !== id && row.colourGrade)
          if (!id || !other?.colourGrade) {
            setEditNote('Colour match needs another clip that already has a grade.')
            return
          }
          frame.onCommit({
            ...frame.recipe,
            tracks: frame.recipe.tracks.map((track) => ({
              ...track,
              clips: track.clips.map((row) => row.id === id ? { ...row, colourGrade: other.colourGrade } : row),
            })),
          })
          setEditNote('Copied the other clip’s grade. The picture file is unchanged.')
        }}
      >
        Match grade
      </button>
      <input
        className="min-w-24 rounded border border-white/10 bg-black/40 px-1"
        placeholder="Search library"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <button
        type="button"
        className="rounded bg-white/10 px-2 py-1"
        onClick={() => {
          void fetch(`/api/studio/timeline/edit?q=${encodeURIComponent(search)}`, { credentials: 'include' })
            .then((res) => res.json())
            .then((body: { items?: Array<{ id: string; label: string | null }> }) => setFound(body.items ?? []))
            .catch((err) => {
              console.warn('[library-search]', err instanceof Error ? err.message : err)
            })
        }}
      >
        Search
      </button>
      {found.map((item) => <span key={item.id} className="text-white/50">{item.label || item.id}</span>)}
      <p className="basis-full text-white/35">Scene cuts are not detected on the gateway. Split a clip at the playhead.</p>
      {takeUrl && (
        <button
          type="button"
          className="rounded bg-[#00e5c8] px-2 py-1 text-black"
          onClick={() => {
            if (!id || !takeUrl) return
            if (lastOp === 'bridge') {
              frame.onCommit({
                ...frame.recipe,
                tracks: frame.recipe.tracks.map((track) => {
                  const index = track.clips.findIndex((row) => row.id === id)
                  if (index < 0) return track
                  const host = track.clips[index]
                  const span = 3
                  const bridge = {
                    ...host,
                    id: `bridge-${Date.now()}`,
                    startTime: host.endTime,
                    endTime: host.endTime + span,
                    sourceUrl: takeUrl,
                    prompt: editPrompt,
                    transition: { type: 'generative-bridge' as const, duration: 0.5 },
                    timeRemap: fast ? { enabled: true, keyframes: SNAP_TO_CUT, motionBlur: { amountPct: 60, directionDeg: 0, peakOnly: true } } : undefined,
                    generativeOp: { type: 'bridge' as const, parentClipId: id, engine: 'kling-video/o1/image-to-video', prompt: editPrompt, accepted: true },
                  }
                  const shifted = track.clips.map((row) => row.startTime >= host.endTime
                    ? { ...row, startTime: row.startTime + span, endTime: row.endTime + span }
                    : row)
                  shifted.splice(index + 1, 0, bridge)
                  return { ...track, clips: shifted }
                }),
              })
              setEditNote('Bridge inserted after this clip. The original stays.')
              return
            }
            frame.onCommit({
              ...frame.recipe,
              tracks: frame.recipe.tracks.map((track) => ({
                ...track,
                clips: track.clips.map((row) => row.id === id ? {
                  ...row,
                  sourceUrl: takeUrl,
                  generativeOp: { type: lastOp, parentClipId: id, engine: lastOp === 'fx-inpaint' ? 'wan-vace-14b/inpainting' : 'kling-video/o1/image-to-video', prompt: editPrompt, accepted: true },
                } : row),
              })),
            })
            setEditNote('Accepted onto this clip. The library take remains.')
          }}
        >
          Accept take
        </button>
      )}
      {editNote && <p className="basis-full text-white/50">{editNote}</p>}
    </div>
  )
}

function TemplatesPanel(_props: IDockviewPanelProps) {
  return (
    <div className="h-full overflow-auto p-2">
      <TemplateGallery onUse={(template) => window.dispatchEvent(new CustomEvent('cinema:use-template', { detail: template }))} />
    </div>
  )
}

function ExtensionsPanel(_props: IDockviewPanelProps) {
  const frame = useFrame()
  return <ExtensionManager recipe={frame.recipe} onCommit={frame.onCommit} />
}

function TranscriptDock(_props: IDockviewPanelProps) {
  const frame = useFrame()
  return <TranscriptPanel recipe={frame.recipe} selectedClipId={frame.selectedClipId} onCommit={frame.onCommit} onSeek={frame.onSeek} />
}

function WorkspaceToolPanel(_props: IDockviewPanelProps) {
  const workspace = useUIStore((state) => state.workspace)
  return <div className="h-full min-h-0 overflow-hidden"><WorkspaceTool workspace={workspace} /></div>
}

const PANELS = {
  program: ProgramPanel,
  timeline: TimelinePanel,
  inspector: InspectorPanel,
  source: SourcePanel,
  transitions: TransitionPanel,
  titles: TitlePanel,
  tools: ToolsPanel,
  templates: TemplatesPanel,
  extensions: ExtensionsPanel,
  transcript: TranscriptDock,
  'workspace-tool': WorkspaceToolPanel,
}

function place(api: DockviewApi, workspace: WorkspaceName) {
  api.clear()
  const toolWorkspace = workspace === 'Colour' || workspace === 'Audio' || workspace === 'VFX' || workspace === 'Compositor' || workspace === 'Motion' || workspace === 'Look-dev' || workspace === 'Review'
  if (toolWorkspace) {
    const tool = api.addPanel({ id: 'workspace-tool', component: 'workspace-tool', title: workspace })
    api.addPanel({ id: 'program', component: 'program', title: 'Program', position: { referencePanel: tool, direction: 'right' } })
    api.addPanel({ id: 'timeline', component: 'timeline', title: 'Timeline', position: { referencePanel: tool, direction: 'below' } })
    api.addPanel({ id: 'inspector', component: 'inspector', title: 'Inspector', position: { referencePanel: 'program', direction: 'below' } })
  } else {
    const program = api.addPanel({ id: 'program', component: 'program', title: 'Program' })
    api.addPanel({ id: 'timeline', component: 'timeline', title: 'Timeline', position: { referencePanel: program, direction: 'below' } })
    if (workspace !== 'Creator') {
      api.addPanel({ id: 'source', component: 'source', title: 'Source', position: { referencePanel: program, direction: 'left' } })
    }
    api.addPanel({ id: 'tools', component: 'tools', title: 'Tools', position: { referencePanel: program, direction: 'right' } })
    api.addPanel({ id: 'inspector', component: 'inspector', title: 'Inspector', position: { referencePanel: 'tools', direction: 'within' } })
    if (workspace === 'Editor' || workspace === 'Creator' || workspace === 'Director') {
      api.addPanel({ id: 'transitions', component: 'transitions', title: 'Transitions', position: { referencePanel: 'inspector', direction: 'within' } })
      api.addPanel({ id: 'titles', component: 'titles', title: 'Titles', position: { referencePanel: 'inspector', direction: 'within' } })
      api.addPanel({ id: 'templates', component: 'templates', title: 'Templates', position: { referencePanel: 'inspector', direction: 'within' } })
      api.addPanel({ id: 'extensions', component: 'extensions', title: 'Extensions', position: { referencePanel: 'inspector', direction: 'within' } })
      api.addPanel({ id: 'transcript', component: 'transcript', title: 'Transcript', position: { referencePanel: 'inspector', direction: 'within' } })
    }
  }
  const lock = workspace === 'Creator'
  api.groups.forEach((group) => { group.locked = lock })
  api.getPanel('timeline')?.api.setConstraints({ minimumHeight: toolWorkspace ? 64 : 80 })
}

export function EditorDock({
  userId,
  program,
  timeline,
  inspector,
  recipe,
  playhead,
  selectedClipId,
  onCommit,
  onSeek,
  onPlayPause,
  onSplit,
  onUndo,
  onRedo,
}: {
  userId: string | null
  program: ReactNode
  timeline: ReactNode
  inspector: ReactNode
  recipe: TimelineRecipe
  playhead: number
  selectedClipId: string | null
  onCommit: (recipe: TimelineRecipe) => void
  onSeek: (time: number) => void
  onPlayPause: () => void
  onSplit: (clipId: string, at: number) => void
  onUndo: () => void
  onRedo: () => void
}) {
  const apiRef = useRef<DockviewApi | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceName>('Creator')
  const [locked, setLocked] = useState(true)
  const [preset, setPreset] = useState<KeymapPresetId>('forge')
  const [keymap, setKeymap] = useState<Keymap>(KEYMAP_PRESETS.forge)
  const [timelineMode, setTimelineMode] = useState<TimelineDockMode>('full')
  const [bindCommand, setBindCommand] = useState<KeyCommand | ''>('')
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [marks, setMarks] = useState({ inn: 0, out: 2 })
  const requested = useUIStore((state) => state.workspace)
  const hydrated = useRef(false)
  const storageKey = `cinema-editor:${userId ?? 'local'}`

  const frame = useMemo<Frame>(() => ({
    program, timeline, inspector, recipe, playhead, selectedClipId,
    onCommit, onSeek, onPlayPause, onSplit, onUndo, onRedo,
    sourceId, setSourceId, marks, setMarks,
  }), [program, timeline, inspector, recipe, playhead, selectedClipId, onCommit, onSeek, onPlayPause, onSplit, onUndo, onRedo, sourceId, marks])

  useEffect(() => {
    const saved = window.localStorage.getItem(`${storageKey}:keys`)
    if (!saved) return
    try {
      const parsed = JSON.parse(saved) as { preset?: string; map?: Keymap }
      const id = migrateKeymapPreset(parsed.preset)
      if (parsed.preset && KEYMAP_PRESETS[id]) setPreset(id)
      if (parsed.map) setKeymap(parsed.map)
    } catch (err) {
      console.warn('[editor] keymap', err instanceof Error ? err.message : err)
    }
  }, [storageKey])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return
      if (bindCommand) {
        event.preventDefault()
        const chord = chordFromEvent(event)
        const next: Keymap = {}
        for (const [key, command] of Object.entries(keymap)) {
          if (command !== bindCommand) next[key] = command
        }
        next[chord] = bindCommand
        setKeymap(next)
        window.localStorage.setItem(`${storageKey}:keys`, JSON.stringify({ preset, map: next }))
        setBindCommand('')
        return
      }
      if (event.key === '\\' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        setTimelineMode((current) => current === 'full' ? 'compact' : current === 'compact' ? 'hidden' : 'full')
        return
      }
      const command = commandFor(keymap, event)
      if (!command) return
      if (command === 'play') onPlayPause()
      if (command === 'pause') onSeek(playhead)
      if (command === 'shuttleForward') onSeek(playhead + 1)
      if (command === 'shuttleBack') onSeek(Math.max(0, playhead - 1))
      if (command === 'markIn') setMarks((current) => ({ ...current, inn: playhead }))
      if (command === 'markOut') setMarks((current) => ({ ...current, out: playhead }))
      if (command === 'blade' || command === 'razor' || command === 'addEdit' || command === 'split') {
        if (selectedClipId) onSplit(selectedClipId, playhead)
      }
      if (command === 'rippleDelete' && selectedClipId) onCommit(rippleDelete(recipe, selectedClipId))
      if (command === 'duplicate' && selectedClipId) onCommit(duplicateClip(recipe, selectedClipId))
      if (command === 'undo') onUndo()
      if (command === 'redo') onRedo()
      if ((command === 'insert' || command === 'overwrite' || command === 'replace' || command === 'append') && sourceId) {
        const source = recipe.tracks.flatMap((track) => track.clips).find((clip) => clip.id === sourceId)
        const track = recipe.tracks.find((row) => row.type === 'video' && !row.locked)
        if (source && track) {
          onCommit(threePointEdit(recipe, {
            source, trackId: track.id, srcIn: marks.inn, srcOut: Math.max(marks.out, marks.inn + 0.5),
            tlIn: playhead, tlOut: null, mode: command,
          }))
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keymap, bindCommand, preset, storageKey, onPlayPause, onSeek, playhead, selectedClipId, onSplit, onCommit, recipe, onUndo, onRedo, sourceId, marks])

  function onReady(event: DockviewReadyEvent) {
    apiRef.current = event.api
    event.api.onDidLayoutChange(() => {
      window.localStorage.setItem(`${storageKey}:layout`, JSON.stringify(event.api.toJSON()))
    })
    const saved = window.localStorage.getItem(`${storageKey}:layout`)
    if (saved) {
      try {
        event.api.fromJSON(JSON.parse(saved))
        return
      } catch (err) {
        console.warn('[editor] layout', err instanceof Error ? err.message : err)
      }
    }
    place(event.api, 'Creator')
  }

  function switchWorkspace(next: WorkspaceName) {
    setWorkspace(next)
    setLocked(next === 'Creator')
    const full = next === 'Creator' || next === 'Director' || next === 'Editor'
    setTimelineMode(full ? 'full' : 'compact')
    useUIStore.getState().setWorkspace(next)
    const api = apiRef.current
    if (!api) return
    place(api, next)
  }

  useEffect(() => {
    if (requested !== workspace) switchWorkspace(requested)
  }, [requested])

  useEffect(() => {
    let cancelled = false
    void fetch('/api/editor/workspaces', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return null
        return res.json() as Promise<{ workspaces?: Array<{ name: string; timelineMode: string; updatedAt: string }> }>
      })
      .then((body) => {
        if (cancelled || !body) return
        const row = body.workspaces?.find((item) => item.name === workspace)
        const local = window.localStorage.getItem(`${storageKey}:timeline-mode`)
        if (row && (!local || row.updatedAt > (window.localStorage.getItem(`${storageKey}:timeline-at`) ?? ''))) {
          if (row.timelineMode === 'full' || row.timelineMode === 'compact' || row.timelineMode === 'hidden') {
            setTimelineMode(row.timelineMode)
          }
        }
        hydrated.current = true
      })
      .catch((err) => {
        console.warn('[workspace]', err instanceof Error ? err.message : err)
        hydrated.current = true
      })
    return () => { cancelled = true }
  }, [storageKey, workspace])

  useEffect(() => {
    if (!hydrated.current) return
    const updatedAt = new Date().toISOString()
    window.localStorage.setItem(`${storageKey}:timeline-at`, updatedAt)
    void fetch('/api/editor/workspaces', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: workspace, timelineMode, updatedAt }),
    }).catch((err) => console.warn('[workspace]', err instanceof Error ? err.message : err))
  }, [workspace, timelineMode, storageKey])

  useEffect(() => {
    const panel = apiRef.current?.getPanel('timeline')
    if (!panel) return
    const height = timelineMode === 'full' ? 280 : timelineMode === 'compact' ? 72 : 28
    panel.api.setConstraints({ minimumHeight: timelineMode === 'hidden' ? 28 : 64 })
    panel.api.setSize({ height })
    window.localStorage.setItem(`${storageKey}:timeline-mode`, timelineMode)
  }, [timelineMode, storageKey])

  function toggleLock() {
    const api = apiRef.current
    if (!api) return
    const next = !locked
    setLocked(next)
    api.groups.forEach((group) => { group.locked = next })
  }

  return (
    <TimelineDockProvider mode={timelineMode} setMode={setTimelineMode}>
    <EditorFrameContext.Provider value={frame}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1 border-b border-white/10 px-2 py-1 text-[10px] text-white/70">
          <select
            className="rounded border border-white/10 bg-black/40 px-1 py-0.5"
            value={workspace}
            onChange={(event) => switchWorkspace(event.target.value as WorkspaceName)}
          >
            {WORKSPACES.map((name) => <option key={name} value={name}>{name === 'Editor' ? 'Edit' : name}</option>)}
          </select>
          <button type="button" className="rounded bg-white/10 px-2 py-0.5" onClick={() => switchWorkspace('Editor')}>Back to Edit</button>
          <button type="button" className="rounded bg-white/10 px-2 py-0.5" onClick={() => {
            setTimelineMode('full')
            void fetch('/api/editor/workspaces', {
              method: 'PUT',
              credentials: 'include',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ name: workspace, timelineMode: 'full', reset: true, updatedAt: new Date().toISOString() }),
            }).catch((err) => console.warn('[workspace]', err instanceof Error ? err.message : err))
            if (apiRef.current) place(apiRef.current, workspace)
          }}>Reset workspace</button>
          <button type="button" className="rounded bg-white/10 px-2 py-0.5" title="Cycle timeline: full, compact, hidden" onClick={() => setTimelineMode((current) => current === 'full' ? 'compact' : current === 'compact' ? 'hidden' : 'full')}>
            Timeline {timelineMode}
          </button>
          <button type="button" className="rounded bg-white/10 px-2 py-0.5" onClick={toggleLock}>{locked ? 'Unlock layout' : 'Lock layout'}</button>
          <button
            type="button"
            className="rounded bg-white/10 px-2 py-0.5"
            onClick={() => {
              const panel = apiRef.current?.getPanel('program')
              if (panel) void apiRef.current?.addPopoutGroup(panel)
            }}
          >
            Pop out program
          </button>
          <select
            className="rounded border border-white/10 bg-black/40 px-1 py-0.5"
            value={preset}
            title={KEYMAP_PRESET_LABELS[preset]}
            onChange={(event) => {
              const name = migrateKeymapPreset(event.target.value)
              setPreset(name)
              setKeymap(KEYMAP_PRESETS[name])
              window.localStorage.setItem(`${storageKey}:keys`, JSON.stringify({ preset: name, map: KEYMAP_PRESETS[name] }))
            }}
          >
            {KEYMAP_PRESET_IDS.map((id) => <option key={id} value={id}>{KEYMAP_PRESET_LABELS[id]}</option>)}
          </select>
          <select
            className="rounded border border-white/10 bg-black/40 px-1 py-0.5"
            value={bindCommand}
            onChange={(event) => setBindCommand(event.target.value as KeyCommand | '')}
          >
            <option value="">Customise keys…</option>
            {KEY_COMMANDS.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <button
            type="button"
            className="rounded bg-white/10 px-2 py-0.5"
            onClick={() => void navigator.clipboard.writeText(exportKeymap(keymap))}
          >
            Export keymap
          </button>
          <button
            type="button"
            className="rounded bg-white/10 px-2 py-0.5"
            onClick={() => {
              const raw = window.prompt('Import keymap file (.kys, .xml, .json)', '') ?? ''
              const next = importKeymap(raw)
              if (!next || !Object.keys(next).length) return
              setKeymap(next)
              window.localStorage.setItem(`${storageKey}:keys`, JSON.stringify({ preset, map: next }))
            }}
          >
            Import keymap
          </button>
          <span className="text-white/35">{bindCommand ? `Press the new key for ${bindCommand}` : 'J K L move · I O mark'}</span>
        </div>
        <div className="min-h-0 flex-1">
          <DockviewReact className="h-full" components={PANELS} onReady={onReady} />
        </div>
      </div>
    </EditorFrameContext.Provider>
    </TimelineDockProvider>
  )
}
