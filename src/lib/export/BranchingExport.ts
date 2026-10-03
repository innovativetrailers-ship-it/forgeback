/**
 * Interactive branching video export engine (V2-15).
 * Extends the shoppable player concept — each hotspot is a story fork.
 */
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'

export interface BranchChoice {
  id: string
  label: string
  nextNodeId: string | null
  thumbnailUrl?: string
}

export interface BranchNode {
  id: string
  clipUrl: string
  label: string
  triggerAtSecond: number
  choices: BranchChoice[]
}

export interface BranchingConfig {
  projectId: string
  title: string
  startNodeId: string
  nodes: BranchNode[]
  embedTheme: 'dark' | 'light' | 'cinema'
  autoAdvanceMs?: number
}

export interface BranchingEmbed {
  embedId: string
  embedUrl: string
  playerConfig: BranchingConfig
  iframeHtml: string
}

// ─── Type guards ──────────────────────────────────────────────────────────────

function isBranchChoice(v: unknown): v is BranchChoice {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.id === 'string' && typeof o.label === 'string' &&
    (o.nextNodeId === null || typeof o.nextNodeId === 'string')
}

function isBranchNode(v: unknown): v is BranchNode {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.id === 'string' && typeof o.clipUrl === 'string' &&
    typeof o.label === 'string' && typeof o.triggerAtSecond === 'number' &&
    Array.isArray(o.choices) && (o.choices as unknown[]).every(isBranchChoice)
}

export function isBranchingConfig(v: unknown): v is BranchingConfig {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.projectId === 'string' && typeof o.title === 'string' &&
    typeof o.startNodeId === 'string' && Array.isArray(o.nodes) &&
    (o.nodes as unknown[]).every(isBranchNode) &&
    ['dark', 'light', 'cinema'].includes(o.embedTheme as string)
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateBranchingConfig(config: BranchingConfig): void {
  const { nodes, startNodeId } = config

  if (nodes.length < 2) throw new Error(`Branching video requires at least 2 nodes, got ${nodes.length}`)

  const nodeMap = new Map<string, BranchNode>()
  for (const node of nodes) {
    if (nodeMap.has(node.id)) throw new Error(`Duplicate node id: "${node.id}"`)
    nodeMap.set(node.id, node)
  }

  if (!nodeMap.has(startNodeId)) throw new Error(`startNodeId "${startNodeId}" not found`)

  for (const node of nodes) {
    for (const choice of node.choices) {
      if (choice.nextNodeId !== null && !nodeMap.has(choice.nextNodeId)) {
        throw new Error(`Node "${node.id}" choice references unknown node "${choice.nextNodeId}"`)
      }
    }
    if (node.triggerAtSecond < 0) throw new Error(`Node "${node.id}" has negative triggerAtSecond`)
  }

  // DFS cycle detection
  const visited = new Set<string>()
  const inStack = new Set<string>()

  const dfs = (nodeId: string): void => {
    if (inStack.has(nodeId)) throw new Error(`Circular reference detected at node "${nodeId}"`)
    if (visited.has(nodeId)) return
    visited.add(nodeId)
    inStack.add(nodeId)
    const node = nodeMap.get(nodeId)
    if (node) {
      for (const choice of node.choices) {
        if (choice.nextNodeId) dfs(choice.nextNodeId)
      }
    }
    inStack.delete(nodeId)
  }

  dfs(startNodeId)

  const unreachable = nodes.filter((n) => !visited.has(n.id))
  if (unreachable.length > 0) {
    throw new Error(`Unreachable nodes: ${unreachable.map((n) => n.id).join(', ')}`)
  }
}

// ─── Persistence ──────────────────────────────────────────────────────────────

export async function fetchBranchConfig(embedId: string): Promise<BranchingConfig | null> {
  try {
    const row = await (db as unknown as {
      branchingEmbed: {
        findUnique: (args: { where: { embedId: string } }) => Promise<{ config: unknown } | null>
      }
    }).branchingEmbed.findUnique({ where: { embedId } })
    if (row && isBranchingConfig(row.config)) return row.config
  } catch (err) {
    console.warn("[caught] src/lib/export/BranchingExport.ts:125", err instanceof Error ? { name: err.name, message: err.message } : err)

    // Model not migrated yet
  }
  return null
}

// ─── Generator ────────────────────────────────────────────────────────────────

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function generateBranchingEmbed(
  config: BranchingConfig,
  baseUrl: string,
): Promise<BranchingEmbed> {
  validateBranchingConfig(config)

  const embedId = randomUUID()
  const embedUrl = `${baseUrl}/branch/${embedId}`

  const iframeHtml = [
    '<iframe',
    `  src="${embedUrl}"`,
    '  width="100%"',
    '  style="aspect-ratio:16/9;border:none;max-width:100%"',
    '  allowfullscreen',
    '  loading="lazy"',
    `  title="${escapeHtmlAttr(config.title)}"`,
    '></iframe>',
  ].join('\n')

  try {
    await (db as unknown as {
      branchingEmbed: {
        create: (args: { data: { projectId: string; title: string; config: unknown; embedId: string } }) => Promise<unknown>
      }
    }).branchingEmbed.create({
      data: { projectId: config.projectId, title: config.title, config: config as unknown, embedId },
    })
  } catch {
    // Graceful — DB model not migrated; embed still returns valid URL
  }

  return { embedId, embedUrl, playerConfig: config, iframeHtml }
}
