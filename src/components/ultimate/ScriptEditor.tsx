'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useScriptStore } from '@/store/scriptStore'
import { Wand2, Download, Upload, ChevronRight, FileText, Loader2 } from 'lucide-react'

export interface ScriptScene {
  id: string
  heading: string
  action: string
  dialogue: string[]
  characters: string[]
  estimatedDuration: number
}

interface Props {
  onScenesExtracted: (scenes: ScriptScene[]) => void
}

/* Minimal Fountain-like syntax highlighter using CSS classes applied inline */
function highlightFountain(line: string): React.ReactNode {
  const trimmed = line.trim()
  if (/^(INT|EXT|EST|INT\.\/EXT|EXT\.\/INT)[\s.]/i.test(trimmed)) {
    return <span className="text-[#00b8a0] font-bold uppercase tracking-wide">{line}</span>
  }
  if (/^\[/.test(trimmed)) {
    return <span className="text-purple-400 italic">{line}</span>
  }
  if (/^[A-Z][A-Z\s]+$/.test(trimmed) && trimmed.length < 40 && trimmed.length > 2) {
    return <span className="text-cyan-300 font-semibold">{line}</span>
  }
  if (/^\(/.test(trimmed)) {
    return <span className="text-white/40 italic text-sm">{line}</span>
  }
  if (/^>/.test(trimmed)) {
    return <span className="text-green-400 font-mono text-sm">{line.slice(1).trim()}</span>
  }
  if (trimmed === '') return <span>&nbsp;</span>
  return <span className="text-white/70 leading-relaxed">{line}</span>
}

function parseScenes(script: string): ScriptScene[] {
  const lines = script.split('\n')
  const scenes: ScriptScene[] = []
  let current: ScriptScene | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^(INT|EXT|EST|INT\.\/EXT|EXT\.\/INT)[\s.]/i.test(trimmed)) {
      if (current) scenes.push(current)
      current = {
        id: `scene-${scenes.length + 1}`,
        heading: trimmed,
        action: '',
        dialogue: [],
        characters: [],
        estimatedDuration: 0,
      }
    } else if (current) {
      if (/^[A-Z][A-Z\s]+$/.test(trimmed) && trimmed.length < 40 && trimmed.length > 2) {
        if (!current.characters.includes(trimmed)) current.characters.push(trimmed)
      } else if (trimmed && !/^\(/.test(trimmed)) {
        if (/^"/.test(trimmed) || current.characters.length > 0) {
          current.dialogue.push(trimmed)
        } else {
          current.action += (current.action ? ' ' : '') + trimmed
        }
      }
    }
  }
  if (current) scenes.push(current)

  return scenes.map((s) => ({
    ...s,
    estimatedDuration: Math.max(3, Math.round(s.action.split(' ').length / 8 + s.dialogue.length * 2)),
  }))
}

const TEMPLATE = `INT. COFFEE SHOP - DAY

A bustling corner café. Morning light streams through large windows. MAYA (28, sharp-eyed, determined) nurses an espresso while reviewing documents.

ALEX
(sliding into opposite seat)
You're early.

MAYA
I'm always early. That's why I win.

Alex studies her, impressed. Through the window, a black SUV rolls to a stop.

ALEX
We need to move. Now.

EXT. ALLEY BEHIND COFFEE SHOP - CONTINUOUS

Maya and Alex burst through a back door into a narrow alley slick with last night's rain.

`

export function ScriptEditor({ onScenesExtracted }: Props) {
  const { scriptContent, parsedScenes, isParsing, hasHydrated, setScript, setIsParsing, setHasHydrated } = useScriptStore()
  const [showPreview, setShowPreview] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (useScriptStore.persist.hasHydrated()) {
      setHasHydrated(true)
    }
    const unsub = useScriptStore.persist.onFinishHydration(() => setHasHydrated(true))
    return unsub
  }, [setHasHydrated])

  useEffect(() => {
    if (!hasHydrated) return
    if (!useScriptStore.getState().scriptContent.trim()) {
      setScript(TEMPLATE)
    }
  }, [hasHydrated, setScript])

  const liveScenes = parseScenes(scriptContent)
  const scenes = parsedScenes.length > 0 ? parsedScenes : liveScenes

  const handleAnalyse = useCallback(async () => {
    const { scriptContent: content, setIsParsing: setParsing } = useScriptStore.getState()

    if (!content.trim()) {
      console.warn('[parse] script is empty')
      return
    }

    setParsing(true)
    setParseError(null)
    try {
      const res = await fetch('/api/script/parse', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: content }),
      })
      const data = await res.json() as { scenes?: ScriptScene[]; error?: string }
      if (!res.ok) {
        setParseError(data.error ?? `Parse failed (${res.status})`)
      }
      const extracted = data.scenes?.length
        ? data.scenes.map((s, i) => ({
            id: `scene-${i + 1}`,
            heading: s.heading ?? `Scene ${i + 1}`,
            action: typeof s.action === 'string' ? s.action : '',
            dialogue: Array.isArray(s.dialogue) ? s.dialogue.map(String) : [],
            characters: Array.isArray(s.characters) ? s.characters.map(String) : [],
            estimatedDuration: typeof s.estimatedDuration === 'number' ? s.estimatedDuration : 5,
          }))
        : parseScenes(content)

      onScenesExtracted(extracted)
    } catch (err) {
      const msg = (err as Error).message
      console.error('[parse] failed:', msg)
      setParseError(msg)
      const fallback = parseScenes(content)
      onScenesExtracted(fallback)
    } finally {
      setParsing(false)
    }
  }, [onScenesExtracted, setIsParsing])

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setScript(String(ev.target?.result ?? ''))
    reader.readAsText(file)
  }

  const handleExport = () => {
    const blob = new Blob([scriptContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'screenplay.fountain'
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalEstimated = scenes.reduce((s, sc) => s + sc.estimatedDuration, 0)

  return (
    <div className="flex flex-col h-full bg-[#0a0a12]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8 flex-shrink-0">
        <FileText className="w-3.5 h-3.5 text-[#00e5c8]" />
        <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">Script</span>
        <div className="flex-1" />

        <span className="text-[10px] text-white/25">{scenes.length} scenes · ~{totalEstimated}s</span>
        {parseError && (
          <span className="text-[10px] text-red-400 max-w-[200px] truncate" title={parseError}>
            {parseError}
          </span>
        )}

        <button onClick={() => fileInputRef.current?.click()}
          className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors" title="Import .fountain">
          <Upload className="w-3 h-3" />
        </button>
        <input ref={fileInputRef} type="file" accept=".fountain,.txt" className="hidden" onChange={handleImport} />

        <button onClick={handleExport}
          className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors" title="Export .fountain">
          <Download className="w-3 h-3" />
        </button>

        <button
          onClick={() => setShowPreview((v) => !v)}
          className={`px-2.5 py-1 rounded-lg text-[10px] border transition-colors
            ${showPreview ? 'border-[#00e5c8]/40 text-[#00e5c8] bg-[#00e5c8]/10' : 'border-white/10 text-white/40 hover:border-white/20'}`}
        >
          Preview
        </button>

        <button
          onClick={handleAnalyse}
          disabled={isParsing || !scriptContent.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00e5c8] text-black text-[11px] font-semibold
            hover:bg-[#00f0d5] disabled:opacity-50 transition-colors"
        >
          {isParsing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
          {isParsing ? 'Analysing…' : 'Parse & Storyboard'}
        </button>
      </div>

      {/* Editor / Preview */}
      <div className="flex flex-1 overflow-hidden">
        {/* Raw editor */}
        <div className={`flex flex-col ${showPreview ? 'w-1/2 border-r border-white/8' : 'flex-1'}`}>
          <textarea
            ref={textareaRef}
            value={scriptContent}
            onChange={(e) => setScript(e.target.value)}
            spellCheck={false}
            className="flex-1 w-full bg-transparent text-white/70 font-mono text-[13px] leading-relaxed
              resize-none focus:outline-none p-4 placeholder:text-white/20"
            placeholder="Write your screenplay in Fountain format…&#10;&#10;INT. LOCATION - TIME&#10;&#10;Action description.&#10;&#10;CHARACTER&#10;Dialogue."
            style={{ tabSize: 4 }}
          />
        </div>

        {/* Preview panel */}
        {showPreview && (
          <div className="w-1/2 overflow-y-auto p-6 font-mono text-[13px] leading-loose">
            <div className="max-w-sm mx-auto">
              {scriptContent.split('\n').map((line, i) => (
                <div key={i}>{highlightFountain(line)}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Scene index */}
      {scenes.length > 0 && (
        <div className="border-t border-white/8 overflow-x-auto flex-shrink-0">
          <div className="flex gap-0 min-w-max">
            {scenes.map((scene, i) => (
              <button
                key={scene.id}
                onClick={() => {
                  const idx = scriptContent.indexOf(scene.heading)
                  if (idx >= 0 && textareaRef.current) {
                    textareaRef.current.focus()
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-2 border-r border-white/6 hover:bg-white/5 transition-colors
                  text-[9px] text-white/35 hover:text-white/60 whitespace-nowrap"
              >
                <span className="text-white/20 font-mono">{i + 1}</span>
                <span className="max-w-[120px] truncate">{scene.heading.replace(/^(INT|EXT)\.?\s*/i, '')}</span>
                <ChevronRight className="w-2.5 h-2.5 text-white/15" />
                <span className="text-white/20">{scene.estimatedDuration}s</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
