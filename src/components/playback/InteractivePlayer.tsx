'use client'

// Interactive live-editing layer on top of the existing VideoPreview.
// "Live Edit" toggles a WebGL grade overlay + selection tools that run AI
// frame edits (remove / fill / correct / relight / gore) via /api/clips/ai-edit.
// When disabled, this renders VideoPreview unchanged — basic playback is intact.

import { useRef, useEffect, useState, useCallback } from 'react'
import {
  MousePointer2, Lasso, Pentagon, Sun, Paintbrush, Skull, Sliders, Loader2, X,
} from 'lucide-react'
import { VideoPreview } from '@/components/editor/VideoPreview'
import type { Clip, Track } from '@/lib/timeline/schema'
import { initGradeGL, type GradeRenderer } from '@/lib/playback/gradeShader'
import { createToolState, initToolCanvas } from '@/lib/playback/toolCanvas'
import {
  removeObject, fillWithPrompt, correctDefects, relightFrame, addGoreEffect,
} from '@/lib/playback/aiTools'
import type {
  ActiveTool, SelectionMask, MaskOperation, LiveGradeParams, RelightParams,
} from '@/lib/playback/interactiveTypes'
import { GRADE_KEYS } from '@/lib/playback/interactiveTypes'

interface ActiveJob {
  jobId: string
  clipId: string
  progress?: number
  message?: string
}

interface Props {
  clips: Clip[]
  tracks?: Track[]
  playheadTime: number
  isPlaying: boolean
  duration: number
  activeJobs: ActiveJob[]
  onPlayPause: () => void
  onSeek: (t: number) => void
  onSkipToStart: () => void
  onSkipToEnd: () => void
  onPlaybackEnded?: () => void
  /** Persist an AI-edited frame URL onto the active clip. */
  onClipEdited?: (clipId: string, url: string) => void
}

const DEFAULT_GRADE: LiveGradeParams = {
  exposure: 0, contrast: 0, saturation: 1, temperature: 0,
  tint: 0, shadows: 0, highlights: 0, vignette: 0,
}
const DEFAULT_RELIGHT: RelightParams = {
  direction: { x: 0, y: -0.5 }, intensity: 1.0, colorTemp: 5600, ambient: 0.3,
}

const TOOLS: { id: ActiveTool; icon: React.ReactNode; tip: string; key: string }[] = [
  { id: 'select',  icon: <MousePointer2 className="w-4 h-4" />, tip: 'Select',     key: 'V' },
  { id: 'lasso',   icon: <Lasso className="w-4 h-4" />,         tip: 'Lasso',      key: 'L' },
  { id: 'polygon', icon: <Pentagon className="w-4 h-4" />,      tip: 'Polygon',    key: 'P' },
  { id: 'relight', icon: <Sun className="w-4 h-4" />,           tip: 'Relight',    key: 'R' },
  { id: 'defect',  icon: <Paintbrush className="w-4 h-4" />,    tip: 'Fix Defect', key: 'D' },
  { id: 'gore',    icon: <Skull className="w-4 h-4" />,         tip: 'Gore FX',    key: 'G' },
  { id: 'grade',   icon: <Sliders className="w-4 h-4" />,       tip: 'Grade',      key: 'A' },
]

const GRADE_RANGES: Record<keyof LiveGradeParams, [number, number, string]> = {
  exposure:    [-3, 3, 'Exposure'],
  contrast:    [-1, 1, 'Contrast'],
  saturation:  [0, 3, 'Saturation'],
  temperature: [-1, 1, 'Temp'],
  tint:        [-1, 1, 'Tint'],
  shadows:     [-1, 1, 'Shadows'],
  highlights:  [-1, 1, 'Highs'],
  vignette:    [0, 1, 'Vignette'],
}

const GORE_PRESETS = [
  { id: 'gunshot wound', label: 'Gunshot Wound' },
  { id: 'laceration', label: 'Laceration' },
  { id: 'burn', label: 'Burn' },
  { id: 'bruise', label: 'Bruise / Contusion' },
  { id: 'blood splatter', label: 'Blood Splatter' },
  { id: 'custom', label: 'Custom prompt…' },
]

