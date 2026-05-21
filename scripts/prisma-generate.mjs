#!/usr/bin/env node
/**
 * Prisma generate for install/build when DATABASE_URL is not yet provisioned
 * (e.g. Railway Docker build before shared variables are injected).
 */
import { spawnSync } from 'node:child_process'

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://build:build@127.0.0.1:5432/cinema_build'
}

const result = spawnSync('npx', ['prisma', 'generate'], {
  stdio: 'inherit',
  shell: true,
})

process.exit(result.status ?? 1)
