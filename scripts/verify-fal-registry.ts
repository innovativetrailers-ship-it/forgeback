/**
 * @deprecated Use `npm run verify:fal` — delegates to verify-fal-endpoints.ts
 */
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const r = spawnSync('npx', ['tsx', 'scripts/verify-fal-endpoints.ts', ...args], {
  stdio: 'inherit',
  env: process.env,
})
process.exit(r.status ?? 1)
