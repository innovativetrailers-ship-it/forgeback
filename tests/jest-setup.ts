process.env.NEXT_PHASE = 'phase-production-build'
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://jest:jest@127.0.0.1:5432/jest'
}
if (!process.env.FAL_KEY && !process.env.FAL_API_KEY) {
  process.env.FAL_KEY = 'jest-not-a-real-key'
}
