-- Gart no longer sits in the money flow between a client and their trainer.
-- They settle payments between themselves, by whatever means; the system knows
-- nothing about it. The only monetisation is the trainer's subscription to Gart.
--
-- The rows below cannot be retargeted, only discarded: a client's purchase of a
-- trainer's product has no meaning as a trainer's subscription to the platform.
-- There is no payer, no plan and no period that could honestly be inferred from
-- one, so inventing a backfill would fabricate billing history rather than
-- migrate it. Notifications announcing those payments go with them.
DELETE FROM "Notification"
WHERE "type" IN ('PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'PAYMENT_REFUNDED');

DELETE FROM "Entitlement";
DELETE FROM "PaymentEvent";
DELETE FROM "Payment";
DELETE FROM "Subscription";

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('PRO', 'GROW', 'SCALE');

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('WORKOUT_LOGGED', 'EXERCISE_SKIPPED', 'PROGRESS_LOGGED', 'HABIT_STREAK', 'ASSIGNMENT_CREATED', 'CLIENT_INACTIVE', 'TRAINER_MESSAGE', 'CHAT_MESSAGE', 'SUBSCRIPTION_PAST_DUE', 'SUBSCRIPTION_ENDED');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "public"."NotificationType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Entitlement" DROP CONSTRAINT "Entitlement_clientId_fkey";

-- DropForeignKey
ALTER TABLE "Entitlement" DROP CONSTRAINT "Entitlement_paymentId_fkey";

-- DropForeignKey
ALTER TABLE "Entitlement" DROP CONSTRAINT "Entitlement_productId_fkey";

-- DropForeignKey
ALTER TABLE "Entitlement" DROP CONSTRAINT "Entitlement_trainerId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_clientId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_productId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_trainerId_fkey";

-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_clientId_fkey";

-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_productId_fkey";

-- DropIndex
DROP INDEX "Payment_trainerId_clientId_idx";

-- DropIndex
DROP INDEX "Subscription_clientId_productId_key";

-- DropIndex
DROP INDEX "Subscription_trainerId_status_idx";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "accessDaysSnapshot",
DROP COLUMN "checkoutUrl",
DROP COLUMN "clientId",
DROP COLUMN "platformFee",
DROP COLUMN "productId";

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "cancelledBy",
DROP COLUMN "clientId",
DROP COLUMN "productId",
ADD COLUMN     "plan" "SubscriptionPlan" NOT NULL;

-- DropTable
DROP TABLE "Entitlement";

-- DropTable
DROP TABLE "Product";

-- DropEnum
DROP TYPE "CancelledBy";

-- DropEnum
DROP TYPE "ProductKind";

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_trainerId_key" ON "Subscription"("trainerId");