const CURSORS: Record<ActiveTool, string> = {
  select: 'cursor-default', lasso: 'cursor-crosshair', polygon: 'cursor-crosshair',
  relight: 'cursor-grab', defect: 'cursor-cell', gore: 'cursor-crosshair', grade: 'cursor-default',
}

export function InteractivePlayer(props: Props) {
  const { clips, onClipEdited } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const gradeRef = useRef<HTMLCanvasElement>(null)
  const toolRef = useRef<HTMLCanvasElement>(null)
  const glRef = useRef<GradeRenderer | null>(null)
  const toolState = useRef(createToolState())

  const [editMode, setEditMode] = useState(false)
  const [activeTool, setActiveTool] = useState<ActiveTool>('select')
  const [grade, setGrade] = useState<LiveGradeParams>(DEFAULT_GRADE)
  const [relight, setRelight] = useState<RelightParams>(DEFAULT_RELIGHT)
  const [processing, setProcessing] = useState(false)
  const [processLabel, setProcessLabel] = useState('')
  const [pendingMask, setPendingMask] = useState<SelectionMask | null>(null)
  const [gorePreset, setGorePreset] = useState('gunshot wound')
  const [goreIntensity, setGoreIntensity] = useState<'light' | 'medium' | 'heavy'>('medium')
  const [customPrompt, setCustomPrompt] = useState('')
  const [editHistory, setEditHistory] = useState<{ clipId: string; url: string }[]>([])

  const activeClip = clips
    .filter((c) => c.sourceUrl && c.startTime <= props.playheadTime && c.endTime >= props.playheadTime)
    .sort((a, b) => b.startTime - a.startTime)[0] ?? null

  const getVideo = useCallback(
    () => containerRef.current?.querySelector('video') as HTMLVideoElement | null,
    [],
  )

  useEffect(() => { toolState.current.activeTool = activeTool }, [activeTool])

  const gradeLive = useRef(grade)
  gradeLive.current = grade

  // One WebGL context for the grade overlay. Recreated only when edit mode toggles.
  useEffect(() => {
    if (!editMode || !gradeRef.current) return
    const v = getVideo()
    if (!v) return
    const renderer = initGradeGL(gradeRef.current, v)
    glRef.current = renderer
    if (!renderer) return
    let raf = 0
    let running = true
    const loop = () => {
      if (!running) return
      renderer.render(gradeLive.current)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      running = false
      cancelAnimationFrame(raf)
      renderer.dispose()
      glRef.current = null
    }
  }, [editMode, getVideo])

  // Selection / brush / relight-drag interaction.
  useEffect(() => {
    if (!editMode || !toolRef.current) return
    return initToolCanvas(
      toolRef.current,
      toolState.current,
      (mask) => setPendingMask(mask),
      (params) => setRelight((r) => ({ ...r, ...params })),
    )
  }, [editMode])

  const applyEdit = useCallback((url: string) => {
    if (!activeClip || !onClipEdited) return
    setEditHistory((h) => [...h, { clipId: activeClip.id, url: activeClip.sourceUrl }])
    onClipEdited(activeClip.id, url)
  }, [activeClip, onClipEdited])

  const processWithAI = useCallback(async (operation: MaskOperation, mask: SelectionMask) => {
    const v = getVideo()
    if (!v) return
    setProcessing(true)
    try {
      let url: string | undefined
      if (operation === 'remove') { setProcessLabel('Removing object…'); url = await removeObject(v, mask) }
      else if (operation === 'fill_ai') { setProcessLabel('Generating fill…'); url = await fillWithPrompt(v, mask, customPrompt || 'seamless fill') }
      else if (operation === 'correct') { setProcessLabel('Correcting defects…'); url = await correctDefects(v, mask) }
      else if (operation === 'relight_mask') { setProcessLabel('Relighting…'); url = await relightFrame(v, relight) }
      else if (operation === 'add_gore') {
        const preset = gorePreset === 'custom' ? customPrompt : gorePreset
        setProcessLabel(`Adding ${preset}…`)
        url = await addGoreEffect(v, mask, preset, goreIntensity)
      }
      if (url) applyEdit(url)
    } catch (err) {
      console.error('[interactive-player]', err instanceof Error ? err.message : String(err))
    } finally {
      setProcessing(false)
      setProcessLabel('')
      setPendingMask(null)
    }
  }, [getVideo, customPrompt, relight, gorePreset, goreIntensity, applyEdit])

  const applyRelight = useCallback(async () => {
    const v = getVideo()
    if (!v) return
    setProcessing(true)
    setProcessLabel('Relighting…')
    try {
      const url = await relightFrame(v, relight)
      if (url) applyEdit(url)
    } catch (err) {
      console.error('[interactive-player]', err instanceof Error ? err.message : String(err))
    } finally {
      setProcessing(false)
      setProcessLabel('')
    }
  }, [getVideo, relight, applyEdit])

  const undo = useCallback(() => {
    const last = editHistory[editHistory.length - 1]
    if (!last) return
    setEditHistory((h) => h.slice(0, -1))
    onClipEdited?.(last.clipId, last.url)
  }, [editHistory, onClipEdited])

  const POPUP_ACTIONS: { op: MaskOperation; label: string }[] = [
    { op: 'remove', label: 'Remove Object' },
    { op: 'fill_ai', label: 'AI Fill…' },
    { op: 'correct', label: 'Fix Defects' },
    { op: 'relight_mask', label: 'Relight Area' },
    { op: 'add_gore', label: 'Add Gore FX' },
  ]

  return (
    <div className="flex flex-col bg-[#070d1a]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/8">
        <span className="text-[11px] text-white/50 font-medium">Preview</span>
        <button
          onClick={() => setEditMode((e) => !e)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition ${
            editMode
              ? 'bg-[#00e5c8]/20 text-[#00e5c8] border border-[#00e5c8]/30'
              : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
          }`}
        >
          <Sliders className="w-3 h-3" />
          {editMode ? 'Exit Edit Mode' : 'Live Edit'}
        </button>
      </div>

      <div className="flex">
        {editMode && (
          <div className="flex flex-col gap-1 p-1.5 border-r border-white/8 bg-[#0d1425]">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                title={`${t.tip} (${t.key})`}
                onClick={() => setActiveTool(t.id)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${
                  activeTool === t.id
                    ? 'bg-[#00e5c8]/20 text-[#00e5c8]'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/8'
                }`}
              >
                {t.icon}
              </button>
            ))}
          </div>
        )}

        <div ref={containerRef} className="relative flex-1 min-w-0 bg-black">
          <VideoPreview {...props} />

          {editMode && (
            <>
              <canvas ref={gradeRef} className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
              <canvas
                ref={toolRef}
                className={`absolute inset-0 w-full h-full ${CURSORS[activeTool]}`}
                style={{ zIndex: 10 }}
              />

              {processing && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-20">
                  <Loader2 className="w-8 h-8 text-[#00e5c8] animate-spin mb-3" />
                  <p className="text-sm text-[#00e5c8] font-medium">{processLabel}</p>
                  <p className="text-[10px] text-white/40 mt-1">Forge Intelligence processing…</p>
                </div>
              )}

              {pendingMask && !processing && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 bg-[#0d1425] border border-[#00e5c8]/30 rounded-xl p-3 flex flex-col gap-2 shadow-2xl min-w-[220px]">
                  <p className="text-[11px] text-[#00e5c8] font-semibold text-center mb-1">
                    Selection ready — choose action:
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {POPUP_ACTIONS.map((a) => (
                      <button
                        key={a.op}
                        onClick={() => processWithAI(a.op, pendingMask)}
                        className="px-2 py-1.5 rounded-lg bg-white/5 hover:bg-[#00e5c8]/15 text-[11px] text-white/80 hover:text-white text-center transition"
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                  <input
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Custom fill prompt…"
                    className="mt-1 px-2 py-1 rounded-lg bg-[#0a0f1a] border border-white/10 text-[11px] text-white placeholder-white/25 outline-none focus:border-[#00e5c8]/40"
                  />
                  <button
                    onClick={() => setPendingMask(null)}
                    className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 mx-auto mt-1"
                  >
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {editMode && (
          <div className="w-52 border-l border-white/8 bg-[#0d1425] overflow-y-auto flex flex-col gap-3 p-3 text-[11px]">
            <div>
              <p className="font-semibold text-white/60 uppercase tracking-wider text-[10px] mb-2">Live Grade</p>
              {GRADE_KEYS.map((k) => {
                const [mn, mx, label] = GRADE_RANGES[k]
                return (
                  <div key={k} className="flex items-center gap-2 mb-1.5">
                    <span className="text-white/40 w-14 truncate">{label}</span>
                    <input
                      type="range" min={mn} max={mx} step={0.01}
                      value={grade[k]}
                      onChange={(e) => setGrade((g) => ({ ...g, [k]: parseFloat(e.target.value) }))}
                      className="flex-1 h-1 accent-[#00e5c8]"
                    />
                    <span className="text-white/30 w-8 text-right tabular-nums">{grade[k].toFixed(2)}</span>
                  </div>
                )
              })}
              <button onClick={() => setGrade(DEFAULT_GRADE)} className="text-[10px] text-white/25 hover:text-white/50 mt-1">
                Reset grade
              </button>
            </div>

            {activeTool === 'relight' && (
              <div className="border-t border-white/8 pt-3">
                <p className="font-semibold text-white/60 uppercase tracking-wider text-[10px] mb-2">Relight</p>
                <p className="text-white/30 text-[10px] mb-2">Drag on the frame to set direction</p>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-white/40 w-14">Intensity</span>
                  <input type="range" min={0} max={2} step={0.05} value={relight.intensity}
                    onChange={(e) => setRelight((r) => ({ ...r, intensity: parseFloat(e.target.value) }))}
                    className="flex-1 h-1 accent-[#00e5c8]" />
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-white/40 w-14">Temp</span>
                  <input type="range" min={2000} max={8000} step={100} value={relight.colorTemp}
                    onChange={(e) => setRelight((r) => ({ ...r, colorTemp: parseFloat(e.target.value) }))}
                    className="flex-1 h-1 accent-[#00e5c8]" />
                </div>
                <button onClick={applyRelight}
                  className="w-full mt-2 py-1.5 rounded-lg bg-[#00e5c8]/20 text-[#00e5c8] text-[11px] font-semibold hover:bg-[#00e5c8]/30">
                  Apply Relight
                </button>
              </div>
            )}

            {activeTool === 'gore' && (
              <div className="border-t border-white/8 pt-3">
                <p className="font-semibold text-white/60 uppercase tracking-wider text-[10px] mb-2">Gore / Wound FX</p>
                <p className="text-white/30 text-[10px] mb-2">Paint over the area, then release to apply</p>
                <div className="space-y-1 mb-2">
                  {GORE_PRESETS.map((p) => (
                    <button key={p.id} onClick={() => setGorePreset(p.id)}
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] transition ${
                        gorePreset === p.id ? 'bg-[#00e5c8]/15 text-[#00e5c8]' : 'text-white/50 hover:bg-white/5'
                      }`}>
                      {p.label}
                    </button>
                  ))}
                </div>
                {gorePreset === 'custom' && (
                  <input value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Describe the wound/effect…"
                    className="w-full px-2 py-1.5 rounded-lg bg-[#0a0f1a] border border-white/10 text-[11px] text-white placeholder-white/25 outline-none mb-2" />
                )}
                <div className="flex gap-1">
                  {(['light', 'medium', 'heavy'] as const).map((v) => (
                    <button key={v} onClick={() => setGoreIntensity(v)}
                      className={`flex-1 py-1 rounded-md text-[10px] font-medium transition ${
                        goreIntensity === v ? 'bg-[#00e5c8]/20 text-[#00e5c8]' : 'bg-white/5 text-white/40'
                      }`}>{v}</button>
                  ))}
                </div>
              </div>
            )}

            {activeTool === 'defect' && (
              <div className="border-t border-white/8 pt-3">
                <p className="font-semibold text-white/60 uppercase tracking-wider text-[10px] mb-2">Defect Correction</p>
                <p className="text-white/30 text-[10px]">Paint over artifacts or generation defects, then release — AI corrects the region.</p>
              </div>
            )}

            {editHistory.length > 0 && (
              <button onClick={undo} className="mt-auto text-[10px] text-white/30 hover:text-white/60">
                ↩ Undo last edit ({editHistory.length})
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
