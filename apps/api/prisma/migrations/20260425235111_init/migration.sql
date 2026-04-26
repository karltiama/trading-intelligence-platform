-- AlterTable
ALTER TABLE "StrategyRun" ADD COLUMN     "userEmail" TEXT NOT NULL DEFAULT 'local-default@paper.local';

-- CreateIndex
CREATE INDEX "StrategyRun_userEmail_startedAt_idx" ON "StrategyRun"("userEmail", "startedAt");
