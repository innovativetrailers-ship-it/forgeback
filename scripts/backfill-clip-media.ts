import 'dotenv/config'
import { db } from '../src/lib/db'
import { persistClipVideoToR2 } from '../src/lib/storage/persistMedia'
import { clipVideoKey, objectKeyFromStored } from '../src/lib/storage/r2'

async function main() {
const clips = await db.studioClip.findMany({
  where: { status: 'COMPLETED', storageKey: null, videoUrl: { not: null } },
  select: { id: true, videoUrl: true, scene: { select: { projectId: true } } },
})

let mirrored = 0
let dead = 0
for (const clip of clips) {
  const source = clip.videoUrl?.trim()
  if (!source) continue
  try {
    const stored = await persistClipVideoToR2(source, clip.scene.projectId, clip.id)
    const storageKey = objectKeyFromStored(stored) ?? clipVideoKey(clip.scene.projectId, clip.id)
    await db.studioClip.update({
      where: { id: clip.id },
      data: { videoUrl: stored, rawVideoUrl: source, storageKey },
    })
    mirrored += 1
    console.log(`mirrored ${clip.id}`)
  } catch (err) {
    dead += 1
    console.log(`dead ${clip.id} ${err instanceof Error ? err.message : 'download failed'}`)
  }
}
console.log(`backfill mirrored=${mirrored} dead=${dead} scanned=${clips.length}`)
await db.$disconnect()
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : 'backfill failed')
  process.exit(1)
})
