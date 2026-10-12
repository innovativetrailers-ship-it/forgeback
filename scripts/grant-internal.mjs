#!/usr/bin/env node
// One-off: set isInternal on a single production user. Prompts for the email.
// Refuses if zero or more than one user matches. Does not print the database URL.
import { createInterface } from 'node:readline'
import pg from 'pg'
import { config } from 'dotenv'

config({ path: new URL('../.env.local', import.meta.url) })
config({ path: new URL('../.env', import.meta.url) })

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

function ask(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve))
}

const pool = new pg.Pool({ connectionString: url, max: 1 })
const rl = createInterface({ input: process.stdin, output: process.stdout })

async function main() {
  if (!process.stdin.isTTY) {
    console.error('Run this in a terminal so the email prompt can be answered.')
    process.exit(1)
  }
  const email = String(await ask(rl, 'Account email: ')).trim().toLowerCase()
  if (!email || !email.includes('@')) {
    console.error('Refusing: that is not an email.')
    process.exit(1)
  }
  const found = await pool.query(
    'SELECT id, role, "isInternal" FROM "User" WHERE lower(email) = $1',
    [email],
  )
  if (found.rowCount !== 1) {
    console.error(`Refusing: ${found.rowCount ?? 0} users match. Expected exactly one.`)
    process.exit(1)
  }
  const user = found.rows[0]
  console.log(`Matched user id ${user.id} role ${user.role} isInternal ${user.isInternal}`)
  const confirm = String(await ask(rl, 'Type yes to set isInternal=true: ')).trim().toLowerCase()
  if (confirm !== 'yes') {
    console.error('Refusing: confirmation was not yes.')
    process.exit(1)
  }
  await pool.query('UPDATE "User" SET "isInternal" = true WHERE id = $1', [user.id])
  console.log(`isInternal set for user id ${user.id}`)
}

main().catch((err) => {
  const text = err instanceof Error ? err.message : String(err)
  console.error(text.includes('postgres://') || text.includes('postgresql://') ? 'Database connection failed' : text)
  process.exit(1)
}).finally(async () => {
  rl.close()
  await pool.end()
})
