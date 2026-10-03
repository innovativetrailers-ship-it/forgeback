-- CreateTable
CREATE TABLE "Playbook" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "style" JSONB,
    "generation" JSONB,
    "language" JSONB,
    "rules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ruleActions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playbook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Playbook_userId_projectId_idx" ON "Playbook"("userId", "projectId");

-- CreateIndex
CREATE INDEX "Playbook_userId_idx" ON "Playbook"("userId");

-- AddForeignKey
ALTER TABLE "Playbook" ADD CONSTRAINT "Playbook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playbook" ADD CONSTRAINT "Playbook_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
