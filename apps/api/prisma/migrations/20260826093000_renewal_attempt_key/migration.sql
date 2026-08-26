-- DropIndex
DROP INDEX "Payment_subscriptionId_periodStart_key";

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "periodAttempt" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_subscriptionId_periodStart_periodAttempt_key" ON "Payment"("subscriptionId", "periodStart", "periodAttempt");

