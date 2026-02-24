-- Adaptaciones: agregar riego_id para evitar adaptación repetida del mismo riego.
ALTER TABLE "adaptaciones"
  ADD COLUMN IF NOT EXISTS "riego_id" UUID NULL;

CREATE INDEX IF NOT EXISTS "idx_adaptaciones_riego_id" ON "adaptaciones" ("riego_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_adaptaciones_riego') THEN
    ALTER TABLE "adaptaciones"
      ADD CONSTRAINT "fk_adaptaciones_riego"
      FOREIGN KEY ("riego_id") REFERENCES "riegos"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
