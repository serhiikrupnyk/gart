-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE 'TRIALING';

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "pendingPeriod" "SubscriptionPeriod";

