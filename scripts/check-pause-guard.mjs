/**
 * Fail when a paid submit can run while GENERATION_PAUSED is unset.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname

function problemsIn(pauseSource, submitSource) {
  const problems = []
  if (!pauseSource.includes("value === 'false'") || !pauseSource.includes('return true')) {
    problems.push('unset GENERATION_PAUSED does not resolve to paused')
  }
  if (!submitSource.includes('generationPausedFromEnv') || !submitSource.includes('GenerationPausedError')) {
    problems.push('guarded submit does not throw when generation is paused')
  }
  return problems
}

function selfTest() {
  const hit = problemsIn('export function generationPausedFromEnv(){ return false }', 'export async function guardedFalSubmit(){ return true }')
  if (hit.length < 2) {
    console.error('check-pause-guard: self-test missed a removed pause assert')
    process.exit(1)
  }
  console.log('check-pause-guard: self-test RED (pause assert removed)')
  console.log(hit[0])
}

selfTest()
const pauseSource = readFileSync(join(root, 'packages/core/src/adapters/chokepoints.ts'), 'utf8')
const submitSource = readFileSync(join(root, 'packages/core/src/fal/guardedSubmit.ts'), 'utf8')
const problems = problemsIn(pauseSource, submitSource)
if (problems.length) {
  console.error(`check-pause-guard: ${problems.length} problem(s)`)
  for (const row of problems) console.error(row)
  process.exit(1)
}
console.log('check-pause-guard: pause default and guarded submit hold')
