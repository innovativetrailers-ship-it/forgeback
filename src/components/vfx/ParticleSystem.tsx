'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Sparkles, Play, Square, Download } from 'lucide-react'
import {
  type ParticleConfig,
  type EmitterType,
  type ParticleTexture,
  type PhysicsForces,
  DEFAULT_PARTICLE_CONFIG,
} from '@/lib/vfx/ParticleEngine'

interface Props {
  clipId?: string
  onExport?: (blobUrl: string) => void
}

const EMITTER_TYPES: EmitterType[] = ['point', 'line', 'sphere', 'cone']
const TEXTURES: ParticleTexture[] = ['fire', 'smoke', 'sparks', 'snow', 'rain', 'dust', 'stars', 'magic', 'bubbles', 'confetti', 'bokeh', 'debris']
const BLEND_MODES = ['add', 'normal', 'screen'] as const

// Canvas-based particle renderer (simplified — Three.js would be used in production)
function renderParticles(
  canvas: HTMLCanvasElement,
  config: ParticleConfig,
  time: number,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.globalCompositeOperation = config.blendMode === 'add' ? 'lighter' : config.blendMode === 'screen' ? 'screen' : 'source-over'

  const cx = canvas.width / 2
  const cy = canvas.height / 2

  for (let i = 0; i < Math.min(config.count, 150); i++) {
    const seed = i * 127.3 + time * 0.7
    const age = ((seed % config.lifespan) + time) % config.lifespan
    const life = 1 - age / config.lifespan

    const angle = (i / config.count) * Math.PI * 2 + time * 0.5
    const spread = (config.spread / 180) * Math.PI
    const emitAngle = angle + (Math.random() - 0.5) * spread
    const dist = age * config.speed + Math.sin(seed) * 20

    const gravity = config.physics.gravity.strength * age * age * 0.5
    const x = cx + Math.cos(emitAngle) * dist + config.physics.wind.strength * age * 10
    const y = cy + Math.sin(emitAngle) * dist + gravity * 0.1 - age * 10

    const size = (config.size + (Math.sin(seed) * config.sizeVariance)) * life
    if (size <= 0) continue

    const alpha = config.opacity * life
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha))

    // Color with variance
    ctx.fillStyle = config.color
    ctx.beginPath()
    ctx.arc(x, y, Math.max(0.5, size), 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

export function ParticleSystem({ onExport }: Props) {
  const [config, setConfig] = useState<ParticleConfig>({ ...DEFAULT_PARTICLE_CONFIG })
  const [isPlaying, setIsPlaying] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const startTimeRef = useRef(0)

  const animate = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !isPlaying) return
    const time = (Date.now() - startTimeRef.current) / 1000
    renderParticles(canvas, config, time)
    rafRef.current = requestAnimationFrame(animate)
  }, [config, isPlaying])

  useEffect(() => {
    if (isPlaying) {
      startTimeRef.current = Date.now()
      rafRef.current = requestAnimationFrame(animate)
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [isPlaying, animate])

  // Single preview frame when stopped
  useEffect(() => {
    if (!isPlaying) renderParticles(canvasRef.current!, config, 0.5)
  }, [config, isPlaying])

  const patch = useCallback(<K extends keyof ParticleConfig>(key: K, value: ParticleConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }, [])

  const patchPhysics = useCallback(<K extends keyof PhysicsForces>(key: K, value: PhysicsForces[K]) => {
    setConfig((prev) => ({ ...prev, physics: { ...prev.physics, [key]: value } }))
  }, [])

  const handleExport = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      onExport?.(url)
    })
  }, [onExport])

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/8">
        <Sparkles className="w-3.5 h-3.5 text-[#00e5c8]" />
        <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider flex-1">Particle System</span>
        <button
          onClick={() => setIsPlaying((v) => !v)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] border transition ${
            isPlaying ? 'border-red-500/40 text-red-400 bg-red-500/10' : 'border-[#00e5c8]/40 text-[#00e5c8] bg-[#00e5c8]/10'
          }`}
        >
          {isPlaying ? <><Square className="w-2.5 h-2.5" /> Stop</> : <><Play className="w-2.5 h-2.5" /> Preview</>}
        </button>
      </div>

      {/* Canvas preview */}
      <div className="relative bg-[#050508] border-b border-white/6">
        <canvas ref={canvasRef} width={280} height={160} className="w-full" />
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Emitter type */}
        <div>
          <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1.5">Emitter</p>
          <div className="grid grid-cols-4 gap-1">
            {EMITTER_TYPES.map((t) => (
              <button key={t} onClick={() => patch('emitterType', t)}
                className={`py-1 rounded text-[9px] capitalize border transition ${
                  config.emitterType === t ? 'border-[#00e5c8]/40 bg-[#00e5c8]/10 text-[#00e5c8]' : 'border-white/8 text-white/30 hover:border-white/20'
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Texture */}
        <div>
          <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1.5">Texture</p>
          <div className="grid grid-cols-4 gap-1">
            {TEXTURES.map((t) => (
              <button key={t} onClick={() => patch('texture', t)}
                className={`py-1 rounded text-[9px] capitalize border transition ${
                  config.texture === t ? 'border-[#00e5c8]/40 bg-[#00e5c8]/10 text-[#00e5c8]' : 'border-white/8 text-white/30 hover:border-white/20'
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders */}
        {([
          ['count',     'Count',    1, 500,  1,    ''],
          ['lifespan',  'Lifespan', 0.1, 10, 0.1,  's'],
          ['size',      'Size',     1, 50,   1,    'px'],
          ['opacity',   'Opacity',  0, 1,    0.01, ''],
          ['speed',     'Speed',    1, 200,  1,    ''],
          ['spread',    'Spread',   0, 180,  1,    '°'],
        ] as const).map(([key, label, min, max, step, unit]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[9px] text-white/35 w-12 shrink-0">{label}</span>
            <input
              type="range" min={min} max={max} step={step}
              value={config[key as keyof ParticleConfig] as number}
              onChange={(e) => patch(key as keyof ParticleConfig, Number(e.target.value) as never)}
              className="flex-1 accent-[#00e5c8] h-1"
            />
            <span className="text-[9px] text-white/40 w-10 text-right">
              {String(config[key as keyof ParticleConfig])}{unit}
            </span>
          </div>
        ))}

        {/* Physics */}
        <div>
          <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1.5">Physics</p>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-white/35 w-12 shrink-0">Gravity</span>
            <input
              type="range" min={0} max={30} step={0.5}
              value={config.physics.gravity.strength}
              onChange={(e) => patchPhysics('gravity', { ...config.physics.gravity, strength: Number(e.target.value) })}
              className="flex-1 accent-[#00e5c8] h-1"
            />
            <span className="text-[9px] text-white/40 w-10 text-right">{config.physics.gravity.strength}</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[9px] text-white/35 w-12 shrink-0">Wind</span>
            <input
              type="range" min={0} max={30} step={0.5}
              value={config.physics.wind.strength}
              onChange={(e) => patchPhysics('wind', { ...config.physics.wind, strength: Number(e.target.value) })}
              className="flex-1 accent-[#00e5c8] h-1"
            />
            <span className="text-[9px] text-white/40 w-10 text-right">{config.physics.wind.strength}</span>
          </div>
        </div>

        {/* Blend mode */}
        <div>
          <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1.5">Blend Mode</p>
          <div className="grid grid-cols-3 gap-1">
            {BLEND_MODES.map((m) => (
              <button key={m} onClick={() => patch('blendMode', m)}
                className={`py-1 rounded text-[9px] capitalize border transition ${
                  config.blendMode === m ? 'border-[#00e5c8]/40 bg-[#00e5c8]/10 text-[#00e5c8]' : 'border-white/8 text-white/30 hover:border-white/20'
                }`}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-white/35 w-12 shrink-0">Color</span>
          <input
            type="color" value={config.color}
            onChange={(e) => patch('color', e.target.value)}
            className="w-8 h-6 rounded border border-white/10 bg-transparent cursor-pointer"
          />
          <span className="text-[9px] text-white/30">{config.color}</span>
        </div>
      </div>

      <div className="p-3 border-t border-white/6">
        <button
          onClick={() => void handleExport()}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#1a1f2e] border border-white/10 text-white/60 text-xs hover:border-[#00e5c8]/30 hover:text-white/80 transition"
        >
          <Download className="w-3 h-3" /> Add to Timeline
        </button>
      </div>
    </div>
  )
}
