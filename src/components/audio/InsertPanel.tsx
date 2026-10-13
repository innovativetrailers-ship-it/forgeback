'use client'

import { useState, useCallback } from 'react'
import { Waves } from 'lucide-react'

interface ReverbState { roomSize: number; decay: number; wet: number }
interface DelayState  { time: number; feedback: number; wet: number }

interface Props { trackId: string }

function Slider({ label, min, max, step, value, unit, onChange }: {
  label: string; min: number; max: number; step: number
  value: number; unit: string; onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-white/35 w-14 shrink-0">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-[#00e5c8] h-1"
      />
      <span className="text-[9px] text-white/45 w-12 text-right">{value}{unit}</span>
    </div>
  )
}

export function InsertPanel({ trackId }: Props) {
  const [loading, setLoading] = useState(false)
  const [reverb, setReverb] = useState<ReverbState>({ roomSize: 40, decay: 1.5, wet: 30 })
  const [delay, setDelay] = useState<DelayState>({ time: 250, feedback: 35, wet: 25 })

  const handleApply = useCallback(async () => {
    setLoading(true)
    try {
      await fetch('/api/audio/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId, type: 'inserts', reverb, delay }),
      })
    } finally {
      setLoading(false)
    }
  }, [trackId, reverb, delay])

  return (
    <div className="bg-[#0d1117] rounded-xl border border-white/8 p-3">
      <div className="flex items-center gap-1.5 mb-3">
        <Waves className="w-3.5 h-3.5 text-[#00e5c8]" />
        <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">Inserts</span>
      </div>

      <div className="mb-3">
        <p className="text-[9px] text-white/30 uppercase tracking-wider mb-2">Reverb</p>
        <div className="space-y-1.5">
          <Slider label="Room Size" min={0} max={100} step={1} value={reverb.roomSize} unit="%"
            onChange={(v) => setReverb((p) => ({ ...p, roomSize: v }))} />
          <Slider label="Decay" min={0.1} max={10} step={0.1} value={reverb.decay} unit="s"
            onChange={(v) => setReverb((p) => ({ ...p, decay: v }))} />
          <Slider label="Wet/Dry" min={0} max={100} step={1} value={reverb.wet} unit="%"
            onChange={(v) => setReverb((p) => ({ ...p, wet: v }))} />
        </div>
      </div>

      <div className="mb-3">
        <p className="text-[9px] text-white/30 uppercase tracking-wider mb-2">Delay</p>
        <div className="space-y-1.5">
          <Slider label="Time" min={10} max={2000} step={10} value={delay.time} unit="ms"
            onChange={(v) => setDelay((p) => ({ ...p, time: v }))} />
          <Slider label="Feedback" min={0} max={100} step={1} value={delay.feedback} unit="%"
            onChange={(v) => setDelay((p) => ({ ...p, feedback: v }))} />
          <Slider label="Wet/Dry" min={0} max={100} step={1} value={delay.wet} unit="%"
            onChange={(v) => setDelay((p) => ({ ...p, wet: v }))} />
        </div>
      </div>

      <button
        onClick={() => void handleApply()}
        disabled={loading}
        className="w-full py-1.5 rounded-lg text-xs font-medium bg-[#00e5c8] text-black hover:bg-[#00f0d5] disabled:opacity-40 transition"
      >
        {loading ? 'Applying…' : 'Apply Inserts'}
      </button>
    </div>
  )
}
