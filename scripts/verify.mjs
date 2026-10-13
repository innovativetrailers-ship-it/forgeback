import { spawnSync } from 'node:child_process'

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('npx', ['tsc', '--noEmit', '--pretty', 'false', '--incremental', 'true', '--tsBuildInfoFile', '/tmp/cinema-verify.tsbuildinfo'])
run(process.execPath, ['scripts/verify-static.mjs'])
run('npx', ['jest', 'src/__tests__/launch-invariants.test.ts', '--runInBand', '--forceExit', '--no-coverage'])
console.log('verify: 0')
