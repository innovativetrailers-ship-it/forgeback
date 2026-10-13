#!/usr/bin/env node
// Grant a small credit pack to one ordinary test account.
// Uses grantCredits(), the same writer as a Stripe pack purchase.
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import pg from 'pg'
import { config } from 'dotenv'
import { tsImport } from 'tsx/esm/api'

export const DEFAULT_GRANT = 50
export const MAX_GRANT = 200
const UNGATED_EMAIL = 'innovative.trailers@gmail.com'

config({ path: new URL('../.env.local', import.meta.url), quiet: true })
config({ path: new URL('../.env', import.meta.url), quiet: true })

export function parseGrantAmount(argv) {
  const flag = argv.indexOf('--credits')
  if (flag === -1) return DEFAULT_GRANT
  const raw = argv[flag + 1]
  const amount = Number(raw)
  if (!Number.isInteger(amount) || amount < 1) {
    throw new Error('Refusing: --credits must be a whole number of at least 1.')
  }
  if (amount > MAX_GRANT) {
    throw new Error(`Refusing: --credits ${amount} is above the hard max of ${MAX_GRANT}.`)
  }
  return amount
}

export function assertGrantableUser(user) {
  const email = String(user?.email ?? '').trim().toLowerCase()
  if (!email) throw new Error('Refusing: the matched user has no email.')
  if (user.isInternal === true || email === UNGATED_EMAIL) {
    throw new Error('Refusing: that account is internal.')
  }
  if (user.canUseOwnKeys === true) {
    throw new Error('Refusing: that account can use its own key.')
  }
  return email
}

function ask(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve))
}

function databaseName(url) {
  try {
    const path = new URL(url).pathname.replace(/^\//, '')
    return path.split('?')[0] || 'unknown'
  } catch {
    return 'unknown'
  }
}

async function main() {
  let amount
  try {
    amount = parseGrantAmount(process.argv)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
  if (!process.stdin.isTTY) {
    console.error('Run this in a terminal so the email prompt can be answered.')
    process.exit(1)
  }
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }
  const loaded = await tsImport('../src/lib/credits/grant.ts', import.meta.url)
  const grantCredits = loaded.grantCredits ?? loaded.default?.grantCredits
  if (typeof grantCredits !== 'function') {
    throw new Error('grantCredits did not load')
  }
  const pool = new pg.Pool({ connectionString: url, max: 1 })
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    console.log(`Database name: ${databaseName(url)}`)
    console.log(`Grant amount: ${amount} (hard max ${MAX_GRANT})`)
    const email = String(await ask(rl, 'Test account email: ')).trim().toLowerCase()
    if (!email) {
      console.error('Refusing: email was empty.')
      process.exit(1)
    }
    const found = await pool.query(
      'SELECT id, email, "isInternal", "canUseOwnKeys", "creditBalance" FROM "User" WHERE lower(email) = $1',
      [email],
    )
    if (found.rowCount !== 1) {
      console.error(`Refusing: ${found.rowCount ?? 0} users match. Expected exactly one.`)
      process.exit(1)
    }
    const user = found.rows[0]
    assertGrantableUser(user)
    console.log(`Matched user id ${user.id} balance ${user.creditBalance}`)
    const confirm = String(await ask(rl, `Type yes to grant ${amount} credits: `)).trim().toLowerCase()
    if (confirm !== 'yes') {
      console.error('Refusing: confirmation was not yes.')
      process.exit(1)
    }
    const externalId = `test-grant-${user.id}-${Date.now()}`
    const client = await pool.connect()
    let result
    try {
      await client.query('BEGIN')
      const tx = {
        creditTransaction: {
          findFirst: async ({ where }) => {
            const foundTxn = await client.query(
              'SELECT "balanceAfter" FROM "CreditTransaction" WHERE "stripeId" = $1 LIMIT 1',
              [where.stripeId],
            )
            return foundTxn.rows[0] ?? null
          },
          create: async ({ data }) => {
            await client.query(
              `INSERT INTO "CreditTransaction"
                 (id, "userId", amount, type, description, "stripeId", "balanceAfter", "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
              [randomUUID(), data.userId, data.amount, data.type, data.description, data.stripeId, data.balanceAfter],
            )
          },
        },
        user: {
          update: async ({ where, data }) => {
            const updated = await client.query(
              `UPDATE "User"
                 SET "creditBalance" = "creditBalance" + $2, "updatedAt" = NOW()
                 WHERE id = $1
                 RETURNING "creditBalance"`,
              [where.id, data.creditBalance.increment],
            )
            return updated.rows[0]
          },
        },
      }
      result = await grantCredits(
        { $transaction: (fn) => fn(tx) },
        user.id,
        'admin',
        externalId,
        amount,
        'admin-grant',
      )
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
    console.log(`granted ${result.granted} balanceAfter ${result.balanceAfter} type admin-grant`)
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
