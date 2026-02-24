-- Adaptaciones: historial de recalibraciones/ajustes por maceta, PK UUID, FK macetas RESTRICT, índice por maceta_id.
CREATE TABLE IF NOT EXISTS "adaptaciones" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "maceta_id" UUID NOT NULL,
  "tipo" TEXT NOT NULL,
  "parametros_anteriores" JSONB,
  "parametros_nuevos" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_adaptaciones_maceta_id" ON "adaptaciones" ("maceta_id");
CREATE INDEX IF NOT EXISTS "idx_adaptaciones_created_at" ON "adaptaciones" ("created_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_adaptaciones_maceta') THEN
    ALTER TABLE "adaptaciones"
      ADD CONSTRAINT "fk_adaptaciones_maceta"
      FOREIGN KEY ("maceta_id") REFERENCES "macetas"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
