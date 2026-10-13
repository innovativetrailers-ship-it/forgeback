import { readFileSync } from 'node:fs'
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const { PrismaClient } = await import('../src/generated/prisma/client.js')
const { PrismaPg } = await import('@prisma/adapter-pg')
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const id = 'IKJr28EDV9KM7yEnbFLDU'
const found = await db.renderJob.findUnique({ where: { id } })
console.log('record exists:', !!found, found ? `status=${found.status}` : '')

try {
  const r = await db.renderJob.update({ where: { id }, data: { status: 'PROCESSING' } })
  console.log('UPDATE OK ->', r.status)
} catch (e) {
  console.log('UPDATE FAILED full message:\n', e?.message)
  console.log('code:', e?.code)
}
await db.$disconnect()
process.exit(0)
