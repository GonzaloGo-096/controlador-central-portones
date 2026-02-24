-- Riegos: eventos de riego por maceta, PK UUID, FK macetas RESTRICT, índice por maceta_id.
CREATE TABLE IF NOT EXISTS "riegos" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "maceta_id" UUID NOT NULL,
  "volumen_ml" INTEGER NOT NULL,
  "ejecutado_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_riegos_maceta_id" ON "riegos" ("maceta_id");
CREATE INDEX IF NOT EXISTS "idx_riegos_ejecutado_at" ON "riegos" ("ejecutado_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_riegos_maceta') THEN
    ALTER TABLE "riegos"
      ADD CONSTRAINT "fk_riegos_maceta"
      FOREIGN KEY ("maceta_id") REFERENCES "macetas"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
