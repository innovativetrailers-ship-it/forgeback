#!/usr/bin/env node
// Read-only check of one user's credit ledger. Prints PASS or FAIL. Does not write.
import pg from 'pg'
import { config } from 'dotenv'

config({ path: new URL('../.env.local', import.meta.url), quiet: true })
config({ path: new URL('../.env', import.meta.url), quiet: true })

const RELEASE_TYPES = new Set(['release'])
const REFUND_PREFIX = 'Refund'

export function isRefund(row) {
  return row.type === 'refund' || String(row.description ?? '').startsWith(REFUND_PREFIX)
}

export function isGrant(row) {
  if (row.amount <= 0) return false
  if (RELEASE_TYPES.has(row.type)) return false
  if (isRefund(row)) return false
  if (row.type === 'internal') return false
  return true
}

export function ledgerIdentity({ balance, held, transactions, holds }) {
  const grants = transactions.filter(isGrant).reduce((sum, row) => sum + row.amount, 0)
  const refunds = transactions.filter(isRefund).reduce((sum, row) => sum + row.amount, 0)
  const consumed = holds
    .filter((hold) => hold.status === 'SETTLED')
    .reduce((sum, hold) => sum + hold.amountUsed, 0)
  const left = balance + held + consumed
  const right = grants - refunds
  return { grants, refunds, consumed, left, right, ok: left === right }
}

function providerRequestId(job) {
  const meta = job.metadata && typeof job.metadata === 'object' ? job.metadata.falRequestId : null
  const payload = job.inputPayload && typeof job.inputPayload === 'object' ? job.inputPayload.falRequestId : null
  return (typeof meta === 'string' && meta) || (typeof payload === 'string' && payload) || null
}

function countType(transactions, jobId, type) {
  return transactions.filter((row) => row.jobId === jobId && row.type === type).length
}

export function assessBilling({ balance, held, jobs, holds, transactions }) {
  const lines = []
  const nonNegative = balance >= 0 && held >= 0
  lines.push(`${nonNegative ? 'PASS' : 'FAIL'} balance >= 0 and held >= 0 (${balance}, ${held})`)

  for (const job of jobs) {
    const jobHolds = holds.filter((hold) => hold.jobId === job.id)
    if (job.status === 'COMPLETE') {
      const settledOnce = jobHolds.length === 1
        && jobHolds[0].status === 'SETTLED'
        && countType(transactions, job.id, 'release') <= 1
        && countType(transactions, job.id, 'deduction') <= 1
      lines.push(`${settledOnce ? 'PASS' : 'FAIL'} job ${job.id} settled exactly once`)
    }
    if (job.status === 'FAILED' || job.status === 'CANCELLED') {
      const releasedOnce = jobHolds.length === 1
        && jobHolds[0].status === 'REFUNDED'
        && countType(transactions, job.id, 'release') === 1
        && countType(transactions, job.id, 'deduction') === 0
      lines.push(`${releasedOnce ? 'PASS' : 'FAIL'} job ${job.id} released its hold exactly once`)
    }
  }

  const books = ledgerIdentity({ balance, held, transactions, holds })
  lines.push(`${books.ok ? 'PASS' : 'FAIL'} balance + held + consumed = grants - refunds (${books.left} vs ${books.right})`)
  return { lines, ok: lines.every((line) => line.startsWith('PASS')) }
}

async function main() {
  const email = String(process.argv[2] ?? '').trim().toLowerCase()
  if (!email) {
    console.error('Usage: npx tsx scripts/verify-billing-run.mjs <email>')
    process.exit(1)
  }
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }
  const pool = new pg.Pool({ connectionString: url, max: 1 })
  const client = await pool.connect()
  try {
    await client.query('SET default_transaction_read_only = on')
    const found = await client.query(
      'SELECT id, "creditBalance", "heldCredits" FROM "User" WHERE lower(email) = $1',
      [email],
    )
    if (found.rowCount !== 1) {
      console.error(`Refusing: ${found.rowCount ?? 0} users match. Expected exactly one.`)
      process.exit(1)
    }
    const user = found.rows[0]
    const txns = await client.query(
      'SELECT id, amount, type, description, "jobId", "balanceAfter", "createdAt" FROM "CreditTransaction" WHERE "userId" = $1 ORDER BY "createdAt" DESC',
      [user.id],
    )
    const holds = await client.query(
      'SELECT id, "jobId", "amountHeld", "amountUsed", status, "settledAt", "createdAt" FROM "CreditHold" WHERE "userId" = $1 ORDER BY "createdAt" DESC',
      [user.id],
    )
    const jobs = await client.query(
      'SELECT id, status, type, metadata, "inputPayload", "createdAt" FROM "RenderJob" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 20',
      [user.id],
    )

    console.log(`user ${user.id}`)
    console.log(`creditBalance ${user.creditBalance}`)
    console.log(`heldCredits ${user.heldCredits}`)
    console.log('last CreditTransaction rows')
    for (const row of txns.rows.slice(0, 20)) {
      console.log(`  ${row.createdAt.toISOString()} amount ${row.amount} type ${row.type ?? ''} job ${row.jobId ?? ''} balanceAfter ${row.balanceAfter}`)
    }
    console.log('open CreditHold rows')
    for (const row of holds.rows.filter((hold) => hold.status === 'ACTIVE')) {
      console.log(`  ${row.id} job ${row.jobId} held ${row.amountHeld} used ${row.amountUsed} ${row.status}`)
    }
    console.log('settled CreditHold rows')
    for (const row of holds.rows.filter((hold) => hold.status === 'SETTLED')) {
      console.log(`  ${row.id} job ${row.jobId} held ${row.amountHeld} used ${row.amountUsed} ${row.status}`)
    }
    console.log('released CreditHold rows')
    for (const row of holds.rows.filter((hold) => hold.status === 'REFUNDED')) {
      console.log(`  ${row.id} job ${row.jobId} held ${row.amountHeld} used ${row.amountUsed} ${row.status}`)
    }
    console.log('last jobs')
    for (const job of jobs.rows) {
      console.log(`  ${job.id} ${job.status} ${job.type} providerRequestId ${providerRequestId(job) ?? 'none'}`)
    }

    const report = assessBilling({
      balance: user.creditBalance,
      held: user.heldCredits,
      jobs: jobs.rows,
      holds: holds.rows,
      transactions: txns.rows,
    })
    for (const line of report.lines) console.log(line)
    if (!report.ok) process.exitCode = 1
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err)
    console.error(text.includes('postgres://') || text.includes('postgresql://') ? 'Database connection failed' : text)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (isMain) await main()
