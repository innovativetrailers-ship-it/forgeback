import type { CompositorGraph, CompositorNode, NodeType } from '@/lib/compositor/schema'

function node(id: string, type: NodeType, params: Record<string, unknown>, inputLabels: string[]): CompositorNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    inputs: inputLabels.map((label, index) => ({
      id: `${id}-in-${index}`,
      label,
      type: 'input' as const,
      dataType: 'video' as const,
    })),
    outputs: [{ id: `${id}-out`, label: 'Output', type: 'output' as const, dataType: 'video' as const }],
    params,
    label: type,
  }
}

export interface GreenScreenGraphInput {
  mode: 'chroma' | 'luma' | 'ai'
  colour: string
  tolerance: number
  softness: number
  spill: number
  invert: boolean
  shrink: number
  grow: number
  holeFill: boolean
  backdrop: boolean
  lightWrap: number
  shadow: number
  colourMatch: number
  subjectUrl?: string
  plateUrl?: string
}

/** Keyer → spill → merge. AI skips the local key and composites the cutout. */
export function greenScreenGraph(input: GreenScreenGraphInput): CompositorGraph {
  const subject = node('subject', 'MediaIn', input.mode === 'ai' ? {
    aiMatte: true,
    cutout: true,
    subjectUrl: input.subjectUrl ?? '',
    plateUrl: input.plateUrl ?? '',
  } : {}, [])
  const out = node('out', 'MediaOut', {}, ['Input'])
  const nodes: CompositorNode[] = [subject]
  const connections: CompositorGraph['connections'] = []
  let tail = 'subject'

  if (input.mode !== 'ai') {
    const keyer = node('key', input.mode === 'luma' ? 'LumaKeyer' : 'Keyer', {
      colour: input.colour,
      tolerance: input.tolerance,
      softness: input.softness,
      spill: input.spill,
      invert: input.invert,
      shrink: input.shrink,
      grow: input.grow,
      holeFill: input.holeFill,
      lumaLow: input.tolerance,
      lumaHigh: Math.min(1, input.tolerance + Math.max(input.softness, 0.05)),
    }, ['Input'])
    const spill = node('spill', 'SpillSuppress', { colour: input.colour, spill: input.spill }, ['Input'])
    nodes.push(keyer, spill)
    connections.push(
      { id: 'c-key', fromNodeId: 'subject', fromPortId: 'subject-out', toNodeId: 'key', toPortId: 'key-in-0' },
      { id: 'c-spill', fromNodeId: 'key', fromPortId: 'key-out', toNodeId: 'spill', toPortId: 'spill-in-0' },
    )
    tail = 'spill'
  }

  if (input.backdrop) {
    const plate = node('plate', 'MediaIn', {}, [])
    const merge = node('merge', 'Merge', {
      greenScreen: true,
      lightWrap: input.lightWrap,
      shadow: input.shadow,
      colourMatch: input.colourMatch,
    }, ['Foreground', 'Background'])
    nodes.push(plate, merge)
    connections.push(
      { id: 'c-fg', fromNodeId: tail, fromPortId: `${tail}-out`, toNodeId: 'merge', toPortId: 'merge-in-0' },
      { id: 'c-bg', fromNodeId: 'plate', fromPortId: 'plate-out', toNodeId: 'merge', toPortId: 'merge-in-1' },
    )
    tail = 'merge'
  }

  nodes.push(out)
  connections.push({ id: 'c-out', fromNodeId: tail, fromPortId: `${tail}-out`, toNodeId: 'out', toPortId: 'out-in-0' })
  return { nodes, connections, outputNodeId: 'out' }
}
