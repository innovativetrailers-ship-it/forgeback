-- Wave B.5 voice. Additive. Existing shots load with dialogue null.
ALTER TABLE "StudioClip" ADD COLUMN "dialogue" JSONB;
