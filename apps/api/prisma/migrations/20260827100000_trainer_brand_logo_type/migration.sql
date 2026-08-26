-- The verified content type, recorded at finalize exactly as ProgressPhoto and
-- ExerciseMedia record theirs. Serving a logo then costs ONE storage round trip
-- rather than two: this is the only unauthenticated byte-serving route in the
-- app, and asking storage twice per request doubled its cost for nothing.
ALTER TABLE "Trainer" ADD COLUMN "brandLogoType" TEXT;
