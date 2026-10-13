import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg }     from '@prisma/adapter-pg'

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

const ADMIN_ACCOUNTS = [
  { email: 'innovative.trailers@gmail.com', name: 'Antonio Peixoto' },
  { email: 'susi.tate@gmail.com',           name: 'Susi Tate' },
]

async function main() {
  for (const account of ADMIN_ACCOUNTS) {
    await db.user.upsert({
      where:  { email: account.email },
      update: { role: 'ADMIN', creditBalance: 9_999_999 },
      create: {
        email:         account.email,
        name:          account.name,
        role:          'ADMIN',
        creditBalance: 9_999_999,
        totalGenerated: 0,
      },
    })
    console.log(`✓ Admin seeded: ${account.email}`)
  }

  console.log('✅ Dev accounts seeded: innovative.trailers@gmail.com, susi.tate@gmail.com')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
