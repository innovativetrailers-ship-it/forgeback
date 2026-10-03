import { spawnSync } from 'node:child_process'

const steps = [
  'scripts/check-chokepoints.mjs',
  'scripts/check-swallowed-catches.mjs',
  'scripts/check-endpoints.mjs',
  'scripts/check-one-worker.mjs',
  'scripts/check-route-segments.mjs',
  'scripts/check-dormant-auth.mjs',
  'scripts/check-pause-guard.mjs',
]

for (const step of steps) {
  const result = spawnSync(process.execPath, [step], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
console.log('verify-static: 0')
