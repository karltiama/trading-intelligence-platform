-- AlterTable: optional symbol metadata for pipeline symbols
ALTER TABLE "Symbol" ALTER COLUMN "name" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Symbol" ADD COLUMN "assetType" TEXT;

-- CreateTable
CREATE TABLE "DailyPrice" (
    "id" TEXT NOT NULL,
    "symbolId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "open" DECIMAL(18,8) NOT NULL,
    "high" DECIMAL(18,8) NOT NULL,
    "low" DECIMAL(18,8) NOT NULL,
    "close" DECIMAL(18,8) NOT NULL,
    "volume" DECIMAL(20,8) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'alpaca',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyPrice_symbolId_date_key" ON "DailyPrice"("symbolId", "date");

-- CreateIndex
CREATE INDEX "DailyPrice_symbolId_date_idx" ON "DailyPrice"("symbolId", "date");

-- AddForeignKey
ALTER TABLE "DailyPrice" ADD CONSTRAINT "DailyPrice_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "Symbol"("id") ON DELETE CASCADE ON UPDATE CASCADE;
