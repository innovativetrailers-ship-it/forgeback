#!/usr/bin/env node
// Set or clear isInternal for the one ungated account. Refuses every other email.
import { createInterface } from 'node:readline'
import pg from 'pg'
import { config } from 'dotenv'

export const ALLOWED_INTERNAL_EMAIL = 'innovative.trailers@gmail.com'

config({ path: new URL('../.env.local', import.meta.url) })
config({ path: new URL('../.env', import.meta.url) })

export function assertInternalEmail(email) {
  const normalised = String(email ?? '').trim().toLowerCase()
  if (normalised !== ALLOWED_INTERNAL_EMAIL) {
    throw new Error('Refusing: that email is not the ungated account.')
  }
  return normalised
}

function ask(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve))
}

async function main() {
  if (!process.stdin.isTTY) {
    console.error('Run this in a terminal so the email prompt can be answered.')
    process.exit(1)
  }
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }
  const revoke = process.argv.includes('--revoke')
  const pool = new pg.Pool({ connectionString: url, max: 1 })
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const email = assertInternalEmail(await ask(rl, 'Account email: '))
    const found = await pool.query('SELECT id, role, "isInternal" FROM "User" WHERE lower(email) = $1', [email])
    if (found.rowCount !== 1) {
      console.error(`Refusing: ${found.rowCount ?? 0} users match. Expected exactly one.`)
      process.exit(1)
    }
    const user = found.rows[0]
    console.log(`Matched user id ${user.id} role ${user.role} isInternal ${user.isInternal}`)
    const confirm = String(await ask(rl, revoke ? 'Type yes to set isInternal=false: ' : 'Type yes to set isInternal=true: ')).trim().toLowerCase()
    if (confirm !== 'yes') {
      console.error('Refusing: confirmation was not yes.')
      process.exit(1)
    }
    await pool.query('UPDATE "User" SET "isInternal" = $2 WHERE id = $1', [user.id, !revoke])
    console.log(`isInternal ${revoke ? 'cleared' : 'set'} for user id ${user.id}`)
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err)
    console.error(text.includes('postgres://') || text.includes('postgresql://') ? 'Database connection failed' : text)
    process.exitCode = 1
  } finally {
    rl.close()
    await pool.end()
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (isMain) await main()
