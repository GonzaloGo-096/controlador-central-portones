-- Sensores lecturas: lecturas por maceta, PK UUID, FK macetas RESTRICT, índice por maceta_id y created_at.
CREATE TABLE IF NOT EXISTS "sensores_lecturas" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "maceta_id" UUID NOT NULL,
  "tipo_sensor" TEXT NOT NULL,
  "valor" DOUBLE PRECISION NOT NULL,
  "unidad" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_sensores_lecturas_maceta_id" ON "sensores_lecturas" ("maceta_id");
CREATE INDEX IF NOT EXISTS "idx_sensores_lecturas_created_at" ON "sensores_lecturas" ("created_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sensores_lecturas_maceta') THEN
    ALTER TABLE "sensores_lecturas"
      ADD CONSTRAINT "fk_sensores_lecturas_maceta"
      FOREIGN KEY ("maceta_id") REFERENCES "macetas"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
