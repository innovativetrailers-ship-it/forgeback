// Runs every cognitive agent with a timeout + graceful degradation + telemetry.
// Cognition NEVER blocks a render: on failure it returns the fallback and logs.

export interface AgentRun<T> {
  name: string
  run: () => Promise<T>
  fallback: T // returned if the agent times out or throws
  timeoutMs?: number
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('agent timeout')), ms)),
  ])
}

// Run one agent safely — never throws, always resolves (real value or fallback).
export async function runAgent<T>(spec: AgentRun<T>): Promise<{ value: T; ok: boolean; ms: number }> {
  const t0 = Date.now()
  try {
    const value = await withTimeout(spec.run(), spec.timeoutMs ?? 30_000)
    return { value, ok: true, ms: Date.now() - t0 }
  } catch (err) {
    console.warn(`[cognition:${spec.name}] degraded → fallback:`, err instanceof Error ? err.message : String(err))
    return { value: spec.fallback, ok: false, ms: Date.now() - t0 }
  }
}

// Telemetry: track which agents are healthy (surfaces silent degradation).
const agentHealth = new Map<string, { ok: number; fail: number }>()

export function noteAgentHealth(name: string, ok: boolean): void {
  const h = agentHealth.get(name) ?? { ok: 0, fail: 0 }
  if (ok) h.ok++
  else h.fail++
  agentHealth.set(name, h)
}

export function getAgentHealth(): Record<string, { ok: number; fail: number }> {
  return Object.fromEntries(agentHealth)
}
