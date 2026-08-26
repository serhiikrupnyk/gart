-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "planSnapshot" "SubscriptionPlan";


-- Every trainer who registered before billing existed gets the same free trial
-- a new registration starts.
--
-- Without this they would hold no Subscription row at all, which both the
-- allowance and the lapse guard read as "predates billing" and wave through —
-- unlimited clients and permanent immunity, with nothing that would ever move
-- them off it. Granting the trial puts them on the same footing as everybody
-- else and gives them two weeks to choose.
INSERT INTO "Subscription" (
  "id", "trainerId", "plan", "status", "period",
  "currentPeriodStart", "currentPeriodEnd", "anchorDay",
  "accessUntil", "nextChargeAt", "failedAttempts", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text, t."id", 'PRO', 'TRIALING', 'MONTHLY',
  NOW(), NOW() + INTERVAL '14 days', EXTRACT(DAY FROM NOW())::int,
  NOW() + INTERVAL '14 days', NULL, 0, NOW(), NOW()
FROM "Trainer" t
WHERE NOT EXISTS (SELECT 1 FROM "Subscription" s WHERE s."trainerId" = t."id");
