-- CreateEnum
CREATE TYPE "Timeframe" AS ENUM ('M1', 'M5', 'M15', 'H1', 'D1');

-- CreateEnum
CREATE TYPE "SignalSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Symbol" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Symbol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candle" (
    "id" TEXT NOT NULL,
    "symbolId" TEXT NOT NULL,
    "timeframe" "Timeframe" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(18,8) NOT NULL,
    "high" DECIMAL(18,8) NOT NULL,
    "low" DECIMAL(18,8) NOT NULL,
    "close" DECIMAL(18,8) NOT NULL,
    "volume" DECIMAL(20,8) NOT NULL,

    CONSTRAINT "Candle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "symbolId" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "side" "SignalSide" NOT NULL,
    "confidence" DECIMAL(5,4),
    "entryPrice" DECIMAL(18,8),
    "stopPrice" DECIMAL(18,8),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyRun" (
    "id" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "RunStatus" NOT NULL,
    "notes" TEXT,

    CONSTRAINT "StrategyRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Symbol_ticker_key" ON "Symbol"("ticker");

-- CreateIndex
CREATE INDEX "Candle_symbolId_timestamp_idx" ON "Candle"("symbolId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Candle_symbolId_timeframe_timestamp_key" ON "Candle"("symbolId", "timeframe", "timestamp");

-- CreateIndex
CREATE INDEX "Signal_symbolId_createdAt_idx" ON "Signal"("symbolId", "createdAt");

-- CreateIndex
CREATE INDEX "StrategyRun_strategy_startedAt_idx" ON "StrategyRun"("strategy", "startedAt");

-- AddForeignKey
ALTER TABLE "Candle" ADD CONSTRAINT "Candle_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "Symbol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "Symbol"("id") ON DELETE CASCADE ON UPDATE CASCADE;
