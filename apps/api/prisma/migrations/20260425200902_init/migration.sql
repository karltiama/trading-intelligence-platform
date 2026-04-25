-- CreateEnum
CREATE TYPE "PaperOrderSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "PaperOrderType" AS ENUM ('MARKET');

-- CreateEnum
CREATE TYPE "PaperOrderStatus" AS ENUM ('NEW', 'FILLED', 'CANCELED');

-- CreateTable
CREATE TABLE "PaperAccount" (
    "id" TEXT NOT NULL,
    "startingCash" DECIMAL(18,8) NOT NULL,
    "cashBalance" DECIMAL(18,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperOrder" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "symbolId" TEXT NOT NULL,
    "side" "PaperOrderSide" NOT NULL,
    "type" "PaperOrderType" NOT NULL DEFAULT 'MARKET',
    "status" "PaperOrderStatus" NOT NULL DEFAULT 'NEW',
    "quantity" DECIMAL(18,8) NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filledAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperFill" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "symbolId" TEXT NOT NULL,
    "side" "PaperOrderSide" NOT NULL,
    "quantity" DECIMAL(18,8) NOT NULL,
    "price" DECIMAL(18,8) NOT NULL,
    "notional" DECIMAL(18,8) NOT NULL,
    "filledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaperFill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperPosition" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "symbolId" TEXT NOT NULL,
    "quantity" DECIMAL(18,8) NOT NULL,
    "averageCost" DECIMAL(18,8) NOT NULL,
    "realizedPnl" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperAccountSnapshot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cashBalance" DECIMAL(18,8) NOT NULL,
    "positionsValue" DECIMAL(18,8) NOT NULL,
    "totalEquity" DECIMAL(18,8) NOT NULL,
    "unrealizedPnl" DECIMAL(18,8) NOT NULL,
    "realizedPnl" DECIMAL(18,8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaperAccountSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaperOrder_accountId_requestedAt_idx" ON "PaperOrder"("accountId", "requestedAt");

-- CreateIndex
CREATE INDEX "PaperOrder_symbolId_requestedAt_idx" ON "PaperOrder"("symbolId", "requestedAt");

-- CreateIndex
CREATE INDEX "PaperOrder_status_requestedAt_idx" ON "PaperOrder"("status", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaperFill_orderId_key" ON "PaperFill"("orderId");

-- CreateIndex
CREATE INDEX "PaperFill_accountId_filledAt_idx" ON "PaperFill"("accountId", "filledAt");

-- CreateIndex
CREATE INDEX "PaperFill_symbolId_filledAt_idx" ON "PaperFill"("symbolId", "filledAt");

-- CreateIndex
CREATE INDEX "PaperPosition_accountId_updatedAt_idx" ON "PaperPosition"("accountId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaperPosition_accountId_symbolId_key" ON "PaperPosition"("accountId", "symbolId");

-- CreateIndex
CREATE INDEX "PaperAccountSnapshot_accountId_asOf_idx" ON "PaperAccountSnapshot"("accountId", "asOf");

-- AddForeignKey
ALTER TABLE "PaperOrder" ADD CONSTRAINT "PaperOrder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PaperAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperOrder" ADD CONSTRAINT "PaperOrder_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "Symbol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperFill" ADD CONSTRAINT "PaperFill_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PaperAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperFill" ADD CONSTRAINT "PaperFill_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PaperOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperFill" ADD CONSTRAINT "PaperFill_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "Symbol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperPosition" ADD CONSTRAINT "PaperPosition_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PaperAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperPosition" ADD CONSTRAINT "PaperPosition_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "Symbol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperAccountSnapshot" ADD CONSTRAINT "PaperAccountSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PaperAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
