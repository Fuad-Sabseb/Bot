-- CreateTable
CREATE TABLE IF NOT EXISTS "BlogReport" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BlogReport_status_idx" ON "BlogReport"("status");
CREATE INDEX IF NOT EXISTS "BlogReport_postId_idx" ON "BlogReport"("postId");
CREATE INDEX IF NOT EXISTS "BlogReport_commentId_idx" ON "BlogReport"("commentId");
CREATE INDEX IF NOT EXISTS "BlogReport_reporterId_idx" ON "BlogReport"("reporterId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BlogReport_postId_fkey') THEN
        ALTER TABLE "BlogReport" ADD CONSTRAINT "BlogReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BlogReport_commentId_fkey') THEN
        ALTER TABLE "BlogReport" ADD CONSTRAINT "BlogReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "BlogComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BlogReport_reporterId_fkey') THEN
        ALTER TABLE "BlogReport" ADD CONSTRAINT "BlogReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- Check Constraints
ALTER TABLE "BlogPost" DROP CONSTRAINT IF EXISTS "chk_blog_post_title_length";
ALTER TABLE "BlogPost" ADD CONSTRAINT "chk_blog_post_title_length" CHECK (length(title) > 0);

ALTER TABLE "BlogComment" DROP CONSTRAINT IF EXISTS "chk_blog_comment_content_length";
ALTER TABLE "BlogComment" ADD CONSTRAINT "chk_blog_comment_content_length" CHECK (length(content) > 0);

ALTER TABLE "BlogReport" DROP CONSTRAINT IF EXISTS "chk_blog_report_target";
ALTER TABLE "BlogReport" ADD CONSTRAINT "chk_blog_report_target" CHECK (("postId" IS NOT NULL) OR ("commentId" IS NOT NULL));
