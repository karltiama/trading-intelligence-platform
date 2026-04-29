-- CreateTable
CREATE TABLE "ScannerRun" (
    "id" TEXT NOT NULL,
    "strategyName" "StrategyName" NOT NULL,
    "scannedSymbols" INTEGER NOT NULL,
    "qualifiedCount" INTEGER NOT NULL,
    "upsertedCount" INTEGER NOT NULL,
    "expiredCount" INTEGER NOT NULL,
    "skippedCount" INTEGER NOT NULL,
    "strongCount" INTEGER NOT NULL,
    "watchlistCount" INTEGER NOT NULL,
    "weakCount" INTEGER NOT NULL,
    "ignoreCount" INTEGER NOT NULL,
    "blockerCounts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScannerRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScannerRun_strategyName_createdAt_idx" ON "ScannerRun"("strategyName", "createdAt");

-- CreateIndex
CREATE INDEX "ScannerRun_createdAt_idx" ON "ScannerRun"("createdAt");
