'use client'

import { useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Layers, Upload, ChevronDown, ChevronRight } from 'lucide-react'

type BackgroundType = 'image' | 'video' | 'gradient' | 'solid' | 'location'
type KeyingMethod = 'luma' | 'chroma_green' | 'chroma_blue' | 'ai_rembg' | 'depth'

const LOCATION_PRESETS = [
  'Cinema night street', 'Studio office', 'Luxury apartment', 'Mountain vista',
  'Space station', 'Forest clearing', 'Beach sunset', 'Urban rooftop',
  'Futuristic city', 'Ancient temple', 'Underwater coral', 'Snowy tundra',
]

const KEYING_METHODS: Array<{ id: KeyingMethod; label: string; desc: string }> = [
  { id: 'chroma_green', label: 'Chroma Green',  desc: 'Classic green screen removal' },
  { id: 'chroma_blue',  label: 'Chroma Blue',   desc: 'Blue screen variant' },
  { id: 'luma',         label: 'Luma Key',       desc: 'Brightness-based keying' },
  { id: 'ai_rembg',     label: 'AI Remove BG',   desc: 'BiRefNet neural segmentation' },
  { id: 'depth',        label: 'Depth Matte',    desc: 'Depth-Anything-v2 isolation' },
]

export function GreenScreenPanel() {
  const [bgType, setBgType] = useState<BackgroundType>('location')
  const [keyMethod, setKeyMethod] = useState<KeyingMethod>('ai_rembg')
  const [tolerance, setTolerance] = useState(40)
  const [feather, setFeather] = useState(3)
  const [spill, setSpill] = useState(20)
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [bgUrl, setBgUrl] = useState<string | null>(null)
  const [methodsOpen, setMethodsOpen] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="panel-section">
        <p className="panel-label mb-2 flex items-center gap-1.5">
          <Layers size={10} className="text-[var(--teal-bright)]" />
          Green Screen & BG Swap
        </p>
      </div>

      {/* Keying method */}
      <div className="border-b border-[var(--border)]">
        <button className="collapsible-trigger px-3 py-2" onClick={() => setMethodsOpen(!methodsOpen)}>
          <span>Keying Method</span>
          {methodsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        {methodsOpen && (
          <div className="px-3 pb-3 space-y-1">
            {KEYING_METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() => setKeyMethod(m.id)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 rounded border text-left transition-all',
                  keyMethod === m.id
                    ? 'bg-[var(--teal-glow)] border-[var(--teal-border)]'
                    : 'border-[var(--border)] hover:bg-[var(--bg-hover)]'
                )}
              >
                <span className={cn('text-[11px] font-medium', keyMethod === m.id ? 'text-[var(--teal-bright)]' : 'text-[var(--text-secondary)]')}>
                  {m.label}
                </span>
                <span className="text-[9px] text-[var(--text-tertiary)]">{m.desc}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Keying controls (only for chroma/luma) */}
      {(keyMethod === 'chroma_green' || keyMethod === 'chroma_blue' || keyMethod === 'luma') && (
        <div className="panel-section space-y-3">
          <p className="panel-label">Key Controls</p>
          {[
            { label: 'Tolerance', value: tolerance, set: setTolerance, max: 100 },
            { label: 'Edge Feather', value: feather, set: setFeather, max: 20 },
            { label: 'Spill Suppress', value: spill, set: setSpill, max: 100 },
          ].map(({ label, value, set, max }) => (
            <div key={label}>
              <div className="flex justify-between mb-1">
                <span className="text-[10px] text-[var(--text-secondary)]">{label}</span>
                <span className="text-[10px] text-[var(--teal-bright)] tabular-nums">{value}</span>
              </div>
              <input type="range" min={0} max={max} value={value}
                onChange={(e) => set(Number(e.target.value))}
                className="cinema-slider"
              />
            </div>
          ))}
        </div>
      )}

      {/* Background source */}
      <div className="panel-section">
        <p className="panel-label mb-2">Background Source</p>
        <div className="pill-group mb-3">
          {(['location', 'image', 'video', 'gradient', 'solid'] as BackgroundType[]).map((t) => (
            <button key={t} onClick={() => setBgType(t)}
              className={cn('pill capitalize', bgType === t && 'active')}
            >{t.replace('_', ' ')}</button>
          ))}
        </div>

        {bgType === 'location' && (
          <div className="grid grid-cols-2 gap-1.5">
            {LOCATION_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setSelectedPreset(p)}
                className={cn(
                  'text-[10px] px-2 py-1.5 rounded border text-left transition-all',
                  selectedPreset === p
                    ? 'bg-[var(--teal-glow)] border-[var(--teal-border)] text-[var(--teal-bright)]'
                    : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-mid)] hover:bg-[var(--bg-hover)]'
                )}
              >{p}</button>
            ))}
          </div>
        )}

        {(bgType === 'image' || bgType === 'video') && (
          <div>
            <input ref={fileRef} type="file" accept={bgType === 'image' ? 'image/*' : 'video/*'} className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) setBgUrl(URL.createObjectURL(file))
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full py-6 rounded-lg border-2 border-dashed border-[var(--border)] text-[var(--text-tertiary)] hover:border-[var(--teal-dark)] hover:text-[var(--text-secondary)] transition-colors flex flex-col items-center gap-1"
            >
              <Upload size={16} />
              <span className="text-[10px]">Upload {bgType}</span>
            </button>
            {bgUrl && bgType === 'image' && (
              <img src={bgUrl} alt="bg" className="w-full h-20 object-cover rounded mt-2" />
            )}
          </div>
        )}
      </div>

    </div>
  )
}
