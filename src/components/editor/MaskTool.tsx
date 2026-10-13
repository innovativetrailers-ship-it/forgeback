'use client'

import { useState, useRef, useCallback } from 'react'
import { Pen, Edit3, FlipHorizontal, RotateCcw, Check } from 'lucide-react'

type MaskMode = 'bezier' | 'freehand'

interface Point { x: number; y: number }
interface ControlPoint { anchor: Point; cp1: Point; cp2: Point }

interface Props {
  width: number
  height: number
  clipId: string
  onMaskComplete?: (svgPath: string) => void
}

function pointsToSvgPath(points: Point[], closed: boolean): string {
  if (points.length < 2) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`
  }
  if (closed) d += ' Z'
  return d
}

function controlPointsToSvgPath(cps: ControlPoint[], closed: boolean): string {
  if (cps.length < 2) return ''
  let d = `M ${cps[0].anchor.x} ${cps[0].anchor.y}`
  for (let i = 1; i < cps.length; i++) {
    const prev = cps[i - 1]
    const curr = cps[i]
    d += ` C ${prev.cp2.x} ${prev.cp2.y} ${curr.cp1.x} ${curr.cp1.y} ${curr.anchor.x} ${curr.anchor.y}`
  }
  if (closed && cps.length >= 2) {
    const last = cps[cps.length - 1]
    const first = cps[0]
    d += ` C ${last.cp2.x} ${last.cp2.y} ${first.cp1.x} ${first.cp1.y} ${first.anchor.x} ${first.anchor.y} Z`
  }
  return d
}

export function MaskTool({ width, height, clipId, onMaskComplete }: Props) {
  const [mode, setMode] = useState<MaskMode>('bezier')
  const [inverted, setInverted] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [closed, setClosed] = useState(false)

  // Bezier state
  const [controlPoints, setControlPoints] = useState<ControlPoint[]>([])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  // Freehand state
  const [freehandPoints, setFreehandPoints] = useState<Point[]>([])

  const svgRef = useRef<SVGSVGElement>(null)

  const getRelativePos = useCallback((e: React.MouseEvent): Point => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: ((e.clientX - rect.left) / rect.width) * width,
      y: ((e.clientY - rect.top) / rect.height) * height,
    }
  }, [width, height])

  const handleSvgClick = useCallback((e: React.MouseEvent) => {
    if (mode !== 'bezier' || closed) return
    const pos = getRelativePos(e)

    // Close path if clicking near first point
    if (controlPoints.length >= 3) {
      const first = controlPoints[0].anchor
      const dist = Math.hypot(pos.x - first.x, pos.y - first.y)
      if (dist < 10) { setClosed(true); return }
    }

    const cp: ControlPoint = {
      anchor: pos,
      cp1: { x: pos.x - 20, y: pos.y },
      cp2: { x: pos.x + 20, y: pos.y },
    }
    setControlPoints((prev) => [...prev, cp])
    setSelectedIdx(controlPoints.length)
  }, [mode, closed, controlPoints, getRelativePos])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (mode !== 'freehand') return
    setIsDrawing(true)
    setFreehandPoints([getRelativePos(e)])
  }, [mode, getRelativePos])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (mode !== 'freehand' || !isDrawing) return
    setFreehandPoints((prev) => [...prev, getRelativePos(e)])
  }, [mode, isDrawing, getRelativePos])

  const handleMouseUp = useCallback(() => {
    if (mode === 'freehand') { setIsDrawing(false); setClosed(true) }
  }, [mode])

  const handleReset = useCallback(() => {
    setControlPoints([])
    setFreehandPoints([])
    setClosed(false)
    setSelectedIdx(null)
    setIsDrawing(false)
  }, [])

  const handleApply = useCallback(async () => {
    const svgPath = mode === 'bezier'
      ? controlPointsToSvgPath(controlPoints, closed)
      : pointsToSvgPath(freehandPoints, true)

    if (!svgPath) return
    const finalPath = inverted ? `${svgPath} M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z` : svgPath

    onMaskComplete?.(finalPath)

    await fetch(`/api/vfx/mask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clipId, svgPath: finalPath, inverted }),
    })
  }, [mode, controlPoints, freehandPoints, closed, inverted, clipId, width, height, onMaskComplete])

  const bezierPath = controlPointsToSvgPath(controlPoints, closed)
  const freehandPath = pointsToSvgPath(freehandPoints, false)

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex items-center gap-1 bg-[#0d1117] rounded-lg p-1 border border-white/8">
        <button
          onClick={() => { setMode('bezier'); handleReset() }}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] transition ${
            mode === 'bezier' ? 'bg-[#00e5c8]/15 text-[#00e5c8]' : 'text-white/30 hover:text-white/60'
          }`}
        >
          <Pen className="w-3 h-3" /> Bezier
        </button>
        <button
          onClick={() => { setMode('freehand'); handleReset() }}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] transition ${
            mode === 'freehand' ? 'bg-[#00e5c8]/15 text-[#00e5c8]' : 'text-white/30 hover:text-white/60'
          }`}
        >
          <Edit3 className="w-3 h-3" /> Freehand
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setInverted((v) => !v)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] border transition ${
            inverted ? 'border-[#00e5c8]/40 text-[#00e5c8]' : 'border-white/8 text-white/30'
          }`}
        >
          <FlipHorizontal className="w-3 h-3" /> Invert
        </button>
        <button onClick={handleReset} className="px-2 py-1 text-[9px] text-white/30 hover:text-white/60 transition">
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>

      {/* Canvas */}
      <div className="relative rounded-lg overflow-hidden border border-white/10 bg-[#12121a]" style={{ aspectRatio: `${width}/${height}` }}>
        <div className="absolute inset-0 text-[9px] text-white/20 flex items-center justify-center select-none pointer-events-none">
          {!isDrawing && controlPoints.length === 0 && freehandPoints.length === 0 &&
            (mode === 'bezier' ? 'Click to place bezier points' : 'Click and drag to draw mask')}
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full cursor-crosshair"
          onClick={handleSvgClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          {/* Mask overlay */}
          {(bezierPath || freehandPath) && (
            <path
              d={mode === 'bezier' ? bezierPath : freehandPath}
              fill={inverted ? 'rgba(0,229,200,0.12)' : 'rgba(0,229,200,0.20)'}
              stroke="#00e5c8"
              strokeWidth={1.5}
              strokeDasharray={closed ? 'none' : '4 4'}
            />
          )}

          {/* Bezier control points */}
          {mode === 'bezier' && controlPoints.map((cp, i) => (
            <g key={i}>
              {i > 0 && (
                <>
                  <line x1={cp.anchor.x} y1={cp.anchor.y} x2={cp.cp1.x} y2={cp.cp1.y} stroke="#00e5c8" strokeWidth={0.5} opacity={0.4} />
                  <circle cx={cp.cp1.x} cy={cp.cp1.y} r={3} fill="#4f9cf9" stroke="#0d1117" strokeWidth={1} className="cursor-move" />
                </>
              )}
              <circle
                cx={cp.anchor.x} cy={cp.anchor.y} r={5}
                fill={i === selectedIdx ? '#00e5c8' : '#0d1117'}
                stroke="#00e5c8" strokeWidth={1.5}
                className="cursor-pointer"
                onClick={(e) => { e.stopPropagation(); setSelectedIdx(i) }}
              />
            </g>
          ))}

          {/* Close hint */}
          {mode === 'bezier' && controlPoints.length >= 3 && !closed && (
            <circle
              cx={controlPoints[0].anchor.x}
              cy={controlPoints[0].anchor.y}
              r={10}
              fill="none" stroke="#00e5c8" strokeWidth={1} opacity={0.4}
              strokeDasharray="3 3"
            />
          )}
        </svg>
      </div>

      <p className="text-[8px] text-white/20">
        {mode === 'bezier'
          ? `${controlPoints.length} points${closed ? ' (closed)' : ''}`
          : `${freehandPoints.length} path points`}
      </p>

      <button
        onClick={() => void handleApply()}
        disabled={mode === 'bezier' ? controlPoints.length < 3 : freehandPoints.length < 5}
        className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#00e5c8] text-black text-xs font-medium hover:bg-[#00f0d5] disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        <Check className="w-3 h-3" /> Apply Mask
      </button>
    </div>
  )
}
