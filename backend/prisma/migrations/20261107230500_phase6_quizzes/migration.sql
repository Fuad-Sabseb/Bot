-- AlterTable
ALTER TABLE "PracticeQuestion"
  ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- AlterTable
ALTER TABLE "Quiz"
  ADD COLUMN IF NOT EXISTS "shuffleQuestions" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "shuffleOptions" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- Custom Check Constraints
ALTER TABLE "Quiz" DROP CONSTRAINT IF EXISTS "chk_quiz_duration";
ALTER TABLE "Quiz" ADD CONSTRAINT "chk_quiz_duration" CHECK ("durationMin" > 0);

ALTER TABLE "Quiz" DROP CONSTRAINT IF EXISTS "chk_quiz_passing_score";
ALTER TABLE "Quiz" ADD CONSTRAINT "chk_quiz_passing_score" CHECK ("passingScore" >= 0 AND "passingScore" <= 100);

ALTER TABLE "Quiz" DROP CONSTRAINT IF EXISTS "chk_quiz_max_attempts";
ALTER TABLE "Quiz" ADD CONSTRAINT "chk_quiz_max_attempts" CHECK ("maxAttempts" >= 1);

ALTER TABLE "QuizQuestion" DROP CONSTRAINT IF EXISTS "chk_quiz_question_points";
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "chk_quiz_question_points" CHECK ("points" >= 0);
