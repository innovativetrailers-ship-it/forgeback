/**
 * @deprecated Use `npm run verify:fal` (scripts/verify-fal-endpoints.ts).
 * Thin wrapper for backwards compatibility.
 */
import { spawnSync } from 'node:child_process'
const args = process.argv.slice(2)
const r = spawnSync('npx', ['tsx', 'scripts/verify-fal-endpoints.ts', ...args], {
  stdio: 'inherit',
  env: process.env,
})
process.exit(r.status ?? 1)
