import { seedAll } from '../src/lib/cognition'

seedAll()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
