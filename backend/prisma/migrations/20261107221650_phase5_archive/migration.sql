-- AlterTable
ALTER TABLE "ArchivedResource" 
  ADD COLUMN IF NOT EXISTS "assessmentType" TEXT,
  ADD COLUMN IF NOT EXISTS "examYear" INTEGER,
  ADD COLUMN IF NOT EXISTS "isOfficial" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "fileSha256" TEXT,
  ADD COLUMN IF NOT EXISTS "tags" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ArchivedResource_status_isOfficial_idx" ON "ArchivedResource"("status", "isOfficial");
CREATE INDEX IF NOT EXISTS "ArchivedResource_status_examYear_idx" ON "ArchivedResource"("status", "examYear");
