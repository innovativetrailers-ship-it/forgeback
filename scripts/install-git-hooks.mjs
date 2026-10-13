/**
 * Installs scripts/git-hooks/pre-commit into .git/hooks when this is a git checkout.
 * Does not change git config. No-ops in CI checkouts that omit .git/hooks.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const hooksDir = join(root, '.git', 'hooks')
if (!existsSync(hooksDir)) {
  process.exit(0)
}
mkdirSync(hooksDir, { recursive: true })
const src = join(root, 'scripts', 'git-hooks', 'pre-commit')
const dest = join(hooksDir, 'pre-commit')
copyFileSync(src, dest)
chmodSync(dest, 0o755)
console.log('install-git-hooks: pre-commit → chokepoints, swallowed catches, endpoints')
