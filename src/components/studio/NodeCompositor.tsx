'use client'

import { useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import {
  NODE_COLORS,
  NODE_TYPES_LIST,
  COMPOSITOR_NODE_COUNT,
  makeNode,
  type NodeType,
  type CompositorNode,
  type NodeConnection,
} from '@/lib/compositor'
import { DESKTOP_VFX_NODES } from '@/lib/compositor/vfx'

export type { NodeType, NodePort, CompositorNode, NodeConnection } from '@/lib/compositor'

export default function NodeCompositor() {
  const [nodes, setNodes] = useState<CompositorNode[]>([])
  const [connections, setConnections] = useState<NodeConnection[]>([])
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ nodeId: string; offsetX: number; offsetY: number } | null>(null)
  const [connecting, setConnecting] = useState<{ fromNodeId: string; fromPortId: string } | null>(null)
  const [rendering, setRendering] = useState(false)
  const [renderUrl, setRenderUrl] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  function addNode(type: NodeType) {
    const node = makeNode(type, { x: 200 + Math.random() * 300, y: 100 + Math.random() * 200 })
    setNodes((prev) => [...prev, node])
  }

  function deleteNode(id: string) {
    setNodes((prev) => prev.filter((n) => n.id !== id))
    setConnections((prev) => prev.filter((c) => c.fromNodeId !== id && c.toNodeId !== id))
    if (selectedNode === id) setSelectedNode(null)
  }

  async function renderGraph() {
    setRendering(true)
    setRenderUrl(null)
    try {
      const mediaUrls: Record<string, string> = {}
      for (const n of nodes) {
        if (n.type === 'MediaIn' && n.params.sourceUrl) {
          mediaUrls[n.id] = String(n.params.sourceUrl)
        }
      }
      const res = await fetch('/api/studio/compositor/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph: { nodes, connections }, mediaUrls }),
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Render failed')
      setRenderUrl(data.url ?? null)
    } catch (err) {
      console.warn("[caught] src/components/studio/NodeCompositor.tsx:57", err instanceof Error ? { name: err.name, message: err.message } : err)

      alert((err as Error).message)
    } finally {
      setRendering(false)
    }
  }

  function startDrag(e: React.MouseEvent, nodeId: string) {
    e.stopPropagation()
    const node = nodes.find((n) => n.id === nodeId)
    if (!node) return
    setDragging({ nodeId, offsetX: e.clientX - node.position.x, offsetY: e.clientY - node.position.y })
    setSelectedNode(nodeId)
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragging) return
    setNodes((prev) =>
      prev.map((n) =>
        n.id === dragging.nodeId
          ? { ...n, position: { x: e.clientX - dragging.offsetX, y: e.clientY - dragging.offsetY } }
          : n
      )
    )
  }

  function startConnect(e: React.MouseEvent, nodeId: string, portId: string) {
    e.stopPropagation()
    setConnecting({ fromNodeId: nodeId, fromPortId: portId })
  }

  function endConnect(e: React.MouseEvent, toNodeId: string, toPortId: string) {
    e.stopPropagation()
    if (!connecting || connecting.fromNodeId === toNodeId) {
      setConnecting(null)
      return
    }
    setConnections((prev) => [
      ...prev,
      {
        id: nanoid(),
        fromNodeId: connecting.fromNodeId,
        fromPortId: connecting.fromPortId,
        toNodeId,
        toPortId,
      },
    ])
    setConnecting(null)
  }

  const selectedNodeData = nodes.find((n) => n.id === selectedNode)

  return (
    <div className="flex h-full bg-[#0c0c10] text-white overflow-hidden flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 text-xs">
        <span className="text-gray-400">{COMPOSITOR_NODE_COUNT} nodes · EXR via port 7435</span>
        <button
          type="button"
          disabled={rendering || nodes.length === 0}
          onClick={() => void renderGraph()}
          className="px-3 py-1 rounded-lg bg-[#00e5c8] text-black font-medium disabled:opacity-40"
        >
          {rendering ? 'Rendering…' : 'Render graph'}
        </button>
      </div>
      {renderUrl && (
        <div className="px-3 py-1 text-xs text-[#00e5c8] border-b border-white/5 truncate">
          Output:{' '}
          <a href={renderUrl} target="_blank" rel="noreferrer" className="underline">
            {renderUrl}
          </a>
        </div>
      )}
      <div className="flex flex-1 min-h-0">
        <div className="w-48 flex-shrink-0 border-r border-white/10 overflow-y-auto p-3">
          <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Nodes</div>
          <p className="mb-2 text-[10px] text-white/40">Particles, 3D layers, and OFX plugins are desktop depth. This page runs the same graph.</p>
          {NODE_TYPES_LIST.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => addNode(type)}
              className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-white/10 transition-colors mb-1 flex items-center gap-2"
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: NODE_COLORS[type] }} />
              {type}
              {DESKTOP_VFX_NODES.includes(type as (typeof DESKTOP_VFX_NODES)[number]) ? ' · desktop' : ''}
            </button>
          ))}
        </div>

        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden"
          onMouseMove={onMouseMove}
          onMouseUp={() => setDragging(null)}
          onClick={() => setConnecting(null)}
        >
          <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
            {connections.map((conn) => {
              const fromNode = nodes.find((n) => n.id === conn.fromNodeId)
              const toNode = nodes.find((n) => n.id === conn.toNodeId)
              if (!fromNode || !toNode) return null
              const x1 = fromNode.position.x + 180
              const y1 = fromNode.position.y + 30
              const x2 = toNode.position.x
              const y2 = toNode.position.y + 30
              const cp = Math.abs(x2 - x1) * 0.5
              return (
                <path
                  key={conn.id}
                  d={`M ${x1} ${y1} C ${x1 + cp} ${y1}, ${x2 - cp} ${y2}, ${x2} ${y2}`}
                  stroke="#00e5c8"
                  strokeWidth={2}
                  fill="none"
                  opacity={0.7}
                />
              )
            })}
          </svg>

          {nodes.map((node) => (
            <div
              key={node.id}
              data-node={node.id}
              className={`absolute bg-[#1a1a24] rounded-xl border transition-all select-none ${
                selectedNode === node.id ? 'border-[#00b8a0]' : 'border-white/10'
              }`}
              style={{ left: node.position.x, top: node.position.y, width: 180, zIndex: 2 }}
              onMouseDown={(e) => startDrag(e, node.id)}
            >
              <div
                className="px-3 py-2 rounded-t-xl flex items-center justify-between text-xs font-semibold"
                style={{ backgroundColor: NODE_COLORS[node.type] + '33' }}
              >
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: NODE_COLORS[node.type] }} />
                  {node.label}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteNode(node.id)
                  }}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="py-2 px-0 relative">
                {node.inputs.map((port) => (
                  <div
                    key={port.id}
                    className="flex items-center gap-2 px-2 py-0.5"
                    onMouseUp={(e) => endConnect(e, node.id, port.id)}
                  >
                    <div
                      className="w-3 h-3 rounded-full border-2 border-white/40 cursor-crosshair -ml-1.5 flex-shrink-0 hover:border-[#00b8a0]"
                      style={{ backgroundColor: '#1a1a24' }}
                    />
                    <span className="text-xs text-gray-400">{port.label}</span>
                  </div>
                ))}
                {node.outputs.map((port) => (
                  <div
                    key={port.id}
                    className="flex items-center justify-end gap-2 px-2 py-0.5"
                    onMouseDown={(e) => startConnect(e, node.id, port.id)}
                  >
                    <span className="text-xs text-gray-400">{port.label}</span>
                    <div
                      className="w-3 h-3 rounded-full border-2 border-[#00b8a0] cursor-crosshair -mr-1.5 flex-shrink-0 hover:bg-[#00f0d5]"
                      style={{ backgroundColor: '#1a1a24' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm pointer-events-none">
              Add nodes from the panel to start compositing
            </div>
          )}
        </div>

        {selectedNodeData && (
          <div className="w-56 flex-shrink-0 border-l border-white/10 p-4 overflow-y-auto">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              {selectedNodeData.type}
            </div>
            {Object.entries(selectedNodeData.params).map(([key, value]) => (
              <div key={key} className="mb-3">
                <label className="text-xs text-gray-400 block mb-1 capitalize">{key.replace(/_/g, ' ')}</label>
                {typeof value === 'number' ? (
                  <input
                    type="number"
                    value={value}
                    step={0.01}
                    onChange={(e) => {
                      setNodes((prev) =>
                        prev.map((n) =>
                          n.id === selectedNodeData.id
                            ? { ...n, params: { ...n.params, [key]: Number(e.target.value) } }
                            : n
                        )
                      )
                    }}
                    className="w-full bg-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none focus:ring-1 focus:ring-teal-400"
                  />
                ) : typeof value === 'string' ? (
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => {
                      setNodes((prev) =>
                        prev.map((n) =>
                          n.id === selectedNodeData.id
                            ? { ...n, params: { ...n.params, [key]: e.target.value } }
                            : n
                        )
                      )
                    }}
                    className="w-full bg-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none focus:ring-1 focus:ring-teal-400"
                  />
                ) : (
                  <pre className="text-xs text-gray-500">{JSON.stringify(value)}</pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
