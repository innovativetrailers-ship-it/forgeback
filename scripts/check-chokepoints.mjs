/**
 * Fail the build when a paid API is called outside its guarded boundary.
 * Scans the web src tree, desktop src tree, and @cinema/core.
 *
 * Maintenance: every paid host belongs in PAID_HOSTS. A provider whose host
 * is missing from that list is invisible here, and this checker will stay
 * green while that host bills during pause. Add the host, and the one file
 * allowed to call it, before wiring the client.
 */
import { readdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const roots = ['src', 'cinematic-forge-v3/src', 'packages/core/src']
  .map((rel) => join(root, rel))
  .filter((dir) => {
    try { return statSync(dir).isDirectory() } catch { return false }
  })

const FAL_CLIENT_ALLOW = [
  'src/lib/fal/client.ts',
  'cinematic-forge-v3/src/main/ai/falClient.ts',
  'packages/core/src/fal/guardedSubmit.ts',
]
const FAL_SUBMIT_ALLOW = [
  'packages/core/src/fal/guardedSubmit.ts',
]

const RULES = [
  {
    name: '@fal-ai/client',
    pattern: /@fal-ai\/client/,
    allow: new Set(FAL_CLIENT_ALLOW),
  },
  {
    name: 'fal.subscribe / fal.queue / queue.fal.run',
    pattern: /fal\.subscribe|fal\.queue|queue\.fal\.run/,
    allow: new Set(FAL_SUBMIT_ALLOW),
  },
  {
    name: 'OpenRouter / chat.completions outside llmCall',
    pattern: /openrouter\.ai|chat\.completions\.create|getOpenRouterClient|['"`]openrouter\/router['"`]/,
    allow: new Set([
      'packages/core/src/logic/openRouterChat.ts',
      'packages/core/src/llm/falRouter.ts',
    ]),
  },
  {
    name: 'messages.create / new Anthropic(',
    pattern: /messages\.create|new Anthropic\(/,
    allow: new Set(),
  },
  {
    name: 'api.anthropic.com',
    pattern: /api\.anthropic\.com/,
    allow: new Set(),
  },
  {
    name: 'api.x.ai',
    pattern: /api\.x\.ai/,
    allow: new Set(['src/lib/providers/grok.ts']),
  },
  {
    name: '@runwayml client',
    pattern: /@runwayml\/sdk|new RunwayML\(/,
    allow: new Set(['src/lib/providers/runway.ts']),
  },
  {
    name: 'ElevenLabs SDK construction',
    pattern: /new ElevenLabsClient\(|@elevenlabs\/elevenlabs-js/,
    allow: new Set([
      'src/lib/elevenlabs/client.ts',
      // Electron cannot import the Next.js client. This file is the desktop process gate (pause + source).
      'cinematic-forge-v3/src/main/ai/elevenlabsClient.ts',
    ]),
  },
  {
    name: 'Suno client',
    pattern: /studio-api\.suno\.ai|api\.suno\.ai/,
    allow: new Set(['src/lib/audio/suno.ts']),
  },
  {
    name: 'trainer / SAM-3 / voice-clone endpoint outside the gated submit',
    pattern: /lora-fast-training|sam-3\/image-rle|elevenlabs\/clone-voice|\/trainer['"`]/,
    allow: new Set([
      'packages/core/src/logic/trainerRegistry.ts',
      'packages/core/src/logic/elevenlabs.ts',
      'packages/core/src/logic/trainingSet.ts',
      'src/lib/fal/falQueue.ts',
    ]),
  },
  {
    name: 'addClip store definition',
    pattern: /^\s*addClip\s*:/,
    allow: new Set([
      'src/store/playbackStore.ts',
      'src/store/timeline.ts',
      'src/store/editor.ts',
      'cinematic-forge-v3/src/renderer/store/timeline.ts',
      'cinematic-forge-v3/src/preload/index.ts',
    ]),
  },
  {
    name: 'resolveModel definition',
    pattern: /function resolveModel\b/,
    allow: new Set(['packages/core/src/logic/resolveModel.ts']),
  },
  {
    name: 'VIDEO_MODEL_REGISTRY definition',
    pattern: /export const VIDEO_MODEL_REGISTRY\b/,
    allow: new Set(['packages/core/src/logic/registry.ts']),
  },
  {
    name: 'buildPayload definition',
    pattern: /function buildPayload\b/,
    allow: new Set(['packages/core/src/logic/payload.ts']),
  },
]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name)) out.push(full)
  }
  return out
}

const SUBMIT_CALL = /fal\.queue\.submit\s*\(/
const QUEUE_FETCH = /fetch\s*\(\s*[`'"][^`'"]*queue\.fal\.run/
const WEB_SUBMIT = 'packages/core/src/fal/guardedSubmit.ts'

function enclosingTop(lines, index) {
  for (let i = index; i >= 0; i--) {
    const match = lines[i].match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/)
    if (match) return { name: match[1], start: i }
    if (i < index && /^}\s*$/.test(lines[i])) return null
  }
  return null
}

function desktopSubmitGuarded(rel, lines, index) {
  if (rel !== 'cinematic-forge-v3/src/main/ai/falQueue.ts') return false
  const fn = enclosingTop(lines, index)
  if (!fn || fn.name !== 'submitToFal') return false
  const before = lines.slice(fn.start, index).join('\n')
  return /throw new GenerationPausedError/.test(before)
}

function guardedSubmitCopy(lines, index) {
  let depth = 0
  let started = false
  const chunk = []
  for (let j = index; j < lines.length; j++) {
    const line = lines[j]
    chunk.push(line)
    if (!started) {
      if (/\)\s*(?::[^{]*)?\{/.test(line)) {
        started = true
        depth = 1
      }
      continue
    }
    for (const ch of line) {
      if (ch === '{') depth++
      else if (ch === '}') depth--
    }
    if (depth === 0) break
  }
  const body = chunk.join('\n')
  const pauseAt = body.search(/throw new GenerationPausedError|assertGenerationNotPaused|generationPausedFromEnv|guardedFalSubmit/)
  const submitAt = body.search(/fal\.queue\.submit\s*\(/)
  if (submitAt < 0) return pauseAt >= 0
  return pauseAt >= 0 && pauseAt < submitAt
}

function collectSubmitBypass(rel, lines) {
  const found = []
  lines.forEach((line, i) => {
    const submit = SUBMIT_CALL.test(line)
    const queued = QUEUE_FETCH.test(line)
    const copy = /\bfunction\s+submitToFal\b/.test(line) && rel !== WEB_SUBMIT
    if (!submit && !queued && !copy) return
    const fn = enclosingTop(lines, i)
    const webSubmit = rel === WEB_SUBMIT && fn?.name === 'guardedFalSubmit' && submit
    if (webSubmit) {
      found.push({ kind: 'allowed', text: `${rel}:${i + 1}  ${line.trim()}` })
      return
    }
    if (submit && desktopSubmitGuarded(rel, lines, i)) return
    if (copy && guardedSubmitCopy(lines, i)) return
    found.push({ kind: 'violation', text: `${rel}:${i + 1}  ${line.trim()}` })
  })
  return found
}

const PROVIDER_SUBMIT = /imageToVideo\.create\s*\(|textToVideo\.create\s*\(|predictions\.create\s*\(|api\.replicate\.com|api\.x\.ai/

/**
 * Hosts that bill. A fetch or SDK submit to one of these is an egress.
 * queue.fal.run submit is fal.queue.submit (collected separately). The
 * result-URL string in falQueue is not a call and is not an egress.
 */
const PAID_HOSTS = [
  'queue.fal.run',
  'fal.run',
  'api.anthropic.com',
  'openrouter.ai',
  'api.openai.com',
  'api.replicate.com',
  'api.x.ai',
  'api.dev.runwayml.com',
  'api.voyageai.com',
  'studio-api.suno.ai',
  'api.suno.ai',
]

function lineHasPaidHost(line, host) {
  if (!line.includes(host)) return false
  // fal.run is a suffix of queue.fal.run. Count only the host that was written.
  if (host === 'fal.run' && line.includes('queue.fal.run')) return false
  // Schema reads are not a billable submit.
  if (host === 'fal.run' && line.includes('/schema')) return false
  return true
}

const PAID_EGRESS_ALLOW = {
  'queue.fal.run': ['packages/core/src/fal/guardedSubmit.ts'],
  'fal.run': ['packages/core/src/llm/falRouter.ts'],
  'api.replicate.com': ['cinematic-forge-v3/src/main/ai/providers.ts'],
  'api.x.ai': ['src/lib/providers/grok.ts'],
  'api.dev.runwayml.com': ['src/lib/providers/runway.ts'],
  'api.voyageai.com': ['src/lib/cognition/memory/embeddings.ts'],
  'studio-api.suno.ai': ['src/lib/audio/suno.ts'],
  'api.suno.ai': ['src/lib/audio/suno.ts'],
}

const SDK_EGRESS = [
  { pattern: /imageToVideo\.create\s*\(|textToVideo\.create\s*\(/, allow: ['src/lib/providers/runway.ts'] },
  { pattern: /predictions\.create\s*\(/, allow: ['cinematic-forge-v3/src/main/ai/providers.ts', 'src/lib/providers/replicate.ts'] },
]

function pauseAssertedBefore(lines, index) {
  const fn = enclosingTop(lines, index)
  if (!fn) return false
  const before = lines.slice(fn.start, index).join('\n')
  return /assertGenerationNotPaused\s*\(/.test(before)
    || /throw new GenerationPausedError/.test(before)
    || /generationPausedFromEnv\s*\(/.test(before)
    || /isGenerationPaused\s*\(/.test(before)
    || /name\s*=\s*['"]GenerationPausedError['"]/.test(before)
}

function paidHostConsts(lines) {
  const names = new Map()
  for (const line of lines) {
    const match = line.match(/(?:const|let)\s+([A-Z0-9_]+)\s*=\s*['"`]([^'"`]+)['"`]/)
    if (!match) continue
    const host = [...PAID_HOSTS].sort((a, b) => b.length - a.length).find((item) => lineHasPaidHost(match[2], item))
    if (host) names.set(match[1], host)
  }
  return names
}

function hostsOnEgressLine(line, consts) {
  const hosts = PAID_HOSTS.filter((host) => lineHasPaidHost(line, host))
  if (/fetch/.test(line)) {
    for (const [name, host] of consts) {
      if (line.includes(name) && !hosts.includes(host)) hosts.push(host)
    }
  }
  return hosts
}

function collectPaidEgress(rel, lines) {
  const consts = paidHostConsts(lines)
  const found = []
  lines.forEach((line, i) => {
    const fetchCall = /fetch/.test(line)
    const hosts = fetchCall ? hostsOnEgressLine(line, consts) : PAID_HOSTS.filter((host) => lineHasPaidHost(line, host) && /fetch/.test(line))
    const sdk = SDK_EGRESS.find((row) => row.pattern.test(line))
    if (!hosts.length && !sdk) return
    const allowedHosts = hosts.every((host) => (PAID_EGRESS_ALLOW[host] ?? []).includes(rel))
    const allowedSdk = !sdk || sdk.allow.includes(rel)
    if (allowedHosts && allowedSdk && pauseAssertedBefore(lines, i)) return
    found.push(`${rel}:${i + 1}  ${line.trim()}`)
  })
  return found
}

function collectViolations(rel, lines) {
  const found = []
  lines.forEach((line, i) => {
    if (PROVIDER_SUBMIT.test(line) && !pauseAssertedBefore(lines, i)) {
      found.push(`${rel}:${i + 1}  ${line.trim()}`)
    }
    for (const rule of RULES) {
      if (!rule.pattern.test(line)) continue
      if (rule.name.startsWith('fal.subscribe') && /https?:\/\/queue\.fal\.run/.test(line) && !/fetch\s*\(/.test(line)) continue
      if (rule.allow.has(rel)) continue
      if (PROVIDER_SUBMIT.test(line) && pauseAssertedBefore(lines, i)) continue
      found.push(`${rel}:${i + 1}  ${line.trim()}`)
    }
  })
  found.push(...collectPaidEgress(rel, lines))
  return found
}

function selfTest() {
  const probes = [
    ["fetch('https://openrouter.ai/api/v1/chat/completions')", 'OpenRouter'],
    ['client.messages.create({})', 'messages.create'],
    ["fal.subscribe('fal-ai/probe')", 'fal.subscribe'],
    ['queue.fal.run("fal-ai/probe")', 'queue.fal.run'],
    ["fetch('https://fal.run/fal-ai/flux-lora-fast-training')", 'trainer endpoint'],
    ['client.imageToVideo.create({})', 'Runway submit'],
    ['replicate.predictions.create({})', 'Replicate submit'],
    ["fetch('https://queue.fal.run/x')", 'queue.fal.run'],
    ["fetch('https://fal.run/openrouter/router/openai/v1/chat/completions')", 'fal.run'],
    ["fetch('https://api.anthropic.com/v1/messages')", 'api.anthropic.com'],
    ["fetch('https://api.openai.com/v1/audio/transcriptions')", 'api.openai.com'],
    ["fetch('https://api.replicate.com/v1/predictions')", 'api.replicate.com'],
    ["fetch('https://api.x.ai/v1/videos')", 'api.x.ai'],
    ["fetch('https://api.dev.runwayml.com/v1/image_to_video')", 'api.dev.runwayml.com'],
    ["fetch('https://api.voyageai.com/v1/embeddings')", 'api.voyageai.com'],
    ["fetch('https://studio-api.suno.ai/api/generate')", 'studio-api.suno.ai'],
    ["fetch('https://api.suno.ai/v1/generate')", 'api.suno.ai'],
  ]
  const missed = []
  for (const [line, label] of probes) {
    const hit = collectViolations('src/lib/__dpfix_probe.ts', [line])
    if (!hit.length) missed.push(label)
  }
  if (missed.length) {
    console.error(`check-chokepoints: self-test missed ${missed.join(', ')}`)
    process.exit(1)
  }

  const planted = join(root, 'src/lib/__chokepoint_bypass_probe.ts')
  writeFileSync(planted, [
    'export async function sneak() {',
    "  return fal.queue.submit('fal-ai/probe', { input: {} })",
    '}',
    'export async function sneakLlm() {',
    '  return client.messages.create({})',
    '}',
    'export async function sneakRunway() {',
    '  return client.imageToVideo.create({})',
    '}',
    'export async function sneakReplicate() {',
    '  return replicate.predictions.create({})',
    '}',
    'export async function sneakHosts() {',
    "  fetch('https://queue.fal.run/x')",
    "  fetch('https://fal.run/openrouter/router/openai/v1/chat/completions')",
    "  fetch('https://api.anthropic.com/v1/messages')",
    "  fetch('https://openrouter.ai/api/v1/chat/completions')",
    "  fetch('https://api.openai.com/v1/audio/transcriptions')",
    "  fetch('https://api.replicate.com/v1/predictions')",
    "  fetch('https://api.x.ai/v1/videos')",
    "  fetch('https://api.dev.runwayml.com/v1/image_to_video')",
    "  fetch('https://api.voyageai.com/v1/embeddings')",
    "  fetch('https://studio-api.suno.ai/api/generate')",
    "  fetch('https://api.suno.ai/v1/generate')",
    '}',
    '',
  ].join('\n'))
  try {
    const plantedRel = 'src/lib/__chokepoint_bypass_probe.ts'
    const plantedLines = readFileSync(planted, 'utf8').split('\n')
    const hit = collectSubmitBypass(plantedRel, plantedLines).filter((row) => row.kind === 'violation')
    if (!hit.length) {
      console.error('check-chokepoints: self-test missed planted fal.queue.submit bypass')
      process.exit(1)
    }
    const llmHit = collectViolations(plantedRel, plantedLines).filter((row) => row.includes('messages.create'))
    if (!llmHit.length) {
      console.error('check-chokepoints: self-test missed planted messages.create bypass')
      process.exit(1)
    }
    const runwayHit = collectViolations(plantedRel, plantedLines).filter((row) => row.includes('imageToVideo.create'))
    if (!runwayHit.length) {
      console.error('check-chokepoints: self-test missed planted Runway submit')
      process.exit(1)
    }
    const replicateHit = collectViolations(plantedRel, plantedLines).filter((row) => row.includes('predictions.create'))
    if (!replicateHit.length) {
      console.error('check-chokepoints: self-test missed planted Replicate submit')
      process.exit(1)
    }
    const plantedHits = collectViolations(plantedRel, plantedLines)
    const requiredHosts = [
      'queue.fal.run',
      'fal.run',
      'api.anthropic.com',
      'openrouter.ai',
      'api.openai.com',
      'api.replicate.com',
      'api.x.ai',
      'api.dev.runwayml.com',
      'api.voyageai.com',
      'studio-api.suno.ai',
      'api.suno.ai',
    ]
    const missedHosts = requiredHosts.filter((host) => !plantedHits.some((row) => row.includes(host)))
    if (missedHosts.length) {
      console.error(`check-chokepoints: self-test missed planted hosts ${missedHosts.join(', ')}`)
      process.exit(1)
    }
    console.log('check-chokepoints: self-test RED (planted paid hosts)')
    const seen = new Set()
    for (const row of plantedHits) {
      if (!requiredHosts.some((host) => row.includes(host)) || seen.has(row)) continue
      seen.add(row)
      console.log(row)
    }
    console.log('check-chokepoints: self-test plants removed')
  } finally {
    try { unlinkSync(planted) } catch { /* already gone */ }
  }
}

selfTest()

const violations = []
const allowedSubmits = []
for (const file of roots.flatMap((dir) => walk(dir))) {
  const rel = relative(root, file).split('\\').join('/')
  const lines = readFileSync(file, 'utf8').split('\n')
  violations.push(...collectViolations(rel, lines))
  for (const row of collectSubmitBypass(rel, lines)) {
    if (row.kind === 'allowed') allowedSubmits.push(row.text)
    else violations.push(row.text)
  }
}

if (allowedSubmits.length) {
  console.log('check-chokepoints: allowed submit')
  for (const row of allowedSubmits) console.log(row)
}

if (violations.length) {
  console.error(`check-chokepoints: ${violations.length} violation(s)`)
  for (const v of violations) console.error(v)
  process.exit(1)
}

console.log('check-chokepoints: 0 violations')
