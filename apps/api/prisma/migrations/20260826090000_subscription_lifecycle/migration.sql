-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'ENDED');

-- CreateEnum
CREATE TYPE "CancelledBy" AS ENUM ('CLIENT', 'TRAINER');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "periodStart" TIMESTAMP(3),
ADD COLUMN     "subscriptionId" TEXT;

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "period" "SubscriptionPeriod" NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "accessUntil" TIMESTAMP(3) NOT NULL,
    "nextChargeAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "recurrenceRef" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" "CancelledBy",
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Subscription_status_nextChargeAt_idx" ON "Subscription"("status", "nextChargeAt");

-- CreateIndex
CREATE INDEX "Subscription_trainerId_status_idx" ON "Subscription"("trainerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_clientId_productId_key" ON "Subscription"("clientId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_subscriptionId_periodStart_key" ON "Payment"("subscriptionId", "periodStart");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

