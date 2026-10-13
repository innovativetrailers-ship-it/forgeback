import {
  localModelForRole,
  probeLocalModel,
  requireLocalModel,
  routableLocalModels,
  runLocalShot,
  setLocalModelEnabled,
  upsertLocalModel,
  type LocalModelRecord,
} from '@cinema/core'

const comfy: LocalModelRecord = {
  id: 'comfy-1',
  name: 'ComfyUI',
  endpoint: 'http://127.0.0.1:8188/prompt',
  role: 't2v',
  enabled: true,
  status: 'reachable',
  workflow: { prompt: '{{PROMPT}}' },
  lora: 'wan-local',
}

describe('local model routing', () => {
  it('keeps a disabled or down model out of the routable set', async () => {
    const models = upsertLocalModel([], comfy)
    expect(routableLocalModels(models)).toHaveLength(1)
    expect(routableLocalModels(setLocalModelEnabled(models, comfy.id, false))).toHaveLength(0)
    expect(() => requireLocalModel([{ ...comfy, status: 'down' }], comfy.id)).toThrow(/down/)
    expect(localModelForRole(models, 'image')).toBeNull()
    const down = await probeLocalModel('http://127.0.0.1:9', async () => { throw new Error('offline') })
    expect(down).toBe('down')
  })

  it('submits only the shot payload at zero cost and still honours pause', async () => {
    const calls: string[] = []
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push(String(init?.body))
      return { ok: true, status: 200, json: async () => ({ url: 'https://example.com/take.mp4' }) } as Response
    }) as typeof fetch
    await expect(runLocalShot({
      model: comfy,
      shotPrompt: 'A woman crosses the room',
      seed: 3,
      duration: 4,
      pausedEnv: 'true',
    }, fetchImpl)).rejects.toThrow(/GENERATION_PAUSED/)
    const take = await runLocalShot({
      model: comfy,
      shotPrompt: 'A woman crosses the room',
      seed: 3,
      duration: 4,
      pausedEnv: 'false',
    }, fetchImpl)
    expect(take).toEqual({ mediaUrl: 'https://example.com/take.mp4', costUsd: 0, libraryTake: true })
    expect(calls[0]).not.toMatch(/must not leak|wan-local is not|plan/)
    expect(calls[0]).toMatch(/A woman crosses the room/)
    expect(calls[0]).toMatch(/wan-local/)
  })
})
