import { execFileSync } from 'node:child_process'

try {
  const out = execFileSync('rg', ['-n', 'vaultLocation|VaultLocation|filmLocation|FilmLocation', 'src'], { encoding: 'utf8' })
  console.error(out)
  process.exit(1)
} catch (err) {
  const status = err && typeof err === 'object' && 'status' in err ? err.status : 1
  if (status === 1) {
    console.log('check-retired-location: 0')
    process.exit(0)
  }
  throw err
}
