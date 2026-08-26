-- `brandLogoUrl` held an arbitrary trainer-supplied URL — somebody else's host
-- embedded in our page, outside every check the media path performs. No route
-- could ever write it, so every row is NULL and nothing is lost by dropping it.
-- Logos are now Gart-held objects, referenced by a server-generated key.
ALTER TABLE "Trainer" DROP COLUMN "brandLogoUrl",
ADD COLUMN     "brandLogoKey" TEXT;
