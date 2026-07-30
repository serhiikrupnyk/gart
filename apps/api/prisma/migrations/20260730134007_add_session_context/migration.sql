-- Sessions are ephemeral credentials; wiping them is the honest way to add a
-- NOT NULL context column. `context` deliberately has no default — defaulting
-- to TRAINER would point a future forgotten assignment in the escalation
-- direction. Everyone signs in again once.
DELETE FROM "Session";

-- CreateEnum
CREATE TYPE "SessionContext" AS ENUM ('TRAINER', 'CLIENT');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "context" "SessionContext" NOT NULL;

-- CreateIndex
CREATE INDEX "Session_clientId_idx" ON "Session"("clientId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A session's shape must match its context even against a buggy write:
-- CLIENT sessions carry a client binding, TRAINER sessions never do.
ALTER TABLE "Session" ADD CONSTRAINT "Session_context_client_ck"
  CHECK (("context" = 'CLIENT') = ("clientId" IS NOT NULL));
