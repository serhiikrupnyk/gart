-- Backfill the terms every existing payment was bought under, from the product
-- it names.
--
-- Without this, a payment predating the snapshot columns is indistinguishable
-- from a PERPETUAL one-time purchase, whose correct snapshot is legitimately
-- (NULL, NULL). Any "both null means no snapshot" fallback would therefore hand
-- that purchase back to the live product — the exact hole the columns were
-- added to close, and reachable for the most ordinary product shape there is.
--
-- After this runs there is no such thing as a payment without a snapshot, so
-- nothing downstream has to guess which of the two states it is looking at.
UPDATE "Payment" p
SET "periodSnapshot" = pr."period",
    "accessDaysSnapshot" = pr."accessDays"
FROM "Product" pr
WHERE p."productId" = pr."id"
  AND p."periodSnapshot" IS NULL
  AND p."accessDaysSnapshot" IS NULL;
