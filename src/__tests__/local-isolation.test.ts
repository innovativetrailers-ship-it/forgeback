import {
  buildLocalTaskPayload,
  assertLocalPayloadClosed,
  assertLocalEndpoint,
  validateLocalResult,
  injectWorkflowSlots,
  localRequestHeaders,
  submitLocalTask,
  LocalModelRefusal,
} from '@cinema/core'

const FAT = {
  shotPrompt: 'A woman crosses the room',
  seed: 7,
  duration: 5,
  referenceImages: ['https://example.com/ref.png', 'http://user:secret@example.com/leak.png'],
  params: { steps: 20, sampler: 'euler', system: 'You are the director', script: 'INT. ROOM' },
  system: 'You are the director',
  script: 'INT. ROOM',
  otherShots: ['another shot'],
  dag: { nodes: ['plan', 'delegate'] },
  falKey: 'secret',
  userId: 'user-1',
}

describe('local model isolation', () => {
  it('sends only the shot payload', () => {
    const payload = buildLocalTaskPayload(FAT)
    assertLocalPayloadClosed(payload)
    expect(payload).toEqual({
      shotPrompt: 'A woman crosses the room',
      seed: 7,
      duration: 5,
      referenceImages: ['https://example.com/ref.png'],
      params: { steps: 20, sampler: 'euler' },
    })
    expect(JSON.stringify(payload)).not.toMatch(/director|INT\. ROOM|secret|user-1|delegate/)
  })

  it('rejects a non-local endpoint and credentialed urls', () => {
    expect(() => assertLocalEndpoint('https://example.com/run')).toThrow(/localhost/)
    expect(() => assertLocalEndpoint('http://user:pass@127.0.0.1/run')).toThrow(/credentials/)
    expect(assertLocalEndpoint('http://127.0.0.1:8188/prompt').hostname).toBe('127.0.0.1')
    expect(assertLocalEndpoint('http://10.0.0.8:8188/prompt', ['http://10.0.0.8:8188']).origin).toBe('http://10.0.0.8:8188')
  })

  it('treats a workflow as data and rejects a non-media return', () => {
    const workflow = injectWorkflowSlots('{"prompt":"{{PROMPT}}","class_type":"KSampler"}', 'hello')
    expect(workflow).toEqual({ prompt: 'hello', class_type: 'KSampler' })
    expect(localRequestHeaders()).toEqual({ 'content-type': 'application/json', accept: 'application/json' })
    expect(validateLocalResult({ video: { url: 'https://example.com/out.mp4' } }).mediaUrl).toMatch(/out\.mp4/)
    expect(() => validateLocalResult({ code: 'process.exit(1)' })).toThrow(LocalModelRefusal)
    expect(() => validateLocalResult({ error: 'model failed' })).toThrow(/model failed/)
    expect(() => validateLocalResult({ url: `data:video/mp4,${'a'.repeat(1_500_001)}` })).toThrow(/non-media/)
    expect(() => injectWorkflowSlots('{not json', 'hello')).toThrow(LocalModelRefusal)
  })

  it('posts the whitelist only when enabled, and stays off otherwise', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return { ok: true, status: 200, json: async () => ({ url: 'https://example.com/out.mp4' }) } as Response
    }) as typeof fetch

    await expect(submitLocalTask({
      endpoint: 'http://127.0.0.1:8188/prompt',
      task: FAT,
      pausedEnv: 'false',
      enabledEnv: '',
    }, fetchImpl)).rejects.toThrow(/stay off/)
    expect(calls).toHaveLength(0)

    await expect(submitLocalTask({
      endpoint: 'http://127.0.0.1:8188/prompt',
      task: FAT,
      pausedEnv: 'true',
      enabledEnv: 'true',
    }, fetchImpl)).rejects.toThrow(/GENERATION_PAUSED/)
    expect(calls).toHaveLength(0)

    const result = await submitLocalTask({
      endpoint: 'http://127.0.0.1:8188/prompt',
      task: FAT,
      workflow: { prompt: '{{PROMPT}}' },
      pausedEnv: 'false',
      enabledEnv: 'true',
    }, fetchImpl)
    expect(result.mediaUrl).toBe('https://example.com/out.mp4')
    expect(calls).toHaveLength(1)
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.authorization).toBeUndefined()
    expect(Object.keys(headers).sort()).toEqual(['accept', 'content-type'])
    const posted = JSON.parse(String(calls[0].init.body)) as { task: Record<string, unknown>; workflow: { prompt: string } }
    expect(Object.keys(posted.task).sort()).toEqual(['duration', 'params', 'referenceImages', 'seed', 'shotPrompt'])
    expect(JSON.stringify(posted)).not.toMatch(/director|INT\. ROOM|secret|user-1|delegate|falKey/)
    expect(posted.workflow.prompt).toBe('A woman crosses the room')
  })
})
