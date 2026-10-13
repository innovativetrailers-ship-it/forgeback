-- D2 additive. Rows stay. Cascades that removed user work now restrict.
ALTER TABLE "VaultCharacter" ADD COLUMN IF NOT EXISTS "retiredAt" TIMESTAMP(3);
ALTER TABLE "AudioTrack" ADD COLUMN IF NOT EXISTS "retiredAt" TIMESTAMP(3);
ALTER TABLE "Playbook" ADD COLUMN IF NOT EXISTS "retiredAt" TIMESTAMP(3);
ALTER TABLE "MediaBin" ADD COLUMN IF NOT EXISTS "retiredAt" TIMESTAMP(3);
ALTER TABLE "BinClipEntry" ADD COLUMN IF NOT EXISTS "retiredAt" TIMESTAMP(3);

ALTER TABLE "StudioClip" DROP CONSTRAINT IF EXISTS "StudioClip_sceneId_fkey";
ALTER TABLE "StudioClip" ADD CONSTRAINT "StudioClip_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "StudioScene"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AudioTrack" DROP CONSTRAINT IF EXISTS "AudioTrack_projectId_fkey";
ALTER TABLE "AudioTrack" ADD CONSTRAINT "AudioTrack_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WardrobeItem" DROP CONSTRAINT IF EXISTS "WardrobeItem_characterId_fkey";
ALTER TABLE "WardrobeItem" ADD CONSTRAINT "WardrobeItem_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "VaultCharacter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Asset" DROP CONSTRAINT IF EXISTS "Asset_ownerId_fkey";
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Playbook" DROP CONSTRAINT IF EXISTS "Playbook_userId_fkey";
ALTER TABLE "Playbook" ADD CONSTRAINT "Playbook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Playbook" DROP CONSTRAINT IF EXISTS "Playbook_projectId_fkey";
ALTER TABLE "Playbook" ADD CONSTRAINT "Playbook_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
