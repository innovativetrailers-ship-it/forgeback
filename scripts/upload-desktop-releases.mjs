#!/usr/bin/env node
/** @deprecated Use scripts/upload-releases.mjs — kept as alias for older docs/scripts. */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const child = spawn(process.execPath, [join(dir, 'upload-releases.mjs'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
})
child.on('exit', (code) => process.exit(code ?? 1))
