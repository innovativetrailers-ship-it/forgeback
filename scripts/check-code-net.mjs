/**
 * ADX-4 static gate: strict tsc flags + desktop TS5070 (resolveJsonModule needs moduleResolution).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = new URL('..', import.meta.url).pathname

function fail(label, detail) {
  console.error('FAIL', label, detail ?? '')
  process.exitCode = 1
}

function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'))
}

function assertStrict(rel) {
  const ts = readJson(rel)
  const opt = ts.compilerOptions ?? {}
  if (opt.strict !== true) fail(`${rel} strict`, opt.strict)
  else console.log('PASS', rel, 'strict:true')
}

function assertJsonModule(rel) {
  const ts = readJson(rel)
  const opt = ts.compilerOptions ?? {}
  const resolution = String(opt.moduleResolution ?? '').toLowerCase()
  if (opt.resolveJsonModule && !['node', 'node16', 'nodenext', 'bundler'].includes(resolution)) {
    fail(`${rel} TS5070: resolveJsonModule requires moduleResolution node/bundler`, opt.moduleResolution)
  } else {
    console.log('PASS', rel, 'resolveJsonModule + moduleResolution')
  }
}

assertStrict('tsconfig.json')
assertStrict('packages/core/tsconfig.json')
assertStrict('cinematic-forge-v3/tsconfig.json')
assertStrict('cinematic-forge-v3/tsconfig.main.json')
assertStrict('cinematic-forge-v3/tsconfig.preload.json')
assertStrict('cinematic-forge-v3/tsconfig.renderer.json')
assertJsonModule('cinematic-forge-v3/tsconfig.json')
assertJsonModule('cinematic-forge-v3/tsconfig.main.json')
assertJsonModule('cinematic-forge-v3/tsconfig.preload.json')
assertJsonModule('cinematic-forge-v3/tsconfig.renderer.json')

const projects = [
  'cinematic-forge-v3/tsconfig.main.json',
  'cinematic-forge-v3/tsconfig.preload.json',
  'cinematic-forge-v3/tsconfig.renderer.json',
]
for (const project of projects) {
  const desktop = spawnSync('npx', ['tsc', '-p', project, '--noEmit', '--pretty', 'false'], {
    cwd: root,
    encoding: 'utf8',
  })
  if (desktop.status !== 0) {
    const out = `${desktop.stdout || ''}\n${desktop.stderr || ''}`
    if (/TS5070/.test(out)) fail(`${project} TS5070`, out.slice(0, 800))
    else fail(`${project} tsc`, out.slice(0, 1200))
  } else {
    console.log('PASS desktop tsc --noEmit', project)
  }
}

const validate = spawnSync('node', ['scripts/validate-code-net.mjs'], { cwd: root, encoding: 'utf8' })
process.stdout.write(validate.stdout || '')
process.stderr.write(validate.stderr || '')
if (validate.status !== 0) fail('validate-code-net')

if (process.exitCode) process.exit(process.exitCode)
console.log('code net inspected; generation not run')
