-- The billing anchor: the day of the month a subscription charges on.
--
-- Added nullable, backfilled from the period start, then made required —
-- Postgres will not accept a column reference in a DEFAULT expression, and a
-- required column cannot simply appear on a table that already has rows.
ALTER TABLE "Subscription" ADD COLUMN "anchorDay" INTEGER;

UPDATE "Subscription" SET "anchorDay" = EXTRACT(DAY FROM "currentPeriodStart");

ALTER TABLE "Subscription" ALTER COLUMN "anchorDay" SET NOT NULL;
